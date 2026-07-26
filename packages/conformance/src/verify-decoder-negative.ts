import { decodeSampledSymbol } from "@rectamatrix/decoder";
import { toSampledSymbol } from "./decoder-negative-vectors.js";
import type {
  DecoderNegativeVector,
  DecoderNegativeVectorSuite,
  VectorVerificationResult,
} from "./types.js";
import { validateDecoderNegativeVectorSuite } from "./validate-decoder-negative.js";
import { ConformanceMismatchError } from "./verify.js";

export function verifyDecoderNegativeVector(
  vector: DecoderNegativeVector,
): VectorVerificationResult {
  const result = decodeSampledSymbol(toSampledSymbol(vector.input));
  if (result.ok) {
    throw new ConformanceMismatchError(
      vector.id,
      "negative vector returned a Payload.",
    );
  }
  if (!vector.expected.errorCodes.includes(result.error.code)) {
    throw new ConformanceMismatchError(
      vector.id,
      `expected ${vector.expected.errorCodes.join(" or ")}, received ${result.error.code}.`,
    );
  }
  return Object.freeze({ id: vector.id, verified: true });
}

export function verifyDecoderNegativeVectorSuite(
  value: unknown,
): readonly VectorVerificationResult[] {
  validateDecoderNegativeVectorSuite(value);
  return Object.freeze(value.vectors.map(verifyDecoderNegativeVector));
}

export function asDecoderNegativeVectorSuite(
  value: unknown,
): DecoderNegativeVectorSuite {
  validateDecoderNegativeVectorSuite(value);
  return value;
}
