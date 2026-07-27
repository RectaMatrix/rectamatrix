import {
  HEADER_BITS,
  applyBodyMask,
  applyHeaderWhitening,
  buildScanOrder,
  bytesToBits,
  createBodyBitstream,
  crc32c,
  encodeFrameBlocks,
  getSymbolSize,
  interleaveCodewords,
  reedSolomonEncode,
  uint32ToBytesBE,
  type BooleanMatrix,
  type Coordinate,
} from "../packages/core/src/index.js";
import {
  createDecoderNegativeVector,
  createDecoderNegativeVectorSuite,
  type DecoderNegativeDetectorMetadata,
  type DecoderNegativeVector,
  type DecoderNegativeVectorInput,
  type DecoderNegativeVectorSuite,
} from "../packages/conformance/src/index.js";
import {
  encodeBytesWithTrace,
  encodeTextWithTrace,
  type EncoderTrace,
} from "../packages/encoder/src/index.js";

const vectors: DecoderNegativeVector[] = [];
const binaryTrace = encodeBytesWithTrace(
  Uint8Array.of(0x41, 0x42, 0x43, 0x44, 0x45, 0x46),
  { sizeId: 0, eccLevel: "medium", compression: "none" },
);
const textTrace = encodeTextWithTrace("A", {
  sizeId: 0,
  eccLevel: "medium",
  compression: "none",
});
const compressedTrace = encodeTextWithTrace("A".repeat(64), {
  sizeId: 0,
  eccLevel: "medium",
  compression: "rm-lz1",
});
const baseRows = matrixToRows(binaryTrace.symbol.matrix);

add("unsupported-size", baseRows.slice(0, -1), ["UNSUPPORTED_SIZE"]);

const nonRectangular = [...baseRows];
nonRectangular[1] = nonRectangular[1]!.slice(0, -1);
add("non-rectangular-matrix", nonRectangular, ["INVALID_GEOMETRY"]);

add("confidence-height-mismatch", baseRows, ["INVALID_CONFIDENCE"], [[1]]);

const outOfRangeConfidence = Array.from({ length: 16 }, () =>
  Array<number>(24).fill(1),
);
outOfRangeConfidence[0]![0] = 1.1;
add(
  "confidence-out-of-range",
  baseRows,
  ["INVALID_CONFIDENCE"],
  outOfRangeConfidence,
);

add(
  "detector-image-quality-out-of-range",
  baseRows,
  ["INVALID_DETECTOR_METADATA"],
  undefined,
  { imageQuality: 1.1 },
);

const anchorDamage = mutableMatrix(binaryTrace.symbol.matrix);
for (let y = 0; y < 4; y += 1) {
  for (let x = 0; x < 4; x += 1) anchorDamage[y]![x] = false;
}
add("anchor-destroyed", matrixToRows(anchorDamage), ["ANCHOR_NOT_FOUND"]);

const clockDamage = mutableMatrix(binaryTrace.symbol.matrix);
for (let x = 4; x < binaryTrace.symbol.width; x += 1) {
  clockDamage[0]![x] = !clockDamage[0]![x];
}
for (let y = 4; y < binaryTrace.symbol.height; y += 1) {
  clockDamage[y]![0] = !clockDamage[y]![0];
}
add("clocking-inverted", matrixToRows(clockDamage), ["CLOCKING_MISMATCH"]);

add(
  "header-rs-over-capacity",
  matrixToRows(
    flipCodewordBits(
      binaryTrace.symbol.matrix,
      binaryTrace,
      "header",
      [0, 1, 2],
    ),
  ),
  ["HEADER_RS_FAILURE"],
);

add(
  "body-rs-over-capacity",
  matrixToRows(
    flipCodewordBits(
      binaryTrace.symbol.matrix,
      binaryTrace,
      "body",
      [0, 1, 2, 3, 4],
    ),
  ),
  ["BODY_RS_FAILURE"],
);

add(
  "header-reserved-bits",
  matrixToRows(
    replaceHeader(binaryTrace, (information) => {
      information[3] = information[3]! | 0x01;
    }),
  ),
  ["INVALID_HEADER"],
);

add(
  "header-unsupported-version",
  matrixToRows(
    replaceHeader(binaryTrace, (information) => {
      information[0] = (information[0]! & 0xf0) | 0x03;
    }),
  ),
  ["UNSUPPORTED_VERSION"],
);

add(
  "header-invalid-magic",
  matrixToRows(
    replaceHeader(binaryTrace, (information) => {
      information[0] = 0x02;
    }),
  ),
  ["INVALID_HEADER"],
);

add(
  "header-reserved-ecc",
  matrixToRows(
    replaceHeader(binaryTrace, (information) => {
      information[1] = (information[1]! & 0x3f) | 0xc0;
    }),
  ),
  ["INVALID_HEADER"],
);

add(
  "header-unsupported-integrity-profile",
  matrixToRows(
    replaceHeader(binaryTrace, (information) => {
      information[3] = (information[3]! & 0xf9) | 0x06;
    }),
  ),
  ["UNSUPPORTED_INTEGRITY_PROFILE"],
);

add(
  "header-unsupported-compression",
  matrixToRows(
    replaceHeader(binaryTrace, (information) => {
      information[1] = (information[1]! & 0xe3) | 0x08;
    }),
  ),
  ["UNSUPPORTED_COMPRESSION"],
);

add(
  "header-body-truncated",
  matrixToRows(
    replaceHeader(binaryTrace, (information) => {
      information[2] = (information[2]! & 0x80) | (100 >>> 5);
      information[3] = (100 & 0x1f) << 3;
    }),
  ),
  ["BODY_TRUNCATED"],
);

const crcFailureFrame = binaryTrace.frame.slice();
crcFailureFrame[crcFailureFrame.length - 1] =
  crcFailureFrame[crcFailureFrame.length - 1]! ^ 0x01;
add("crc-mismatch", matrixToRows(replaceFrame(binaryTrace, crcFailureFrame)), [
  "CRC_FAILURE",
]);

const invalidUtf8Payload = Uint8Array.of(0xff);
const invalidUtf8Frame = new Uint8Array(5);
invalidUtf8Frame.set(invalidUtf8Payload);
invalidUtf8Frame.set(uint32ToBytesBE(crc32c(invalidUtf8Payload)), 1);
add(
  "invalid-strict-utf8",
  matrixToRows(replaceFrame(textTrace, invalidUtf8Frame)),
  ["INVALID_UTF8"],
);

const invalidCompressedFrame = compressedTrace.frame.slice();
invalidCompressedFrame.fill(0, 0, compressedTrace.encodedPayload.length);
invalidCompressedFrame[0] = 0x01;
add(
  "invalid-rm-lz1-stream",
  matrixToRows(replaceFrame(compressedTrace, invalidCompressedFrame)),
  ["DECOMPRESSION_FAILURE"],
);

export function buildCanonicalDecoderNegativeVectorSuite(): DecoderNegativeVectorSuite {
  return createDecoderNegativeVectorSuite(vectors);
}

function add(
  id: string,
  modules: readonly string[],
  errorCodes: readonly string[],
  confidence?: readonly (readonly number[])[],
  detectorMetadata?: DecoderNegativeDetectorMetadata,
): void {
  const input: DecoderNegativeVectorInput = {
    modules,
    ...(confidence === undefined ? {} : { confidence }),
    ...(detectorMetadata === undefined ? {} : { detectorMetadata }),
  };
  vectors.push(createDecoderNegativeVector(id, input, errorCodes));
}

function replaceHeader(
  trace: EncoderTrace,
  mutate: (information: Uint8Array) => void,
): BooleanMatrix {
  const information = trace.headerInformation.slice();
  mutate(information);
  const protectedHeader = reedSolomonEncode(information, 4);
  const matrix = mutableMatrix(trace.symbol.matrix);
  const scan = buildScanOrder(getSymbolSize(trace.symbol.sizeId));
  writeBits(
    matrix,
    scan.slice(0, HEADER_BITS),
    bytesToBits(applyHeaderWhitening(protectedHeader)),
  );
  return freezeMatrix(matrix);
}

function replaceFrame(trace: EncoderTrace, frame: Uint8Array): BooleanMatrix {
  if (frame.length !== trace.frame.length) {
    throw new Error("Negative fixture Frame length must remain unchanged.");
  }
  const blocks = encodeFrameBlocks(frame, trace.symbol.eccLevel);
  const interleaved = interleaveCodewords(blocks, trace.rsLayout);
  const scan = buildScanOrder(getSymbolSize(trace.symbol.sizeId));
  const bodyCoordinates = scan.slice(HEADER_BITS);
  const body = createBodyBitstream(interleaved, bodyCoordinates.length);
  const masked = applyBodyMask(body, bodyCoordinates, trace.symbol.maskId);
  const matrix = mutableMatrix(trace.symbol.matrix);
  writeBits(matrix, bodyCoordinates, masked);
  return freezeMatrix(matrix);
}

function flipCodewordBits(
  source: BooleanMatrix,
  trace: EncoderTrace,
  section: "header" | "body",
  codewordIndices: readonly number[],
): BooleanMatrix {
  const scan = buildScanOrder(getSymbolSize(trace.symbol.sizeId));
  const offset = section === "header" ? 0 : HEADER_BITS;
  const matrix = mutableMatrix(source);
  for (const codewordIndex of codewordIndices) {
    const coordinate = scan[offset + codewordIndex * 8]!;
    matrix[coordinate.y]![coordinate.x] = !matrix[coordinate.y]![coordinate.x];
  }
  return freezeMatrix(matrix);
}

function mutableMatrix(matrix: BooleanMatrix): boolean[][] {
  return matrix.map((row) => [...row]);
}

function freezeMatrix(matrix: boolean[][]): BooleanMatrix {
  return Object.freeze(matrix.map((row) => Object.freeze(row.slice())));
}

function matrixToRows(matrix: BooleanMatrix): readonly string[] {
  return Object.freeze(
    matrix.map((row) => row.map((value) => (value ? "1" : "0")).join("")),
  );
}

function writeBits(
  matrix: boolean[][],
  coordinates: readonly Coordinate[],
  bits: readonly boolean[],
): void {
  if (coordinates.length !== bits.length) {
    throw new Error("Negative fixture matrix write length mismatch.");
  }
  for (let index = 0; index < bits.length; index += 1) {
    const coordinate = coordinates[index]!;
    matrix[coordinate.y]![coordinate.x] = bits[index]!;
  }
}
