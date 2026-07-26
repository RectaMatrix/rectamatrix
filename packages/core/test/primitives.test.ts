import { describe, expect, it } from "vitest";
import {
  bitsToBytes,
  bytesToBits,
  bytesToUint32BE,
  uint32ToBytesBE,
} from "../src/bits.js";
import { crc32c } from "../src/crc32c.js";
import { gfAdd, gfDivide, gfInverse, gfMultiply, gfPow } from "../src/gf256.js";
import { rmlz1Decode, rmlz1Encode } from "../src/rmlz1.js";
import {
  decodeUtf8Strict,
  encodeUtf8Strict,
  hasUnpairedSurrogate,
} from "../src/utf8.js";

describe("bit and byte order", () => {
  it("uses MSB-first byte bits", () => {
    const bytes = Uint8Array.of(0xa6, 0x01);
    expect(bytesToBits(bytes).map(Number).join("")).toBe("1010011000000001");
    expect(bitsToBytes(bytesToBits(bytes))).toEqual(bytes);
  });

  it("stores unsigned integers big-endian", () => {
    expect(uint32ToBytesBE(0xe3069283)).toEqual(
      Uint8Array.of(0xe3, 0x06, 0x92, 0x83),
    );
    expect(bytesToUint32BE(uint32ToBytesBE(0xe3069283))).toBe(0xe3069283);
  });
});

describe("strict UTF-8", () => {
  it("round-trips multilingual text without normalization", () => {
    const text = "Grüße – Ελληνικά – 中文 – 😀 – a\u0308";
    expect(decodeUtf8Strict(encodeUtf8Strict(text))).toBe(text);
  });

  it("rejects every unpaired surrogate form", () => {
    expect(hasUnpairedSurrogate("\ud800")).toBe(true);
    expect(hasUnpairedSurrogate("\udc00")).toBe(true);
    expect(hasUnpairedSurrogate("\ud800A")).toBe(true);
    expect(() => encodeUtf8Strict("\ud800")).toThrow(/unpaired/i);
  });

  it("rejects malformed UTF-8", () => {
    expect(() => decodeUtf8Strict(Uint8Array.of(0xc0, 0xaf))).toThrow(
      /valid strict UTF-8/i,
    );
  });
});

describe("CRC-32C", () => {
  it("matches standard known-answer vectors", () => {
    expect(crc32c(new Uint8Array())).toBe(0);
    expect(crc32c(encodeUtf8Strict("123456789"))).toBe(0xe3069283);
  });
});

describe("RM-LZ1", () => {
  it("round-trips literals and deterministic overlapping matches", () => {
    for (const bytes of [
      new Uint8Array(),
      Uint8Array.of(0, 1, 2, 3, 4, 255),
      encodeUtf8Strict("AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA"),
      encodeUtf8Strict("abcabcabcabcabcabcxyzxyzxyz"),
    ]) {
      const encoded = rmlz1Encode(bytes);
      expect(rmlz1Encode(bytes)).toEqual(encoded);
      expect(rmlz1Decode(encoded, bytes.length)).toEqual(bytes);
    }
  });

  it("uses a distance-one overlapping match", () => {
    expect(rmlz1Decode(Uint8Array.of(0x02, 0x41, 0x00, 0x02), 6)).toEqual(
      encodeUtf8Strict("AAAAAA"),
    );
  });

  it("rejects invalid distances, truncation, overflow, and trailing bytes", () => {
    expect(() => rmlz1Decode(Uint8Array.of(0x01, 0x00, 0x00), 3)).toThrow(
      /distance/i,
    );
    expect(() => rmlz1Decode(Uint8Array.of(0x00), 1)).toThrow(/literal/i);
    expect(() => rmlz1Decode(Uint8Array.of(0x02, 0x41, 0x00, 0x0f), 6)).toThrow(
      /exceeds/i,
    );
    expect(() => rmlz1Decode(Uint8Array.of(0x00, 0x41, 0x42), 1)).toThrow(
      /trailing/i,
    );
    expect(() => rmlz1Decode(Uint8Array.of(0x80, 0x41), 1)).toThrow(/flag/i);
  });
});

describe("GF(256)", () => {
  it("implements the 0x11D field", () => {
    expect(gfAdd(0x53, 0xca)).toBe(0x99);
    expect(gfMultiply(0x53, 0xca)).toBe(0x8f);
    expect(gfDivide(gfMultiply(0x53, 0xca), 0xca)).toBe(0x53);
    expect(gfMultiply(0x53, gfInverse(0x53))).toBe(1);
    expect(gfPow(2, 255)).toBe(1);
  });
});
