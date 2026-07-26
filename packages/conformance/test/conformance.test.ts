import { describe, expect, it } from "vitest";
import {
  ConformanceMismatchError,
  ConformanceValidationError,
  canonicalJson,
  createEncoderVector,
  createEncoderVectorSuite,
  validateEncoderVectorSuite,
  verifyEncoderVectorSuite,
  type EncoderVectorSuite,
} from "../src/index.js";

describe("encoder conformance vectors", () => {
  it("validates and independently decodes a complete vector", () => {
    const suite = createEncoderVectorSuite([
      createEncoderVector(
        "round-trip",
        { type: "utf8", text: "Conformance 🧭" },
        { eccLevel: "medium", compression: "none" },
      ),
    ]);

    expect(() => {
      validateEncoderVectorSuite(suite);
    }).not.toThrow();
    expect(verifyEncoderVectorSuite(suite)).toEqual([
      { id: "round-trip", verified: true },
    ]);
    expect(canonicalJson(suite)).toBe(
      `${JSON.stringify(suite, undefined, 2)}\n`,
    );
  });

  it("rejects unknown properties and duplicate IDs", () => {
    const vector = createEncoderVector(
      "duplicate",
      { type: "binary", hex: "00ff" },
      { eccLevel: "low", compression: "none" },
    );
    const duplicateSuite = {
      ...createEncoderVectorSuite([vector, vector]),
    };
    expect(() => {
      validateEncoderVectorSuite(duplicateSuite);
    }).toThrow(ConformanceValidationError);

    const unknownPropertySuite: unknown = {
      ...createEncoderVectorSuite([vector]),
      surprise: true,
    };
    expect(() => {
      validateEncoderVectorSuite(unknownPropertySuite);
    }).toThrow(ConformanceValidationError);
  });

  it("reports the exact path of a changed normative value", () => {
    const original = createEncoderVectorSuite([
      createEncoderVector(
        "tampered-mask-score",
        { type: "binary", hex: "010203" },
        { eccLevel: "high", compression: "none" },
      ),
    ]);
    const parsed = JSON.parse(canonicalJson(original)) as EncoderVectorSuite;
    const expected = parsed.vectors[0]!.expected;
    const tampered = {
      ...parsed,
      vectors: [
        {
          ...parsed.vectors[0]!,
          expected: {
            ...expected,
            maskScores: [
              expected.maskScores[0]! + 1,
              ...expected.maskScores.slice(1),
            ],
          },
        },
      ],
    };

    expect(() => verifyEncoderVectorSuite(tampered)).toThrow(
      ConformanceMismatchError,
    );
    expect(() => verifyEncoderVectorSuite(tampered)).toThrow(
      /expected\.maskScores\[0\]/u,
    );
  });
});
