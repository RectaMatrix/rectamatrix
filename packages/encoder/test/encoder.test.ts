import {
  HEADER_BITS,
  RECTAMATRIX_SIZES,
  applyHeaderWhitening,
  applyBodyMask,
  buildScanOrder,
  bytesToUint32BE,
  calculateRsLayout,
  crc32c,
  decodeProtectedHeader,
  deinterleaveCodewords,
  encodeUtf8Strict,
  getSymbolSize,
  readCodewordsFromBodyBits,
  reassembleFrame,
  reedSolomonDecode,
} from "@rectamatrix/core";
import { describe, expect, it } from "vitest";
import { encodeBytes, encodeText } from "../src/encoder.js";
import { renderSvg } from "../src/svg.js";

describe("complete RectaMatrix encoding", () => {
  it("encodes empty Binary and UTF-8 Payloads", () => {
    const binary = encodeBytes(new Uint8Array(), {
      compression: "none",
    });
    const text = encodeText("", { compression: "none" });
    expect(binary.payloadType).toBe("binary");
    expect(text.payloadType).toBe("utf8");
    expect(binary.sizeId).toBe(0);
    expect(text.sizeId).toBe(0);
    expect(binary.originalLength).toBe(0);
    expect(text.originalLength).toBe(0);
  });

  it("is deterministic and does not mutate Binary input", () => {
    const input = Uint8Array.from(
      { length: 90 },
      (_, index) => (index * 41 + 3) & 0xff,
    );
    const original = input.slice();
    const first = encodeBytes(input, {
      eccLevel: "high",
      compression: "none",
    });
    const second = encodeBytes(input, {
      eccLevel: "high",
      compression: "none",
    });
    expect(input).toEqual(original);
    expect(second).toEqual(first);
    expect(Object.isFrozen(first)).toBe(true);
    expect(Object.isFrozen(first.matrix)).toBe(true);
    expect(first.matrix.every(Object.isFrozen)).toBe(true);
  });

  it("supports every currently implemented Version 2 geometry", () => {
    for (const { sizeId } of RECTAMATRIX_SIZES) {
      const symbol = encodeBytes(Uint8Array.of(1, 2, 3), {
        sizeId,
        compression: "none",
        eccLevel: "low",
      });
      const size = getSymbolSize(sizeId);
      expect(symbol.width).toBe(size.width);
      expect(symbol.height).toBe(size.height);
      expect(symbol.matrix).toHaveLength(size.height);
      expect(symbol.matrix.every((row) => row.length === size.width)).toBe(
        true,
      );
    }
  });

  it("keeps the whitened Header visually balanced in every geometry", () => {
    for (const { sizeId } of RECTAMATRIX_SIZES) {
      const symbol = encodeText("Header", {
        sizeId,
        compression: "none",
        eccLevel: "medium",
      });
      const darkHeaderModules = buildScanOrder(getSymbolSize(sizeId))
        .slice(0, HEADER_BITS)
        .filter(({ x, y }) => symbol.matrix[y]![x]!).length;
      expect(darkHeaderModules).toBeGreaterThanOrEqual(20);
      expect(darkHeaderModules).toBeLessThanOrEqual(44);
    }
  });

  it("uses RM-LZ1 only under the normative savings rule", () => {
    const compressed = encodeBytes(new Uint8Array(100).fill(0x41), {
      compression: "auto",
    });
    expect(compressed.compression).toBe("rm-lz1");
    expect(compressed.encodedLength).toBeLessThan(compressed.originalLength);

    const incompressible = Uint8Array.of(0, 1, 2, 3, 4, 5, 6, 7);
    expect(
      encodeBytes(incompressible, { compression: "auto" }).compression,
    ).toBe("none");
    expect(() =>
      encodeBytes(incompressible, { compression: "rm-lz1" }),
    ).toThrow(/shorter/i);
  });

  it("selects RM-HLE1 for compact structured text", () => {
    const text = "https://www.example.com/items/123456789";
    const encoded = encodeText(text, { compression: "auto" });
    expect(encoded.compression).toBe("rm-hle1");
    expect(encoded.encodedLength).toBeLessThan(
      new TextEncoder().encode(text).length,
    );
  });

  it("rejects RM-HLE1 for binary Payloads", () => {
    expect(() =>
      encodeBytes(Uint8Array.of(1, 2, 3), { compression: "rm-hle1" }),
    ).toThrow(/text Payload/i);
  });

  it("honors exact uncompressed capacity boundaries", () => {
    expect(
      encodeBytes(new Uint8Array(25), {
        sizeId: 0,
        eccLevel: "low",
        compression: "none",
      }).sizeId,
    ).toBe(0);
    expect(() =>
      encodeBytes(new Uint8Array(26), {
        sizeId: 0,
        eccLevel: "low",
        compression: "none",
      }),
    ).toThrow(/exceeds/i);
    expect(
      encodeBytes(new Uint8Array(26), {
        eccLevel: "low",
        compression: "none",
      }).sizeId,
    ).toBe(10);
  });

  it("writes a correct protected Header and recoverable RS Frame", () => {
    const input = encodeUtf8Strict("Grüße – Ελληνικά – 中文 – 😀");
    const symbol = encodeBytes(input, {
      eccLevel: "medium",
      compression: "none",
    });
    const size = getSymbolSize(symbol.sizeId);
    const scan = buildScanOrder(size);
    const headerBits = scan
      .slice(0, HEADER_BITS)
      .map(({ x, y }) => symbol.matrix[y]![x]!);
    const headerBytes = readCodewordsFromBodyBits(headerBits, 8);
    const header = decodeProtectedHeader(applyHeaderWhitening(headerBytes));
    expect(header.fields).toMatchObject({
      payloadType: "binary",
      compression: "none",
      eccLevel: "medium",
      maskId: symbol.maskId,
      encodedLength: input.length,
      integrityProfile: "crc32c",
    });

    const layout = calculateRsLayout(input.length + 4, "medium");
    const bodyCoordinates = scan.slice(HEADER_BITS);
    const maskedBody = bodyCoordinates.map(({ x, y }) => symbol.matrix[y]![x]!);
    const body = applyBodyMask(maskedBody, bodyCoordinates, symbol.maskId);
    const interleaved = readCodewordsFromBodyBits(
      body,
      layout.totalCodewordBytes,
    );
    const blocks = deinterleaveCodewords(interleaved, layout);
    const frame = reassembleFrame(
      blocks.map(
        (block, index) =>
          reedSolomonDecode(block.codeword, layout.blocks[index]!.parityLength)
            .data,
      ),
      layout,
    );
    expect(frame.slice(0, input.length)).toEqual(input);
    expect(bytesToUint32BE(frame, input.length)).toBe(crc32c(input));
  });

  it("rejects malformed text and invalid runtime options", () => {
    expect(() => encodeText("\ud800")).toThrow(/surrogate/i);
    expect(() =>
      encodeBytes(Uint8Array.of(1), {
        eccLevel: "invalid" as "low",
      }),
    ).toThrow(/ECC/i);
  });

  it("renders dependency-free SVG with an exact Quiet Zone", () => {
    const symbol = encodeText("RectaMatrix", {
      compression: "none",
      sizeId: 0,
    });
    const svg = renderSvg(symbol, { moduleSize: 4, quietZone: 4 });
    expect(svg).toContain('viewBox="0 0 128 96"');
    expect(svg).toContain('shape-rendering="crispEdges"');
    expect(svg).toContain('fill="#fff"');
    expect(svg).toContain('fill="#000"');
    expect(
      renderSvg(symbol, { moduleSize: 4, quietZoneProfile: "compact" }),
    ).toContain('viewBox="0 0 112 80"');
    expect(() => renderSvg(symbol, { quietZone: 3 })).toThrow(/Compact/i);
    expect(() =>
      renderSvg(symbol, {
        quietZone: 4,
        quietZoneProfile: "compact",
      }),
    ).toThrow(/either/i);
  });
});
