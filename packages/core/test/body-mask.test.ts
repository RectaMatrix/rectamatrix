import { describe, expect, it } from "vitest";
import {
  createBodyBitstream,
  readCodewordsFromBodyBits,
} from "../src/body-bitstream.js";
import { applyBodyMask, maskCondition } from "../src/mask.js";
import type { Coordinate, MaskId } from "../src/types.js";

describe("Body Bitstream", () => {
  it("writes codewords MSB-first, a Terminator, alignment, and alternating padding", () => {
    const bits = createBodyBitstream(Uint8Array.of(0xa6), 32);
    expect(bits.map(Number).join("")).toBe(
      "10100110" + "10000000" + "11101100" + "00010001",
    );
    expect(readCodewordsFromBodyBits(bits, 1)).toEqual(Uint8Array.of(0xa6));
  });

  it("uses the most significant bits of the next padding byte for a partial end", () => {
    const bits = createBodyBitstream(Uint8Array.of(0x00), 20);
    expect(bits.map(Number).join("")).toBe("00000000100000001110");
  });

  it("truncates alignment zeros only when Body capacity ends first", () => {
    const bits = createBodyBitstream(new Uint8Array(2), 20);
    expect(bits.map(Number).join("")).toBe("00000000000000001000");
  });

  it("rejects a stream without room for the Terminator", () => {
    expect(() => createBodyBitstream(Uint8Array.of(0xff), 8)).toThrow(
      /Terminator/i,
    );
  });
});

describe("Body masks", () => {
  const coordinates: readonly Coordinate[] = Object.freeze(
    Array.from({ length: 24 }, (_, index) =>
      Object.freeze({ x: index % 6, y: Math.floor(index / 6) }),
    ),
  );

  it("implements the four exact coordinate conditions", () => {
    expect(maskCondition(0, 2, 2)).toBe(true);
    expect(maskCondition(0, 2, 3)).toBe(false);
    expect(maskCondition(1, 5, 2)).toBe(true);
    expect(maskCondition(1, 5, 3)).toBe(false);
    expect(maskCondition(2, 3, 1)).toBe(true);
    expect(maskCondition(2, 4, 1)).toBe(false);
    expect(maskCondition(3, 1, 1)).toBe(true);
    expect(maskCondition(3, 0, 1)).toBe(false);
  });

  it("is an involution for every Mask ID", () => {
    const input = Object.freeze(coordinates.map((_, index) => index % 3 === 0));
    for (const maskId of [0, 1, 2, 3] as const) {
      expect(
        applyBodyMask(
          applyBodyMask(input, coordinates, maskId),
          coordinates,
          maskId,
        ),
      ).toEqual(input);
    }
  });

  it("rejects unsupported runtime Mask IDs", () => {
    expect(() => maskCondition(4 as MaskId, 0, 0)).toThrow(/Mask ID/i);
  });
});
