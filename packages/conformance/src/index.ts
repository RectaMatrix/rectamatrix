export const CONFORMANCE_VECTOR_VERSION = 1 as const;

export {
  createDecoderNegativeVector,
  createDecoderNegativeVectorSuite,
  normalizeDecoderVectorInput,
  toSampledSymbol,
} from "./decoder-negative-vectors.js";
export {
  createDecoderPositiveVector,
  createDecoderPositiveVectorSuite,
  decoderResultToExpected,
} from "./decoder-positive-vectors.js";
export {
  createEncoderVector,
  createEncoderVectorSuite,
  encoderTraceToExpected,
} from "./encoder-vectors.js";
export {
  createImageFailureVector,
  createImageSuccessVector,
  createImageVectorSuite,
} from "./image-vectors.js";
export { bytesToHex, hexToBytes, uint32ToHex } from "./hex.js";
export {
  ConformanceValidationError,
  validateEncoderVectorSuite,
} from "./validate.js";
export { validateDecoderNegativeVectorSuite } from "./validate-decoder-negative.js";
export { validateDecoderPositiveVectorSuite } from "./validate-decoder-positive.js";
export { validateImageVectorSuite } from "./validate-image.js";
export {
  ConformanceMismatchError,
  asEncoderVectorSuite,
  canonicalJson,
  verifyEncoderVector,
  verifyEncoderVectorSuite,
} from "./verify.js";
export {
  asDecoderNegativeVectorSuite,
  verifyDecoderNegativeVector,
  verifyDecoderNegativeVectorSuite,
} from "./verify-decoder-negative.js";
export {
  asDecoderPositiveVectorSuite,
  verifyDecoderPositiveVector,
  verifyDecoderPositiveVectorSuite,
} from "./verify-decoder-positive.js";
export {
  asImageVectorSuite,
  validateAndVerifyImageVectorSuite,
  verifyImageVector,
} from "./verify-image.js";
export type {
  DecoderNegativeDetectorMetadata,
  DecoderNegativeVector,
  DecoderNegativeVectorExpected,
  DecoderNegativeVectorInput,
  DecoderNegativeVectorSuite,
  DecoderExpectedPayload,
  DecoderPositiveExpected,
  DecoderPositiveMetadataExpected,
  DecoderPositiveQualityExpected,
  DecoderPositiveVector,
  DecoderPositiveVectorSuite,
  DecoderVectorInput,
  EncoderVector,
  EncoderVectorExpected,
  EncoderVectorInput,
  EncoderVectorOptions,
  EncoderVectorRsBlock,
  EncoderVectorSuite,
  ImageVector,
  ImageVectorAsset,
  ImageVectorExpected,
  ImageVectorOptions,
  ImageVectorSuite,
  VectorVerificationResult,
} from "./types.js";
export type { ImageSuccessExpectation } from "./image-vectors.js";
