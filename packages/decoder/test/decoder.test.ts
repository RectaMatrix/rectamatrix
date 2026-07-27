import {
  HEADER_BITS,
  applyHeaderWhitening,
  applyBodyMask,
  buildProtectedHeader,
  buildScanOrder,
  bytesToBits,
  calculateRsLayout,
  createBodyBitstream,
  encodeFrameBlocks,
  getSymbolSize,
  interleaveCodewords,
} from "@rectamatrix/core";
import { encodeBytes, encodeText } from "@rectamatrix/encoder";
import { describe, expect, it } from "vitest";
import { decodeSampledSymbol } from "../src/decoder.js";

describe("sampled RectaMatrix decoding", () => {
  it("round-trips multilingual UTF-8 and arbitrary Binary Payloads", () => {
    const text = "Grüße – a\u0308 – Ελληνικά – Кириллица – العربية – 中文 – 😀";
    const textResult = decodeSampledSymbol({
      modules: encodeText(text).matrix,
    });
    expect(textResult.ok).toBe(true);
    if (textResult.ok && textResult.type === "utf8") {
      expect(textResult.text).toBe(text);
      expect(textResult.metadata.quality.crcValid).toBe(true);
      expect(textResult.metadata.quality.decodeAttempts).toBe(2);
      expect(textResult.metadata.quality.headerErasureProfile).toBe(
        "reference",
      );
      expect(textResult.metadata.quality.bodyErasureProfile).toBe("reference");
    }

    const bytes = Uint8Array.of(0x00, 0xff, 0x80, 0x01, 0xfe);
    const binaryResult = decodeSampledSymbol({
      modules: encodeBytes(bytes, { compression: "none" }).matrix,
    });
    expect(binaryResult.ok).toBe(true);
    if (binaryResult.ok) expect(binaryResult.bytes).toEqual(bytes);
  });

  it("decodes every geometry and ECC Level", () => {
    for (const sizeId of [0, 1, 2, 3, 4, 5, 6] as const) {
      for (const eccLevel of ["low", "medium", "high"] as const) {
        const encoded = encodeText(`size-${String(sizeId)}-${eccLevel}`, {
          sizeId,
          eccLevel,
          compression: "none",
        });
        const decoded = decodeSampledSymbol({ modules: encoded.matrix });
        expect(decoded.ok).toBe(true);
        if (decoded.ok) {
          expect(decoded.metadata.sizeId).toBe(sizeId);
          expect(decoded.metadata.eccLevel).toBe(eccLevel);
        }
      }
    }
  });

  it("decodes RM-LZ1 and propagates detector quality metadata", () => {
    const text = "ABCD".repeat(80);
    const encoded = encodeText(text, { compression: "auto" });
    expect(encoded.compression).toBe("rm-lz1");
    const decoded = decodeSampledSymbol({
      modules: encoded.matrix,
      detectorMetadata: {
        imageQuality: 0.8,
        blurEstimate: 0.15,
        perspectiveEstimateDegrees: 4.5,
      },
    });
    expect(decoded.ok).toBe(true);
    if (decoded.ok && decoded.type === "utf8") {
      expect(decoded.text).toBe(text);
      expect(decoded.metadata.quality.imageQuality).toBe(0.8);
      expect(decoded.metadata.quality.blurEstimate).toBe(0.15);
      expect(decoded.metadata.quality.perspectiveEstimateDegrees).toBe(4.5);
    }
  });

  it("corrects the maximum four unknown Body errors for medium ECC", () => {
    const input = Uint8Array.from(
      { length: 30 },
      (_, index) => (index * 31 + 9) & 0xff,
    );
    const encoded = encodeBytes(input, {
      eccLevel: "medium",
      compression: "none",
    });
    const modules = mutableMatrix(encoded.matrix);
    const body = bodyCoordinates(encoded.sizeId);
    for (const byteIndex of [0, 1, 2, 3]) {
      flip(modules, body[byteIndex * 8]!);
    }
    const decoded = decodeSampledSymbol({ modules });
    expect(decoded.ok).toBe(true);
    if (decoded.ok) {
      expect(decoded.bytes).toEqual(input);
      expect(decoded.metadata.quality.correctedCodewords).toBe(4);
    }
  });

  it("uses four Header erasures from module confidence", () => {
    const encoded = encodeText("header erasure correction", {
      compression: "none",
    });
    const modules = mutableMatrix(encoded.matrix);
    const confidence = fullConfidence(encoded.width, encoded.height);
    const scan = buildScanOrder(getSymbolSize(encoded.sizeId));
    for (const byteIndex of [0, 1, 2, 3]) {
      const byteCoordinates = scan.slice(byteIndex * 8, byteIndex * 8 + 8);
      flip(modules, byteCoordinates[0]!);
      setConfidence(confidence, byteCoordinates, 0);
    }
    const decoded = decodeSampledSymbol({ modules, confidence });
    expect(decoded.ok).toBe(true);
    if (decoded.ok) {
      expect(decoded.metadata.quality.headerErasuresUsed).toBe(4);
      expect(decoded.metadata.quality.headerCorrectedCodewords).toBe(4);
    }
  });

  it("uses eight Body erasures from module confidence", () => {
    const input = Uint8Array.from(
      { length: 30 },
      (_, index) => (index * 13 + 5) & 0xff,
    );
    const encoded = encodeBytes(input, {
      eccLevel: "medium",
      compression: "none",
    });
    const modules = mutableMatrix(encoded.matrix);
    const confidence = fullConfidence(encoded.width, encoded.height);
    const body = bodyCoordinates(encoded.sizeId);
    for (let byteIndex = 0; byteIndex < 8; byteIndex += 1) {
      const byteCoordinates = body.slice(byteIndex * 8, byteIndex * 8 + 8);
      flip(modules, byteCoordinates[0]!);
      setConfidence(confidence, byteCoordinates, 0);
    }
    const decoded = decodeSampledSymbol({ modules, confidence });
    expect(decoded.ok).toBe(true);
    if (decoded.ok) {
      expect(decoded.bytes).toEqual(input);
      expect(decoded.metadata.quality.erasuresUsed).toBe(8);
      expect(decoded.metadata.quality.correctedCodewords).toBe(8);
    }
  });

  it("rejects invalid geometry, confidence values, Anchor, and Clocking", () => {
    expect(decodeSampledSymbol({ modules: [[true]] })).toMatchObject({
      ok: false,
      error: { code: "UNSUPPORTED_SIZE" },
    });

    const encoded = encodeText("validation");
    const nanConfidence = fullConfidence(encoded.width, encoded.height);
    nanConfidence[2]![3] = Number.NaN;
    expect(
      decodeSampledSymbol({
        modules: encoded.matrix,
        confidence: nanConfidence,
      }),
    ).toMatchObject({
      ok: false,
      error: { code: "INVALID_CONFIDENCE" },
    });

    const missingAnchor = mutableMatrix(encoded.matrix);
    const size = getSymbolSize(encoded.sizeId);
    for (let y = 0; y < size.anchorSize; y += 1) {
      for (let x = 0; x < size.anchorSize; x += 1) {
        missingAnchor[y]![x] = false;
      }
    }
    expect(decodeSampledSymbol({ modules: missingAnchor })).toMatchObject({
      ok: false,
      error: { code: "ANCHOR_NOT_FOUND" },
    });

    const badClock = mutableMatrix(encoded.matrix);
    for (let x = size.anchorSize; x < size.width; x += 1) {
      badClock[0]![x] = false;
    }
    expect(decodeSampledSymbol({ modules: badClock })).toMatchObject({
      ok: false,
      error: { code: "CLOCKING_MISMATCH" },
    });
  });

  it("rejects a CRC-invalid but RS-valid Body", () => {
    const input = Uint8Array.from({ length: 24 }, (_, index) => index);
    const encoded = encodeBytes(input, {
      eccLevel: "medium",
      compression: "none",
    });
    const frame = Uint8Array.from([...input, 0, 0, 0, 0]);
    const modules = rewriteBody(encoded, frame);
    expect(decodeSampledSymbol({ modules })).toMatchObject({
      ok: false,
      error: { code: "CRC_FAILURE" },
    });
  });

  it("rejects malformed UTF-8 after successful RS and CRC validation", () => {
    const encoded = encodeBytes(Uint8Array.of(0xc0, 0xaf), {
      compression: "none",
    });
    const modules = mutableMatrix(encoded.matrix);
    const scan = buildScanOrder(getSymbolSize(encoded.sizeId));
    const header = buildProtectedHeader({
      eccLevel: encoded.eccLevel,
      payloadType: "utf8",
      compression: encoded.compression,
      maskId: encoded.maskId,
      encodedLength: encoded.encodedLength,
      integrityProfile: "crc32c",
    });
    writeBits(
      modules,
      scan.slice(0, HEADER_BITS),
      bytesToBits(applyHeaderWhitening(header)),
    );
    expect(decodeSampledSymbol({ modules })).toMatchObject({
      ok: false,
      error: { code: "INVALID_UTF8" },
    });
  });

  it("rejects malformed RM-LZ1 before CRC validation", () => {
    const encoded = encodeBytes(Uint8Array.of(1, 2), {
      compression: "none",
    });
    const malformedFrame = Uint8Array.of(0x01, 0x00, 0, 0, 0, 0);
    const modules = rewriteBody(encoded, malformedFrame);
    rewriteHeader(modules, encoded, {
      payloadType: "binary",
      compression: "rm-lz1",
      encodedLength: 2,
    });
    expect(decodeSampledSymbol({ modules })).toMatchObject({
      ok: false,
      error: { code: "DECOMPRESSION_FAILURE" },
    });
  });
});

function mutableMatrix(matrix: readonly (readonly boolean[])[]): boolean[][] {
  return matrix.map((row) => [...row]);
}

function fullConfidence(width: number, height: number): number[][] {
  return Array.from({ length: height }, () =>
    Array.from({ length: width }, () => 1),
  );
}

function bodyCoordinates(sizeId: 0 | 1 | 2 | 3 | 4 | 5 | 6) {
  return buildScanOrder(getSymbolSize(sizeId)).slice(HEADER_BITS);
}

function flip(
  modules: boolean[][],
  coordinate: { readonly x: number; readonly y: number },
): void {
  modules[coordinate.y]![coordinate.x] = !modules[coordinate.y]![coordinate.x];
}

function setConfidence(
  confidence: number[][],
  coordinates: readonly { readonly x: number; readonly y: number }[],
  value: number,
): void {
  for (const { x, y } of coordinates) confidence[y]![x] = value;
}

function rewriteBody(
  symbol: ReturnType<typeof encodeBytes>,
  frame: Uint8Array,
): boolean[][] {
  const modules = mutableMatrix(symbol.matrix);
  const layout = calculateRsLayout(frame.length, symbol.eccLevel);
  const blocks = encodeFrameBlocks(frame, symbol.eccLevel);
  const interleaved = interleaveCodewords(blocks, layout);
  const body = bodyCoordinates(symbol.sizeId);
  const bits = createBodyBitstream(interleaved, body.length);
  const masked = applyBodyMask(bits, body, symbol.maskId);
  writeBits(modules, body, masked);
  return modules;
}

function rewriteHeader(
  modules: boolean[][],
  symbol: ReturnType<typeof encodeBytes>,
  fields: {
    readonly payloadType: "binary" | "utf8";
    readonly compression: "none" | "rm-lz1";
    readonly encodedLength: number;
  },
): void {
  const header = buildProtectedHeader({
    eccLevel: symbol.eccLevel,
    payloadType: fields.payloadType,
    compression: fields.compression,
    maskId: symbol.maskId,
    encodedLength: fields.encodedLength,
    integrityProfile: "crc32c",
  });
  const scan = buildScanOrder(getSymbolSize(symbol.sizeId));
  writeBits(
    modules,
    scan.slice(0, HEADER_BITS),
    bytesToBits(applyHeaderWhitening(header)),
  );
}

function writeBits(
  modules: boolean[][],
  coordinates: readonly { readonly x: number; readonly y: number }[],
  bits: readonly boolean[],
): void {
  for (let index = 0; index < bits.length; index += 1) {
    const coordinate = coordinates[index]!;
    modules[coordinate.y]![coordinate.x] = bits[index]!;
  }
}
