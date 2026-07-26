export const SYMBOL_VERSION = 1 as const;
export const SYNC_BYTE = 0xa7 as const;
export const RS_PROFILE = 1 as const;
export const HEADER_INFORMATION_BYTES = 8 as const;
export const HEADER_PARITY_BYTES = 4 as const;
export const HEADER_TOTAL_BYTES = 12 as const;
export const HEADER_BITS = 96 as const;
export const HEADER_WHITENING_BYTES = [
  0xd3, 0x91, 0x6a, 0xc5, 0x2e, 0x78, 0xb4, 0x0f, 0x59, 0xe3, 0x86, 0x1d,
] as const;
export const QUIET_ZONE_MODULES = 4 as const;
export const QUIET_ZONE_PROFILES = {
  compact: 2,
  standard: 4,
} as const;
export const PADDING_BYTES = [0xec, 0x11] as const;

export const RECTAMATRIX_SIZES = [
  { sizeId: 0, width: 24, height: 16, anchorSize: 4 },
  { sizeId: 1, width: 36, height: 24, anchorSize: 6 },
  { sizeId: 2, width: 48, height: 32, anchorSize: 8 },
  { sizeId: 3, width: 72, height: 48, anchorSize: 12 },
  { sizeId: 4, width: 96, height: 64, anchorSize: 16 },
  { sizeId: 5, width: 120, height: 80, anchorSize: 20 },
  { sizeId: 6, width: 144, height: 96, anchorSize: 24 },
] as const;

export const ECC_PROFILES = {
  low: { bits: 0b00, numerator: 5, denominator: 100, minimumParity: 4 },
  medium: {
    bits: 0b01,
    numerator: 15,
    denominator: 100,
    minimumParity: 8,
  },
  high: {
    bits: 0b10,
    numerator: 30,
    denominator: 100,
    minimumParity: 12,
  },
} as const;

export const PAYLOAD_TYPE_VALUES = {
  binary: 0b00,
  utf8: 0b01,
} as const;

export const COMPRESSION_MODE_VALUES = {
  none: 0b00,
  "rm-lz1": 0b01,
} as const;

export const MASK_IDS = [0, 1, 2, 3] as const;

export const CRC32C_PARAMETERS = {
  reflectedPolynomial: 0x82f63b78,
  initialValue: 0xffffffff,
  finalXor: 0xffffffff,
  reflectedInput: true,
  reflectedOutput: true,
} as const;

export const GF256_PARAMETERS = {
  primitivePolynomial: 0x11d,
  primitiveElement: 2,
  firstGeneratorRoot: 0,
  maximumCodewordBytes: 255,
} as const;

export const RM_LZ1_LIMITS = {
  minimumDistance: 1,
  maximumDistance: 4096,
  minimumMatchLength: 3,
  maximumMatchLength: 18,
  tokensPerGroup: 8,
} as const;

export const CONFIDENCE_THRESHOLDS = {
  header: {
    lowBitThreshold: 0.25,
    lowBitCount: 2,
    meanThreshold: 0.35,
  },
  body: {
    lowBitThreshold: 0.3,
    lowBitCount: 3,
    meanThreshold: 0.4,
    minimumThreshold: 0.1,
  },
  maximumDecodeAttempts: 4,
} as const;

export const CALCULATED_CAPACITIES = [
  {
    sizeId: 0,
    accessibleModules: 336,
    bodyBits: 240,
    maximumCodewordBytes: 29,
    maximumUncompressedPayloadBytes: { low: 21, medium: 17, high: 13 },
  },
  {
    sizeId: 1,
    accessibleModules: 780,
    bodyBits: 684,
    maximumCodewordBytes: 85,
    maximumUncompressedPayloadBytes: { low: 76, medium: 69, high: 61 },
  },
  {
    sizeId: 2,
    accessibleModules: 1408,
    bodyBits: 1312,
    maximumCodewordBytes: 163,
    maximumUncompressedPayloadBytes: { low: 151, medium: 137, high: 121 },
  },
  {
    sizeId: 3,
    accessibleModules: 3216,
    bodyBits: 3120,
    maximumCodewordBytes: 389,
    maximumUncompressedPayloadBytes: { low: 365, medium: 333, high: 295 },
  },
  {
    sizeId: 4,
    accessibleModules: 5760,
    bodyBits: 5664,
    maximumCodewordBytes: 707,
    maximumUncompressedPayloadBytes: { low: 667, medium: 610, high: 538 },
  },
  {
    sizeId: 5,
    accessibleModules: 9040,
    bodyBits: 8944,
    maximumCodewordBytes: 1117,
    maximumUncompressedPayloadBytes: { low: 1058, medium: 964, high: 853 },
  },
  {
    sizeId: 6,
    accessibleModules: 13056,
    bodyBits: 12960,
    maximumCodewordBytes: 1619,
    maximumUncompressedPayloadBytes: { low: 1537, medium: 1400, high: 1237 },
  },
] as const;
