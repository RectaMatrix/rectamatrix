import {
  HEADER_BITS,
  RECTAMATRIX_SIZES,
  RectaMatrixError,
  applyBodyMask,
  applyHeaderWhitening,
  buildInterleavingMap,
  buildScanOrder,
  bytesToUint32BE,
  calculateRsLayout,
  crc32c,
  decodeProtectedHeader,
  decodeUtf8Strict,
  deinterleaveCodewords,
  readCodewordsFromBodyBits,
  reassembleFrame,
  reedSolomonDecode,
  rmlz1Decode,
  type Coordinate,
  type HeaderFields,
  type ReedSolomonDecodeResult,
  type RsLayout,
  type SymbolSize,
} from "@rectamatrix/core";
import type {
  DecodeMetadata,
  DecodeQualityReport,
  DecodeResult,
  DetectorMetadata,
  SampledSymbolInput,
} from "./types.js";

interface ConfidenceRules {
  readonly lowBitThreshold: number;
  readonly lowBitCount: number;
  readonly meanThreshold: number;
  readonly minimumThreshold?: number;
}

interface ErasureProfile {
  readonly name: "reference" | "strict" | "permissive" | "none";
  readonly header?: ConfidenceRules;
  readonly body?: ConfidenceRules;
}

interface ByteRead {
  readonly bytes: Uint8Array;
  readonly confidence: readonly ByteConfidence[];
}

interface ByteConfidence {
  readonly mean: number;
  readonly minimum: number;
  readonly values: readonly number[];
}

interface ValidatedSample {
  readonly modules: readonly (readonly boolean[])[];
  readonly confidence?: readonly (readonly number[])[];
  readonly size: SymbolSize;
  readonly averageConfidence: number;
  readonly minimumConfidence: number;
  readonly detectorMetadata?: DetectorMetadata;
}

interface StructuralScores {
  readonly anchor: number;
  readonly anchorCutout: number;
  readonly topClock: number;
  readonly leftClock: number;
}

interface HeaderCandidate {
  readonly fields: HeaderFields;
  readonly correctedCodewords: number;
  readonly erasuresUsed: number;
  readonly profileName: ErasureProfile["name"];
}

interface BodyDecode {
  readonly originalPayload: Uint8Array;
  readonly correctedCodewords: number;
  readonly erasuresUsed: number;
  readonly profileName: ErasureProfile["name"];
}

const ERASURE_PROFILES: readonly ErasureProfile[] = Object.freeze([
  Object.freeze({
    name: "reference",
    header: Object.freeze({
      lowBitThreshold: 0.25,
      lowBitCount: 2,
      meanThreshold: 0.35,
    }),
    body: Object.freeze({
      lowBitThreshold: 0.3,
      lowBitCount: 3,
      meanThreshold: 0.4,
      minimumThreshold: 0.1,
    }),
  }),
  Object.freeze({
    name: "strict",
    header: Object.freeze({
      lowBitThreshold: 0.35,
      lowBitCount: 2,
      meanThreshold: 0.45,
    }),
    body: Object.freeze({
      lowBitThreshold: 0.4,
      lowBitCount: 2,
      meanThreshold: 0.5,
      minimumThreshold: 0.2,
    }),
  }),
  Object.freeze({
    name: "permissive",
    header: Object.freeze({
      lowBitThreshold: 0.15,
      lowBitCount: 3,
      meanThreshold: 0.25,
    }),
    body: Object.freeze({
      lowBitThreshold: 0.2,
      lowBitCount: 4,
      meanThreshold: 0.3,
      minimumThreshold: 0.05,
    }),
  }),
  Object.freeze({ name: "none" }),
]);

const MINIMUM_ANCHOR_SCORE = 0.8;
const MINIMUM_CLOCK_SCORE = 0.75;
const MINIMUM_COMBINED_CLOCK_SCORE = 0.82;

export function decodeSampledSymbol(symbol: SampledSymbolInput): DecodeResult {
  try {
    const sample = validateSample(symbol);
    const scores = calculateStructuralScores(sample);
    validateStructuralScores(scores);
    const scan = buildScanOrder(sample.size);
    const headerCoordinates = scan.slice(0, HEADER_BITS);
    const bodyCoordinates = scan.slice(HEADER_BITS);
    const headerRead = readBytesWithConfidence(sample, headerCoordinates, 12);
    let attempts = 0;
    let decodedHeaderCandidate = false;
    let lastFailure = new DecoderFailure(
      "HEADER_RS_FAILURE",
      "Format Header could not be corrected and validated.",
    );
    const attemptedHeaderErasures = new Set<string>();
    const correctedHeaders = new Set<string>();

    for (const headerProfile of ERASURE_PROFILES) {
      const headerErasures = selectErasures(
        headerRead.confidence,
        headerProfile.header,
      );
      const headerErasureKey = headerErasures.join(",");
      if (attemptedHeaderErasures.has(headerErasureKey)) continue;
      attemptedHeaderErasures.add(headerErasureKey);
      attempts += 1;
      let header: HeaderCandidate;
      try {
        const decoded = decodeProtectedHeader(
          applyHeaderWhitening(headerRead.bytes),
          headerErasures,
          sample.size.sizeId,
        );
        const correctedKey = Array.from(decoded.correctedHeader).join(",");
        if (correctedHeaders.has(correctedKey)) continue;
        correctedHeaders.add(correctedKey);
        decodedHeaderCandidate = true;
        header = Object.freeze({
          fields: decoded.fields,
          correctedCodewords: decoded.correctedCodewords,
          erasuresUsed: decoded.erasuresUsed,
          profileName: headerProfile.name,
        });
      } catch (error) {
        lastFailure = normalizeHeaderFailure(error);
        continue;
      }
      let layout: RsLayout;
      try {
        layout = calculateRsLayout(
          header.fields.encodedLength + 4,
          header.fields.eccLevel,
        );
      } catch {
        lastFailure = new DecoderFailure(
          "INVALID_HEADER",
          "Header lengths do not define a valid RS layout.",
        );
        continue;
      }
      if (layout.totalCodewordBytes * 8 + 1 > bodyCoordinates.length) {
        lastFailure = new DecoderFailure(
          "BODY_TRUNCATED",
          "Header declares more codewords than the Body can contain.",
        );
        continue;
      }

      const bodyRead = readMaskedBody(
        sample,
        bodyCoordinates,
        layout.totalCodewordBytes,
        header.fields.maskId,
      );
      const attemptedErasures = new Set<string>();
      for (const profile of ERASURE_PROFILES) {
        const erasures = selectErasures(bodyRead.confidence, profile.body);
        const erasureKey = erasures.join(",");
        if (attemptedErasures.has(erasureKey)) continue;
        attemptedErasures.add(erasureKey);
        attempts += 1;
        try {
          const body = decodeBody(
            bodyRead.bytes,
            erasures,
            layout,
            header.fields,
            profile.name,
          );
          return buildSuccess(sample, scores, header, body, attempts);
        } catch (error) {
          lastFailure = normalizeBodyFailure(error);
        }
      }
    }
    if (!decodedHeaderCandidate) {
      throw normalizeHeaderFailure(lastFailure);
    }
    throw lastFailure;
  } catch (error) {
    return failureResult(normalizePublicFailure(error));
  }
}

function validateSample(symbol: SampledSymbolInput): ValidatedSample {
  const runtimeSymbol: unknown = symbol;
  if (
    typeof runtimeSymbol !== "object" ||
    runtimeSymbol === null ||
    !("modules" in runtimeSymbol)
  ) {
    throw new DecoderFailure(
      "INVALID_GEOMETRY",
      "Sampled Symbol must contain a module matrix.",
    );
  }
  const modules = symbol.modules;
  if (!Array.isArray(modules) || modules.length === 0) {
    throw new DecoderFailure(
      "INVALID_GEOMETRY",
      "Module matrix must be a non-empty array.",
    );
  }
  const firstRow: unknown = modules[0];
  if (!Array.isArray(firstRow) || firstRow.length === 0) {
    throw new DecoderFailure(
      "INVALID_GEOMETRY",
      "Module matrix rows must be non-empty arrays.",
    );
  }
  const height = modules.length;
  const width = firstRow.length;
  const size = RECTAMATRIX_SIZES.find(
    (candidate) => candidate.width === width && candidate.height === height,
  );
  if (size === undefined) {
    throw new DecoderFailure(
      "UNSUPPORTED_SIZE",
      `Unsupported sampled matrix dimensions: ${String(width)} × ${String(height)}.`,
    );
  }
  for (const row of modules) {
    if (!Array.isArray(row) || row.length !== width) {
      throw new DecoderFailure(
        "INVALID_GEOMETRY",
        "Module matrix must be rectangular.",
      );
    }
    if (row.some((value) => typeof value !== "boolean")) {
      throw new DecoderFailure(
        "INVALID_GEOMETRY",
        "Every sampled module must be boolean.",
      );
    }
  }

  const confidence = symbol.confidence;
  let confidenceSum = 0;
  let minimumConfidence = 1;
  if (confidence !== undefined) {
    if (!Array.isArray(confidence) || confidence.length !== height) {
      throw invalidConfidence(
        "Confidence matrix dimensions must match the module matrix.",
      );
    }
    for (const row of confidence) {
      if (!Array.isArray(row) || row.length !== width) {
        throw invalidConfidence(
          "Confidence matrix dimensions must match the module matrix.",
        );
      }
      for (const rawValue of row as unknown[]) {
        if (
          typeof rawValue !== "number" ||
          !Number.isFinite(rawValue) ||
          rawValue < 0 ||
          rawValue > 1
        ) {
          throw invalidConfidence(
            "Confidence values must be finite numbers in [0, 1].",
          );
        }
        const value = rawValue;
        confidenceSum += value;
        minimumConfidence = Math.min(minimumConfidence, value);
      }
    }
  } else {
    confidenceSum = width * height;
  }
  const detectorMetadata = validateDetectorMetadata(symbol.detectorMetadata);
  return {
    modules,
    ...(confidence === undefined ? {} : { confidence }),
    size,
    averageConfidence: confidenceSum / (width * height),
    minimumConfidence,
    ...(detectorMetadata === undefined ? {} : { detectorMetadata }),
  };
}

function validateDetectorMetadata(
  metadata: DetectorMetadata | undefined,
): DetectorMetadata | undefined {
  if (metadata === undefined) return undefined;
  const runtimeMetadata: unknown = metadata;
  if (typeof runtimeMetadata !== "object" || runtimeMetadata === null) {
    throw new DecoderFailure(
      "INVALID_DETECTOR_METADATA",
      "Detector metadata must be an object.",
    );
  }
  if (
    metadata.imageQuality !== undefined &&
    (!Number.isFinite(metadata.imageQuality) ||
      metadata.imageQuality < 0 ||
      metadata.imageQuality > 1)
  ) {
    throw new DecoderFailure(
      "INVALID_DETECTOR_METADATA",
      "Image quality must be in [0, 1].",
    );
  }
  for (const [name, value] of [
    ["blurEstimate", metadata.blurEstimate],
    ["perspectiveEstimateDegrees", metadata.perspectiveEstimateDegrees],
  ] as const) {
    if (value !== undefined && !Number.isFinite(value)) {
      throw new DecoderFailure(
        "INVALID_DETECTOR_METADATA",
        `${name} must be finite.`,
      );
    }
  }
  return Object.freeze({ ...metadata });
}

function calculateStructuralScores(sample: ValidatedSample): StructuralScores {
  const anchorCoordinates: Coordinate[] = [];
  const cutoutCoordinates: Coordinate[] = [];
  for (let y = 0; y < sample.size.anchorSize; y += 1) {
    for (let x = 0; x < sample.size.anchorSize; x += 1) {
      const coordinate = { x, y };
      anchorCoordinates.push(coordinate);
      if (x >= sample.size.anchorSize / 2 && y >= sample.size.anchorSize / 2) {
        cutoutCoordinates.push(coordinate);
      }
    }
  }
  const topCoordinates = Array.from(
    { length: sample.size.width - sample.size.anchorSize },
    (_, index) => ({ x: sample.size.anchorSize + index, y: 0 }),
  );
  const leftCoordinates = Array.from(
    { length: sample.size.height - sample.size.anchorSize },
    (_, index) => ({ x: 0, y: sample.size.anchorSize + index }),
  );
  return Object.freeze({
    anchor: weightedAgreement(sample, anchorCoordinates, ({ x, y }) => {
      const half = sample.size.anchorSize / 2;
      return !(x >= half && y >= half);
    }),
    anchorCutout: weightedAgreement(sample, cutoutCoordinates, () => false),
    topClock: weightedAgreement(
      sample,
      topCoordinates,
      ({ x }) => (x - sample.size.anchorSize) % 2 === 0,
    ),
    leftClock: weightedAgreement(
      sample,
      leftCoordinates,
      ({ y }) => (y - sample.size.anchorSize) % 2 === 0,
    ),
  });
}

function validateStructuralScores(scores: StructuralScores): void {
  if (
    scores.anchor < MINIMUM_ANCHOR_SCORE ||
    scores.anchorCutout < MINIMUM_ANCHOR_SCORE
  ) {
    throw new DecoderFailure(
      "ANCHOR_NOT_FOUND",
      "Micro-Anchor agreement is below the reference threshold.",
      { anchorScore: scores.anchor, cutoutScore: scores.anchorCutout },
    );
  }
  if (
    scores.topClock < MINIMUM_CLOCK_SCORE ||
    scores.leftClock < MINIMUM_CLOCK_SCORE ||
    (scores.topClock + scores.leftClock) / 2 < MINIMUM_COMBINED_CLOCK_SCORE
  ) {
    throw new DecoderFailure(
      "CLOCKING_MISMATCH",
      "Clocking agreement is below the reference threshold.",
      {
        topClockScore: scores.topClock,
        leftClockScore: scores.leftClock,
      },
    );
  }
}

function readMaskedBody(
  sample: ValidatedSample,
  bodyCoordinates: readonly Coordinate[],
  codewordCount: number,
  maskId: HeaderFields["maskId"],
): ByteRead {
  const bitCount = codewordCount * 8;
  if (bitCount > bodyCoordinates.length) {
    throw new DecoderFailure(
      "BODY_TRUNCATED",
      "Body does not contain the declared codeword stream.",
    );
  }
  const coordinates = bodyCoordinates.slice(0, bitCount);
  const maskedBits = coordinates.map(({ x, y }) => sample.modules[y]![x]!);
  const bits = applyBodyMask(maskedBits, coordinates, maskId);
  return {
    bytes: readCodewordsFromBodyBits(bits, codewordCount),
    confidence: aggregateByteConfidence(sample, coordinates),
  };
}

function decodeBody(
  interleaved: Uint8Array,
  interleavedErasures: readonly number[],
  layout: RsLayout,
  header: HeaderFields,
  profileName: ErasureProfile["name"],
): BodyDecode {
  const blocks = deinterleaveCodewords(interleaved, layout);
  const map = buildInterleavingMap(layout);
  const blockErasures = Array.from(
    { length: layout.blockCount },
    () => [] as number[],
  );
  for (const streamIndex of interleavedErasures) {
    const position = map[streamIndex]!;
    const block = layout.blocks[position.blockIndex]!;
    blockErasures[position.blockIndex]!.push(
      position.section === "data"
        ? position.offset
        : block.dataLength + position.offset,
    );
  }

  const decodedBlocks: ReedSolomonDecodeResult[] = [];
  try {
    for (const block of blocks) {
      decodedBlocks.push(
        reedSolomonDecode(
          block.codeword,
          layout.blocks[block.index]!.parityLength,
          blockErasures[block.index],
        ),
      );
    }
  } catch {
    throw new DecoderFailure(
      "BODY_RS_FAILURE",
      "Body Reed-Solomon correction failed.",
    );
  }

  const frame = reassembleFrame(
    decodedBlocks.map((block) => block.data),
    layout,
  );
  if (frame.length !== header.encodedLength + 4) {
    throw new DecoderFailure(
      "LENGTH_MISMATCH",
      "Corrected Frame length does not match the Header.",
    );
  }
  const encodedPayload = frame.slice(0, header.encodedLength);
  const storedCrc = bytesToUint32BE(frame, header.encodedLength);
  let originalPayload: Uint8Array;
  if (header.compression === "none") {
    originalPayload = encodedPayload;
  } else {
    try {
      originalPayload = rmlz1Decode(encodedPayload, header.originalLength);
    } catch {
      throw new DecoderFailure(
        "DECOMPRESSION_FAILURE",
        "RM-LZ1 Payload decompression failed.",
      );
    }
  }
  if (originalPayload.length !== header.originalLength) {
    throw new DecoderFailure(
      "LENGTH_MISMATCH",
      "Original Payload length does not match the Header.",
    );
  }
  if (crc32c(originalPayload) !== storedCrc) {
    throw new DecoderFailure("CRC_FAILURE", "Payload CRC-32C does not match.");
  }
  if (header.payloadType === "utf8") {
    try {
      decodeUtf8Strict(originalPayload);
    } catch {
      throw new DecoderFailure(
        "INVALID_UTF8",
        "Payload is not valid strict UTF-8.",
      );
    }
  }
  return Object.freeze({
    originalPayload,
    correctedCodewords: decodedBlocks.reduce(
      (sum, block) => sum + block.correctedCodewords,
      0,
    ),
    erasuresUsed: decodedBlocks.reduce(
      (sum, block) => sum + block.erasuresUsed,
      0,
    ),
    profileName,
  });
}

function buildSuccess(
  sample: ValidatedSample,
  scores: StructuralScores,
  header: HeaderCandidate,
  body: BodyDecode,
  attempts: number,
): DecodeResult {
  const totalProtectedCodewords =
    calculateRsLayout(header.fields.encodedLength + 4, header.fields.eccLevel)
      .totalCodewordBytes + 12;
  const correctionConfidence = clamp01(
    1 -
      (body.correctedCodewords +
        body.erasuresUsed +
        header.correctedCodewords +
        header.erasuresUsed) /
        totalProtectedCodewords,
  );
  const structuralConfidence =
    (scores.anchor + scores.topClock + scores.leftClock) / 3;
  const imageQuality = sample.detectorMetadata?.imageQuality;
  const overallConfidence =
    imageQuality === undefined
      ? clamp01(
          structuralConfidence * 0.4 +
            sample.averageConfidence * 0.4 +
            correctionConfidence * 0.2,
        )
      : clamp01(
          structuralConfidence * 0.3 +
            sample.averageConfidence * 0.3 +
            correctionConfidence * 0.2 +
            imageQuality * 0.2,
        );
  const quality: DecodeQualityReport = Object.freeze({
    profile: "rmx-cv-1",
    overallConfidence,
    averageModuleConfidence: sample.averageConfidence,
    minimumModuleConfidence: sample.minimumConfidence,
    anchorScore: scores.anchor,
    topClockScore: scores.topClock,
    leftClockScore: scores.leftClock,
    correctedCodewords: body.correctedCodewords,
    erasuresUsed: body.erasuresUsed,
    headerCorrectedCodewords: header.correctedCodewords,
    headerErasuresUsed: header.erasuresUsed,
    decodeAttempts: attempts,
    headerErasureProfile: header.profileName,
    bodyErasureProfile: body.profileName,
    crcValid: true,
    ...(imageQuality === undefined ? {} : { imageQuality }),
    ...(sample.detectorMetadata?.blurEstimate === undefined
      ? {}
      : { blurEstimate: sample.detectorMetadata.blurEstimate }),
    ...(sample.detectorMetadata?.perspectiveEstimateDegrees === undefined
      ? {}
      : {
          perspectiveEstimateDegrees:
            sample.detectorMetadata.perspectiveEstimateDegrees,
        }),
  });
  const metadata: DecodeMetadata = Object.freeze({
    version: 1,
    sizeId: header.fields.sizeId,
    width: sample.size.width,
    height: sample.size.height,
    eccLevel: header.fields.eccLevel,
    compression: header.fields.compression,
    maskId: header.fields.maskId,
    quality,
  });
  const bytes = body.originalPayload.slice();
  if (header.fields.payloadType === "utf8") {
    return Object.freeze({
      ok: true,
      type: "utf8",
      text: decodeUtf8Strict(bytes),
      bytes,
      metadata,
    });
  }
  return Object.freeze({
    ok: true,
    type: "binary",
    bytes,
    metadata,
  });
}

function readBytesWithConfidence(
  sample: ValidatedSample,
  coordinates: readonly Coordinate[],
  byteCount: number,
): ByteRead {
  const bitCount = byteCount * 8;
  if (coordinates.length < bitCount) {
    throw new DecoderFailure(
      "BODY_TRUNCATED",
      "Sample does not contain the requested bytes.",
    );
  }
  const usedCoordinates = coordinates.slice(0, bitCount);
  const bits = usedCoordinates.map(({ x, y }) => sample.modules[y]![x]!);
  return Object.freeze({
    bytes: readCodewordsFromBodyBits(bits, byteCount),
    confidence: aggregateByteConfidence(sample, usedCoordinates),
  });
}

function aggregateByteConfidence(
  sample: ValidatedSample,
  coordinates: readonly Coordinate[],
): readonly ByteConfidence[] {
  if (coordinates.length % 8 !== 0) {
    throw new Error("Internal byte-confidence coordinate mismatch.");
  }
  const result: ByteConfidence[] = [];
  for (let offset = 0; offset < coordinates.length; offset += 8) {
    const values = coordinates
      .slice(offset, offset + 8)
      .map(({ x, y }) => confidenceAt(sample, x, y));
    result.push(
      Object.freeze({
        mean: values.reduce((sum, value) => sum + value, 0) / 8,
        minimum: Math.min(...values),
        values: Object.freeze(values),
      }),
    );
  }
  return Object.freeze(result);
}

function selectErasures(
  confidence: readonly ByteConfidence[],
  rules: ConfidenceRules | undefined,
): readonly number[] {
  if (rules === undefined) return Object.freeze([]);
  return Object.freeze(
    confidence.flatMap((byte, index) => {
      const lowBits = byte.values.filter(
        (value) => value < rules.lowBitThreshold,
      ).length;
      const erase =
        lowBits >= rules.lowBitCount ||
        byte.mean < rules.meanThreshold ||
        (rules.minimumThreshold !== undefined &&
          byte.minimum < rules.minimumThreshold);
      return erase ? [index] : [];
    }),
  );
}

function weightedAgreement(
  sample: ValidatedSample,
  coordinates: readonly Coordinate[],
  expected: (coordinate: Coordinate) => boolean,
): number {
  let weightedCorrect = 0;
  let totalWeight = 0;
  for (const coordinate of coordinates) {
    const confidence = confidenceAt(sample, coordinate.x, coordinate.y);
    totalWeight += confidence;
    if (sample.modules[coordinate.y]![coordinate.x] === expected(coordinate)) {
      weightedCorrect += confidence;
    }
  }
  return totalWeight === 0 ? 0 : weightedCorrect / totalWeight;
}

function confidenceAt(sample: ValidatedSample, x: number, y: number): number {
  return sample.confidence?.[y]?.[x] ?? 1;
}

function normalizeBodyFailure(error: unknown): DecoderFailure {
  if (error instanceof DecoderFailure) return error;
  if (error instanceof RectaMatrixError) {
    return new DecoderFailure(error.code, error.message);
  }
  if (error instanceof RangeError) {
    return new DecoderFailure("BODY_RS_FAILURE", error.message);
  }
  throw error;
}

function normalizeHeaderFailure(error: unknown): DecoderFailure {
  if (error instanceof DecoderFailure) return error;
  if (error instanceof RectaMatrixError) {
    return new DecoderFailure(error.code, error.message);
  }
  if (error instanceof RangeError) {
    return new DecoderFailure("HEADER_RS_FAILURE", error.message);
  }
  throw error;
}

function normalizePublicFailure(error: unknown): DecoderFailure {
  if (error instanceof DecoderFailure) return error;
  if (error instanceof RectaMatrixError) {
    return new DecoderFailure(error.code, error.message);
  }
  if (error instanceof RangeError || error instanceof TypeError) {
    return new DecoderFailure("INVALID_GEOMETRY", error.message);
  }
  throw error;
}

function failureResult(failure: DecoderFailure): DecodeResult {
  return Object.freeze({
    ok: false,
    error: Object.freeze({
      code: failure.code,
      message: failure.message,
      ...(failure.details === undefined
        ? {}
        : { details: Object.freeze({ ...failure.details }) }),
    }),
  });
}

function invalidConfidence(message: string): DecoderFailure {
  return new DecoderFailure("INVALID_CONFIDENCE", message);
}

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}

class DecoderFailure extends Error {
  public constructor(
    public readonly code: string,
    message: string,
    public readonly details?: Readonly<Record<string, unknown>>,
  ) {
    super(message);
    this.name = "DecoderFailure";
  }
}
