import type { BooleanMatrix } from "@rectamatrix/core";
import { encodeBytes, encodeText } from "@rectamatrix/encoder";
import { describe, expect, it } from "vitest";
import {
  buildHomography,
  decodeImageData,
  detectCandidates,
  invertHomography,
  parsePortableGraymap,
  project,
  sampleVisionCandidate,
  toGrayscale,
  type ImageDataLike,
  type SourceQuadrilateral,
} from "../src/index.js";

describe("RectaMatrix image detector", () => {
  it("decodes a tightly cropped image with the normative Quiet Zone", () => {
    const text = "Detector";
    const symbol = encodeText(text, {
      sizeId: 0,
      eccLevel: "medium",
      compression: "none",
    });
    const image = renderSymbol(symbol.matrix, 6, 4);
    const result = decodeImageData(image);

    expect(result.ok, JSON.stringify(result)).toBe(true);
    if (result.ok && result.type === "utf8") {
      expect(result.text).toBe(text);
      expect(result.vision.orientationDegrees).toBe(0);
      expect(result.metadata.quality.crcValid).toBe(true);
      expect(result.metadata.quality.imageQuality).toBeGreaterThan(0.9);
    }
  });

  it("decodes a tightly cropped Compact-profile image", () => {
    const text = "Compact";
    const symbol = encodeText(text, {
      sizeId: 0,
      eccLevel: "high",
      compression: "none",
    });
    const result = decodeImageData(renderSymbol(symbol.matrix, 6, 2));
    expect(result.ok).toBe(true);
    if (result.ok && result.type === "utf8") expect(result.text).toBe(text);
  });

  it("normalizes all four image orientations", () => {
    const payload = Uint8Array.of(0, 17, 34, 51, 68, 85);
    const symbol = encodeBytes(payload, {
      sizeId: 0,
      eccLevel: "medium",
      compression: "none",
    });
    let image = renderSymbol(symbol.matrix, 5, 4);
    for (const orientation of [0, 90, 180, 270] as const) {
      const result = decodeImageData(image);
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.bytes).toEqual(payload);
        expect(result.vision.orientationDegrees).toBe(orientation);
      }
      image = rotateClockwise(image);
    }
  });

  it("rectifies and decodes a projective quadrilateral", () => {
    const text = "Perspective";
    const symbol = encodeText(text, {
      sizeId: 1,
      eccLevel: "high",
      compression: "none",
    });
    const quadrilateral = Object.freeze([
      Object.freeze({ x: 22, y: 18 }),
      Object.freeze({ x: 244, y: 31 }),
      Object.freeze({ x: 226, y: 176 }),
      Object.freeze({ x: 35, y: 163 }),
    ]) as SourceQuadrilateral;
    const image = renderPerspective(symbol.matrix, 270, 195, quadrilateral);
    const result = decodeImageData(image, {
      sourceQuadrilateral: quadrilateral,
      samplesPerModule: 7,
    });

    expect(result.ok).toBe(true);
    if (result.ok && result.type === "utf8") {
      expect(result.text).toBe(text);
      expect(result.vision.orientationDegrees).toBe(0);
      expect(
        result.metadata.quality.perspectiveEstimateDegrees,
      ).toBeGreaterThan(0);
    }
  });

  it("automatically finds a symbol placed inside a larger scene", () => {
    const text = "Scene";
    const symbol = encodeText(text, {
      sizeId: 0,
      eccLevel: "high",
      compression: "none",
    });
    const scene = placeImage(
      renderSymbol(symbol.matrix, 5, 4),
      310,
      220,
      73,
      51,
    );
    const candidates = detectCandidates(scene);
    const result = decodeImageData(scene);

    expect(candidates.length).toBeGreaterThan(0);
    expect(result.ok).toBe(true);
    if (result.ok && result.type === "utf8") {
      expect(result.text).toBe(text);
      expect(result.vision.sourceQuadrilateral[0].x).toBeCloseTo(93, 0);
      expect(result.vision.sourceQuadrilateral[0].y).toBeCloseTo(71, 0);
    }
  });

  it("automatically normalizes a rotated symbol inside a scene", () => {
    const payload = Uint8Array.of(1, 3, 3, 7);
    const symbol = encodeBytes(payload, {
      sizeId: 0,
      eccLevel: "medium",
      compression: "none",
    });
    const rotated = rotateClockwise(renderSymbol(symbol.matrix, 5, 4));
    const scene = placeImage(rotated, 280, 270, 64, 37);
    const result = decodeImageData(scene);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.bytes).toEqual(payload);
      expect(result.vision.orientationDegrees).toBe(90);
    }
  });

  it("discovers spatially separated candidates deterministically", () => {
    const first = renderSymbol(
      encodeText("First", { sizeId: 0, compression: "none" }).matrix,
      5,
      4,
    );
    const second = renderSymbol(
      encodeText("Second", { sizeId: 0, compression: "none" }).matrix,
      5,
      4,
    );
    const scene = composeImages(470, 240, [
      { image: first, left: 30, top: 40 },
      { image: second, left: 270, top: 80 },
    ]);
    const candidates = detectCandidates(scene, { maximumCandidates: 64 });

    expect(
      candidates.some(
        ([point]) => Math.abs(point.x - 50) <= 2 && Math.abs(point.y - 60) <= 2,
      ),
    ).toBe(true);
    expect(
      candidates.some(
        ([point]) =>
          Math.abs(point.x - 290) <= 2 && Math.abs(point.y - 100) <= 2,
      ),
    ).toBe(true);
    expect(detectCandidates(scene, { maximumCandidates: 1 })).toHaveLength(1);
  });

  it("splits overlapping candidate projections by their fixed patterns", () => {
    const first = encodeText("Upper", {
      sizeId: 1,
      eccLevel: "high",
      compression: "none",
    });
    const second = encodeText("Lower", {
      sizeId: 1,
      eccLevel: "high",
      compression: "none",
    });
    const scene = composeImages(280, 260, []);
    drawMatrix(scene, first.matrix, 4, 30, 30);
    drawMatrix(scene, second.matrix, 4, 80, 131);

    const candidates = detectCandidates(scene, { maximumCandidates: 64 });
    const decodedTexts = new Set<string>();
    for (const sourceQuadrilateral of candidates) {
      const result = decodeImageData(scene, { sourceQuadrilateral });
      if (result.ok && result.type === "utf8") decodedTexts.add(result.text);
    }

    expect(decodedTexts).toEqual(new Set(["Upper", "Lower"]));
  }, 20_000);

  it("automatically finds a projectively distorted symbol", () => {
    const text = "Automatic perspective";
    const symbol = encodeText(text, {
      sizeId: 1,
      eccLevel: "high",
      compression: "none",
    });
    const quadrilateral = Object.freeze([
      Object.freeze({ x: 42, y: 28 }),
      Object.freeze({ x: 272, y: 46 }),
      Object.freeze({ x: 248, y: 193 }),
      Object.freeze({ x: 61, y: 178 }),
    ]) as SourceQuadrilateral;
    const scene = renderPerspective(symbol.matrix, 320, 225, quadrilateral);
    const result = decodeImageData(scene);

    expect(result.ok).toBe(true);
    if (result.ok && result.type === "utf8") {
      expect(result.text).toBe(text);
      expect(
        result.metadata.quality.perspectiveEstimateDegrees,
      ).toBeGreaterThan(0);
    }
  });

  it("refines projective corners relative to a rotated anchor", () => {
    const text = "Rotated perspective";
    const symbol = encodeText(text, {
      sizeId: 1,
      eccLevel: "high",
      compression: "none",
    });
    const quadrilateral = Object.freeze([
      Object.freeze({ x: 42, y: 28 }),
      Object.freeze({ x: 281, y: 48 }),
      Object.freeze({ x: 249, y: 198 }),
      Object.freeze({ x: 65, y: 176 }),
    ]) as SourceQuadrilateral;
    const scene = rotateClockwise(
      renderPerspective(symbol.matrix, 320, 225, quadrilateral),
    );
    const result = decodeImageData(scene);

    expect(result.ok).toBe(true);
    if (result.ok && result.type === "utf8") {
      expect(result.text).toBe(text);
      expect(result.vision.orientationDegrees).toBe(90);
    }
  });

  it("handles uneven illumination, isolated noise, glare, and small clutter", () => {
    const text = "Photo";
    const symbol = encodeText(text, {
      sizeId: 0,
      eccLevel: "high",
      compression: "none",
    });
    const clean = placeImage(
      renderSymbol(symbol.matrix, 5, 4),
      360,
      240,
      90,
      60,
    );
    const scene = addIlluminationGradient(clean, 80, 245);
    addImpulseNoise(scene, 320, 0x9e3779b9);
    fillImageRectangle(scene, 14, 184, 22, 18, 25);
    fillImageRectangle(scene, 316, 17, 19, 24, 35);
    addGlare(scene, 178, 3, 0.85);
    const result = decodeImageData(scene);

    expect(result.ok, JSON.stringify(result)).toBe(true);
    if (result.ok && result.type === "utf8") {
      expect(result.text).toBe(text);
      expect(result.metadata.quality.crcValid).toBe(true);
    }
  }, 15_000);

  it("separates a symbol from a structured background through its Quiet Zone", () => {
    const text = "Texture";
    const symbolImage = renderSymbol(
      encodeText(text, {
        sizeId: 0,
        eccLevel: "high",
        compression: "none",
      }).matrix,
      5,
      4,
    );
    const left = 73;
    const top = 51;
    const scene = placeImage(symbolImage, 310, 220, left, top);
    addStructuredBackground(scene, {
      left,
      top,
      right: left + symbolImage.width,
      bottom: top + symbolImage.height,
    });
    const result = decodeImageData(scene);

    expect(result.ok).toBe(true);
    if (result.ok && result.type === "utf8") {
      expect(result.text).toBe(text);
    }
  });

  it("handles directional motion blur and a wider glare band", () => {
    const text = "Motion";
    const symbol = encodeText(text, {
      sizeId: 0,
      eccLevel: "high",
      compression: "none",
    });
    const clean = placeImage(
      renderSymbol(symbol.matrix, 6, 4),
      340,
      240,
      72,
      45,
    );
    const scene = directionalBlur(clean, 2, 1);
    addGlare(scene, 177, 7, 0.72);
    const result = decodeImageData(scene);

    expect(result.ok, JSON.stringify(result)).toBe(true);
    if (result.ok && result.type === "utf8") {
      expect(result.text).toBe(text);
      expect(result.metadata.quality.crcValid).toBe(true);
    }
  }, 15_000);

  it("recovers a high-ECC symbol beneath a larger reflection patch", () => {
    const text = "Reflection";
    const symbol = encodeText(text, {
      sizeId: 1,
      eccLevel: "high",
      compression: "none",
    });
    const scene = placeImage(
      renderSymbol(symbol.matrix, 5, 4),
      330,
      240,
      45,
      38,
    );
    addReflectionPatch(scene, 181, 112, 14, 20, 0.94);
    const result = decodeImageData(scene);

    expect(result.ok).toBe(true);
    if (result.ok && result.type === "utf8") {
      expect(result.text).toBe(text);
      expect(result.metadata.quality.correctedCodewords).toBeGreaterThan(0);
    }
  });

  it("supports an explicit inverted-image hypothesis", () => {
    const payload = Uint8Array.of(9, 8, 7, 6);
    const symbol = encodeBytes(payload, {
      sizeId: 0,
      compression: "none",
    });
    const image = renderSymbol(symbol.matrix, 6, 4, true);

    expect(decodeImageData(image)).toMatchObject({
      ok: false,
      error: { code: "NO_CANDIDATE" },
    });
    const result = decodeImageData(image, { tryInverted: true });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.bytes).toEqual(payload);
      expect(result.vision.inverted).toBe(true);
    }
  });

  it("exposes the deterministic normalized handoff", () => {
    const symbol = encodeText("handoff", {
      sizeId: 0,
      compression: "none",
    });
    const scale = 6;
    const quietZone = 4;
    const image = renderSymbol(symbol.matrix, scale, quietZone);
    const quadrilateral = Object.freeze([
      Object.freeze({ x: quietZone * scale, y: quietZone * scale }),
      Object.freeze({
        x: (quietZone + symbol.width) * scale,
        y: quietZone * scale,
      }),
      Object.freeze({
        x: (quietZone + symbol.width) * scale,
        y: (quietZone + symbol.height) * scale,
      }),
      Object.freeze({
        x: quietZone * scale,
        y: (quietZone + symbol.height) * scale,
      }),
    ]) as SourceQuadrilateral;
    const sampled = sampleVisionCandidate(
      image,
      quadrilateral,
      symbol.sizeId,
      0,
    );

    expect(sampled.modules).toEqual(symbol.matrix);
    expect(sampled.confidence.flat().every((value) => value > 0.99)).toBe(true);
    expect(sampled.scores.anchor).toBe(1);
    expect(sampled.scores.topClock).toBe(1);
    expect(sampled.scores.leftClock).toBe(1);
  });

  it("composites alpha onto white and rejects malformed images", () => {
    const grayscale = toGrayscale({
      width: 1,
      height: 1,
      data: Uint8Array.of(0, 0, 0, 0),
    });
    expect(grayscale.pixels[0]).toBe(255);

    expect(
      decodeImageData({ width: 2, height: 2, data: Uint8Array.of(0) }),
    ).toMatchObject({
      ok: false,
      error: { code: "INVALID_IMAGE" },
    });
    expect(
      decodeImageData(
        {
          width: 2,
          height: 2,
          data: new Uint8Array(16),
        },
        { maximumPixels: 3 },
      ),
    ).toMatchObject({
      ok: false,
      error: { code: "IMAGE_TOO_LARGE" },
    });
    expect(
      decodeImageData(
        { width: 1, height: 1, data: Uint8Array.of(0, 0, 0, 255) },
        { maximumCandidates: 0 },
      ),
    ).toMatchObject({
      ok: false,
      error: { code: "INVALID_OPTIONS" },
    });
  });

  it("parses portable binary grayscale fixtures", () => {
    const header = Uint8Array.from("P5\n# fixture\n2 1\n255\n", (character) =>
      character.charCodeAt(0),
    );
    const pgm = new Uint8Array(header.length + 2);
    pgm.set(header);
    pgm.set(Uint8Array.of(17, 239), header.length);
    const image = parsePortableGraymap(pgm);
    expect(image).toMatchObject({ width: 2, height: 1 });
    expect(Array.from(image.data)).toEqual([
      17, 17, 17, 255, 239, 239, 239, 255,
    ]);
    expect(() => parsePortableGraymap(Uint8Array.of(1, 2, 3))).toThrow();
  });
});

function renderSymbol(
  matrix: BooleanMatrix,
  moduleSize: number,
  quietZone: number,
  inverted = false,
): ImageDataLike {
  const width = (matrix[0]!.length + quietZone * 2) * moduleSize;
  const height = (matrix.length + quietZone * 2) * moduleSize;
  const data = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const moduleX = Math.floor(x / moduleSize) - quietZone;
      const moduleY = Math.floor(y / moduleSize) - quietZone;
      const black =
        moduleX >= 0 &&
        moduleY >= 0 &&
        moduleX < matrix[0]!.length &&
        moduleY < matrix.length &&
        matrix[moduleY]![moduleX]!;
      const value = (black ? !inverted : inverted) ? 20 : 235;
      setPixel(data, width, x, y, value);
    }
  }
  return { width, height, data };
}

function renderPerspective(
  matrix: BooleanMatrix,
  width: number,
  height: number,
  quadrilateral: SourceQuadrilateral,
): ImageDataLike {
  const data = new Uint8ClampedArray(width * height * 4);
  data.fill(255);
  const transform = buildHomography(
    matrix[0]!.length,
    matrix.length,
    quadrilateral,
  );
  const inverse = invertHomography(transform);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const point = project(inverse, x + 0.5, y + 0.5);
      if (
        point.x < 0 ||
        point.y < 0 ||
        point.x >= matrix[0]!.length ||
        point.y >= matrix.length
      ) {
        continue;
      }
      const black = matrix[Math.floor(point.y)]![Math.floor(point.x)]!;
      setPixel(data, width, x, y, black ? 18 : 238);
    }
  }
  return { width, height, data };
}

function rotateClockwise(image: ImageDataLike): ImageDataLike {
  const width = image.height;
  const height = image.width;
  const data = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < image.height; y += 1) {
    for (let x = 0; x < image.width; x += 1) {
      const targetX = image.height - 1 - y;
      const targetY = x;
      const sourceOffset = (y * image.width + x) * 4;
      const targetOffset = (targetY * width + targetX) * 4;
      for (let channel = 0; channel < 4; channel += 1) {
        data[targetOffset + channel] = image.data[sourceOffset + channel]!;
      }
    }
  }
  return { width, height, data };
}

function placeImage(
  source: ImageDataLike,
  width: number,
  height: number,
  left: number,
  top: number,
): ImageDataLike {
  return composeImages(width, height, [{ image: source, left, top }]);
}

function composeImages(
  width: number,
  height: number,
  placements: readonly {
    readonly image: ImageDataLike;
    readonly left: number;
    readonly top: number;
  }[],
): ImageDataLike {
  const data = new Uint8ClampedArray(width * height * 4);
  data.fill(255);
  for (const { image, left, top } of placements) {
    for (let y = 0; y < image.height; y += 1) {
      for (let x = 0; x < image.width; x += 1) {
        const sourceOffset = (y * image.width + x) * 4;
        const targetOffset = ((top + y) * width + left + x) * 4;
        for (let channel = 0; channel < 4; channel += 1) {
          data[targetOffset + channel] = image.data[sourceOffset + channel]!;
        }
      }
    }
  }
  return { width, height, data };
}

function setPixel(
  data: Uint8ClampedArray,
  width: number,
  x: number,
  y: number,
  value: number,
): void {
  const offset = (y * width + x) * 4;
  data[offset] = value;
  data[offset + 1] = value;
  data[offset + 2] = value;
  data[offset + 3] = 255;
}

function drawMatrix(
  image: ImageDataLike,
  matrix: BooleanMatrix,
  moduleSize: number,
  left: number,
  top: number,
): void {
  if (!(image.data instanceof Uint8ClampedArray)) {
    throw new TypeError("Test image must use mutable clamped RGBA data.");
  }
  for (let moduleY = 0; moduleY < matrix.length; moduleY += 1) {
    for (let moduleX = 0; moduleX < matrix[0]!.length; moduleX += 1) {
      const value = matrix[moduleY]![moduleX]! ? 20 : 235;
      for (let y = 0; y < moduleSize; y += 1) {
        for (let x = 0; x < moduleSize; x += 1) {
          setPixel(
            image.data,
            image.width,
            left + moduleX * moduleSize + x,
            top + moduleY * moduleSize + y,
            value,
          );
        }
      }
    }
  }
}

function addIlluminationGradient(
  image: ImageDataLike,
  leftWhite: number,
  rightWhite: number,
): ImageDataLike {
  const data = Uint8ClampedArray.from(image.data);
  for (let y = 0; y < image.height; y += 1) {
    for (let x = 0; x < image.width; x += 1) {
      const white =
        leftWhite +
        ((rightWhite - leftWhite) * x) / Math.max(1, image.width - 1);
      const offset = (y * image.width + x) * 4;
      const value = Math.round((data[offset]! * white) / 255);
      data[offset] = value;
      data[offset + 1] = value;
      data[offset + 2] = value;
    }
  }
  return { width: image.width, height: image.height, data };
}

function addImpulseNoise(
  image: ImageDataLike,
  count: number,
  seed: number,
): void {
  if (!(image.data instanceof Uint8ClampedArray)) {
    throw new TypeError("Test image must use mutable clamped RGBA data.");
  }
  let state = seed >>> 0;
  for (let index = 0; index < count; index += 1) {
    state ^= state << 13;
    state ^= state >>> 17;
    state ^= state << 5;
    const pixel = state % (image.width * image.height);
    const value = (state & 1) === 0 ? 0 : 255;
    const offset = pixel * 4;
    image.data[offset] = value;
    image.data[offset + 1] = value;
    image.data[offset + 2] = value;
  }
}

function fillImageRectangle(
  image: ImageDataLike,
  left: number,
  top: number,
  width: number,
  height: number,
  value: number,
): void {
  if (!(image.data instanceof Uint8ClampedArray)) {
    throw new TypeError("Test image must use mutable clamped RGBA data.");
  }
  for (let y = top; y < top + height; y += 1) {
    for (let x = left; x < left + width; x += 1) {
      setPixel(image.data, image.width, x, y, value);
    }
  }
}

function addGlare(
  image: ImageDataLike,
  left: number,
  width: number,
  strength: number,
): void {
  if (!(image.data instanceof Uint8ClampedArray)) {
    throw new TypeError("Test image must use mutable clamped RGBA data.");
  }
  for (let y = 0; y < image.height; y += 1) {
    for (let x = left; x < left + width; x += 1) {
      const offset = (y * image.width + x) * 4;
      const value = Math.round(
        image.data[offset]! + (255 - image.data[offset]!) * strength,
      );
      setPixel(image.data, image.width, x, y, value);
    }
  }
}

function addStructuredBackground(
  image: ImageDataLike,
  protectedArea: {
    readonly left: number;
    readonly top: number;
    readonly right: number;
    readonly bottom: number;
  },
): void {
  if (!(image.data instanceof Uint8ClampedArray)) {
    throw new TypeError("Test image must use mutable clamped RGBA data.");
  }
  for (let y = 0; y < image.height; y += 1) {
    for (let x = 0; x < image.width; x += 1) {
      if (
        x >= protectedArea.left &&
        x < protectedArea.right &&
        y >= protectedArea.top &&
        y < protectedArea.bottom
      ) {
        continue;
      }
      const texture = 180 + ((x * 17 + y * 29 + ((x ^ y) & 15)) % 56);
      const stroke = (x + y * 2) % 47 < 2 || (x * 3 - y + 997) % 71 < 2;
      setPixel(image.data, image.width, x, y, stroke ? 45 : texture);
    }
  }
}

function directionalBlur(
  image: ImageDataLike,
  horizontalRadius: number,
  verticalRadius: number,
): ImageDataLike {
  const data = new Uint8ClampedArray(image.width * image.height * 4);
  for (let y = 0; y < image.height; y += 1) {
    for (let x = 0; x < image.width; x += 1) {
      let sum = 0;
      let count = 0;
      for (let dy = -verticalRadius; dy <= verticalRadius; dy += 1) {
        const sourceY = Math.max(0, Math.min(image.height - 1, y + dy));
        for (let dx = -horizontalRadius; dx <= horizontalRadius; dx += 1) {
          const sourceX = Math.max(0, Math.min(image.width - 1, x + dx));
          sum += image.data[(sourceY * image.width + sourceX) * 4]!;
          count += 1;
        }
      }
      setPixel(data, image.width, x, y, Math.round(sum / count));
    }
  }
  return { width: image.width, height: image.height, data };
}

function addReflectionPatch(
  image: ImageDataLike,
  left: number,
  top: number,
  width: number,
  height: number,
  strength: number,
): void {
  if (!(image.data instanceof Uint8ClampedArray)) {
    throw new TypeError("Test image must use mutable clamped RGBA data.");
  }
  for (let y = top; y < top + height; y += 1) {
    for (let x = left; x < left + width; x += 1) {
      const offset = (y * image.width + x) * 4;
      const value = Math.round(
        image.data[offset]! + (255 - image.data[offset]!) * strength,
      );
      setPixel(image.data, image.width, x, y, value);
    }
  }
}
