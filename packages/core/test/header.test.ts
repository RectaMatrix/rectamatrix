import { describe, expect, it } from "vitest";
import {
  applyHeaderWhitening,
  buildHeaderInformation,
  buildProtectedHeader,
  decodeProtectedHeader,
  parseHeaderInformation,
} from "../src/header.js";
import {
  decodeOriginalLengthPrefix,
  encodeOriginalLengthPrefix,
} from "../src/length-prefix.js";
import { calculateSyndromes } from "../src/reed-solomon.js";

const HEADER_INPUT = {
  eccLevel: "medium",
  payloadType: "utf8",
  compression: "rm-lz1",
  maskId: 3,
  encodedLength: 0x061,
  integrityProfile: "crc32c",
} as const;

describe("RectaMatrix v2 Format Header", () => {
  it("constructs the exact 32-bit information word and RS protection", () => {
    const information = buildHeaderInformation(HEADER_INPUT);
    expect(information).toEqual(Uint8Array.of(0xa2, 0x69, 0x83, 0x08));
    const protectedHeader = buildProtectedHeader(HEADER_INPUT);
    expect(protectedHeader.slice(0, 4)).toEqual(information);
    expect(protectedHeader).toHaveLength(8);
    expect(calculateSyndromes(protectedHeader, 4)).toEqual(new Uint8Array(4));
  });

  it("applies the fixed balanced whitening mask reversibly", () => {
    const protectedHeader = buildProtectedHeader(HEADER_INPUT);
    const whitened = applyHeaderWhitening(protectedHeader);
    expect(whitened).not.toEqual(protectedHeader);
    expect(applyHeaderWhitening(whitened)).toEqual(protectedHeader);
    expect(() => applyHeaderWhitening(new Uint8Array(7))).toThrow(/eight/i);
  });

  it("parses every v2 field", () => {
    const fields = parseHeaderInformation(buildHeaderInformation(HEADER_INPUT));
    expect(fields).toEqual({ version: 2, ...HEADER_INPUT });
  });

  it("corrects two unknown Header byte errors", () => {
    const protectedHeader = buildProtectedHeader(HEADER_INPUT);
    protectedHeader[0] ^= 0x5a;
    protectedHeader[7] ^= 0xc3;
    const decoded = decodeProtectedHeader(protectedHeader);
    expect(decoded.fields).toEqual({ version: 2, ...HEADER_INPUT });
    expect(decoded.correctedCodewords).toBe(2);
  });

  it("corrects four Header erasures", () => {
    const protectedHeader = buildProtectedHeader(HEADER_INPUT);
    const erasures = [0, 3, 5, 7];
    for (const position of erasures) protectedHeader[position] ^= 0x81;
    const decoded = decodeProtectedHeader(protectedHeader, erasures);
    expect(decoded.fields).toEqual({ version: 2, ...HEADER_INPUT });
    expect(decoded.erasuresUsed).toBe(4);
  });

  it("rejects invalid Magic, version, reserved values, and length escape", () => {
    const valid = buildHeaderInformation(HEADER_INPUT);
    expect(() => parseHeaderInformation(withByte(valid, 0, 0x02))).toThrow(
      /Magic/i,
    );
    expect(() => parseHeaderInformation(withByte(valid, 0, 0xa3))).toThrow(
      /version/i,
    );
    expect(() => parseHeaderInformation(withByte(valid, 1, 0xe5))).toThrow(
      /ECC/i,
    );
    expect(() => parseHeaderInformation(withByte(valid, 1, 0x7d))).toThrow(
      /Codec/i,
    );
    expect(() => parseHeaderInformation(withByte(valid, 3, 0x0f))).toThrow(
      /integrity|reserved/i,
    );
    const extendedLength = valid.slice();
    extendedLength[2] = (extendedLength[2]! & 0x80) | 0x7f;
    extendedLength[3] = 0xf8;
    expect(() => parseHeaderInformation(extendedLength)).toThrow(/Extended/i);
  });
});

describe("v2 original-length prefix", () => {
  it.each([0, 1, 127, 128, 16_383, 16_384, 65_535])(
    "round-trips %i canonically",
    (value) => {
      const encoded = encodeOriginalLengthPrefix(value);
      expect(decodeOriginalLengthPrefix(encoded)).toEqual({
        value,
        bytesRead: encoded.length,
      });
    },
  );

  it("rejects non-canonical, truncated, and overflowing prefixes", () => {
    expect(() => decodeOriginalLengthPrefix(Uint8Array.of(0x80, 0x00))).toThrow(
      /canonical/i,
    );
    expect(() => decodeOriginalLengthPrefix(Uint8Array.of(0x80))).toThrow(
      /truncated/i,
    );
    expect(() =>
      decodeOriginalLengthPrefix(Uint8Array.of(0xff, 0xff, 0x7f)),
    ).toThrow(/exceeds/i);
  });
});

function withByte(
  source: Uint8Array,
  index: number,
  value: number,
): Uint8Array {
  const copy = source.slice();
  copy[index] = value;
  return copy;
}
