export function bytesToBits(bytes: Uint8Array): readonly boolean[] {
  const bits = new Array<boolean>(bytes.length * 8);
  for (let byteIndex = 0; byteIndex < bytes.length; byteIndex += 1) {
    const value = bytes[byteIndex]!;
    for (let bit = 0; bit < 8; bit += 1) {
      bits[byteIndex * 8 + bit] = ((value >>> (7 - bit)) & 1) === 1;
    }
  }
  return Object.freeze(bits);
}

export function bitsToBytes(bits: readonly boolean[]): Uint8Array {
  if (bits.length % 8 !== 0) {
    throw new RangeError("Bit length must be a multiple of eight.");
  }
  const bytes = new Uint8Array(bits.length / 8);
  for (let index = 0; index < bits.length; index += 1) {
    if (bits[index]) {
      bytes[Math.floor(index / 8)]! |= 1 << (7 - (index % 8));
    }
  }
  return bytes;
}

export function uint32ToBytesBE(value: number): Uint8Array {
  if (!Number.isInteger(value) || value < 0 || value > 0xffffffff) {
    throw new RangeError("Value must be an unsigned 32-bit integer.");
  }
  return Uint8Array.of(value >>> 24, value >>> 16, value >>> 8, value);
}

export function bytesToUint32BE(bytes: Uint8Array, offset = 0): number {
  if (!Number.isInteger(offset) || offset < 0 || offset + 4 > bytes.length) {
    throw new RangeError("Four bytes are required at the requested offset.");
  }
  return (
    ((bytes[offset]! << 24) |
      (bytes[offset + 1]! << 16) |
      (bytes[offset + 2]! << 8) |
      bytes[offset + 3]!) >>>
    0
  );
}
