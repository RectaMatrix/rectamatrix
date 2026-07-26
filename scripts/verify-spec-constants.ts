import {
  CALCULATED_CAPACITIES,
  HEADER_BITS,
  HEADER_WHITENING_BYTES,
  QUIET_ZONE_PROFILES,
  RECTAMATRIX_SIZES,
} from "../packages/core/src/generated/spec-constants.js";
import {
  calculateAccessibleModules,
  calculateBodyBits,
  maximumCodewordBytes,
} from "../packages/core/src/geometry.js";
import { calculateRsLayout } from "../packages/core/src/block-layout.js";
import type { EccLevel } from "../packages/core/src/types.js";

const ECC_LEVELS = ["low", "medium", "high"] as const;
const quietZoneProfiles: Readonly<Record<string, number>> = QUIET_ZONE_PROFILES;

if (quietZoneProfiles.compact !== 2 || quietZoneProfiles.standard !== 4) {
  throw new Error("Quiet Zone profile constants are invalid.");
}

if (
  HEADER_WHITENING_BYTES.reduce(
    (count, byte) => count + byte.toString(2).replaceAll("0", "").length,
    0,
  ) !== 48
) {
  throw new Error("Header whitening must contain exactly 48 one-bits.");
}

for (const size of RECTAMATRIX_SIZES) {
  const expected = CALCULATED_CAPACITIES[size.sizeId];
  if (size.width * 2 !== size.height * 3) {
    throw new Error(`Size ${String(size.sizeId)} is not exactly 3:2.`);
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

console.log("RectaMatrix v1 specification constants verified.");

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
