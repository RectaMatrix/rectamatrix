import {
  RECTAMATRIX_SIZES,
  type EccLevel,
  type PayloadType,
  type SizeId,
} from "@rectamatrix/core";
import { isLowercaseHex } from "./hex.js";
import type {
  EncoderVector,
  EncoderVectorExpected,
  EncoderVectorInput,
  EncoderVectorOptions,
  EncoderVectorSuite,
} from "./types.js";

export class ConformanceValidationError extends Error {
  public constructor(message: string) {
    super(message);
    this.name = "ConformanceValidationError";
  }
}

export function validateEncoderVectorSuite(
  value: unknown,
): asserts value is EncoderVectorSuite {
  const suite = record(value, "suite");
  exactKeys(
    suite,
    ["format", "vectorVersion", "coreVersion", "kind", "vectors"],
    "suite",
  );
  literal(suite.format, "rectamatrix-conformance", "suite.format");
  literal(suite.vectorVersion, 1, "suite.vectorVersion");
  literal(suite.coreVersion, 2, "suite.coreVersion");
  literal(suite.kind, "encoder", "suite.kind");
  if (!Array.isArray(suite.vectors) || suite.vectors.length === 0) {
    fail("suite.vectors must be a non-empty array.");
  }
  const ids = new Set<string>();
  suite.vectors.forEach((vector, index) => {
    validateVector(vector, `suite.vectors[${String(index)}]`);
    const id = (vector as EncoderVector).id;
    if (ids.has(id)) fail(`Duplicate vector ID: ${id}.`);
    ids.add(id);
  });
}

function validateVector(value: unknown, path: string): void {
  const vector = record(value, path);
  exactKeys(vector, ["id", "input", "options", "expected"], path);
  nonEmptyString(vector.id, `${path}.id`);
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/u.test(vector.id)) {
    fail(`${path}.id must be a lowercase kebab-case identifier.`);
  }
  validateInput(vector.input, `${path}.input`);
  validateOptions(vector.options, `${path}.options`);
  validateExpected(vector.expected, `${path}.expected`);
}

function validateInput(
  value: unknown,
  path: string,
): asserts value is EncoderVectorInput {
  const input = record(value, path);
  if (input.type === "binary") {
    exactKeys(input, ["type", "hex"], path);
    hex(input.hex, `${path}.hex`);
    return;
  }
  if (input.type === "utf8") {
    exactKeys(input, ["type", "text"], path);
    string(input.text, `${path}.text`);
    return;
  }
  fail(`${path}.type must be "binary" or "utf8".`);
}

function validateOptions(
  value: unknown,
  path: string,
): asserts value is EncoderVectorOptions {
  const options = record(value, path);
  const keys =
    options.sizeId === undefined
      ? ["eccLevel", "compression"]
      : ["eccLevel", "compression", "sizeId"];
  exactKeys(options, keys, path);
  enumeration(
    options.eccLevel,
    ["low", "medium", "high"] satisfies readonly EccLevel[],
    `${path}.eccLevel`,
  );
  enumeration(
    options.compression,
    ["none", "rm-hle1", "rm-lz1", "auto"],
    `${path}.compression`,
  );
  if (options.sizeId !== undefined) sizeId(options.sizeId, `${path}.sizeId`);
}

function validateExpected(
  value: unknown,
  path: string,
): asserts value is EncoderVectorExpected {
  const expected = record(value, path);
  exactKeys(
    expected,
    [
      "sizeId",
      "width",
      "height",
      "payloadType",
      "compression",
      "eccLevel",
      "maskId",
      "originalLength",
      "encodedLength",
      "originalPayloadHex",
      "encodedPayloadHex",
      "crc32cHex",
      "frameHex",
      "headerInformationHex",
      "protectedHeaderHex",
      "rsBlockCount",
      "rsTotalDataBytes",
      "rsTotalParityBytes",
      "rsTotalCodewordBytes",
      "rsBlocks",
      "interleavedCodewordsHex",
      "unmaskedBodyBits",
      "maskScores",
      "finalMatrix",
    ],
    path,
  );
  sizeId(expected.sizeId, `${path}.sizeId`);
  const size = RECTAMATRIX_SIZES[expected.sizeId];
  integer(expected.width, size.width, size.width, `${path}.width`);
  integer(expected.height, size.height, size.height, `${path}.height`);
  enumeration(
    expected.payloadType,
    ["binary", "utf8"] satisfies readonly PayloadType[],
    `${path}.payloadType`,
  );
  enumeration(
    expected.compression,
    ["none", "rm-hle1", "rm-lz1"],
    `${path}.compression`,
  );
  enumeration(
    expected.eccLevel,
    ["low", "medium", "high"] satisfies readonly EccLevel[],
    `${path}.eccLevel`,
  );
  integer(expected.maskId, 0, 3, `${path}.maskId`);
  integer(expected.originalLength, 0, 0xffff, `${path}.originalLength`);
  integer(expected.encodedLength, 0, 0x0ffe, `${path}.encodedLength`);
  for (const key of [
    "originalPayloadHex",
    "encodedPayloadHex",
    "crc32cHex",
    "frameHex",
    "headerInformationHex",
    "protectedHeaderHex",
    "interleavedCodewordsHex",
  ] as const) {
    hex(expected[key], `${path}.${key}`);
  }
  if ((expected.crc32cHex as string).length !== 8) {
    fail(`${path}.crc32cHex must contain four bytes.`);
  }
  if ((expected.headerInformationHex as string).length !== 8) {
    fail(`${path}.headerInformationHex must contain four bytes.`);
  }
  if ((expected.protectedHeaderHex as string).length !== 16) {
    fail(`${path}.protectedHeaderHex must contain eight bytes.`);
  }
  integer(expected.rsBlockCount, 1, 0xffff + 4, `${path}.rsBlockCount`);
  integer(expected.rsTotalDataBytes, 4, 0xffff + 4, `${path}.rsTotalDataBytes`);
  integer(
    expected.rsTotalParityBytes,
    4,
    Number.MAX_SAFE_INTEGER,
    `${path}.rsTotalParityBytes`,
  );
  integer(
    expected.rsTotalCodewordBytes,
    8,
    Number.MAX_SAFE_INTEGER,
    `${path}.rsTotalCodewordBytes`,
  );
  if (!Array.isArray(expected.rsBlocks)) {
    fail(`${path}.rsBlocks must be an array.`);
  }
  expected.rsBlocks.forEach((block, index) => {
    const blockPath = `${path}.rsBlocks[${String(index)}]`;
    const item = record(block, blockPath);
    exactKeys(
      item,
      [
        "index",
        "dataLength",
        "parityLength",
        "dataHex",
        "parityHex",
        "codewordHex",
      ],
      blockPath,
    );
    integer(item.index, index, index, `${blockPath}.index`);
    integer(item.dataLength, 1, 255, `${blockPath}.dataLength`);
    integer(item.parityLength, 1, 254, `${blockPath}.parityLength`);
    hex(item.dataHex, `${blockPath}.dataHex`);
    hex(item.parityHex, `${blockPath}.parityHex`);
    hex(item.codewordHex, `${blockPath}.codewordHex`);
  });
  if (
    typeof expected.unmaskedBodyBits !== "string" ||
    !/^[01]+$/u.test(expected.unmaskedBodyBits)
  ) {
    fail(`${path}.unmaskedBodyBits must be a non-empty bit string.`);
  }
  if (!Array.isArray(expected.maskScores) || expected.maskScores.length !== 4) {
    fail(`${path}.maskScores must contain four integers.`);
  }
  expected.maskScores.forEach((score, index) => {
    integer(
      score,
      0,
      Number.MAX_SAFE_INTEGER,
      `${path}.maskScores[${String(index)}]`,
    );
  });
  if (
    !Array.isArray(expected.finalMatrix) ||
    expected.finalMatrix.length !== size.height
  ) {
    fail(`${path}.finalMatrix must contain ${String(size.height)} rows.`);
  }
  expected.finalMatrix.forEach((row, index) => {
    if (typeof row !== "string" || !/^[01]+$/u.test(row)) {
      fail(`${path}.finalMatrix[${String(index)}] must be a bit string.`);
    }
    if (row.length !== size.width) {
      fail(
        `${path}.finalMatrix[${String(index)}] must contain ${String(size.width)} modules.`,
      );
    }
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

function nonEmptyString(value: unknown, path: string): asserts value is string {
  string(value, path);
  if (value.length === 0) fail(`${path} must not be empty.`);
}

function hex(value: unknown, path: string): asserts value is string {
  string(value, path);
  if (!isLowercaseHex(value)) {
    fail(`${path} must contain lowercase hexadecimal byte pairs.`);
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
    fail(
      `${path} must be an integer from ${String(minimum)} through ${String(maximum)}.`,
    );
  }
}

function sizeId(value: unknown, path: string): asserts value is SizeId {
  integer(value, 0, RECTAMATRIX_SIZES.length - 1, path);
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
