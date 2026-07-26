import {
  decodeSampledSymbol,
  type SampledSymbolInput,
} from "@rectamatrix/decoder";
import type {
  DecoderNegativeVector,
  DecoderNegativeVectorInput,
  DecoderNegativeVectorSuite,
  DecoderVectorInput,
} from "./types.js";

export function createDecoderNegativeVector(
  id: string,
  input: DecoderNegativeVectorInput,
  errorCodes: readonly string[],
): DecoderNegativeVector {
  const normalizedInput = normalizeDecoderVectorInput(input);
  const result = decodeSampledSymbol(toSampledSymbol(normalizedInput));
  if (result.ok) {
    throw new Error(
      `Negative decoder fixture "${id}" unexpectedly returned a Payload.`,
    );
  }
  if (!errorCodes.includes(result.error.code)) {
    throw new Error(
      `Negative decoder fixture "${id}" returned ${result.error.code}, expected ${errorCodes.join(" or ")}.`,
    );
  }
  return Object.freeze({
    id,
    input: normalizedInput,
    expected: Object.freeze({
      errorCodes: Object.freeze([...errorCodes]),
    }),
  });
}

export function createDecoderNegativeVectorSuite(
  vectors: readonly DecoderNegativeVector[],
): DecoderNegativeVectorSuite {
  return Object.freeze({
    format: "rectamatrix-conformance",
    vectorVersion: 1,
    coreVersion: 1,
    kind: "decoder-negative",
    vectors: Object.freeze([...vectors]),
  });
}

export function toSampledSymbol(
  input: DecoderNegativeVectorInput,
): SampledSymbolInput {
  const modules = input.modules.map((row) =>
    Array.from(row, (module) => module === "1"),
  );
  return {
    modules,
    ...(input.confidence === undefined
      ? {}
      : { confidence: input.confidence.map((row) => [...row]) }),
    ...(input.detectorMetadata === undefined
      ? {}
      : {
          detectorMetadata: {
            ...input.detectorMetadata,
          },
        }),
  };
}

export function normalizeDecoderVectorInput(
  input: DecoderVectorInput,
): DecoderVectorInput {
  return Object.freeze({
    modules: Object.freeze([...input.modules]),
    ...(input.confidence === undefined
      ? {}
      : {
          confidence: Object.freeze(
            input.confidence.map((row) => Object.freeze([...row])),
          ),
        }),
    ...(input.detectorMetadata === undefined
      ? {}
      : {
          detectorMetadata: Object.freeze({
            ...input.detectorMetadata,
          }),
        }),
  });
}
