import {
  decodeImageData,
  sampleVisionCandidate,
  type ImageDataLike,
} from "@rectamatrix/detector";
import { encodeUtf8Strict } from "@rectamatrix/core";
import { hexToBytes } from "./hex.js";
import type {
  ImageVector,
  ImageVectorSuite,
  VectorVerificationResult,
} from "./types.js";
import { validateImageVectorSuite } from "./validate-image.js";
import { ConformanceMismatchError } from "./verify.js";

export function verifyImageVector(
  vector: ImageVector,
  image: ImageDataLike,
): VectorVerificationResult {
  if (
    image.width !== vector.image.width ||
    image.height !== vector.image.height
  ) {
    throw new ConformanceMismatchError(
      vector.id,
      "image dimensions differ from the manifest.",
    );
  }
  const result = decodeImageData(image, vector.options);
  if (vector.expected.result === "failure") {
    if (result.ok) {
      throw new ConformanceMismatchError(
        vector.id,
        "negative image returned a Payload.",
      );
    }
    if (!vector.expected.allowedErrorCodes.includes(result.error.code)) {
      throw new ConformanceMismatchError(
        vector.id,
        `unexpected image error ${result.error.code}.`,
      );
    }
    return Object.freeze({ id: vector.id, verified: true });
  }
  const expected = vector.expected;
  if (!result.ok) {
    throw new ConformanceMismatchError(
      vector.id,
      `positive image failed with ${result.error.code}.`,
    );
  }
  const expectedBytes =
    expected.type === "binary"
      ? hexToBytes(expected.payloadHex)
      : encodeUtf8Strict(expected.text);
  if (
    result.type !== expected.type ||
    result.bytes.length !== expectedBytes.length ||
    result.bytes.some((value, index) => value !== expectedBytes[index]) ||
    result.metadata.sizeId !== expected.sizeId ||
    result.vision.orientationDegrees !== expected.orientationDegrees ||
    result.metadata.quality.overallConfidence <
      expected.minimumOverallConfidence
  ) {
    throw new ConformanceMismatchError(
      vector.id,
      "decoded image result differs from the manifest.",
    );
  }
  const sample = sampleVisionCandidate(
    image,
    result.vision.sourceQuadrilateral,
    result.metadata.sizeId,
    result.vision.orientationDegrees,
    vector.options,
  );
  const moduleRows = sample.modules.map((row) =>
    row.map((module) => (module ? "1" : "0")).join(""),
  );
  if (
    moduleRows.length !== expected.referenceModules.length ||
    moduleRows.some((row, index) => row !== expected.referenceModules[index])
  ) {
    throw new ConformanceMismatchError(
      vector.id,
      "normalized reference modules differ.",
    );
  }
  for (let y = 0; y < sample.confidence.length; y += 1) {
    const actualRow = sample.confidence[y]!;
    const expectedRow = expected.referenceConfidence[y];
    if (
      expectedRow === undefined ||
      actualRow.length !== expectedRow.length ||
      actualRow.some(
        (value, index) => Math.abs(value - expectedRow[index]!) > 1e-12,
      )
    ) {
      throw new ConformanceMismatchError(
        vector.id,
        "normalized reference confidence differs.",
      );
    }
  }
  return Object.freeze({ id: vector.id, verified: true });
}

export function validateAndVerifyImageVectorSuite(
  value: unknown,
  images: ReadonlyMap<string, ImageDataLike>,
): readonly VectorVerificationResult[] {
  validateImageVectorSuite(value);
  return Object.freeze(
    value.vectors.map((vector) => {
      const image = images.get(vector.image.file);
      if (image === undefined) {
        throw new ConformanceMismatchError(vector.id, "image file is missing.");
      }
      return verifyImageVector(vector, image);
    }),
  );
}

export function asImageVectorSuite(value: unknown): ImageVectorSuite {
  validateImageVectorSuite(value);
  return value;
}
