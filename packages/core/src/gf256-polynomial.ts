import { gfAdd, gfMultiply } from "./gf256.js";

export function gfPolynomialAdd(
  left: Uint8Array,
  right: Uint8Array,
): Uint8Array {
  const length = Math.max(left.length, right.length);
  const result = new Uint8Array(length);
  const leftOffset = length - left.length;
  const rightOffset = length - right.length;

  for (let index = 0; index < length; index += 1) {
    const leftValue = index >= leftOffset ? (left[index - leftOffset] ?? 0) : 0;
    const rightValue =
      index >= rightOffset ? (right[index - rightOffset] ?? 0) : 0;
    result[index] = gfAdd(leftValue, rightValue);
  }

  return trimLeadingZeros(result);
}

export function gfPolynomialMultiply(
  left: Uint8Array,
  right: Uint8Array,
): Uint8Array {
  if (left.length === 0 || right.length === 0) {
    throw new RangeError("GF(256) polynomials must contain a coefficient.");
  }
  const result = new Uint8Array(left.length + right.length - 1);
  for (let leftIndex = 0; leftIndex < left.length; leftIndex += 1) {
    for (let rightIndex = 0; rightIndex < right.length; rightIndex += 1) {
      const resultIndex = leftIndex + rightIndex;
      result[resultIndex] =
        result[resultIndex]! ^ gfMultiply(left[leftIndex]!, right[rightIndex]!);
    }
  }
  return trimLeadingZeros(result);
}

export function gfPolynomialScale(
  polynomial: Uint8Array,
  scalar: number,
): Uint8Array {
  if (polynomial.length === 0) {
    throw new RangeError("GF(256) polynomials must contain a coefficient.");
  }
  return trimLeadingZeros(
    Uint8Array.from(polynomial, (coefficient) =>
      gfMultiply(coefficient, scalar),
    ),
  );
}

export function gfPolynomialEvaluate(
  polynomial: Uint8Array,
  value: number,
): number {
  if (polynomial.length === 0) {
    throw new RangeError("GF(256) polynomials must contain a coefficient.");
  }
  let result = polynomial[0]!;
  for (let index = 1; index < polynomial.length; index += 1) {
    result = gfAdd(gfMultiply(result, value), polynomial[index]!);
  }
  return result;
}

function trimLeadingZeros(polynomial: Uint8Array): Uint8Array {
  let firstNonZero = 0;
  while (
    firstNonZero < polynomial.length - 1 &&
    polynomial[firstNonZero] === 0
  ) {
    firstNonZero += 1;
  }
  return polynomial.slice(firstNonZero);
}
