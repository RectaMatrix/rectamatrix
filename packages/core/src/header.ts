import { RectaMatrixError } from "./errors.js";
import {
  COMPRESSION_MODE_VALUES,
  ECC_PROFILES,
  HEADER_INFORMATION_BYTES,
  HEADER_PARITY_BYTES,
  HEADER_TOTAL_BYTES,
  HEADER_WHITENING_BYTES,
  PAYLOAD_TYPE_VALUES,
  RS_PROFILE,
  SYMBOL_VERSION,
  SYNC_BYTE,
} from "./generated/spec-constants.js";
import {
  reedSolomonDecode,
  reedSolomonEncode,
  type ReedSolomonDecodeResult,
} from "./reed-solomon.js";
import type {
  CompressionMode,
  EccLevel,
  MaskId,
  PayloadType,
  SizeId,
} from "./types.js";

export interface HeaderFields {
  readonly version: 1;
  readonly sizeId: SizeId;
  readonly eccLevel: EccLevel;
  readonly payloadType: PayloadType;
  readonly compression: CompressionMode;
  readonly maskId: MaskId;
  readonly originalLength: number;
  readonly encodedLength: number;
}

export interface HeaderInput extends Omit<HeaderFields, "version"> {
  readonly version?: 1;
}

export interface DecodedProtectedHeader {
  readonly fields: HeaderFields;
  readonly correctedHeader: Uint8Array;
  readonly correctedCodewords: number;
  readonly erasuresUsed: number;
  readonly errorPositions: readonly number[];
}

export function buildHeaderInformation(input: HeaderInput): Uint8Array {
  validateHeaderInput(input);
  const version =
    (input as { readonly version?: number }).version ?? SYMBOL_VERSION;
  const information = new Uint8Array(HEADER_INFORMATION_BYTES);
  information[0] = SYNC_BYTE;
  information[1] = (version << 4) | input.sizeId;
  information[2] =
    (ECC_PROFILES[input.eccLevel].bits << 6) |
    (PAYLOAD_TYPE_VALUES[input.payloadType] << 4) |
    (COMPRESSION_MODE_VALUES[input.compression] << 2) |
    input.maskId;
  information[3] = RS_PROFILE << 4;
  information[4] = input.originalLength >>> 8;
  information[5] = input.originalLength;
  information[6] = input.encodedLength >>> 8;
  information[7] = input.encodedLength;
  return information;
}

export function buildProtectedHeader(input: HeaderInput): Uint8Array {
  return reedSolomonEncode(buildHeaderInformation(input), HEADER_PARITY_BYTES);
}

/** Applies the fixed v1 Header whitening mask. XOR makes this operation its own inverse. */
export function applyHeaderWhitening(header: Uint8Array): Uint8Array {
  if (header.length !== HEADER_TOTAL_BYTES) {
    throw new RangeError("Header whitening requires exactly twelve bytes.");
  }
  return Uint8Array.from(
    header,
    (value, index) => value ^ HEADER_WHITENING_BYTES[index]!,
  );
}

export function parseHeaderInformation(
  information: Uint8Array,
  expectedSizeId?: SizeId,
): HeaderFields {
  if (information.length !== HEADER_INFORMATION_BYTES) {
    throw invalidHeader("Header information must contain exactly eight bytes.");
  }
  if (information[0] !== SYNC_BYTE) {
    throw new RectaMatrixError(
      "INVALID_HEADER",
      "RectaMatrix Sync Byte is invalid.",
    );
  }
  const version = information[1]! >>> 4;
  if (version !== SYMBOL_VERSION) {
    throw new RectaMatrixError(
      "UNSUPPORTED_VERSION",
      `Unsupported RectaMatrix version: ${String(version)}.`,
    );
  }
  const rawSizeId = information[1]! & 0x0f;
  if (rawSizeId > 6) {
    throw new RectaMatrixError(
      "UNSUPPORTED_SIZE",
      `Unsupported RectaMatrix size ID: ${String(rawSizeId)}.`,
    );
  }
  const sizeId = rawSizeId as SizeId;
  if (expectedSizeId !== undefined && sizeId !== expectedSizeId) {
    throw invalidHeader("Header Size ID does not match sampled geometry.");
  }

  const flags = information[2]!;
  const eccLevel = decodeEccLevel(flags >>> 6);
  const payloadType = decodePayloadType((flags >>> 4) & 0x03);
  const compression = decodeCompression((flags >>> 2) & 0x03);
  const maskId = (flags & 0x03) as MaskId;

  if (information[3] !== RS_PROFILE << 4) {
    throw invalidHeader("RS Profile or reserved Header bits are invalid.");
  }
  const originalLength = (information[4]! << 8) | information[5]!;
  const encodedLength = (information[6]! << 8) | information[7]!;
  validateLengthRelationship(originalLength, encodedLength, compression);

  return Object.freeze({
    version: SYMBOL_VERSION,
    sizeId,
    eccLevel,
    payloadType,
    compression,
    maskId,
    originalLength,
    encodedLength,
  });
}

export function decodeProtectedHeader(
  protectedHeader: Uint8Array,
  erasurePositions: readonly number[] = [],
  expectedSizeId?: SizeId,
): DecodedProtectedHeader {
  if (protectedHeader.length !== HEADER_TOTAL_BYTES) {
    throw invalidHeader("Protected Header must contain exactly twelve bytes.");
  }
  let decoded: ReedSolomonDecodeResult;
  try {
    decoded = reedSolomonDecode(
      protectedHeader,
      HEADER_PARITY_BYTES,
      erasurePositions,
    );
  } catch (error) {
    if (error instanceof RangeError) throw error;
    throw new RectaMatrixError(
      "HEADER_RS_FAILURE",
      "Format Header Reed-Solomon correction failed.",
    );
  }
  return Object.freeze({
    fields: parseHeaderInformation(decoded.data, expectedSizeId),
    correctedHeader: decoded.correctedCodeword,
    correctedCodewords: decoded.correctedCodewords,
    erasuresUsed: decoded.erasuresUsed,
    errorPositions: decoded.errorPositions,
  });
}

function validateHeaderInput(input: HeaderInput): void {
  const version =
    (input as { readonly version?: number }).version ?? SYMBOL_VERSION;
  if (version !== SYMBOL_VERSION) {
    throw new RangeError("Only RectaMatrix Version 1 can be encoded.");
  }
  if (!Number.isInteger(input.sizeId) || input.sizeId < 0 || input.sizeId > 6) {
    throw new RangeError("Header Size ID must be between 0 and 6.");
  }
  if (!Object.hasOwn(ECC_PROFILES, input.eccLevel)) {
    throw new RangeError("Header ECC Level is unsupported.");
  }
  if (!Object.hasOwn(PAYLOAD_TYPE_VALUES, input.payloadType)) {
    throw new RangeError("Header Payload Type is unsupported.");
  }
  if (!Object.hasOwn(COMPRESSION_MODE_VALUES, input.compression)) {
    throw new RangeError("Header Compression Mode is unsupported.");
  }
  if (!Number.isInteger(input.maskId) || input.maskId < 0 || input.maskId > 3) {
    throw new RangeError("Header Mask ID must be between 0 and 3.");
  }
  assertUint16(input.originalLength, "original Payload length");
  assertUint16(input.encodedLength, "Encoded Payload length");
  validateLengthRelationship(
    input.originalLength,
    input.encodedLength,
    input.compression,
  );
}

function validateLengthRelationship(
  originalLength: number,
  encodedLength: number,
  compression: CompressionMode,
): void {
  if (compression === "none" && originalLength !== encodedLength) {
    throw invalidHeader("Uncompressed Header lengths must be identical.");
  }
  if (compression === "rm-lz1" && encodedLength >= originalLength) {
    throw invalidHeader(
      "RM-LZ1 Encoded Payload must be shorter than the original Payload.",
    );
  }
}

function decodeEccLevel(bits: number): EccLevel {
  if (bits === 0) return "low";
  if (bits === 1) return "medium";
  if (bits === 2) return "high";
  throw invalidHeader("Reserved ECC Level is unsupported.");
}

function decodePayloadType(bits: number): PayloadType {
  if (bits === 0) return "binary";
  if (bits === 1) return "utf8";
  throw new RectaMatrixError(
    "UNSUPPORTED_PAYLOAD_TYPE",
    "Reserved Payload Type is unsupported.",
  );
}

function decodeCompression(bits: number): CompressionMode {
  if (bits === 0) return "none";
  if (bits === 1) return "rm-lz1";
  throw new RectaMatrixError(
    "UNSUPPORTED_COMPRESSION",
    "Reserved Compression Mode is unsupported.",
  );
}

function assertUint16(value: number, name: string): void {
  if (!Number.isInteger(value) || value < 0 || value > 0xffff) {
    throw new RangeError(`${name} must be an unsigned 16-bit integer.`);
  }
}

function invalidHeader(message: string): RectaMatrixError {
  return new RectaMatrixError("INVALID_HEADER", message);
}
