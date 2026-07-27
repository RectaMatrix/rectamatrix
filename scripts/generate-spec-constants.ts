import { writeFile } from "node:fs/promises";
import {
  CALCULATED_CAPACITIES,
  COMPRESSION_MODE_VALUES,
  CRC32C_PARAMETERS,
  GF256_PARAMETERS,
  HEADER_BITS,
  HEADER_INFORMATION_BYTES,
  HEADER_MAGIC,
  HEADER_PARITY_BYTES,
  HEADER_TOTAL_BYTES,
  HEADER_WHITENING_BYTES,
  MAX_ENCODED_DATA_LENGTH,
  PADDING_BYTES,
  QUIET_ZONE_MODULES,
  QUIET_ZONE_PROFILES,
  RECTAMATRIX_SIZES,
  SYMBOL_VERSION,
} from "../packages/core/src/generated/spec-constants.js";
import {
  RM_HLE1_ALPHANUMERIC_TABLE,
  RM_HLE1_LOWER_TABLE,
  RM_HLE1_UPPER_TABLE,
  RM_HLE1_URL_TOKENS,
} from "../packages/core/src/rmhle1.js";

const rootDirectory = `${String(import.meta.dirname)}/..`;
const outputPath = `${rootDirectory}/conformance/generated/spec-constants.json`;
const sizes = RECTAMATRIX_SIZES.map((size, index) => ({
  ...size,
  ...CALCULATED_CAPACITIES[index],
}));

const document = {
  symbolVersion: SYMBOL_VERSION,
  headerMagic: HEADER_MAGIC,
  header: {
    informationBytes: HEADER_INFORMATION_BYTES,
    parityBytes: HEADER_PARITY_BYTES,
    totalBytes: HEADER_TOTAL_BYTES,
    bits: HEADER_BITS,
    whiteningBytes: HEADER_WHITENING_BYTES,
    maximumEncodedDataLength: MAX_ENCODED_DATA_LENGTH,
    extendedLengthEscape: 0x0fff,
  },
  sizes,
  codecs: COMPRESSION_MODE_VALUES,
  rmHle1: {
    alphanumericTable: RM_HLE1_ALPHANUMERIC_TABLE,
    lowerTable: RM_HLE1_LOWER_TABLE,
    upperTable: RM_HLE1_UPPER_TABLE,
    urlTokens: RM_HLE1_URL_TOKENS,
  },
  crc32c: CRC32C_PARAMETERS,
  gf256: GF256_PARAMETERS,
  paddingBytes: PADDING_BYTES,
  quietZoneModules: QUIET_ZONE_MODULES,
  quietZoneProfiles: QUIET_ZONE_PROFILES,
};

await writeFile(outputPath, `${JSON.stringify(document, null, 2)}\n`, "utf8");
console.log(`Generated ${outputPath}.`);
