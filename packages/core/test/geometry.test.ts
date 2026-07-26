import { describe, expect, it } from "vitest";
import {
  CALCULATED_CAPACITIES,
  RECTAMATRIX_SIZES,
} from "../src/generated/spec-constants.js";
import {
  anchorModule,
  buildScanOrder,
  calculateAccessibleModules,
  calculateBodyBits,
  createFixedPatternMatrix,
  createReservedMap,
  maximumCodewordBytes,
} from "../src/geometry.js";

describe("RectaMatrix Version 1 geometry", () => {
  it("matches all calculated capacities", () => {
    for (const size of RECTAMATRIX_SIZES) {
      const expected = CALCULATED_CAPACITIES[size.sizeId];
      expect(calculateAccessibleModules(size)).toBe(expected.accessibleModules);
      expect(calculateBodyBits(size)).toBe(expected.bodyBits);
      expect(maximumCodewordBytes(size)).toBe(expected.maximumCodewordBytes);
      expect(buildScanOrder(size)).toHaveLength(expected.accessibleModules);
    }
  });

  it("generates the exact size-0 Micro-Anchor", () => {
    const size = RECTAMATRIX_SIZES[0];
    const rows = Array.from({ length: size.anchorSize }, (_, y) =>
      Array.from({ length: size.anchorSize }, (_, x) =>
        anchorModule(size, x, y) ? "1" : "0",
      ).join(""),
    );
    expect(rows).toEqual(["1111", "1111", "1100", "1100"]);
  });

  it("starts at the lower right and skips every reserved module", () => {
    const size = RECTAMATRIX_SIZES[0];
    const reserved = createReservedMap(size);
    const scan = buildScanOrder(size);
    expect(scan.slice(0, 4)).toEqual([
      { x: 23, y: 15 },
      { x: 22, y: 15 },
      { x: 23, y: 14 },
      { x: 22, y: 14 },
    ]);
    expect(scan.every(({ x, y }) => reserved[y]?.[x] === false)).toBe(true);
    expect(
      new Set(scan.map(({ x, y }) => `${String(x)},${String(y)}`)).size,
    ).toBe(scan.length);
  });

  it("writes exact alternating clocking modules", () => {
    const size = RECTAMATRIX_SIZES[0];
    const matrix = createFixedPatternMatrix(size);
    expect(
      matrix[0]!
        .slice(size.anchorSize)
        .map((value) => (value ? "1" : "0"))
        .join(""),
    ).toBe("10".repeat((size.width - size.anchorSize) / 2));
    expect(
      matrix
        .slice(size.anchorSize)
        .map((row) => (row[0] ? "1" : "0"))
        .join(""),
    ).toBe("10".repeat((size.height - size.anchorSize) / 2));
  });
});
