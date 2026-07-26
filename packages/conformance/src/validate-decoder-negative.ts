import type {
  DecoderNegativeVector,
  DecoderNegativeVectorInput,
  DecoderNegativeVectorSuite,
} from "./types.js";
import { ConformanceValidationError } from "./validate.js";

export function validateDecoderNegativeVectorSuite(
  value: unknown,
): asserts value is DecoderNegativeVectorSuite {
  const suite = record(value, "suite");
  exactKeys(
    suite,
    ["format", "vectorVersion", "coreVersion", "kind", "vectors"],
    "suite",
  );
  literal(suite.format, "rectamatrix-conformance", "suite.format");
  literal(suite.vectorVersion, 1, "suite.vectorVersion");
  literal(suite.coreVersion, 1, "suite.coreVersion");
  literal(suite.kind, "decoder-negative", "suite.kind");
  if (!Array.isArray(suite.vectors) || suite.vectors.length === 0) {
    fail("suite.vectors must be a non-empty array.");
  }
  const ids = new Set<string>();
  suite.vectors.forEach((vector, index) => {
    validateVector(vector, `suite.vectors[${String(index)}]`);
    const id = (vector as DecoderNegativeVector).id;
    if (ids.has(id)) fail(`Duplicate vector ID: ${id}.`);
    ids.add(id);
  });
}

function validateVector(value: unknown, path: string): void {
  const vector = record(value, path);
  exactKeys(vector, ["id", "input", "expected"], path);
  string(vector.id, `${path}.id`);
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/u.test(vector.id)) {
    fail(`${path}.id must be a lowercase kebab-case identifier.`);
  }
  validateDecoderVectorInput(vector.input, `${path}.input`);
  const expected = record(vector.expected, `${path}.expected`);
  exactKeys(expected, ["errorCodes"], `${path}.expected`);
  if (!Array.isArray(expected.errorCodes) || expected.errorCodes.length === 0) {
    fail(`${path}.expected.errorCodes must be a non-empty array.`);
  }
  const codes = new Set<string>();
  expected.errorCodes.forEach((code, index) => {
    string(code, `${path}.expected.errorCodes[${String(index)}]`);
    if (!/^[A-Z][A-Z0-9]*(?:_[A-Z0-9]+)*$/u.test(code)) {
      fail(
        `${path}.expected.errorCodes[${String(index)}] must be a machine-readable error code.`,
      );
    }
    if (codes.has(code))
      fail(`${path}.expected.errorCodes contains duplicates.`);
    codes.add(code);
  });
}

export function validateDecoderVectorInput(
  value: unknown,
  path = "input",
): asserts value is DecoderNegativeVectorInput {
  const input = record(value, path);
  const expectedKeys = ["modules"];
  if (input.confidence !== undefined) expectedKeys.push("confidence");
  if (input.detectorMetadata !== undefined) {
    expectedKeys.push("detectorMetadata");
  }
  exactKeys(input, expectedKeys, path);
  if (!Array.isArray(input.modules)) {
    fail(`${path}.modules must be an array.`);
  }
  input.modules.forEach((row, index) => {
    string(row, `${path}.modules[${String(index)}]`);
    if (!/^[01]*$/u.test(row)) {
      fail(`${path}.modules[${String(index)}] must contain only 0 and 1.`);
    }
  });
  if (input.confidence !== undefined) {
    if (!Array.isArray(input.confidence)) {
      fail(`${path}.confidence must be an array.`);
    }
    input.confidence.forEach((row, y) => {
      if (!Array.isArray(row)) {
        fail(`${path}.confidence[${String(y)}] must be an array.`);
      }
      row.forEach((value, x) => {
        if (typeof value !== "number" || !Number.isFinite(value)) {
          fail(
            `${path}.confidence[${String(y)}][${String(x)}] must be a finite number.`,
          );
        }
      });
    });
  }
  if (input.detectorMetadata !== undefined) {
    const metadata = record(input.detectorMetadata, `${path}.detectorMetadata`);
    const allowed = [
      "imageQuality",
      "blurEstimate",
      "perspectiveEstimateDegrees",
    ];
    for (const key of Object.keys(metadata)) {
      if (!allowed.includes(key)) {
        fail(`${path}.detectorMetadata contains an unknown property.`);
      }
      if (
        typeof metadata[key] !== "number" ||
        !Number.isFinite(metadata[key])
      ) {
        fail(`${path}.detectorMetadata.${key} must be a finite number.`);
      }
    }
  }
}

function record(value: unknown, path: string): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    fail(`${path} must be an object.`);
  }
  return value as Record<string, unknown>;
}

function exactKeys(
  value: Record<string, unknown>,
  expected: readonly string[],
  path: string,
): void {
  const actual = Object.keys(value).sort();
  const wanted = [...expected].sort();
  if (
    actual.length !== wanted.length ||
    actual.some((key, index) => key !== wanted[index])
  ) {
    fail(`${path} contains missing or unknown properties.`);
  }
}

function string(value: unknown, path: string): asserts value is string {
  if (typeof value !== "string") fail(`${path} must be a string.`);
}

function literal<T extends string | number>(
  value: unknown,
  expected: T,
  path: string,
): asserts value is T {
  if (value !== expected) fail(`${path} has an unsupported value.`);
}

function fail(message: string): never {
  throw new ConformanceValidationError(message);
}
