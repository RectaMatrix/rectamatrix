import { HEADER_BITS, buildScanOrder, getSymbolSize } from "@rectamatrix/core";
import { encodeBytes } from "@rectamatrix/encoder";
import { describe, expect, it } from "vitest";
import {
  ConformanceMismatchError,
  ConformanceValidationError,
  bytesToHex,
  createDecoderPositiveVector,
  createDecoderPositiveVectorSuite,
  validateDecoderPositiveVectorSuite,
  verifyDecoderPositiveVectorSuite,
  type DecoderPositiveVectorSuite,
} from "../src/index.js";

describe("positive decoder conformance vectors", () => {
  it("validates exact Payload recovery and Erasure quality metadata", () => {
    const payload = Uint8Array.of(1, 3, 5, 7, 9, 11);
    const symbol = encodeBytes(payload, {
      sizeId: 0,
      eccLevel: "medium",
      compression: "none",
    });
    const modules = symbol.matrix.map((row) => [...row]);
    const confidence = Array.from({ length: symbol.height }, () =>
      Array<number>(symbol.width).fill(1),
    );
    const body = buildScanOrder(getSymbolSize(symbol.sizeId)).slice(
      HEADER_BITS,
    );
    for (const byteIndex of [0, 1, 2, 3]) {
      const coordinates = body.slice(byteIndex * 8, byteIndex * 8 + 8);
      const first = coordinates[0]!;
      modules[first.y]![first.x] = !modules[first.y]![first.x];
      for (const { x, y } of coordinates) confidence[y]![x] = 0;
    }
    const vector = createDecoderPositiveVector(
      "four-body-erasures",
      {
        modules: modules.map((row) =>
          row.map((module) => (module ? "1" : "0")).join(""),
        ),
        confidence,
      },
      { type: "binary", payloadHex: bytesToHex(payload) },
    );
    const suite = createDecoderPositiveVectorSuite([vector]);

    expect(vector.expected.metadata.quality.erasuresUsed).toBe(4);
    expect(vector.expected.metadata.quality.correctedCodewords).toBe(4);
    expect(() => {
      validateDecoderPositiveVectorSuite(suite);
    }).not.toThrow();
    expect(verifyDecoderPositiveVectorSuite(suite)).toEqual([
      { id: "four-body-erasures", verified: true },
    ]);
  });

  it("rejects unknown positive-vector properties", () => {
    const malformed: unknown = {
      format: "rectamatrix-conformance",
      vectorVersion: 1,
      coreVersion: 2,
      kind: "decoder-positive",
      vectors: [
        {
          id: "unknown-property",
          input: { modules: ["0"] },
          expected: {},
          surprise: true,
        },
      ],
    };
    expect(() => {
      validateDecoderPositiveVectorSuite(malformed);
    }).toThrow(ConformanceValidationError);
  });

  it("fails on changed metadata or a matrix that no longer decodes", () => {
    const payload = Uint8Array.of(10, 20, 30);
    const symbol = encodeBytes(payload, { compression: "none" });
    const vector = createDecoderPositiveVector(
      "baseline",
      {
        modules: symbol.matrix.map((row) =>
          row.map((module) => (module ? "1" : "0")).join(""),
        ),
      },
      { type: "binary", payloadHex: bytesToHex(payload) },
    );
    const changedMetadata: DecoderPositiveVectorSuite = {
      ...createDecoderPositiveVectorSuite([vector]),
      vectors: [
        {
          ...vector,
          expected: {
            ...vector.expected,
            metadata: {
              ...vector.expected.metadata,
              quality: {
                ...vector.expected.metadata.quality,
                decodeAttempts:
                  vector.expected.metadata.quality.decodeAttempts + 1,
              },
            },
          },
        },
      ],
    };
    expect(() => verifyDecoderPositiveVectorSuite(changedMetadata)).toThrow(
      ConformanceMismatchError,
    );

    const failedDecode: DecoderPositiveVectorSuite = {
      ...changedMetadata,
      vectors: [
        {
          ...vector,
          input: { modules: Array<string>(15).fill("0".repeat(24)) },
        },
      ],
    };
    expect(() => verifyDecoderPositiveVectorSuite(failedDecode)).toThrow(
      /failed with UNSUPPORTED_SIZE/u,
    );
  });
});
