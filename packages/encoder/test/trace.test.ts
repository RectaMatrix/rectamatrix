import {
  buildHeaderInformation,
  calculateMaskPenalty,
  crc32c,
} from "@rectamatrix/core";
import { describe, expect, it } from "vitest";
import { encodeBytesWithTrace, encodeTextWithTrace } from "../src/trace.js";

describe("encoder conformance trace", () => {
  it("exposes every deterministic encoding stage", () => {
    const trace = encodeTextWithTrace("RectaMatrix 🧭", {
      eccLevel: "high",
      compression: "none",
    });
    const symbol = trace.symbol;

    expect(trace.crc32c).toBe(crc32c(trace.originalPayload));
    expect(trace.frame.slice(0, -4)).toEqual(trace.encodedPayload);
    expect(trace.headerInformation).toEqual(
      buildHeaderInformation({
        sizeId: symbol.sizeId,
        eccLevel: symbol.eccLevel,
        payloadType: symbol.payloadType,
        compression: symbol.compression,
        maskId: symbol.maskId,
        originalLength: symbol.originalLength,
        encodedLength: symbol.encodedLength,
      }),
    );
    expect(trace.protectedHeader).toHaveLength(12);
    expect(trace.rsBlocks).toHaveLength(trace.rsLayout.blockCount);
    expect(trace.interleavedCodewords).toHaveLength(
      trace.rsLayout.totalCodewordBytes,
    );
    expect(trace.unmaskedBodyBits.length).toBeGreaterThan(
      trace.interleavedCodewords.length * 8,
    );
    expect(trace.masks.map(({ maskId }) => maskId)).toEqual([0, 1, 2, 3]);
    expect(
      trace.masks.find(({ maskId }) => maskId === symbol.maskId)?.penalty,
    ).toEqual(calculateMaskPenalty(symbol.matrix));
  });

  it("matches normal mask selection including the lowest-ID tie break", () => {
    const trace = encodeBytesWithTrace(Uint8Array.of(0, 255, 17, 236), {
      eccLevel: "medium",
      compression: "none",
    });
    const minimum = Math.min(
      ...trace.masks.map(({ penalty }) => penalty.total),
    );
    const expectedMask = trace.masks.find(
      ({ penalty }) => penalty.total === minimum,
    )!.maskId;
    expect(trace.symbol.maskId).toBe(expectedMask);
  });

  it("copies caller-owned binary input", () => {
    const input = Uint8Array.of(1, 2, 3, 4);
    const trace = encodeBytesWithTrace(input, { compression: "none" });
    input.fill(9);
    expect(trace.originalPayload).toEqual(Uint8Array.of(1, 2, 3, 4));
  });
});
