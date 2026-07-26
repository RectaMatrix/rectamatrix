import { describe, expect, it } from "vitest";
import {
  calculateAnchorLikePenalty,
  calculateBalancePenalty,
  calculateBlockPenalty,
  calculateRunPenalty,
  selectBestMask,
} from "../src/penalty.js";
import type { BooleanMatrix, MaskId } from "../src/types.js";

describe("Mask penalty rules", () => {
  it("scores long horizontal and vertical runs independently", () => {
    expect(calculateRunPenalty(matrix("11111"))).toBe(3);
    expect(calculateRunPenalty(matrix("111111"))).toBe(4);
    expect(calculateRunPenalty(matrix("1", "1", "1", "1", "1"))).toBe(3);
    expect(calculateRunPenalty(matrix("1111"))).toBe(0);
  });

  it("scores every uniform 2x2 block", () => {
    expect(calculateBlockPenalty(matrix("11", "11"))).toBe(3);
    expect(calculateBlockPenalty(matrix("111", "111", "111"))).toBe(12);
    expect(calculateBlockPenalty(matrix("10", "01"))).toBe(0);
  });

  it("scores exact Anchor-like patterns and their inversion", () => {
    expect(calculateAnchorLikePenalty(matrix("1011101"))).toBe(20);
    expect(calculateAnchorLikePenalty(matrix("0100010"))).toBe(20);
    expect(
      calculateAnchorLikePenalty(matrix("1", "0", "1", "1", "1", "0", "1")),
    ).toBe(20);
    expect(calculateAnchorLikePenalty(matrix("1011100"))).toBe(0);
  });

  it("scores every started five-percentage-point balance deviation", () => {
    expect(calculateBalancePenalty(matrix("10"))).toBe(0);
    expect(calculateBalancePenalty(matrix("1111110000"))).toBe(20);
    expect(
      calculateBalancePenalty(matrix("1".repeat(62) + "0".repeat(38))),
    ).toBe(30);
  });
});

describe("deterministic Mask selection", () => {
  it("selects the unique lowest score", () => {
    const candidates = [
      candidate(0, "11111"),
      candidate(1, "10101"),
      candidate(2, "111111"),
      candidate(3, "1111111"),
    ];
    expect(selectBestMask(candidates).maskId).toBe(1);
  });

  it("uses the lower Mask ID when scores tie", () => {
    const candidates = [
      candidate(0, "1010"),
      candidate(1, "0101"),
      candidate(2, "1111"),
      candidate(3, "0000"),
    ];
    expect(selectBestMask(candidates).maskId).toBe(0);
  });
});

function matrix(...rows: string[]): BooleanMatrix {
  return Object.freeze(
    rows.map((row) =>
      Object.freeze(
        Array.from(
          { length: row.length },
          (_, index) => row.charCodeAt(index) === 49,
        ),
      ),
    ),
  );
}

function candidate(maskId: MaskId, row: string) {
  return Object.freeze({ maskId, matrix: matrix(row) });
}
