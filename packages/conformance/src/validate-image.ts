import { RECTAMATRIX_SIZES, type SizeId } from "@rectamatrix/core";
import { isLowercaseHex } from "./hex.js";
import type { ImageVector, ImageVectorSuite } from "./types.js";
import { ConformanceValidationError } from "./validate.js";

export function validateImageVectorSuite(
  value: unknown,
): asserts value is ImageVectorSuite {
  const suite = record(value, "suite");
  exactKeys(
    suite,
    ["format", "vectorVersion", "coreVersion", "kind", "vectors"],
    "suite",
  );
  literal(suite.format, "rectamatrix-conformance", "suite.format");
  literal(suite.vectorVersion, 1, "suite.vectorVersion");
  literal(suite.coreVersion, 2, "suite.coreVersion");
  literal(suite.kind, "image", "suite.kind");
  if (!Array.isArray(suite.vectors) || suite.vectors.length === 0) {
    fail("suite.vectors must be a non-empty array.");
  }
  const ids = new Set<string>();
  const files = new Set<string>();
  suite.vectors.forEach((vector, index) => {
    validateVector(vector, `suite.vectors[${String(index)}]`);
    const typed = vector as ImageVector;
    if (ids.has(typed.id)) fail(`Duplicate vector ID: ${typed.id}.`);
    if (files.has(typed.image.file)) {
      fail(`Duplicate image file: ${typed.image.file}.`);
    }
    ids.add(typed.id);
    files.add(typed.image.file);
  });
}

function validateVector(value: unknown, path: string): void {
  const vector = record(value, path);
  exactKeys(vector, ["id", "categories", "image", "options", "expected"], path);
  identifier(vector.id, `${path}.id`);
  if (!Array.isArray(vector.categories) || vector.categories.length === 0) {
    fail(`${path}.categories must be a non-empty array.`);
  }
  const categories = new Set<string>();
  vector.categories.forEach((category, index) => {
    identifier(category, `${path}.categories[${String(index)}]`);
    if (categories.has(category))
      fail(`${path}.categories contains duplicates.`);
    categories.add(category);
  });
  validateAsset(vector.image, `${path}.image`);
  validateOptions(vector.options, `${path}.options`);
  validateExpected(vector.expected, `${path}.expected`);
}

function validateAsset(value: unknown, path: string): void {
  const asset = record(value, path);
  exactKeys(asset, ["file", "width", "height", "crc32cHex"], path);
  string(asset.file, `${path}.file`);
  if (!/^images\/[a-z0-9]+(?:-[a-z0-9]+)*\.pgm$/u.test(asset.file)) {
    fail(`${path}.file must be a canonical relative PGM path.`);
  }
  integer(asset.width, 1, 25_000_000, `${path}.width`);
  integer(asset.height, 1, 25_000_000, `${path}.height`);
  string(asset.crc32cHex, `${path}.crc32cHex`);
  if (!/^[0-9a-f]{8}$/u.test(asset.crc32cHex)) {
    fail(`${path}.crc32cHex must contain four lowercase hexadecimal bytes.`);
  }
}

function validateOptions(value: unknown, path: string): void {
  const options = record(value, path);
  const expected: string[] = [];
  if (options.sourceQuadrilateral !== undefined) {
    expected.push("sourceQuadrilateral");
  }
  if (options.samplesPerModule !== undefined) expected.push("samplesPerModule");
  if (options.tryInverted !== undefined) expected.push("tryInverted");
  if (options.minimumModulePixels !== undefined) {
    expected.push("minimumModulePixels");
  }
  if (options.maximumCandidates !== undefined) {
    expected.push("maximumCandidates");
  }
  exactKeys(options, expected, path);
  if (options.sourceQuadrilateral !== undefined) {
    if (
      !Array.isArray(options.sourceQuadrilateral) ||
      options.sourceQuadrilateral.length !== 4
    ) {
      fail(`${path}.sourceQuadrilateral must contain four points.`);
    }
    options.sourceQuadrilateral.forEach((point, index) => {
      const item = record(
        point,
        `${path}.sourceQuadrilateral[${String(index)}]`,
      );
      exactKeys(
        item,
        ["x", "y"],
        `${path}.sourceQuadrilateral[${String(index)}]`,
      );
      finiteNumber(item.x, `${path}.sourceQuadrilateral[${String(index)}].x`);
      finiteNumber(item.y, `${path}.sourceQuadrilateral[${String(index)}].y`);
    });
  }
  if (options.samplesPerModule !== undefined) {
    integer(options.samplesPerModule, 5, 9, `${path}.samplesPerModule`);
  }
  if (
    options.tryInverted !== undefined &&
    typeof options.tryInverted !== "boolean"
  ) {
    fail(`${path}.tryInverted must be boolean.`);
  }
  if (options.minimumModulePixels !== undefined) {
    integer(options.minimumModulePixels, 2, 16, `${path}.minimumModulePixels`);
  }
  if (options.maximumCandidates !== undefined) {
    integer(options.maximumCandidates, 1, 256, `${path}.maximumCandidates`);
  }
}

function validateExpected(value: unknown, path: string): void {
  const expected = record(value, path);
  if (expected.result === "failure") {
    exactKeys(expected, ["result", "allowedErrorCodes"], path);
    if (
      !Array.isArray(expected.allowedErrorCodes) ||
      expected.allowedErrorCodes.length === 0
    ) {
      fail(`${path}.allowedErrorCodes must be a non-empty array.`);
    }
    expected.allowedErrorCodes.forEach((code, index) => {
      string(code, `${path}.allowedErrorCodes[${String(index)}]`);
      if (!/^[A-Z][A-Z0-9]*(?:_[A-Z0-9]+)*$/u.test(code)) {
        fail(`${path}.allowedErrorCodes contains an invalid code.`);
      }
    });
    return;
  }
  if (expected.result !== "success") {
    fail(`${path}.result must be "success" or "failure".`);
  }
  const keys = [
    "result",
    "type",
    "payloadHex",
    "sizeId",
    "orientationDegrees",
    "minimumOverallConfidence",
    "referenceModules",
    "referenceConfidence",
  ];
  if (expected.type === "utf8") keys.push("text");
  exactKeys(expected, keys, path);
  if (expected.type !== "binary" && expected.type !== "utf8") {
    fail(`${path}.type must be "binary" or "utf8".`);
  }
  if (expected.type === "utf8") string(expected.text, `${path}.text`);
  string(expected.payloadHex, `${path}.payloadHex`);
  if (!isLowercaseHex(expected.payloadHex)) {
    fail(`${path}.payloadHex must contain lowercase hexadecimal byte pairs.`);
  }
  integer(expected.sizeId, 0, RECTAMATRIX_SIZES.length - 1, `${path}.sizeId`);
  const size = RECTAMATRIX_SIZES[expected.sizeId as SizeId];
  enumeration(
    expected.orientationDegrees,
    [0, 90, 180, 270],
    `${path}.orientationDegrees`,
  );
  numberInRange(
    expected.minimumOverallConfidence,
    0,
    1,
    `${path}.minimumOverallConfidence`,
  );
  if (
    !Array.isArray(expected.referenceModules) ||
    expected.referenceModules.length !== size.height
  ) {
    fail(`${path}.referenceModules has incorrect dimensions.`);
  }
  expected.referenceModules.forEach((row, index) => {
    string(row, `${path}.referenceModules[${String(index)}]`);
    if (!/^[01]+$/u.test(row) || row.length !== size.width) {
      fail(`${path}.referenceModules[${String(index)}] is invalid.`);
    }
  });
  if (
    !Array.isArray(expected.referenceConfidence) ||
    expected.referenceConfidence.length !== size.height
  ) {
    fail(`${path}.referenceConfidence has incorrect dimensions.`);
  }
  expected.referenceConfidence.forEach((row, y) => {
    if (!Array.isArray(row) || row.length !== size.width) {
      fail(`${path}.referenceConfidence[${String(y)}] is invalid.`);
    }
    row.forEach((confidence, x) => {
      numberInRange(
        confidence,
        0,
        1,
        `${path}.referenceConfidence[${String(y)}][${String(x)}]`,
      );
    });
  });
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

function identifier(value: unknown, path: string): asserts value is string {
  string(value, path);
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/u.test(value)) {
    fail(`${path} must be a lowercase kebab-case identifier.`);
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

function enumeration<T extends string | number>(
  value: unknown,
  allowed: readonly T[],
  path: string,
): asserts value is T {
  if (!allowed.includes(value as T)) fail(`${path} has an unsupported value.`);
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
