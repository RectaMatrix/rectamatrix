import {
  MASK_IDS,
  applyBodyMask,
  applyHeaderWhitening,
  buildHeaderInformation,
  buildProtectedHeader,
  buildScanOrder,
  bytesToBits,
  calculateMaskPenalty,
  calculateRsLayout,
  createBodyBitstream,
  createFixedPatternMatrix,
  crc32c,
  encodeFrameBlocks,
  encodeOriginalLengthPrefix,
  encodeUtf8Strict,
  getSymbolSize,
  interleaveCodewords,
  rmlz1Encode,
  selectBestMask,
  uint32ToBytesBE,
  type BooleanMatrix,
  type Coordinate,
  type EncodedRsBlock,
  type MaskCandidate,
  type MaskId,
  type MaskPenalty,
  type RsLayout,
} from "@rectamatrix/core";
import { encodeBytes, encodeText } from "./encoder.js";
import type { EncodedSymbol, EncodeOptions } from "./types.js";

export interface EncoderMaskTrace {
  readonly maskId: MaskId;
  readonly penalty: MaskPenalty;
}

export interface EncoderTrace {
  readonly symbol: EncodedSymbol;
  readonly originalPayload: Uint8Array;
  readonly encodedPayload: Uint8Array;
  readonly crc32c: number;
  readonly frame: Uint8Array;
  readonly headerInformation: Uint8Array;
  readonly protectedHeader: Uint8Array;
  readonly rsLayout: RsLayout;
  readonly rsBlocks: readonly EncodedRsBlock[];
  readonly interleavedCodewords: Uint8Array;
  readonly unmaskedBodyBits: readonly boolean[];
  readonly masks: readonly EncoderMaskTrace[];
}

export function encodeTextWithTrace(
  text: string,
  options?: EncodeOptions,
): EncoderTrace {
  const symbol = encodeText(text, options);
  return traceEncodedSymbol(encodeUtf8Strict(text), symbol);
}

export function encodeBytesWithTrace(
  bytes: Uint8Array,
  options?: EncodeOptions,
): EncoderTrace {
  const symbol = encodeBytes(bytes, options);
  return traceEncodedSymbol(bytes.slice(), symbol);
}

function traceEncodedSymbol(
  originalPayload: Uint8Array,
  symbol: EncodedSymbol,
): EncoderTrace {
  const encodedPayload =
    symbol.compression === "rm-lz1"
      ? withOriginalLengthPrefix(
          originalPayload.length,
          rmlz1Encode(originalPayload),
        )
      : originalPayload.slice();
  const checksum = crc32c(originalPayload);
  const frame = new Uint8Array(encodedPayload.length + 4);
  frame.set(encodedPayload);
  frame.set(uint32ToBytesBE(checksum), encodedPayload.length);

  const size = getSymbolSize(symbol.sizeId);
  const rsLayout = calculateRsLayout(frame.length, symbol.eccLevel);
  const rsBlocks = encodeFrameBlocks(frame, symbol.eccLevel);
  const interleavedCodewords = interleaveCodewords(rsBlocks, rsLayout);
  const scanOrder = buildScanOrder(size);
  const headerCoordinates = scanOrder.slice(0, 64);
  const bodyCoordinates = scanOrder.slice(64);
  const unmaskedBodyBits = createBodyBitstream(
    interleavedCodewords,
    bodyCoordinates.length,
  );

  const candidates: MaskCandidate[] = [];
  const masks: EncoderMaskTrace[] = [];
  let selectedHeaderInformation: Uint8Array | undefined;
  let selectedProtectedHeader: Uint8Array | undefined;

  for (const maskId of MASK_IDS) {
    const headerInput = {
      eccLevel: symbol.eccLevel,
      payloadType: symbol.payloadType,
      compression: symbol.compression,
      maskId,
      encodedLength: symbol.encodedLength,
      integrityProfile: "crc32c",
    } as const;
    const headerInformation = buildHeaderInformation(headerInput);
    const protectedHeader = buildProtectedHeader(headerInput);
    const matrix = cloneMatrix(createFixedPatternMatrix(size));
    writeBits(
      matrix,
      headerCoordinates,
      bytesToBits(applyHeaderWhitening(protectedHeader)),
    );
    writeBits(
      matrix,
      bodyCoordinates,
      applyBodyMask(unmaskedBodyBits, bodyCoordinates, maskId),
    );
    const frozenMatrix = freezeMatrix(matrix);
    candidates.push(Object.freeze({ maskId, matrix: frozenMatrix }));
    masks.push(
      Object.freeze({
        maskId,
        penalty: calculateMaskPenalty(frozenMatrix),
      }),
    );
    if (maskId === symbol.maskId) {
      selectedHeaderInformation = headerInformation;
      selectedProtectedHeader = protectedHeader;
    }
  }

  const selected = selectBestMask(candidates);
  if (
    selected.maskId !== symbol.maskId ||
    !matricesEqual(selected.matrix, symbol.matrix) ||
    selectedHeaderInformation === undefined ||
    selectedProtectedHeader === undefined
  ) {
    throw new Error("Internal encoder trace does not match encoded symbol.");
  }

  return Object.freeze({
    symbol,
    originalPayload,
    encodedPayload,
    crc32c: checksum,
    frame,
    headerInformation: selectedHeaderInformation,
    protectedHeader: selectedProtectedHeader,
    rsLayout,
    rsBlocks,
    interleavedCodewords,
    unmaskedBodyBits,
    masks: Object.freeze(masks),
  });
}

function withOriginalLengthPrefix(
  originalLength: number,
  compressed: Uint8Array,
): Uint8Array {
  const prefix = encodeOriginalLengthPrefix(originalLength);
  const result = new Uint8Array(prefix.length + compressed.length);
  result.set(prefix);
  result.set(compressed, prefix.length);
  return result;
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
    throw new Error("Internal trace matrix write length mismatch.");
  }
  for (let index = 0; index < bits.length; index += 1) {
    const coordinate = coordinates[index]!;
    matrix[coordinate.y]![coordinate.x] = bits[index]!;
  }
}

function matricesEqual(left: BooleanMatrix, right: BooleanMatrix): boolean {
  return (
    left.length === right.length &&
    left.every(
      (row, y) =>
        row.length === right[y]?.length &&
        row.every((value, x) => value === right[y]?.[x]),
    )
  );
}
