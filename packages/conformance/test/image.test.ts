import {
  parsePortableGraymap,
  type ImageDataLike,
} from "@rectamatrix/detector";
import { describe, expect, it } from "vitest";
import { buildCanonicalImageVectorSuite } from "../../../scripts/image-vector-fixtures.js";
import {
  ConformanceMismatchError,
  ConformanceValidationError,
  validateAndVerifyImageVectorSuite,
  validateImageVectorSuite,
  type ImageVectorSuite,
} from "../src/index.js";

describe("image conformance vectors", () => {
  it("validates all portable images and their normalized reference handoffs", () => {
    const fixtures = buildCanonicalImageVectorSuite();
    const images = new Map<string, ImageDataLike>();
    for (const [file, bytes] of fixtures.files) {
      images.set(file, parsePortableGraymap(bytes));
    }

    expect(fixtures.suite.vectors).toHaveLength(23);
    expect(() => {
      validateImageVectorSuite(fixtures.suite);
    }).not.toThrow();
    expect(
      validateAndVerifyImageVectorSuite(fixtures.suite, images),
    ).toHaveLength(23);
  }, 40_000);

  it("rejects non-canonical asset paths", () => {
    const malformed: unknown = {
      format: "rectamatrix-conformance",
      vectorVersion: 1,
      coreVersion: 1,
      kind: "image",
      vectors: [
        {
          id: "path-traversal",
          categories: ["negative"],
          image: {
            file: "../outside.pgm",
            width: 1,
            height: 1,
            crc32cHex: "00000000",
          },
          options: {},
          expected: {
            result: "failure",
            allowedErrorCodes: ["NO_CANDIDATE"],
          },
        },
      ],
    };
    expect(() => {
      validateImageVectorSuite(malformed);
    }).toThrow(ConformanceValidationError);
  });

  it("fails when an expected orientation is changed", () => {
    const fixtures = buildCanonicalImageVectorSuite();
    const original = fixtures.suite.vectors.find(
      ({ id }) => id === "rotation-90",
    )!;
    if (original.expected.result !== "success") {
      throw new Error("Expected a successful rotation fixture.");
    }
    const changed: ImageVectorSuite = {
      ...fixtures.suite,
      vectors: [
        {
          ...original,
          expected: {
            ...original.expected,
            orientationDegrees: 180,
          },
        },
      ],
    };
    const image = parsePortableGraymap(
      fixtures.files.get(original.image.file)!,
    );
    expect(() =>
      validateAndVerifyImageVectorSuite(
        changed,
        new Map([[original.image.file, image]]),
      ),
    ).toThrow(ConformanceMismatchError);
  });
});
