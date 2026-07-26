import { describe, expect, it } from "vitest";
import {
  gfPolynomialAdd,
  gfPolynomialEvaluate,
  gfPolynomialMultiply,
  gfPolynomialScale,
} from "../src/gf256-polynomial.js";
import {
  buildGeneratorPolynomial,
  calculateSyndromes,
  reedSolomonDecode,
  reedSolomonEncode,
} from "../src/reed-solomon.js";

const QR_HELLO_WORLD_DATA = Uint8Array.of(
  32,
  91,
  11,
  120,
  209,
  114,
  220,
  77,
  67,
  64,
  236,
  17,
  236,
  17,
  236,
  17,
  236,
  17,
  236,
);

describe("GF(256) polynomial operations", () => {
  it("adds, scales, multiplies, and evaluates highest-degree-first", () => {
    expect(
      gfPolynomialAdd(Uint8Array.of(1, 2, 3), Uint8Array.of(4, 5)),
    ).toEqual(Uint8Array.of(1, 6, 6));
    expect(gfPolynomialScale(Uint8Array.of(1, 2), 2)).toEqual(
      Uint8Array.of(2, 4),
    );
    expect(
      gfPolynomialMultiply(Uint8Array.of(1, 1), Uint8Array.of(1, 2)),
    ).toEqual(Uint8Array.of(1, 3, 2));
    expect(gfPolynomialEvaluate(Uint8Array.of(1, 1), 1)).toBe(0);
  });
});

describe("Reed-Solomon generator and encoding", () => {
  it("matches known generator polynomials for roots alpha^0 onward", () => {
    expect(buildGeneratorPolynomial(4)).toEqual(
      Uint8Array.of(1, 15, 54, 120, 64),
    );
    expect(buildGeneratorPolynomial(7)).toEqual(
      Uint8Array.of(1, 127, 122, 154, 164, 11, 68, 117),
    );
  });

  it("matches the QR HELLO WORLD RS(26,19) known answer", () => {
    const codeword = reedSolomonEncode(QR_HELLO_WORLD_DATA, 7);
    expect(codeword.slice(19)).toEqual(
      Uint8Array.of(209, 239, 196, 207, 78, 195, 109),
    );
    expect(calculateSyndromes(codeword, 7)).toEqual(new Uint8Array(7));
  });

  it("supports shortened blocks and leaves the input unchanged", () => {
    const data = Uint8Array.of(0xa7, 0x10, 0x54, 0x10, 0, 12, 0, 12);
    const original = data.slice();
    const codeword = reedSolomonEncode(data, 4);
    expect(data).toEqual(original);
    expect(codeword.slice(0, data.length)).toEqual(data);
    expect(codeword).toHaveLength(12);
    expect(calculateSyndromes(codeword, 4)).toEqual(new Uint8Array(4));
  });
});

describe("Reed-Solomon decoding", () => {
  it("returns a defensive copy for a clean codeword", () => {
    const data = sequence(32);
    const codeword = reedSolomonEncode(data, 10);
    const decoded = reedSolomonDecode(codeword, 10);
    expect(decoded.data).toEqual(data);
    expect(decoded.correctedCodeword).toEqual(codeword);
    expect(decoded.correctedCodewords).toBe(0);
    expect(decoded.erasuresUsed).toBe(0);
    expect(decoded.correctedCodeword).not.toBe(codeword);
  });

  it("corrects the maximum number of unknown errors", () => {
    const data = sequence(48);
    const codeword = reedSolomonEncode(data, 10);
    const damaged = corrupt(codeword, [0, 7, 19, 41, 57]);
    const decoded = reedSolomonDecode(damaged, 10);
    expect(decoded.data).toEqual(data);
    expect(decoded.correctedCodeword).toEqual(codeword);
    expect(decoded.correctedCodewords).toBe(5);
    expect(decoded.errorPositions).toEqual([0, 7, 19, 41, 57]);
    expect(calculateSyndromes(decoded.correctedCodeword, 10)).toEqual(
      new Uint8Array(10),
    );
  });

  it("corrects the maximum number of erasures", () => {
    const data = sequence(30);
    const codeword = reedSolomonEncode(data, 8);
    const positions = [0, 2, 5, 9, 17, 25, 31, 37];
    const damaged = corrupt(codeword, positions);
    const decoded = reedSolomonDecode(damaged, 8, positions);
    expect(decoded.data).toEqual(data);
    expect(decoded.correctedCodeword).toEqual(codeword);
    expect(decoded.correctedCodewords).toBe(positions.length);
    expect(decoded.erasuresUsed).toBe(positions.length);
  });

  it("corrects valid mixed unknown errors and erasures", () => {
    const data = sequence(40);
    const codeword = reedSolomonEncode(data, 10);
    const erasures = [1, 12, 27, 45];
    const unknownErrors = [5, 33, 48];
    const damaged = corrupt(codeword, [...erasures, ...unknownErrors]);
    const decoded = reedSolomonDecode(damaged, 10, erasures);
    expect(decoded.data).toEqual(data);
    expect(decoded.correctedCodeword).toEqual(codeword);
    expect(decoded.correctedCodewords).toBe(7);
    expect(decoded.erasuresUsed).toBe(4);
  });

  it("accepts a false erasure without altering a clean byte", () => {
    const data = sequence(20);
    const codeword = reedSolomonEncode(data, 8);
    const damaged = corrupt(codeword, [3, 15]);
    const decoded = reedSolomonDecode(damaged, 8, [3, 7]);
    expect(decoded.data).toEqual(data);
    expect(decoded.correctedCodeword).toEqual(codeword);
    expect(decoded.correctedCodewords).toBe(2);
    expect(decoded.erasuresUsed).toBe(2);
  });

  it("rejects corruption beyond the correction limit", () => {
    const codeword = reedSolomonEncode(sequence(32), 8);
    const damaged = corrupt(codeword, [0, 3, 9, 17, 31]);
    expect(() => reedSolomonDecode(damaged, 8)).toThrow(
      /capability|locations|syndrome/i,
    );
  });

  it("validates erasure indices and codeword limits", () => {
    const codeword = reedSolomonEncode(sequence(8), 4);
    expect(() => reedSolomonDecode(codeword, 4, [-1])).toThrow(/position/i);
    expect(() => reedSolomonDecode(codeword, 4, [1, 1])).toThrow(/unique/i);
    expect(() => reedSolomonEncode(new Uint8Array(252), 4)).toThrow(/255/i);
  });

  it("holds at correction boundaries across deterministic shortened blocks", () => {
    for (const parityLength of [4, 8, 12, 20]) {
      for (const dataLength of [1, 17, 73]) {
        const data = sequence(dataLength);
        const codeword = reedSolomonEncode(data, parityLength);
        const unknownPositions = distinctPositions(
          codeword.length,
          Math.floor(parityLength / 2),
          3,
        );
        expect(
          reedSolomonDecode(corrupt(codeword, unknownPositions), parityLength)
            .data,
        ).toEqual(data);

        const erasurePositions = distinctPositions(
          codeword.length,
          parityLength,
          11,
        );
        expect(
          reedSolomonDecode(
            corrupt(codeword, erasurePositions),
            parityLength,
            erasurePositions,
          ).data,
        ).toEqual(data);
      }
    }
  });
});

function sequence(length: number): Uint8Array {
  return Uint8Array.from({ length }, (_, index) => (index * 73 + 19) & 0xff);
}

function corrupt(
  codeword: Uint8Array,
  positions: readonly number[],
): Uint8Array {
  const damaged = codeword.slice();
  for (let index = 0; index < positions.length; index += 1) {
    damaged[positions[index]!] ^= ((index + 1) * 37) & 0xff;
  }
  return damaged;
}

function distinctPositions(
  length: number,
  count: number,
  seed: number,
): readonly number[] {
  const positions: number[] = [];
  let candidate = seed % length;
  while (positions.length < count) {
    if (!positions.includes(candidate)) positions.push(candidate);
    candidate = (candidate + 1) % length;
  }
  return positions;
}
