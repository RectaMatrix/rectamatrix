import { decodeSampledSymbol } from "@rectamatrix/decoder";
import { toSampledSymbol } from "./decoder-negative-vectors.js";
import { decoderResultToExpected } from "./decoder-positive-vectors.js";
import type {
  DecoderPositiveVector,
  DecoderPositiveVectorSuite,
  VectorVerificationResult,
} from "./types.js";
import { validateDecoderPositiveVectorSuite } from "./validate-decoder-positive.js";
import { ConformanceMismatchError, assertConformanceEqual } from "./verify.js";

export function verifyDecoderPositiveVector(
  vector: DecoderPositiveVector,
): VectorVerificationResult {
  const result = decodeSampledSymbol(toSampledSymbol(vector.input));
  if (!result.ok) {
    throw new ConformanceMismatchError(
      vector.id,
      `positive vector failed with ${result.error.code}.`,
    );
  }
  assertConformanceEqual(
    vector.expected,
    decoderResultToExpected(result),
    vector.id,
    "expected",
  );
  return Object.freeze({ id: vector.id, verified: true });
}

export function verifyDecoderPositiveVectorSuite(
  value: unknown,
): readonly VectorVerificationResult[] {
  validateDecoderPositiveVectorSuite(value);
  return Object.freeze(value.vectors.map(verifyDecoderPositiveVector));
}

export function asDecoderPositiveVectorSuite(
  value: unknown,
): DecoderPositiveVectorSuite {
  validateDecoderPositiveVectorSuite(value);
  return value;
}
