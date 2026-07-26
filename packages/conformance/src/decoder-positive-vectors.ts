import {
  decodeSampledSymbol,
  type DecodeMetadata,
  type DecodeQualityReport,
  type DecodeResult,
} from "@rectamatrix/decoder";
import { encodeUtf8Strict } from "@rectamatrix/core";
import {
  normalizeDecoderVectorInput,
  toSampledSymbol,
} from "./decoder-negative-vectors.js";
import { bytesToHex, hexToBytes } from "./hex.js";
import type {
  DecoderExpectedPayload,
  DecoderPositiveExpected,
  DecoderPositiveMetadataExpected,
  DecoderPositiveQualityExpected,
  DecoderPositiveVector,
  DecoderPositiveVectorSuite,
  DecoderVectorInput,
} from "./types.js";

export function createDecoderPositiveVector(
  id: string,
  input: DecoderVectorInput,
  expectedPayload: DecoderExpectedPayload,
): DecoderPositiveVector {
  const normalizedInput = normalizeDecoderVectorInput(input);
  const result = decodeSampledSymbol(toSampledSymbol(normalizedInput));
  if (!result.ok) {
    throw new Error(
      `Positive decoder fixture "${id}" failed with ${result.error.code}.`,
    );
  }
  assertExpectedPayload(id, result, expectedPayload);
  return Object.freeze({
    id,
    input: normalizedInput,
    expected: decoderResultToExpected(result),
  });
}

export function createDecoderPositiveVectorSuite(
  vectors: readonly DecoderPositiveVector[],
): DecoderPositiveVectorSuite {
  return Object.freeze({
    format: "rectamatrix-conformance",
    vectorVersion: 1,
    coreVersion: 1,
    kind: "decoder-positive",
    vectors: Object.freeze([...vectors]),
  });
}

export function decoderResultToExpected(
  result: Extract<DecodeResult, { readonly ok: true }>,
): DecoderPositiveExpected {
  const base = {
    payloadHex: bytesToHex(result.bytes),
    metadata: metadataToExpected(result.metadata),
  };
  return result.type === "utf8"
    ? Object.freeze({ type: "utf8", ...base, text: result.text })
    : Object.freeze({ type: "binary", ...base });
}

function metadataToExpected(
  metadata: DecodeMetadata,
): DecoderPositiveMetadataExpected {
  return Object.freeze({
    version: metadata.version,
    sizeId: metadata.sizeId,
    width: metadata.width,
    height: metadata.height,
    eccLevel: metadata.eccLevel,
    compression: metadata.compression,
    maskId: metadata.maskId,
    quality: qualityToExpected(metadata.quality),
  });
}

function qualityToExpected(
  quality: DecodeQualityReport,
): DecoderPositiveQualityExpected {
  return Object.freeze({
    profile: quality.profile,
    overallConfidence: quality.overallConfidence,
    averageModuleConfidence: quality.averageModuleConfidence,
    minimumModuleConfidence: quality.minimumModuleConfidence,
    anchorScore: quality.anchorScore,
    topClockScore: quality.topClockScore,
    leftClockScore: quality.leftClockScore,
    correctedCodewords: quality.correctedCodewords,
    erasuresUsed: quality.erasuresUsed,
    headerCorrectedCodewords: quality.headerCorrectedCodewords,
    headerErasuresUsed: quality.headerErasuresUsed,
    decodeAttempts: quality.decodeAttempts,
    headerErasureProfile: quality.headerErasureProfile,
    bodyErasureProfile: quality.bodyErasureProfile,
    crcValid: true,
    ...(quality.imageQuality === undefined
      ? {}
      : { imageQuality: quality.imageQuality }),
    ...(quality.blurEstimate === undefined
      ? {}
      : { blurEstimate: quality.blurEstimate }),
    ...(quality.perspectiveEstimateDegrees === undefined
      ? {}
      : {
          perspectiveEstimateDegrees: quality.perspectiveEstimateDegrees,
        }),
  });
}

function assertExpectedPayload(
  id: string,
  result: Extract<DecodeResult, { readonly ok: true }>,
  expected: DecoderExpectedPayload,
): void {
  if (result.type !== expected.type) {
    throw new Error(`Positive decoder fixture "${id}" changed Payload Type.`);
  }
  const expectedBytes =
    expected.type === "binary"
      ? hexToBytes(expected.payloadHex)
      : encodeUtf8Strict(expected.text);
  if (
    result.bytes.length !== expectedBytes.length ||
    result.bytes.some((value, index) => value !== expectedBytes[index])
  ) {
    throw new Error(`Positive decoder fixture "${id}" changed Payload bytes.`);
  }
  if (
    result.type === "utf8" &&
    expected.type === "utf8" &&
    result.text !== expected.text
  ) {
    throw new Error(`Positive decoder fixture "${id}" changed decoded text.`);
  }
}
