import {
  HEADER_BITS,
  buildScanOrder,
  getSymbolSize,
  type BooleanMatrix,
  type Coordinate,
} from "../packages/core/src/index.js";
import {
  bytesToHex,
  createDecoderPositiveVector,
  createDecoderPositiveVectorSuite,
  type DecoderExpectedPayload,
  type DecoderNegativeDetectorMetadata,
  type DecoderPositiveQualityExpected,
  type DecoderPositiveVector,
  type DecoderPositiveVectorSuite,
  type DecoderVectorInput,
} from "../packages/conformance/src/index.js";
import {
  encodeBytesWithTrace,
  encodeTextWithTrace,
  type EncoderTrace,
} from "../packages/encoder/src/index.js";

type QualityAssertion = Partial<
  Pick<
    DecoderPositiveQualityExpected,
    | "correctedCodewords"
    | "erasuresUsed"
    | "headerCorrectedCodewords"
    | "headerErasuresUsed"
    | "decodeAttempts"
    | "headerErasureProfile"
    | "bodyErasureProfile"
  >
>;

interface MutableFixture {
  readonly trace: EncoderTrace;
  readonly modules: boolean[][];
  readonly confidence: number[][];
}

const vectors: DecoderPositiveVector[] = [];

const cleanBinaryPayload = Uint8Array.of(0, 1, 2, 127, 128, 254, 255);
const cleanBinary = encodeBytesWithTrace(cleanBinaryPayload, {
  eccLevel: "medium",
  compression: "none",
});
add(
  "clean-binary-reference",
  inputFromFixture(fixture(cleanBinary), false),
  binary(cleanBinaryPayload),
  cleanQuality(),
);

const compressedTextValue = "RectaMatrix confidence ".repeat(4);
const compressedText = encodeTextWithTrace(compressedTextValue, {
  eccLevel: "medium",
  compression: "auto",
});
const detectorFixture = fixture(compressedText, 0.8);
add(
  "clean-compressed-utf8-with-detector-metadata",
  inputFromFixture(detectorFixture, true, {
    imageQuality: 0.7,
    blurEstimate: 0.1,
    perspectiveEstimateDegrees: 3,
  }),
  { type: "utf8", text: compressedTextValue },
  cleanQuality(),
);

const hleTextValue = "https://rectamatrix.dev/items/123456789";
const hleText = encodeTextWithTrace(hleTextValue, {
  eccLevel: "medium",
  compression: "rm-hle1",
});
add(
  "clean-rm-hle1-utf8",
  inputFromFixture(fixture(hleText), false),
  { type: "utf8", text: hleTextValue },
  cleanQuality(),
);

const headerUnknown = fixture(cleanBinary);
damageBytes(headerUnknown, "header", [0, 1], undefined);
add(
  "header-two-unknown-errors",
  inputFromFixture(headerUnknown, false),
  binary(cleanBinaryPayload),
  {
    ...cleanQuality(),
    headerCorrectedCodewords: 2,
  },
);

const lowPayload = deterministicBytes(10, 17);
const lowTrace = encodeBytesWithTrace(lowPayload, {
  sizeId: 0,
  eccLevel: "low",
  compression: "none",
});
const lowUnknown = fixture(lowTrace);
damageBytes(lowUnknown, "body", [0, 1], undefined);
add(
  "body-low-maximum-unknown-errors",
  inputFromFixture(lowUnknown, false),
  binary(lowPayload),
  { ...cleanQuality(), correctedCodewords: 2 },
);

const mediumPayload = deterministicBytes(30, 89);
const mediumTrace = encodeBytesWithTrace(mediumPayload, {
  eccLevel: "medium",
  compression: "none",
});
const mediumUnknown = fixture(mediumTrace);
damageBytes(mediumUnknown, "body", [0, 1, 2, 3], undefined);
add(
  "body-medium-maximum-unknown-errors",
  inputFromFixture(mediumUnknown, false),
  binary(mediumPayload),
  { ...cleanQuality(), correctedCodewords: 4 },
);

const highPayload = deterministicBytes(30, 157);
const highTrace = encodeBytesWithTrace(highPayload, {
  eccLevel: "high",
  compression: "none",
});
const highUnknown = fixture(highTrace);
damageBytes(highUnknown, "body", [0, 1, 2, 3, 4, 5], undefined);
add(
  "body-high-maximum-unknown-errors",
  inputFromFixture(highUnknown, false),
  binary(highPayload),
  { ...cleanQuality(), correctedCodewords: 6 },
);

const headerErasures = fixture(cleanBinary);
damageBytes(headerErasures, "header", [0, 1, 2, 3], 0);
add(
  "header-reference-four-erasures",
  inputFromFixture(headerErasures, true),
  binary(cleanBinaryPayload),
  {
    ...cleanQuality(),
    headerCorrectedCodewords: 4,
    headerErasuresUsed: 4,
  },
);

const bodyErasures = fixture(mediumTrace);
damageBytes(bodyErasures, "body", [0, 1, 2, 3, 4, 5, 6, 7], 0);
add(
  "body-reference-eight-erasures",
  inputFromFixture(bodyErasures, true),
  binary(mediumPayload),
  {
    ...cleanQuality(),
    correctedCodewords: 8,
    erasuresUsed: 8,
  },
);

const mixedCorrection = fixture(mediumTrace);
damageBytes(mixedCorrection, "body", [0, 1], undefined);
damageBytes(mixedCorrection, "body", [2, 3, 4, 5], 0);
add(
  "body-mixed-errors-and-erasures",
  inputFromFixture(mixedCorrection, true),
  binary(mediumPayload),
  {
    ...cleanQuality(),
    correctedCodewords: 6,
    erasuresUsed: 4,
  },
);

const strictHeader = fixture(cleanBinary);
damageBytes(strictHeader, "header", [0, 1, 2], 0.4);
add(
  "header-strict-profile-fallback",
  inputFromFixture(strictHeader, true),
  binary(cleanBinaryPayload),
  {
    ...cleanQuality(),
    headerCorrectedCodewords: 3,
    headerErasuresUsed: 3,
    decodeAttempts: 3,
    headerErasureProfile: "strict",
  },
);

const strictBody = fixture(mediumTrace);
damageBytes(strictBody, "body", [0, 1, 2, 3, 4], 0.45);
add(
  "body-strict-profile-fallback",
  inputFromFixture(strictBody, true),
  binary(mediumPayload),
  {
    ...cleanQuality(),
    correctedCodewords: 5,
    erasuresUsed: 5,
    decodeAttempts: 3,
    bodyErasureProfile: "strict",
  },
);

const permissiveBody = fixture(mediumTrace);
damageBytes(permissiveBody, "body", [0, 1, 2, 3], 0);
markConfidence(permissiveBody, "body", [4, 5, 6, 7, 8], 0.35);
add(
  "body-permissive-profile-fallback",
  inputFromFixture(permissiveBody, true),
  binary(mediumPayload),
  {
    ...cleanQuality(),
    correctedCodewords: 4,
    erasuresUsed: 4,
    decodeAttempts: 3,
    bodyErasureProfile: "permissive",
  },
);

const noneHeader = fixture(cleanBinary);
damageBytes(noneHeader, "header", [0], undefined);
markConfidence(noneHeader, "header", [1, 2, 3, 4, 5], 0);
add(
  "header-none-profile-fallback",
  inputFromFixture(noneHeader, true),
  binary(cleanBinaryPayload),
  {
    ...cleanQuality(),
    headerCorrectedCodewords: 1,
    decodeAttempts: 3,
    headerErasureProfile: "none",
  },
);

const noneBody = fixture(mediumTrace);
damageBytes(noneBody, "body", [0], undefined);
markConfidence(noneBody, "body", [1, 2, 3, 4, 5, 6, 7, 8, 9], 0);
add(
  "body-none-profile-fallback",
  inputFromFixture(noneBody, true),
  binary(mediumPayload),
  {
    ...cleanQuality(),
    correctedCodewords: 1,
    decodeAttempts: 3,
    bodyErasureProfile: "none",
  },
);

const multiBlockPayload = deterministicBytes(300, 211);
const multiBlockTrace = encodeBytesWithTrace(multiBlockPayload, {
  sizeId: 6,
  eccLevel: "medium",
  compression: "none",
});
const multiBlock = fixture(multiBlockTrace);
damageBytes(
  multiBlock,
  "body",
  Array.from({ length: 20 }, (_, index) => index),
  0,
);
add(
  "body-multi-block-twenty-erasures",
  inputFromFixture(multiBlock, true),
  binary(multiBlockPayload),
  {
    ...cleanQuality(),
    correctedCodewords: 20,
    erasuresUsed: 20,
  },
);

export function buildCanonicalDecoderPositiveVectorSuite(): DecoderPositiveVectorSuite {
  return createDecoderPositiveVectorSuite(vectors);
}

function add(
  id: string,
  input: DecoderVectorInput,
  expectedPayload: DecoderExpectedPayload,
  expectedQuality: QualityAssertion,
): void {
  const vector = createDecoderPositiveVector(id, input, expectedPayload);
  for (const [key, expected] of Object.entries(expectedQuality)) {
    const actual =
      vector.expected.metadata.quality[
        key as keyof DecoderPositiveQualityExpected
      ];
    if (actual !== expected) {
      throw new Error(
        `Positive decoder fixture "${id}" quality ${key} was ${String(actual)}, expected ${String(expected)}.`,
      );
    }
  }
  vectors.push(vector);
}

function cleanQuality(): QualityAssertion {
  return {
    correctedCodewords: 0,
    erasuresUsed: 0,
    headerCorrectedCodewords: 0,
    headerErasuresUsed: 0,
    decodeAttempts: 2,
    headerErasureProfile: "reference",
    bodyErasureProfile: "reference",
  };
}

function fixture(trace: EncoderTrace, confidence = 1): MutableFixture {
  return {
    trace,
    modules: trace.symbol.matrix.map((row) => [...row]),
    confidence: Array.from({ length: trace.symbol.height }, () =>
      Array<number>(trace.symbol.width).fill(confidence),
    ),
  };
}

function inputFromFixture(
  value: MutableFixture,
  includeConfidence: boolean,
  detectorMetadata?: DecoderNegativeDetectorMetadata,
): DecoderVectorInput {
  return {
    modules: matrixToRows(value.modules),
    ...(includeConfidence ? { confidence: value.confidence } : {}),
    ...(detectorMetadata === undefined ? {} : { detectorMetadata }),
  };
}

function damageBytes(
  value: MutableFixture,
  section: "header" | "body",
  byteIndices: readonly number[],
  confidence: number | undefined,
): void {
  const coordinates = sectionCoordinates(value.trace, section);
  for (const byteIndex of byteIndices) {
    const byteCoordinates = coordinates.slice(byteIndex * 8, byteIndex * 8 + 8);
    flip(value.modules, byteCoordinates[0]!);
    if (confidence !== undefined) {
      setConfidence(value.confidence, byteCoordinates, confidence);
    }
  }
}

function markConfidence(
  value: MutableFixture,
  section: "header" | "body",
  byteIndices: readonly number[],
  confidence: number,
): void {
  const coordinates = sectionCoordinates(value.trace, section);
  for (const byteIndex of byteIndices) {
    setConfidence(
      value.confidence,
      coordinates.slice(byteIndex * 8, byteIndex * 8 + 8),
      confidence,
    );
  }
}

function sectionCoordinates(
  trace: EncoderTrace,
  section: "header" | "body",
): readonly Coordinate[] {
  const scan = buildScanOrder(getSymbolSize(trace.symbol.sizeId));
  return section === "header"
    ? scan.slice(0, HEADER_BITS)
    : scan.slice(HEADER_BITS);
}

function flip(modules: boolean[][], coordinate: Coordinate): void {
  modules[coordinate.y]![coordinate.x] = !modules[coordinate.y]![coordinate.x];
}

function setConfidence(
  confidence: number[][],
  coordinates: readonly Coordinate[],
  value: number,
): void {
  for (const { x, y } of coordinates) confidence[y]![x] = value;
}

function matrixToRows(matrix: BooleanMatrix): readonly string[] {
  return Object.freeze(
    matrix.map((row) => row.map((value) => (value ? "1" : "0")).join("")),
  );
}

function binary(bytes: Uint8Array): DecoderExpectedPayload {
  return { type: "binary", payloadHex: bytesToHex(bytes) };
}

function deterministicBytes(length: number, seed: number): Uint8Array {
  let state = (0x9e3779b9 ^ seed) >>> 0;
  return Uint8Array.from({ length }, () => {
    state ^= state << 13;
    state ^= state >>> 17;
    state ^= state << 5;
    return state & 0xff;
  });
}
