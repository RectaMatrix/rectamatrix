import { PADDING_BYTES } from "./generated/spec-constants.js";

export function createBodyBitstream(
  interleavedCodewords: Uint8Array,
  capacityBits: number,
): readonly boolean[] {
  if (!Number.isInteger(capacityBits) || capacityBits < 1) {
    throw new RangeError("Body capacity must be a positive integer.");
  }
  const requiredBits = interleavedCodewords.length * 8 + 1;
  if (requiredBits > capacityBits) {
    throw new RangeError(
      "Interleaved codewords and Terminator exceed Body capacity.",
    );
  }

  const bits = new Array<boolean>(capacityBits).fill(false);
  let bitOffset = 0;
  for (const codeword of interleavedCodewords) {
    for (let bit = 7; bit >= 0; bit -= 1) {
      bits[bitOffset] = ((codeword >>> bit) & 1) === 1;
      bitOffset += 1;
    }
  }

  bits[bitOffset] = true;
  bitOffset += 1;
  bitOffset = Math.min(Math.ceil(bitOffset / 8) * 8, capacityBits);

  let paddingIndex = 0;
  while (bitOffset < capacityBits) {
    const paddingByte = PADDING_BYTES[paddingIndex % PADDING_BYTES.length]!;
    paddingIndex += 1;
    for (let bit = 7; bit >= 0 && bitOffset < capacityBits; bit -= 1) {
      bits[bitOffset] = ((paddingByte >>> bit) & 1) === 1;
      bitOffset += 1;
    }
  }
  return Object.freeze(bits);
}

export function readCodewordsFromBodyBits(
  bodyBits: readonly boolean[],
  codewordCount: number,
): Uint8Array {
  if (!Number.isInteger(codewordCount) || codewordCount < 0) {
    throw new RangeError("Codeword count must be a non-negative integer.");
  }
  if (codewordCount * 8 > bodyBits.length) {
    throw new RangeError("Body does not contain the requested codewords.");
  }
  const codewords = new Uint8Array(codewordCount);
  for (let byteIndex = 0; byteIndex < codewordCount; byteIndex += 1) {
    let value = 0;
    for (let bit = 0; bit < 8; bit += 1) {
      value = (value << 1) | (bodyBits[byteIndex * 8 + bit] ? 1 : 0);
    }
    codewords[byteIndex] = value;
  }
  return codewords;
}
