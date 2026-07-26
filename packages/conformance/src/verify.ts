import { decodeSampledSymbol } from "@rectamatrix/decoder";
import {
  encodeBytesWithTrace,
  encodeTextWithTrace,
} from "@rectamatrix/encoder";
import { encoderTraceToExpected } from "./encoder-vectors.js";
import { hexToBytes } from "./hex.js";
import type {
  EncoderVector,
  EncoderVectorSuite,
  VectorVerificationResult,
} from "./types.js";
import { validateEncoderVectorSuite } from "./validate.js";

export class ConformanceMismatchError extends Error {
  public constructor(
    public readonly vectorId: string,
    message: string,
  ) {
    super(`Conformance vector "${vectorId}" mismatch: ${message}`);
    this.name = "ConformanceMismatchError";
  }
}

export function verifyEncoderVector(
  vector: EncoderVector,
): VectorVerificationResult {
  const trace =
    vector.input.type === "binary"
      ? encodeBytesWithTrace(hexToBytes(vector.input.hex), vector.options)
      : encodeTextWithTrace(vector.input.text, vector.options);
  const actual = encoderTraceToExpected(trace);
  assertConformanceEqual(vector.expected, actual, vector.id, "expected");

  const decoded = decodeSampledSymbol({ modules: trace.symbol.matrix });
  if (!decoded.ok) {
    throw new ConformanceMismatchError(
      vector.id,
      `final matrix did not decode (${decoded.error.code}).`,
    );
  }
  if (decoded.type !== trace.symbol.payloadType) {
    throw new ConformanceMismatchError(
      vector.id,
      "decoded payload type differs.",
    );
  }
  if (!bytesEqual(decoded.bytes, trace.originalPayload)) {
    throw new ConformanceMismatchError(
      vector.id,
      "decoded payload bytes differ.",
    );
  }

  return Object.freeze({ id: vector.id, verified: true });
}

export function verifyEncoderVectorSuite(
  value: unknown,
): readonly VectorVerificationResult[] {
  validateEncoderVectorSuite(value);
  return Object.freeze(value.vectors.map(verifyEncoderVector));
}

export function canonicalJson(value: unknown): string {
  return `${JSON.stringify(value, undefined, 2)}\n`;
}

export function assertConformanceEqual(
  expected: unknown,
  actual: unknown,
  vectorId: string,
  path: string,
): void {
  if (Object.is(expected, actual)) return;
  if (Array.isArray(expected) && Array.isArray(actual)) {
    if (expected.length !== actual.length) {
      mismatch(vectorId, path, expected.length, actual.length);
    }
    for (let index = 0; index < expected.length; index += 1) {
      assertConformanceEqual(
        expected[index],
        actual[index],
        vectorId,
        `${path}[${String(index)}]`,
      );
    }
    return;
  }
  if (
    typeof expected === "object" &&
    expected !== null &&
    typeof actual === "object" &&
    actual !== null
  ) {
    const expectedRecord = expected as Record<string, unknown>;
    const actualRecord = actual as Record<string, unknown>;
    const expectedKeys = Object.keys(expectedRecord);
    const actualKeys = Object.keys(actualRecord);
    if (
      expectedKeys.length !== actualKeys.length ||
      expectedKeys.some((key, index) => key !== actualKeys[index])
    ) {
      mismatch(vectorId, `${path} properties`, expectedKeys, actualKeys);
    }
    for (const key of expectedKeys) {
      assertConformanceEqual(
        expectedRecord[key],
        actualRecord[key],
        vectorId,
        `${path}.${key}`,
      );
    }
    return;
  }
  mismatch(vectorId, path, expected, actual);
}

function mismatch(
  vectorId: string,
  path: string,
  expected: unknown,
  actual: unknown,
): never {
  throw new ConformanceMismatchError(
    vectorId,
    `${path}: expected ${describe(expected)}, received ${describe(actual)}.`,
  );
}

function describe(value: unknown): string {
  const serialized = JSON.stringify(value);
  return serialized.length > 160
    ? `${serialized.slice(0, 157)}...`
    : serialized;
}

function bytesEqual(left: Uint8Array, right: Uint8Array): boolean {
  return (
    left.length === right.length &&
    left.every((value, index) => value === right[index])
  );
}

export function asEncoderVectorSuite(value: unknown): EncoderVectorSuite {
  validateEncoderVectorSuite(value);
  return value;
}
