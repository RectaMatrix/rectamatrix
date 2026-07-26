import { encodeUtf8Strict, type SizeId } from "@rectamatrix/core";
import {
  decodeImageData,
  sampleVisionCandidate,
  type ImageDataLike,
  type OrientationDegrees,
} from "@rectamatrix/detector";
import { bytesToHex, hexToBytes } from "./hex.js";
import type {
  DecoderExpectedPayload,
  ImageVector,
  ImageVectorAsset,
  ImageVectorOptions,
  ImageVectorSuite,
} from "./types.js";

export type ImageSuccessExpectation = DecoderExpectedPayload & {
  readonly sizeId: SizeId;
  readonly orientationDegrees: OrientationDegrees;
  readonly minimumOverallConfidence: number;
};

export function createImageSuccessVector(
  id: string,
  categories: readonly string[],
  asset: ImageVectorAsset,
  image: ImageDataLike,
  options: ImageVectorOptions,
  expectation: ImageSuccessExpectation,
): ImageVector {
  const result = decodeImageData(image, options);
  if (!result.ok) {
    throw new Error(`Image fixture "${id}" failed with ${result.error.code}.`);
  }
  const expectedBytes =
    expectation.type === "binary"
      ? hexToBytes(expectation.payloadHex)
      : encodeUtf8Strict(expectation.text);
  if (
    result.type !== expectation.type ||
    result.bytes.length !== expectedBytes.length ||
    result.bytes.some((value, index) => value !== expectedBytes[index]) ||
    result.metadata.sizeId !== expectation.sizeId ||
    result.vision.orientationDegrees !== expectation.orientationDegrees ||
    result.metadata.quality.overallConfidence <
      expectation.minimumOverallConfidence
  ) {
    throw new Error(`Image fixture "${id}" produced an unexpected result.`);
  }
  if (
    result.type === "utf8" &&
    expectation.type === "utf8" &&
    result.text !== expectation.text
  ) {
    throw new Error(`Image fixture "${id}" produced unexpected text.`);
  }
  const sample = sampleVisionCandidate(
    image,
    result.vision.sourceQuadrilateral,
    result.metadata.sizeId,
    result.vision.orientationDegrees,
    options,
  );
  const common = {
    result: "success" as const,
    type: result.type,
    payloadHex: bytesToHex(result.bytes),
    sizeId: result.metadata.sizeId,
    orientationDegrees: result.vision.orientationDegrees,
    minimumOverallConfidence: expectation.minimumOverallConfidence,
    referenceModules: Object.freeze(
      sample.modules.map((row) =>
        row.map((module) => (module ? "1" : "0")).join(""),
      ),
    ),
    referenceConfidence: Object.freeze(
      sample.confidence.map((row) => Object.freeze([...row])),
    ),
  };
  return Object.freeze({
    id,
    categories: Object.freeze([...categories]),
    image: Object.freeze({ ...asset }),
    options: copyOptions(options),
    expected:
      result.type === "utf8"
        ? Object.freeze({ ...common, type: "utf8", text: result.text })
        : Object.freeze({ ...common, type: "binary" }),
  });
}

export function createImageFailureVector(
  id: string,
  categories: readonly string[],
  asset: ImageVectorAsset,
  image: ImageDataLike,
  options: ImageVectorOptions,
  allowedErrorCodes: readonly string[],
): ImageVector {
  const result = decodeImageData(image, options);
  if (result.ok || !allowedErrorCodes.includes(result.error.code)) {
    throw new Error(`Negative image fixture "${id}" did not fail as expected.`);
  }
  return Object.freeze({
    id,
    categories: Object.freeze([...categories]),
    image: Object.freeze({ ...asset }),
    options: copyOptions(options),
    expected: Object.freeze({
      result: "failure",
      allowedErrorCodes: Object.freeze([...allowedErrorCodes]),
    }),
  });
}

export function createImageVectorSuite(
  vectors: readonly ImageVector[],
): ImageVectorSuite {
  return Object.freeze({
    format: "rectamatrix-conformance",
    vectorVersion: 1,
    coreVersion: 1,
    kind: "image",
    vectors: Object.freeze([...vectors]),
  });
}

function copyOptions(options: ImageVectorOptions): ImageVectorOptions {
  return Object.freeze({
    ...(options.sourceQuadrilateral === undefined
      ? {}
      : {
          sourceQuadrilateral: Object.freeze(
            options.sourceQuadrilateral.map((point) =>
              Object.freeze({ ...point }),
            ),
          ) as NonNullable<ImageVectorOptions["sourceQuadrilateral"]>,
        }),
    ...(options.samplesPerModule === undefined
      ? {}
      : { samplesPerModule: options.samplesPerModule }),
    ...(options.tryInverted === undefined
      ? {}
      : { tryInverted: options.tryInverted }),
    ...(options.minimumModulePixels === undefined
      ? {}
      : { minimumModulePixels: options.minimumModulePixels }),
    ...(options.maximumCandidates === undefined
      ? {}
      : { maximumCandidates: options.maximumCandidates }),
  });
}
