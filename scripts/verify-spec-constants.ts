import {
  CALCULATED_CAPACITIES,
  HEADER_BITS,
  HEADER_WHITENING_BYTES,
  QUIET_ZONE_PROFILES,
  RECTAMATRIX_SIZES,
} from "../packages/core/src/generated/spec-constants.js";
import {
  RM_HLE1_ALPHANUMERIC_TABLE,
  RM_HLE1_LOWER_TABLE,
  RM_HLE1_UPPER_TABLE,
} from "../packages/core/src/rmhle1.js";
import {
  calculateAccessibleModules,
  calculateBodyBits,
  maximumCodewordBytes,
} from "../packages/core/src/geometry.js";
import { calculateRsLayout } from "../packages/core/src/block-layout.js";
import type { EccLevel } from "../packages/core/src/types.js";

const ECC_LEVELS = ["low", "medium", "high"] as const;
const quietZoneProfiles: Readonly<Record<string, number>> = QUIET_ZONE_PROFILES;

if (
  RM_HLE1_ALPHANUMERIC_TABLE.length !== 45 ||
  RM_HLE1_LOWER_TABLE.length !== 32 ||
  RM_HLE1_UPPER_TABLE.length !== 32
) {
  throw new Error("RM-HLE1 tables have invalid sizes.");
}

if (quietZoneProfiles.compact !== 2 || quietZoneProfiles.standard !== 4) {
  throw new Error("Quiet Zone profile constants are invalid.");
}

if (
  HEADER_WHITENING_BYTES.reduce(
    (count, byte) => count + byte.toString(2).replaceAll("0", "").length,
    0,
  ) !== 32
) {
  throw new Error("Header whitening must contain exactly 32 one-bits.");
}

for (const size of RECTAMATRIX_SIZES) {
  const expected = CALCULATED_CAPACITIES[size.sizeId];
  const ratio = size.width / size.height;
  const expectedRatio =
    size.aspectRatio === "3:2" ? 1.5 : size.aspectRatio === "2:1" ? 2 : 3;
  if (ratio !== expectedRatio) {
    throw new Error(
      `Size ${String(size.sizeId)} does not match ${size.aspectRatio}.`,
    );
  }
  if (size.anchorSize !== size.height / 4) {
    throw new Error(`Size ${String(size.sizeId)} has the wrong anchor size.`);
  }
  if (calculateAccessibleModules(size) !== expected.accessibleModules) {
    throw new Error(
      `Accessible-module mismatch for size ${String(size.sizeId)}.`,
    );
  }
  if (calculateBodyBits(size) !== expected.bodyBits) {
    throw new Error(`Body-bit mismatch for size ${String(size.sizeId)}.`);
  }
  if (maximumCodewordBytes(size) !== expected.maximumCodewordBytes) {
    throw new Error(
      `Codeword capacity mismatch for size ${String(size.sizeId)}.`,
    );
  }
  if (expected.accessibleModules - expected.bodyBits !== HEADER_BITS) {
    throw new Error(
      `Header reservation mismatch for size ${String(size.sizeId)}.`,
    );
  }
  for (const eccLevel of ECC_LEVELS) {
    const maximumPayload = expected.maximumUncompressedPayloadBytes[eccLevel];
    const maximumFrame = maximumPayload + 4;
    if (
      calculateRsLayout(maximumFrame, eccLevel).totalCodewordBytes >
      expected.maximumCodewordBytes
    ) {
      throw new Error(
        `Declared ${eccLevel} payload capacity does not fit size ${String(size.sizeId)}.`,
      );
    }
    assertNextFrameDoesNotFit(
      maximumFrame,
      eccLevel,
      expected.maximumCodewordBytes,
      size.sizeId,
    );
  }
}

console.log("RectaMatrix v2 draft specification constants verified.");

function assertNextFrameDoesNotFit(
  maximumFrame: number,
  eccLevel: EccLevel,
  maximumCodewords: number,
  sizeId: number,
): void {
  if (
    calculateRsLayout(maximumFrame + 1, eccLevel).totalCodewordBytes <=
    maximumCodewords
  ) {
    throw new Error(
      `Declared ${eccLevel} payload capacity is not maximal for size ${String(sizeId)}.`,
    );
  }
}
