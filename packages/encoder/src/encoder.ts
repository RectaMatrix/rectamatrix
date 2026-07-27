import {
  MASK_IDS,
  RECTAMATRIX_SIZES,
  RectaMatrixError,
  applyBodyMask,
  applyHeaderWhitening,
  buildProtectedHeader,
  buildScanOrder,
  bytesToBits,
  calculateBodyBits,
  calculateRsLayout,
  createBodyBitstream,
  createFixedPatternMatrix,
  crc32c,
  encodeFrameBlocks,
  encodeOriginalLengthPrefix,
  encodeUtf8Strict,
  getSymbolSize,
  interleaveCodewords,
  rmhle1Encode,
  rmlz1Encode,
  selectBestMask,
  uint32ToBytesBE,
  type BooleanMatrix,
  type CompressionMode as WireCompressionMode,
  type Coordinate,
  type EccLevel,
  type MaskCandidate,
  type PayloadType,
  type SizeId,
  type SymbolSize,
} from "@rectamatrix/core";
import type { CompressionMode, EncodedSymbol, EncodeOptions } from "./types.js";

interface PreparedPayload {
  readonly original: Uint8Array;
  readonly encoded: Uint8Array;
  readonly compression: WireCompressionMode;
  readonly frame: Uint8Array;
}

interface EncodingConfiguration {
  readonly eccLevel: EccLevel;
  readonly compression: CompressionMode;
  readonly sizeId?: SizeId;
}

export function encodeText(
  text: string,
  options?: EncodeOptions,
): EncodedSymbol {
  if (typeof text !== "string") {
    throw new TypeError("RectaMatrix text input must be a string.");
  }
  return encodePayload(encodeUtf8Strict(text), "utf8", options, text);
}

export function encodeBytes(
  bytes: Uint8Array,
  options?: EncodeOptions,
): EncodedSymbol {
  if (!(bytes instanceof Uint8Array)) {
    throw new TypeError("RectaMatrix binary input must be a Uint8Array.");
  }
  return encodePayload(bytes.slice(), "binary", options);
}

function encodePayload(
  original: Uint8Array,
  payloadType: PayloadType,
  options?: EncodeOptions,
  originalText?: string,
): EncodedSymbol {
  const configuration = validateOptions(options);
  if (original.length > 0xffff) {
    throw new RangeError("RectaMatrix Payload cannot exceed 65535 bytes.");
  }
  const prepared = preparePayload(
    original,
    payloadType,
    configuration.compression,
    originalText,
  );
  const { size, layout } = selectSize(
    prepared.frame.length,
    configuration.eccLevel,
    configuration.sizeId,
  );
  const blocks = encodeFrameBlocks(prepared.frame, configuration.eccLevel);
  const interleaved = interleaveCodewords(blocks, layout);
  const scanOrder = buildScanOrder(size);
  const headerCoordinates = scanOrder.slice(0, 64);
  const bodyCoordinates = scanOrder.slice(64);
  const bodyBits = createBodyBitstream(interleaved, bodyCoordinates.length);
  const candidates: MaskCandidate[] = [];

  for (const maskId of MASK_IDS) {
    const matrix = cloneMatrix(createFixedPatternMatrix(size));
    const protectedHeader = buildProtectedHeader({
      eccLevel: configuration.eccLevel,
      payloadType,
      compression: prepared.compression,
      maskId,
      encodedLength: prepared.encoded.length,
      integrityProfile: "crc32c",
    });
    writeBits(
      matrix,
      headerCoordinates,
      bytesToBits(applyHeaderWhitening(protectedHeader)),
    );
    writeBits(
      matrix,
      bodyCoordinates,
      applyBodyMask(bodyBits, bodyCoordinates, maskId),
    );
    candidates.push(
      Object.freeze({
        maskId,
        matrix: freezeMatrix(matrix),
      }),
    );
  }

  const selected = selectBestMask(candidates);
  return Object.freeze({
    version: 2,
    sizeId: size.sizeId,
    width: size.width,
    height: size.height,
    matrix: selected.matrix,
    payloadType,
    compression: prepared.compression,
    eccLevel: configuration.eccLevel,
    maskId: selected.maskId,
    originalLength: prepared.original.length,
    encodedLength: prepared.encoded.length,
  });
}

function preparePayload(
  original: Uint8Array,
  payloadType: PayloadType,
  mode: CompressionMode,
  originalText?: string,
): PreparedPayload {
  const candidates: Array<{
    readonly encoded: Uint8Array;
    readonly compression: WireCompressionMode;
  }> = [{ encoded: original.slice(), compression: "none" }];

  if (mode === "rm-hle1" || mode === "auto") {
    if (payloadType !== "utf8" || originalText === undefined) {
      if (mode === "rm-hle1") {
        throw new RectaMatrixError(
          "UNSUPPORTED_COMPRESSION",
          "RM-HLE1 is available only for Unicode text Payloads.",
        );
      }
    } else {
      candidates.push({
        encoded: rmhle1Encode(originalText),
        compression: "rm-hle1",
      });
    }
  }

  if (mode === "rm-lz1" || mode === "auto") {
    const compressed = rmlz1Encode(original);
    const originalLengthPrefix = encodeOriginalLengthPrefix(original.length);
    const compressedStream = new Uint8Array(
      originalLengthPrefix.length + compressed.length,
    );
    compressedStream.set(originalLengthPrefix);
    compressedStream.set(compressed, originalLengthPrefix.length);
    if (mode === "rm-lz1" && compressedStream.length >= original.length) {
      throw new RectaMatrixError(
        "COMPRESSION_NOT_BENEFICIAL",
        "RM-LZ1 must make the Encoded Payload shorter.",
      );
    }
    candidates.push({ encoded: compressedStream, compression: "rm-lz1" });
  }

  const eligible =
    mode === "none"
      ? candidates.filter(({ compression }) => compression === "none")
      : mode === "rm-hle1"
        ? candidates.filter(({ compression }) => compression === "rm-hle1")
        : mode === "rm-lz1"
          ? candidates.filter(({ compression }) => compression === "rm-lz1")
          : candidates;
  const selected = eligible.reduce((best, candidate) =>
    candidate.encoded.length < best.encoded.length ? candidate : best,
  );
  const encoded = selected.encoded;
  const compression = selected.compression;

  const frame = new Uint8Array(encoded.length + 4);
  frame.set(encoded);
  frame.set(uint32ToBytesBE(crc32c(original)), encoded.length);
  return Object.freeze({
    original: original.slice(),
    encoded,
    compression,
    frame,
  });
}

function selectSize(
  frameLength: number,
  eccLevel: EccLevel,
  requestedSizeId?: SizeId,
): {
  readonly size: SymbolSize;
  readonly layout: ReturnType<typeof calculateRsLayout>;
} {
  const sizes =
    requestedSizeId === undefined
      ? [...RECTAMATRIX_SIZES].sort(compareAutomaticSizeOrder)
      : [getSymbolSize(requestedSizeId)];

  for (const size of sizes) {
    const layout = calculateRsLayout(frameLength, eccLevel);
    if (layout.totalCodewordBytes * 8 + 1 <= calculateBodyBits(size)) {
      return { size, layout };
    }
  }
  throw new RectaMatrixError(
    "PAYLOAD_TOO_LARGE",
    requestedSizeId === undefined
      ? "Payload exceeds every RectaMatrix Version 2 symbol size."
      : `Payload exceeds requested RectaMatrix size ${String(requestedSizeId)}.`,
  );
}

function validateOptions(options?: EncodeOptions): EncodingConfiguration {
  const runtimeOptions: unknown = options;
  if (
    runtimeOptions !== undefined &&
    (typeof runtimeOptions !== "object" || runtimeOptions === null)
  ) {
    throw new TypeError("RectaMatrix encode options must be an object.");
  }
  const eccLevel = options?.eccLevel ?? "medium";
  if (!["low", "medium", "high"].includes(eccLevel)) {
    throw new RangeError("Unsupported RectaMatrix ECC Level.");
  }
  const compression = options?.compression ?? "auto";
  if (!["none", "rm-hle1", "rm-lz1", "auto"].includes(compression)) {
    throw new RangeError("Unsupported RectaMatrix compression option.");
  }
  const sizeId = options?.sizeId;
  if (
    sizeId !== undefined &&
    (!Number.isInteger(sizeId) ||
      sizeId < 0 ||
      sizeId >= RECTAMATRIX_SIZES.length)
  ) {
    throw new RangeError(
      `RectaMatrix Size ID must be between 0 and ${String(RECTAMATRIX_SIZES.length - 1)}.`,
    );
  }
  return sizeId === undefined
    ? Object.freeze({ eccLevel, compression })
    : Object.freeze({ eccLevel, compression, sizeId });
}

function compareAutomaticSizeOrder(
  left: SymbolSize,
  right: SymbolSize,
): number {
  const areaDifference = left.width * left.height - right.width * right.height;
  if (areaDifference !== 0) return areaDifference;
  const familyRank = { "3:2": 0, "2:1": 1, "3:1": 2 } as const;
  return (
    familyRank[left.aspectRatio] - familyRank[right.aspectRatio] ||
    left.sizeId - right.sizeId
  );
}

function cloneMatrix(matrix: BooleanMatrix): boolean[][] {
  return matrix.map((row) => [...row]);
}

function freezeMatrix(matrix: boolean[][]): BooleanMatrix {
  return Object.freeze(matrix.map((row) => Object.freeze(row.slice())));
}

function writeBits(
  matrix: boolean[][],
  coordinates: readonly Coordinate[],
  bits: readonly boolean[],
): void {
  if (coordinates.length !== bits.length) {
    throw new Error("Internal matrix write length mismatch.");
  }
  for (let index = 0; index < bits.length; index += 1) {
    const coordinate = coordinates[index]!;
    matrix[coordinate.y]![coordinate.x] = bits[index]!;
  }
}
