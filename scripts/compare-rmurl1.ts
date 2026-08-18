import {
  encodeUtf8Strict,
  rmhle1EncodeDetailed,
  rmurl1EncodeDetailed,
} from "../packages/core/src/index.js";

const samples = [
  "https://example.com",
  "https://www.example.de/items/123456789",
  "https://example.co.uk/a//b/?x=&x=1#part",
  "https://example.cn/a%2Fb/%2f?empty&=value",
  "https://api.example.in/v1/items/550e8400-e29b-41d4-a716-446655440000",
] as const;

for (const text of samples) {
  const rawBits = encodeUtf8Strict(text).length * 8;
  const hle = rmhle1EncodeDetailed(text);
  const url = rmurl1EncodeDetailed(text);
  const rawStoredBytes = rawBits / 8;
  console.log(
    JSON.stringify({
      text,
      rawBits,
      rmHle1Bits: hle.bitLength,
      rmUrl1Bits: url.bitLength,
      rmUrl1StoredBits: url.bytes.length * 8,
      beforeAnyEccBits: {
        raw: preEccBits(rawStoredBytes, false),
        rmHle1: preEccBits(hle.bytes.length, false),
        rmUrl1: preEccBits(url.bytes.length, false),
      },
      beforeBodyEccWithProtectedHeaderBits: {
        raw: preEccBits(rawStoredBytes, true),
        rmHle1: preEccBits(hle.bytes.length, true),
        rmUrl1: preEccBits(url.bytes.length, true),
      },
      savingsAgainstRawPercent: roundPercent(url.bitLength, rawBits),
      savingsAgainstRmHle1Percent: roundPercent(url.bitLength, hle.bitLength),
    }),
  );
}

function roundPercent(encoded: number, baseline: number): number {
  return Math.round((1 - encoded / baseline) * 1000) / 10;
}

function preEccBits(payloadBytes: number, protectedHeader: boolean): number {
  const headerBits = protectedHeader ? 64 : 32;
  const crc32cBits = 32;
  return headerBits + payloadBytes * 8 + crc32cBits;
}
