import { describe, expect, it } from "vitest";
import {
  RM_HLE1_ALPHANUMERIC_TABLE,
  RM_HLE1_LOWER_TABLE,
  RM_HLE1_UPPER_TABLE,
  decodeUtf8Strict,
  rmhle1Decode,
  rmhle1Encode,
  rmhle1EncodeDetailed,
} from "../src/index.js";

describe("RM-HLE1", () => {
  it("uses normative table sizes", () => {
    expect(RM_HLE1_ALPHANUMERIC_TABLE).toHaveLength(45);
    expect(RM_HLE1_LOWER_TABLE).toHaveLength(32);
    expect(RM_HLE1_UPPER_TABLE).toHaveLength(32);
  });

  it("packs numeric triplets into ten bits", () => {
    const encoded = rmhle1EncodeDetailed("123456789");
    expect(encoded.bitLength).toBe(44);
    expect(encoded.bytes).toHaveLength(6);
    expect(decodeUtf8Strict(rmhle1Decode(encoded.bytes))).toBe("123456789");
  });

  it("packs alphanumeric pairs into eleven bits", () => {
    const encoded = rmhle1EncodeDetailed("ABC123");
    expect(encoded.bitLength).toBe(47);
    expect(decodeUtf8Strict(rmhle1Decode(encoded.bytes))).toBe("ABC123");
  });

  it.each([
    "https://www.example.com/items/123456",
    "RectaMatrix v2",
    "Grüße aus Berlin 🧭",
    "123".repeat(200),
    "a".repeat(600),
    "🧭".repeat(100),
    "",
  ])("round-trips %j through optimal mixed segments", (text) => {
    expect(decodeUtf8Strict(rmhle1Decode(rmhle1Encode(text)))).toBe(text);
  });

  it("rejects a stream without an end marker", () => {
    expect(() => rmhle1Decode(Uint8Array.of(0xff))).toThrow(/RM-HLE1/i);
  });
});
