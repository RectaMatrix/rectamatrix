const LOWERCASE_HEX = /^(?:[0-9a-f]{2})*$/u;

export function bytesToHex(bytes: Uint8Array): string {
  let result = "";
  for (const byte of bytes) {
    result += byte.toString(16).padStart(2, "0");
  }
  return result;
}

export function hexToBytes(hex: string): Uint8Array {
  if (!LOWERCASE_HEX.test(hex)) {
    throw new RangeError(
      "Conformance hexadecimal values must use lowercase byte pairs.",
    );
  }
  const result = new Uint8Array(hex.length / 2);
  for (let index = 0; index < result.length; index += 1) {
    result[index] = Number.parseInt(hex.slice(index * 2, index * 2 + 2), 16);
  }
  return result;
}

export function uint32ToHex(value: number): string {
  if (!Number.isInteger(value) || value < 0 || value > 0xffffffff) {
    throw new RangeError("Expected an unsigned 32-bit integer.");
  }
  return value.toString(16).padStart(8, "0");
}

export function isLowercaseHex(value: string): boolean {
  return LOWERCASE_HEX.test(value);
}
