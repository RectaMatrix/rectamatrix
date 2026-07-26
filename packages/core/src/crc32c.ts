import { CRC32C_PARAMETERS } from "./generated/spec-constants.js";

const TABLE = buildTable();

export function crc32c(bytes: Uint8Array): number {
  let crc: number = CRC32C_PARAMETERS.initialValue;
  for (const byte of bytes) {
    crc = TABLE[(crc ^ byte) & 0xff]! ^ (crc >>> 8);
  }
  return (crc ^ CRC32C_PARAMETERS.finalXor) >>> 0;
}

function buildTable(): Uint32Array {
  const table = new Uint32Array(256);
  for (let value = 0; value < 256; value += 1) {
    let remainder = value;
    for (let bit = 0; bit < 8; bit += 1) {
      remainder =
        (remainder & 1) === 1
          ? (remainder >>> 1) ^ CRC32C_PARAMETERS.reflectedPolynomial
          : remainder >>> 1;
    }
    table[value] = remainder >>> 0;
  }
  return table;
}
