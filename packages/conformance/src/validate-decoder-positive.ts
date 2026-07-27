import { RECTAMATRIX_SIZES, type SizeId } from "@rectamatrix/core";
import { isLowercaseHex } from "./hex.js";
import type {
  DecoderPositiveVector,
  DecoderPositiveVectorSuite,
} from "./types.js";
import { validateDecoderVectorInput } from "./validate-decoder-negative.js";
import { ConformanceValidationError } from "./validate.js";

export function validateDecoderPositiveVectorSuite(
  value: unknown,
): asserts value is DecoderPositiveVectorSuite {
  const suite = record(value, "suite");
  exactKeys(
    suite,
    ["format", "vectorVersion", "coreVersion", "kind", "vectors"],
    "suite",
  );
  literal(suite.format, "rectamatrix-conformance", "suite.format");
  literal(suite.vectorVersion, 1, "suite.vectorVersion");
  literal(suite.coreVersion, 2, "suite.coreVersion");
  literal(suite.kind, "decoder-positive", "suite.kind");
  if (!Array.isArray(suite.vectors) || suite.vectors.length === 0) {
    fail("suite.vectors must be a non-empty array.");
  }
  const ids = new Set<string>();
  suite.vectors.forEach((vector, index) => {
    validateVector(vector, `suite.vectors[${String(index)}]`);
    const id = (vector as DecoderPositiveVector).id;
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
  validateExpected(vector.expected, `${path}.expected`);
}

function validateExpected(value: unknown, path: string): void {
  const expected = record(value, path);
  if (expected.type === "binary") {
    exactKeys(expected, ["type", "payloadHex", "metadata"], path);
  } else if (expected.type === "utf8") {
    exactKeys(expected, ["type", "payloadHex", "text", "metadata"], path);
    string(expected.text, `${path}.text`);
  } else {
    fail(`${path}.type must be "binary" or "utf8".`);
  }
  hex(expected.payloadHex, `${path}.payloadHex`);
  validateMetadata(expected.metadata, `${path}.metadata`);
}

function validateMetadata(value: unknown, path: string): void {
  const metadata = record(value, path);
  exactKeys(
    metadata,
    [
      "version",
      "sizeId",
      "width",
      "height",
      "eccLevel",
      "compression",
      "maskId",
      "quality",
    ],
    path,
  );
  literal(metadata.version, 2, `${path}.version`);
  integer(metadata.sizeId, 0, RECTAMATRIX_SIZES.length - 1, `${path}.sizeId`);
  const size = RECTAMATRIX_SIZES[metadata.sizeId as SizeId];
  integer(metadata.width, size.width, size.width, `${path}.width`);
  integer(metadata.height, size.height, size.height, `${path}.height`);
  enumeration(metadata.eccLevel, ["low", "medium", "high"], `${path}.eccLevel`);
  enumeration(metadata.compression, ["none", "rm-lz1"], `${path}.compression`);
  integer(metadata.maskId, 0, 3, `${path}.maskId`);
  validateQuality(metadata.quality, `${path}.quality`);
}

function validateQuality(value: unknown, path: string): void {
  const quality = record(value, path);
  const required = [
    "profile",
    "overallConfidence",
    "averageModuleConfidence",
    "minimumModuleConfidence",
    "anchorScore",
    "topClockScore",
    "leftClockScore",
    "correctedCodewords",
    "erasuresUsed",
    "headerCorrectedCodewords",
    "headerErasuresUsed",
    "decodeAttempts",
    "headerErasureProfile",
    "bodyErasureProfile",
    "crcValid",
  ];
  for (const key of [
    "imageQuality",
    "blurEstimate",
    "perspectiveEstimateDegrees",
  ]) {
    if (quality[key] !== undefined) required.push(key);
  }
  exactKeys(quality, required, path);
  literal(quality.profile, "rmx-v2-draft", `${path}.profile`);
  for (const key of [
    "overallConfidence",
    "averageModuleConfidence",
    "minimumModuleConfidence",
    "anchorScore",
    "topClockScore",
    "leftClockScore",
  ]) {
    numberInRange(quality[key], 0, 1, `${path}.${key}`);
  }
  for (const key of [
    "correctedCodewords",
    "erasuresUsed",
    "headerCorrectedCodewords",
    "headerErasuresUsed",
    "decodeAttempts",
  ]) {
    integer(quality[key], 0, Number.MAX_SAFE_INTEGER, `${path}.${key}`);
  }
  enumeration(
    quality.headerErasureProfile,
    ["reference", "strict", "permissive", "none"],
    `${path}.headerErasureProfile`,
  );
  enumeration(
    quality.bodyErasureProfile,
    ["reference", "strict", "permissive", "none"],
    `${path}.bodyErasureProfile`,
  );
  literal(quality.crcValid, true, `${path}.crcValid`);
  for (const key of [
    "imageQuality",
    "blurEstimate",
    "perspectiveEstimateDegrees",
  ]) {
    if (quality[key] !== undefined) {
      if (key === "imageQuality") {
        numberInRange(quality[key], 0, 1, `${path}.${key}`);
      } else {
        finiteNumber(quality[key], `${path}.${key}`);
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

function hex(value: unknown, path: string): asserts value is string {
  string(value, path);
  if (!isLowercaseHex(value)) {
    fail(`${path} must contain lowercase hexadecimal byte pairs.`);
  }
}

function finiteNumber(value: unknown, path: string): asserts value is number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    fail(`${path} must be a finite number.`);
  }
}

function numberInRange(
  value: unknown,
  minimum: number,
  maximum: number,
  path: string,
): asserts value is number {
  finiteNumber(value, path);
  if (value < minimum || value > maximum) {
    fail(`${path} must be in its allowed range.`);
  }
}

function integer(
  value: unknown,
  minimum: number,
  maximum: number,
  path: string,
): asserts value is number {
  if (
    typeof value !== "number" ||
    !Number.isInteger(value) ||
    value < minimum ||
    value > maximum
  ) {
    fail(`${path} must be an integer in its allowed range.`);
  }
}

function enumeration<T extends string>(
  value: unknown,
  allowed: readonly T[],
  path: string,
): asserts value is T {
  if (typeof value !== "string" || !allowed.includes(value as T)) {
    fail(`${path} has an unsupported value.`);
  }
}

function literal<T extends string | number | boolean>(
  value: unknown,
  expected: T,
  path: string,
): asserts value is T {
  if (value !== expected) fail(`${path} has an unsupported value.`);
}

function fail(message: string): never {
  throw new ConformanceValidationError(message);
}
