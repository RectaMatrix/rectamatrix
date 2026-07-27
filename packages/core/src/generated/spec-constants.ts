export const SYMBOL_VERSION = 2 as const;
export const HEADER_MAGIC = 0x0a as const;
export const HEADER_INFORMATION_BYTES = 4 as const;
export const HEADER_PARITY_BYTES = 4 as const;
export const HEADER_TOTAL_BYTES = 8 as const;
export const HEADER_BITS = 64 as const;
export const HEADER_WHITENING_BYTES = [
  0xd3, 0x91, 0x6a, 0xc5, 0x2e, 0x78, 0xb4, 0x0f,
] as const;
export const MAX_ENCODED_DATA_LENGTH = 0x0ffe as const;
export const QUIET_ZONE_MODULES = 4 as const;
export const QUIET_ZONE_PROFILES = {
  compact: 2,
  standard: 4,
} as const;
export const PADDING_BYTES = [0xec, 0x11] as const;

export const RECTAMATRIX_SIZES = [
  { sizeId: 0, aspectRatio: "3:2", width: 24, height: 16, anchorSize: 4 },
  { sizeId: 1, aspectRatio: "3:2", width: 30, height: 20, anchorSize: 5 },
  { sizeId: 2, aspectRatio: "3:2", width: 36, height: 24, anchorSize: 6 },
  { sizeId: 3, aspectRatio: "3:2", width: 42, height: 28, anchorSize: 7 },
  { sizeId: 4, aspectRatio: "3:2", width: 48, height: 32, anchorSize: 8 },
  { sizeId: 5, aspectRatio: "3:2", width: 60, height: 40, anchorSize: 10 },
  { sizeId: 6, aspectRatio: "3:2", width: 72, height: 48, anchorSize: 12 },
  { sizeId: 7, aspectRatio: "3:2", width: 96, height: 64, anchorSize: 16 },
  { sizeId: 8, aspectRatio: "3:2", width: 120, height: 80, anchorSize: 20 },
  { sizeId: 9, aspectRatio: "3:2", width: 144, height: 96, anchorSize: 24 },
  { sizeId: 10, aspectRatio: "2:1", width: 32, height: 16, anchorSize: 4 },
  { sizeId: 11, aspectRatio: "2:1", width: 40, height: 20, anchorSize: 5 },
  { sizeId: 12, aspectRatio: "2:1", width: 48, height: 24, anchorSize: 6 },
  { sizeId: 13, aspectRatio: "2:1", width: 56, height: 28, anchorSize: 7 },
  { sizeId: 14, aspectRatio: "2:1", width: 64, height: 32, anchorSize: 8 },
  { sizeId: 15, aspectRatio: "2:1", width: 80, height: 40, anchorSize: 10 },
  { sizeId: 16, aspectRatio: "2:1", width: 96, height: 48, anchorSize: 12 },
  { sizeId: 17, aspectRatio: "2:1", width: 128, height: 64, anchorSize: 16 },
  { sizeId: 18, aspectRatio: "2:1", width: 160, height: 80, anchorSize: 20 },
  { sizeId: 19, aspectRatio: "2:1", width: 192, height: 96, anchorSize: 24 },
  { sizeId: 20, aspectRatio: "3:1", width: 48, height: 16, anchorSize: 4 },
  { sizeId: 21, aspectRatio: "3:1", width: 60, height: 20, anchorSize: 5 },
  { sizeId: 22, aspectRatio: "3:1", width: 72, height: 24, anchorSize: 6 },
  { sizeId: 23, aspectRatio: "3:1", width: 84, height: 28, anchorSize: 7 },
  { sizeId: 24, aspectRatio: "3:1", width: 96, height: 32, anchorSize: 8 },
  { sizeId: 25, aspectRatio: "3:1", width: 120, height: 40, anchorSize: 10 },
  { sizeId: 26, aspectRatio: "3:1", width: 144, height: 48, anchorSize: 12 },
  { sizeId: 27, aspectRatio: "3:1", width: 192, height: 64, anchorSize: 16 },
  { sizeId: 28, aspectRatio: "3:1", width: 240, height: 80, anchorSize: 20 },
  { sizeId: 29, aspectRatio: "3:1", width: 288, height: 96, anchorSize: 24 },
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

export const INTEGRITY_PROFILE_VALUES = {
  crc32c: 0b00,
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
    bodyBits: 272,
    maximumCodewordBytes: 33,
    maximumUncompressedPayloadBytes: { low: 25, medium: 21, high: 17 },
  },
  {
    sizeId: 1,
    accessibleModules: 535,
    bodyBits: 471,
    maximumCodewordBytes: 58,
    maximumUncompressedPayloadBytes: { low: 50, medium: 46, high: 40 },
  },
  {
    sizeId: 2,
    accessibleModules: 780,
    bodyBits: 716,
    maximumCodewordBytes: 89,
    maximumUncompressedPayloadBytes: { low: 80, medium: 73, high: 64 },
  },
  {
    sizeId: 3,
    accessibleModules: 1071,
    bodyBits: 1007,
    maximumCodewordBytes: 125,
    maximumUncompressedPayloadBytes: { low: 115, medium: 104, high: 92 },
  },
  {
    sizeId: 4,
    accessibleModules: 1408,
    bodyBits: 1344,
    maximumCodewordBytes: 167,
    maximumUncompressedPayloadBytes: { low: 155, medium: 141, high: 124 },
  },
  {
    sizeId: 5,
    accessibleModules: 2220,
    bodyBits: 2156,
    maximumCodewordBytes: 269,
    maximumUncompressedPayloadBytes: { low: 251, medium: 229, high: 202 },
  },
  {
    sizeId: 6,
    accessibleModules: 3216,
    bodyBits: 3152,
    maximumCodewordBytes: 393,
    maximumUncompressedPayloadBytes: { low: 369, medium: 337, high: 297 },
  },
  {
    sizeId: 7,
    accessibleModules: 5760,
    bodyBits: 5696,
    maximumCodewordBytes: 711,
    maximumUncompressedPayloadBytes: { low: 671, medium: 614, high: 542 },
  },
  {
    sizeId: 8,
    accessibleModules: 9040,
    bodyBits: 8976,
    maximumCodewordBytes: 1121,
    maximumUncompressedPayloadBytes: { low: 1062, medium: 967, high: 857 },
  },
  {
    sizeId: 9,
    accessibleModules: 13056,
    bodyBits: 12992,
    maximumCodewordBytes: 1623,
    maximumUncompressedPayloadBytes: { low: 1539, medium: 1402, high: 1241 },
  },
  {
    sizeId: 10,
    accessibleModules: 456,
    bodyBits: 392,
    maximumCodewordBytes: 48,
    maximumUncompressedPayloadBytes: { low: 40, medium: 36, high: 32 },
  },
  {
    sizeId: 11,
    accessibleModules: 725,
    bodyBits: 661,
    maximumCodewordBytes: 82,
    maximumUncompressedPayloadBytes: { low: 74, medium: 67, high: 59 },
  },
  {
    sizeId: 12,
    accessibleModules: 1056,
    bodyBits: 992,
    maximumCodewordBytes: 123,
    maximumUncompressedPayloadBytes: { low: 113, medium: 102, high: 90 },
  },
  {
    sizeId: 13,
    accessibleModules: 1449,
    bodyBits: 1385,
    maximumCodewordBytes: 173,
    maximumUncompressedPayloadBytes: { low: 160, medium: 146, high: 129 },
  },
  {
    sizeId: 14,
    accessibleModules: 1904,
    bodyBits: 1840,
    maximumCodewordBytes: 229,
    maximumUncompressedPayloadBytes: { low: 214, medium: 195, high: 172 },
  },
  {
    sizeId: 15,
    accessibleModules: 3000,
    bodyBits: 2936,
    maximumCodewordBytes: 366,
    maximumUncompressedPayloadBytes: { low: 344, medium: 314, high: 277 },
  },
  {
    sizeId: 16,
    accessibleModules: 4344,
    bodyBits: 4280,
    maximumCodewordBytes: 534,
    maximumUncompressedPayloadBytes: { low: 503, medium: 458, high: 405 },
  },
  {
    sizeId: 17,
    accessibleModules: 7776,
    bodyBits: 7712,
    maximumCodewordBytes: 963,
    maximumUncompressedPayloadBytes: { low: 911, medium: 831, high: 735 },
  },
  {
    sizeId: 18,
    accessibleModules: 12200,
    bodyBits: 12136,
    maximumCodewordBytes: 1516,
    maximumUncompressedPayloadBytes: { low: 1438, medium: 1314, high: 1159 },
  },
  {
    sizeId: 19,
    accessibleModules: 17616,
    bodyBits: 17552,
    maximumCodewordBytes: 2193,
    maximumUncompressedPayloadBytes: { low: 2081, medium: 1901, high: 1677 },
  },
  {
    sizeId: 20,
    accessibleModules: 696,
    bodyBits: 632,
    maximumCodewordBytes: 78,
    maximumUncompressedPayloadBytes: { low: 70, medium: 63, high: 56 },
  },
  {
    sizeId: 21,
    accessibleModules: 1105,
    bodyBits: 1041,
    maximumCodewordBytes: 130,
    maximumUncompressedPayloadBytes: { low: 119, medium: 109, high: 96 },
  },
  {
    sizeId: 22,
    accessibleModules: 1608,
    bodyBits: 1544,
    maximumCodewordBytes: 192,
    maximumUncompressedPayloadBytes: { low: 178, medium: 162, high: 143 },
  },
  {
    sizeId: 23,
    accessibleModules: 2205,
    bodyBits: 2141,
    maximumCodewordBytes: 267,
    maximumUncompressedPayloadBytes: { low: 249, medium: 227, high: 201 },
  },
  {
    sizeId: 24,
    accessibleModules: 2896,
    bodyBits: 2832,
    maximumCodewordBytes: 353,
    maximumUncompressedPayloadBytes: { low: 331, medium: 302, high: 267 },
  },
  {
    sizeId: 25,
    accessibleModules: 4560,
    bodyBits: 4496,
    maximumCodewordBytes: 561,
    maximumUncompressedPayloadBytes: { low: 530, medium: 482, high: 426 },
  },
  {
    sizeId: 26,
    accessibleModules: 6600,
    bodyBits: 6536,
    maximumCodewordBytes: 816,
    maximumUncompressedPayloadBytes: { low: 772, medium: 704, high: 622 },
  },
  {
    sizeId: 27,
    accessibleModules: 11808,
    bodyBits: 11744,
    maximumCodewordBytes: 1467,
    maximumUncompressedPayloadBytes: { low: 1391, medium: 1271, high: 1121 },
  },
  {
    sizeId: 28,
    accessibleModules: 18520,
    bodyBits: 18456,
    maximumCodewordBytes: 2306,
    maximumUncompressedPayloadBytes: { low: 2192, medium: 1999, high: 1764 },
  },
  {
    sizeId: 29,
    accessibleModules: 26736,
    bodyBits: 26672,
    maximumCodewordBytes: 3333,
    maximumUncompressedPayloadBytes: { low: 3161, medium: 2887, high: 2558 },
  },
] as const;
