import { RectaMatrixError } from "./errors.js";
import {
  COMPRESSION_MODE_VALUES,
  ECC_PROFILES,
  HEADER_INFORMATION_BYTES,
  HEADER_MAGIC,
  HEADER_PARITY_BYTES,
  HEADER_TOTAL_BYTES,
  HEADER_WHITENING_BYTES,
  INTEGRITY_PROFILE_VALUES,
  MAX_ENCODED_DATA_LENGTH,
  PAYLOAD_TYPE_VALUES,
  SYMBOL_VERSION,
} from "./generated/spec-constants.js";
import {
  reedSolomonDecode,
  reedSolomonEncode,
  type ReedSolomonDecodeResult,
} from "./reed-solomon.js";
import type {
  CompressionMode,
  EccLevel,
  IntegrityProfile,
  MaskId,
  PayloadType,
} from "./types.js";

export interface HeaderFields {
  readonly version: 2;
  readonly eccLevel: EccLevel;
  readonly payloadType: PayloadType;
  readonly compression: CompressionMode;
  readonly maskId: MaskId;
  readonly encodedLength: number;
  readonly integrityProfile: IntegrityProfile;
}

export interface HeaderInput extends Omit<
  HeaderFields,
  "version" | "integrityProfile"
> {
  readonly version?: 2;
  readonly integrityProfile?: IntegrityProfile;
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
  const ecc = ECC_PROFILES[input.eccLevel].bits;
  const payload = PAYLOAD_TYPE_VALUES[input.payloadType];
  const codec = COMPRESSION_MODE_VALUES[input.compression];
  const integrityProfile = input.integrityProfile ?? "crc32c";
  const integrity = INTEGRITY_PROFILE_VALUES[integrityProfile];

  return Uint8Array.of(
    (HEADER_MAGIC << 4) | version,
    (ecc << 6) | (payload << 5) | (codec << 2) | ((input.maskId >>> 1) & 0x03),
    ((input.maskId & 0x01) << 7) | (input.encodedLength >>> 5),
    ((input.encodedLength & 0x1f) << 3) | (integrity << 1),
  );
}

export function buildProtectedHeader(input: HeaderInput): Uint8Array {
  return reedSolomonEncode(buildHeaderInformation(input), HEADER_PARITY_BYTES);
}

/** Applies the fixed v2 Header whitening mask. XOR is its own inverse. */
export function applyHeaderWhitening(header: Uint8Array): Uint8Array {
  if (header.length !== HEADER_TOTAL_BYTES) {
    throw new RangeError("Header whitening requires exactly eight bytes.");
  }
  return Uint8Array.from(
    header,
    (value, index) => value ^ HEADER_WHITENING_BYTES[index]!,
  );
}

export function parseHeaderInformation(information: Uint8Array): HeaderFields {
  if (information.length !== HEADER_INFORMATION_BYTES) {
    throw invalidHeader("Header information must contain exactly four bytes.");
  }
  const magic = information[0]! >>> 4;
  if (magic !== HEADER_MAGIC) {
    throw invalidHeader("RectaMatrix Header Magic is invalid.");
  }
  const version = information[0]! & 0x0f;
  if (version !== SYMBOL_VERSION) {
    throw new RectaMatrixError(
      "UNSUPPORTED_VERSION",
      `Unsupported RectaMatrix version: ${String(version)}.`,
    );
  }

  const flags = information[1]!;
  const eccLevel = decodeEccLevel(flags >>> 6);
  const payloadType = decodePayloadType((flags >>> 5) & 0x01);
  const compression = decodeCompression((flags >>> 2) & 0x07);
  const maskId = (((flags & 0x03) << 1) | (information[2]! >>> 7)) as MaskId;
  if (maskId > 3) {
    throw invalidHeader("Reserved Mask ID is unsupported.");
  }

  const encodedLength =
    ((information[2]! & 0x7f) << 5) | (information[3]! >>> 3);
  if (encodedLength > MAX_ENCODED_DATA_LENGTH) {
    throw invalidHeader("Extended Body framing is not defined for v2 Core.");
  }
  const integrityProfile = decodeIntegrity((information[3]! >>> 1) & 0x03);
  if ((information[3]! & 0x01) !== 0) {
    throw invalidHeader("Reserved Header bit must be zero.");
  }

  return Object.freeze({
    version: SYMBOL_VERSION,
    eccLevel,
    payloadType,
    compression,
    maskId,
    encodedLength,
    integrityProfile,
  });
}

export function decodeProtectedHeader(
  protectedHeader: Uint8Array,
  erasurePositions: readonly number[] = [],
): DecodedProtectedHeader {
  if (protectedHeader.length !== HEADER_TOTAL_BYTES) {
    throw invalidHeader("Protected Header must contain exactly eight bytes.");
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
    fields: parseHeaderInformation(decoded.data),
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
    throw new RangeError("Only RectaMatrix Version 2 can be encoded.");
  }
  if (!Object.hasOwn(ECC_PROFILES, input.eccLevel)) {
    throw new RangeError("Header ECC Level is unsupported.");
  }
  if (!Object.hasOwn(PAYLOAD_TYPE_VALUES, input.payloadType)) {
    throw new RangeError("Header Payload Type is unsupported.");
  }
  if (!Object.hasOwn(COMPRESSION_MODE_VALUES, input.compression)) {
    throw new RangeError("Header Codec ID is unsupported.");
  }
  if (!Number.isInteger(input.maskId) || input.maskId < 0 || input.maskId > 3) {
    throw new RangeError("Header Mask ID must be between 0 and 3.");
  }
  if (
    !Number.isInteger(input.encodedLength) ||
    input.encodedLength < 0 ||
    input.encodedLength > MAX_ENCODED_DATA_LENGTH
  ) {
    throw new RangeError(
      `Encoded data length must be between 0 and ${String(MAX_ENCODED_DATA_LENGTH)}.`,
    );
  }
  const integrityProfile = input.integrityProfile ?? "crc32c";
  if (!Object.hasOwn(INTEGRITY_PROFILE_VALUES, integrityProfile)) {
    throw new RangeError("Header integrity profile is unsupported.");
  }
}

function decodeEccLevel(bits: number): EccLevel {
  if (bits === 0) return "low";
  if (bits === 1) return "medium";
  if (bits === 2) return "high";
  throw invalidHeader("Reserved ECC Level is unsupported.");
}

function decodePayloadType(bits: number): PayloadType {
  return bits === 0 ? "binary" : "utf8";
}

function decodeCompression(bits: number): CompressionMode {
  if (bits === 0) return "none";
  if (bits === 1) return "rm-hle1";
  if (bits === 2) return "rm-lz1";
  throw new RectaMatrixError(
    "UNSUPPORTED_COMPRESSION",
    "Reserved Codec ID is unsupported.",
  );
}

function decodeIntegrity(bits: number): IntegrityProfile {
  if (bits === 0) return "crc32c";
  throw new RectaMatrixError(
    "UNSUPPORTED_INTEGRITY_PROFILE",
    "Reserved integrity profile is unsupported.",
  );
}

function invalidHeader(message: string): RectaMatrixError {
  return new RectaMatrixError("INVALID_HEADER", message);
}
