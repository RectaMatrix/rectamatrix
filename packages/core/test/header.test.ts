import { describe, expect, it } from "vitest";
import {
  applyHeaderWhitening,
  buildHeaderInformation,
  buildProtectedHeader,
  decodeProtectedHeader,
  parseHeaderInformation,
} from "../src/header.js";
import { calculateSyndromes } from "../src/reed-solomon.js";

const HEADER_INPUT = {
  sizeId: 2,
  eccLevel: "medium",
  payloadType: "utf8",
  compression: "rm-lz1",
  maskId: 3,
  originalLength: 0x1234,
  encodedLength: 0x0061,
} as const;

describe("Format Header", () => {
  it("constructs exact MSB-packed information bytes and RS protection", () => {
    const information = buildHeaderInformation(HEADER_INPUT);
    expect(information).toEqual(
      Uint8Array.of(0xa7, 0x12, 0x57, 0x10, 0x12, 0x34, 0x00, 0x61),
    );
    const protectedHeader = buildProtectedHeader(HEADER_INPUT);
    expect(protectedHeader.slice(0, 8)).toEqual(information);
    expect(protectedHeader).toHaveLength(12);
    expect(calculateSyndromes(protectedHeader, 4)).toEqual(new Uint8Array(4));
  });

  it("applies the fixed balanced whitening mask reversibly", () => {
    const protectedHeader = buildProtectedHeader(HEADER_INPUT);
    const whitened = applyHeaderWhitening(protectedHeader);
    expect(whitened).not.toEqual(protectedHeader);
    expect(applyHeaderWhitening(whitened)).toEqual(protectedHeader);
    expect(() => applyHeaderWhitening(new Uint8Array(11))).toThrow(/twelve/i);
  });

  it("parses every field and enforces sampled geometry", () => {
    const fields = parseHeaderInformation(
      buildHeaderInformation(HEADER_INPUT),
      2,
    );
    expect(fields).toEqual({ version: 1, ...HEADER_INPUT });
    expect(() =>
      parseHeaderInformation(buildHeaderInformation(HEADER_INPUT), 1),
    ).toThrow(/geometry/i);
  });

  it("corrects two unknown Header byte errors", () => {
    const protectedHeader = buildProtectedHeader(HEADER_INPUT);
    protectedHeader[0] ^= 0x5a;
    protectedHeader[9] ^= 0xc3;
    const decoded = decodeProtectedHeader(protectedHeader, [], 2);
    expect(decoded.fields).toEqual({ version: 1, ...HEADER_INPUT });
    expect(decoded.correctedCodewords).toBe(2);
  });

  it("corrects four Header erasures", () => {
    const protectedHeader = buildProtectedHeader(HEADER_INPUT);
    const erasures = [0, 3, 7, 11];
    for (const position of erasures) protectedHeader[position] ^= 0x81;
    const decoded = decodeProtectedHeader(protectedHeader, erasures, 2);
    expect(decoded.fields).toEqual({ version: 1, ...HEADER_INPUT });
    expect(decoded.erasuresUsed).toBe(4);
  });

  it("rejects invalid Sync, version, reserved bits, modes, and lengths", () => {
    const valid = buildHeaderInformation(HEADER_INPUT);
    expect(() => parseHeaderInformation(withByte(valid, 0, 0x00))).toThrow(
      /Sync/i,
    );
    expect(() => parseHeaderInformation(withByte(valid, 1, 0x22))).toThrow(
      /version/i,
    );
    expect(() => parseHeaderInformation(withByte(valid, 3, 0x11))).toThrow(
      /reserved/i,
    );
    expect(() => parseHeaderInformation(withByte(valid, 2, 0xd7))).toThrow(
      /ECC/i,
    );
    expect(() =>
      buildHeaderInformation({
        ...HEADER_INPUT,
        compression: "none",
      }),
    ).toThrow(/identical/i);
    expect(() =>
      buildHeaderInformation({
        ...HEADER_INPUT,
        originalLength: 10,
        encodedLength: 10,
      }),
    ).toThrow(/shorter/i);
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
