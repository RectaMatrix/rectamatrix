import { encodeBytes } from "@rectamatrix/encoder";
import { describe, expect, it } from "vitest";
import {
  ConformanceMismatchError,
  ConformanceValidationError,
  createDecoderNegativeVector,
  createDecoderNegativeVectorSuite,
  validateDecoderNegativeVectorSuite,
  verifyDecoderNegativeVectorSuite,
  type DecoderNegativeVectorSuite,
} from "../src/index.js";

describe("negative decoder conformance vectors", () => {
  it("validates a failure and guarantees that no Payload is returned", () => {
    const vector = createDecoderNegativeVector(
      "unsupported-geometry",
      { modules: Array<string>(15).fill("0".repeat(24)) },
      ["UNSUPPORTED_SIZE"],
    );
    const suite = createDecoderNegativeVectorSuite([vector]);

    expect(() => {
      validateDecoderNegativeVectorSuite(suite);
    }).not.toThrow();
    expect(verifyDecoderNegativeVectorSuite(suite)).toEqual([
      { id: "unsupported-geometry", verified: true },
    ]);
  });

  it("rejects malformed module rows before decoding", () => {
    const malformed: unknown = {
      format: "rectamatrix-conformance",
      vectorVersion: 1,
      coreVersion: 1,
      kind: "decoder-negative",
      vectors: [
        {
          id: "malformed-row",
          input: { modules: ["0102"] },
          expected: { errorCodes: ["UNSUPPORTED_SIZE"] },
        },
      ],
    };
    expect(() => {
      validateDecoderNegativeVectorSuite(malformed);
    }).toThrow(ConformanceValidationError);
  });

  it("fails verification on a wrong error code or successful decode", () => {
    const wrongCode: DecoderNegativeVectorSuite = {
      format: "rectamatrix-conformance",
      vectorVersion: 1,
      coreVersion: 1,
      kind: "decoder-negative",
      vectors: [
        {
          id: "wrong-code",
          input: { modules: Array<string>(15).fill("0".repeat(24)) },
          expected: { errorCodes: ["INVALID_GEOMETRY"] },
        },
      ],
    };
    expect(() => verifyDecoderNegativeVectorSuite(wrongCode)).toThrow(
      ConformanceMismatchError,
    );

    const valid = encodeBytes(Uint8Array.of(1, 2, 3), {
      compression: "none",
    });
    const successfulDecode: DecoderNegativeVectorSuite = {
      ...wrongCode,
      vectors: [
        {
          id: "unexpected-payload",
          input: {
            modules: valid.matrix.map((row) =>
              row.map((module) => (module ? "1" : "0")).join(""),
            ),
          },
          expected: { errorCodes: ["CRC_FAILURE"] },
        },
      ],
    };
    expect(() => verifyDecoderNegativeVectorSuite(successfulDecode)).toThrow(
      /returned a Payload/u,
    );
  });
});
