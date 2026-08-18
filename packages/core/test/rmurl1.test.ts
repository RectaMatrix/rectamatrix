import { describe, expect, it } from "vitest";
import {
  RM_URL1_TAIL_TOKENS,
  RM_URL1_TLDS,
  decodeUtf8Strict,
  rmhle1Decode,
  rmhle1EncodeDetailed,
  rmurl1Decode,
  rmurl1Encode,
  rmurl1EncodeDetailed,
} from "../src/index.js";

describe("experimental RM-URL1", () => {
  it("uses a compact unique 32-entry TLD table", () => {
    expect(RM_URL1_TLDS).toHaveLength(32);
    expect(new Set(RM_URL1_TLDS)).toHaveProperty("size", 32);
    expect(RM_URL1_TLDS).toEqual(
      expect.arrayContaining(["com", "org", "net", "de", "uk", "cn", "in"]),
    );
  });

  it("uses only stable path and query tokens, never complete hosts", () => {
    expect(RM_URL1_TAIL_TOKENS).toHaveLength(16);
    expect(RM_URL1_TAIL_TOKENS).toEqual(
      expect.arrayContaining(["/api/", ".html", ".json", "id="]),
    );
    expect(
      RM_URL1_TAIL_TOKENS.every((token) => !token.includes("example")),
    ).toBe(true);
  });

  it.each(RM_URL1_TLDS)("round-trips the prefixed .%s TLD", (tld) => {
    const url = `https://example.${tld}/`;
    expect(decodeUtf8Strict(rmurl1Decode(rmurl1Encode(url)))).toBe(url);
  });

  it("round-trips an unknown final label through the literal escape", () => {
    const url = "https://example.technology/path";
    expect(decodeUtf8Strict(rmurl1Decode(rmurl1Encode(url)))).toBe(url);
  });

  it.each([
    "https://example.com",
    "http://www.example.co.uk/",
    "https://example.cn/a//b/?x=&x=1#part",
    "https://example.in/a%2Fb/%2f?empty&=value",
    "https://sub-domain.example.de:080/path",
    "https://example.com:80/api/v1/items?id=123",
    "http://example.com:443/path",
    "https://example.com:443/path",
    "http://example.com:80/path",
    "https://www2.example.com:443/index.html",
    "https://www3.example.com:8080/assets/app.css",
  ])("round-trips %s byte-exactly", (url) => {
    expect(decodeUtf8Strict(rmurl1Decode(rmurl1Encode(url)))).toBe(url);
  });

  it("uses stable host suffixes without complete-domain entries", () => {
    const encoded = rmurl1EncodeDetailed(
      "https://www.example.com/items/123456789",
    );
    expect(encoded.bitLength).toBeLessThan(157);
  });

  it.each([
    "HTTPS://example.com",
    "https://Example.com",
    "https://user@example.com",
    "mailto:test@example.com",
    "https://[::1]/",
    "https://example.com/ümlaut",
    "https://example.com:65536/",
  ])(
    "rejects unsupported optimization input %s so auto can fall back",
    (value) => {
      expect(() => rmurl1Encode(value)).toThrow(/RM-URL1 cannot encode/i);
    },
  );

  it("rejects truncated and non-canonical streams", () => {
    expect(() => rmurl1Decode(Uint8Array.of())).toThrow(/RM-URL1/i);
    const encoded = rmurl1Encode("https://example.com");
    const withDirtyPadding = encoded.slice();
    withDirtyPadding[withDirtyPadding.length - 1]! |= 1;
    expect(() => rmurl1Decode(withDirtyPadding)).toThrow(/padding/i);
  });

  it("preserves percent-escape spelling and empty URL components", () => {
    const url = "https://example.com//%2F/%2f?x&&x=&=y#";
    expect(decodeUtf8Strict(rmurl1Decode(rmurl1Encode(url)))).toBe(url);
  });

  it("uses the prefix port marker without charging absent ports", () => {
    const absent = rmurl1EncodeDetailed("https://example.com/").bitLength;
    const protocolDefault = rmurl1EncodeDetailed(
      "https://example.com:443/",
    ).bitLength;
    const development = rmurl1EncodeDetailed(
      "https://example.com:8080/",
    ).bitLength;
    const individual = rmurl1EncodeDetailed(
      "https://example.com:8443/",
    ).bitLength;
    expect(protocolDefault - absent).toBe(1);
    expect(development - absent).toBe(2);
    expect(individual - absent).toBe(21);
  });

  it.each([
    ["lower", "a"],
    ["numeric", "1"],
    ["mixed", "A"],
    ["ASCII escape", "["],
  ])("round-trips compact %s run-length boundaries", (_, character) => {
    for (const length of [1, 8, 9, 24, 25, 64]) {
      const url = `https://example.com?${character.repeat(length)}`;
      expect(decodeUtf8Strict(rmurl1Decode(rmurl1Encode(url)))).toBe(url);
    }
  });

  it("selects the shorter run-length format without regressing long runs", () => {
    expect(rmurl1EncodeDetailed("https://example.com?abc").version).toBe(1);
    expect(
      rmurl1EncodeDetailed(`https://example.com?${"a".repeat(64)}`).version,
    ).toBe(0);
  });

  it("switches into RM-URL1 for a URL embedded in longer text by default", () => {
    const text =
      "Open https://www.example.com/api/v1/items/123456789?lang=de now.";
    const encoded = rmhle1EncodeDetailed(text);
    expect(encoded.bitLength).toBe(299);
    expect(decodeUtf8Strict(rmhle1Decode(encoded.bytes))).toBe(text);
  });
});
