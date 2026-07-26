import { GF256_PARAMETERS } from "./generated/spec-constants.js";

const EXP = new Uint8Array(512);
const LOG = new Int16Array(256);
initializeTables();

export function gfAdd(left: number, right: number): number {
  assertElement(left);
  assertElement(right);
  return left ^ right;
}

export const gfSubtract = gfAdd;

export function gfMultiply(left: number, right: number): number {
  assertElement(left);
  assertElement(right);
  if (left === 0 || right === 0) return 0;
  return EXP[LOG[left]! + LOG[right]!]!;
}

export function gfDivide(dividend: number, divisor: number): number {
  assertElement(dividend);
  assertElement(divisor);
  if (divisor === 0) throw new RangeError("Division by zero in GF(256).");
  if (dividend === 0) return 0;
  let exponent = LOG[dividend]! - LOG[divisor]!;
  if (exponent < 0) exponent += 255;
  return EXP[exponent]!;
}

export function gfPow(value: number, exponent: number): number {
  assertElement(value);
  if (!Number.isInteger(exponent)) {
    throw new RangeError("GF(256) exponent must be an integer.");
  }
  if (exponent === 0) return 1;
  if (value === 0) {
    if (exponent < 0) {
      throw new RangeError("Zero cannot have a negative GF(256) exponent.");
    }
    return 0;
  }
  const normalized = (((LOG[value]! * exponent) % 255) + 255) % 255;
  return EXP[normalized]!;
}

export function gfInverse(value: number): number {
  assertElement(value);
  if (value === 0) throw new RangeError("Zero has no inverse in GF(256).");
  return EXP[255 - LOG[value]!]!;
}

function initializeTables(): void {
  let value = 1;
  for (let exponent = 0; exponent < 255; exponent += 1) {
    EXP[exponent] = value;
    LOG[value] = exponent;
    value <<= 1;
    if ((value & 0x100) !== 0) {
      value ^= GF256_PARAMETERS.primitivePolynomial;
    }
  }
  for (let exponent = 255; exponent < EXP.length; exponent += 1) {
    EXP[exponent] = EXP[exponent - 255]!;
  }
  LOG[0] = -1;
}

function assertElement(value: number): void {
  if (!Number.isInteger(value) || value < 0 || value > 0xff) {
    throw new RangeError("GF(256) elements must be bytes.");
  }
}
