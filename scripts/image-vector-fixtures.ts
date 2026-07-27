import {
  HEADER_BITS,
  buildScanOrder,
  crc32c,
  getSymbolSize,
  type BooleanMatrix,
} from "../packages/core/src/index.js";
import {
  bytesToHex,
  createImageFailureVector,
  createImageSuccessVector,
  createImageVectorSuite,
  uint32ToHex,
  type ImageSuccessExpectation,
  type ImageVector,
  type ImageVectorOptions,
  type ImageVectorSuite,
} from "../packages/conformance/src/index.js";
import {
  buildHomography,
  invertHomography,
  project,
  type SourceQuadrilateral,
} from "../packages/detector/src/index.js";
import { encodeBytes, encodeText } from "../packages/encoder/src/index.js";

export interface CanonicalImageFixtureSuite {
  readonly suite: ImageVectorSuite;
  readonly files: ReadonlyMap<string, Uint8Array>;
}

interface RasterImage {
  readonly width: number;
  readonly height: number;
  readonly data: Uint8ClampedArray;
}

const vectors: ImageVector[] = [];
const files = new Map<string, Uint8Array>();
const text = "Image v1";
const textSymbol = encodeText(text, {
  sizeId: 0,
  eccLevel: "medium",
  compression: "none",
});
const binaryPayload = Uint8Array.of(0, 17, 34, 51, 68, 85);
const binarySymbol = encodeBytes(binaryPayload, {
  sizeId: 0,
  eccLevel: "medium",
  compression: "none",
});

addSuccess(
  "clean",
  ["clean", "display"],
  renderSymbol(textSymbol.matrix, 6, 4),
  {},
  textExpectation(text, 0, 0, 0.95),
);
addSuccess(
  "compact-quiet-zone",
  ["clean", "display", "compact-quiet-zone"],
  renderSymbol(textSymbol.matrix, 6, 2),
  {},
  textExpectation(text, 0, 0, 0.95),
);
addSuccess(
  "scene-offset",
  ["scene", "automatic-detection"],
  placeImage(renderSymbol(textSymbol.matrix, 5, 4), 310, 220, 73, 51),
  {},
  textExpectation(text, 0, 0, 0.9),
);

const photometricText = "Photo";
const photometricSymbol = encodeText(photometricText, {
  sizeId: 0,
  eccLevel: "high",
  compression: "none",
});
const photometricScene = addIlluminationGradient(
  placeImage(renderSymbol(photometricSymbol.matrix, 5, 4), 360, 240, 90, 60),
  80,
  245,
);
addImpulseNoise(photometricScene, 320, 0x9e3779b9);
fillRectangle(photometricScene, 14, 184, 22, 18, 25);
fillRectangle(photometricScene, 316, 17, 19, 24, 35);
addGlare(photometricScene, 178, 3, 0.85);
addSuccess(
  "scene-photometric-stress",
  ["scene", "illumination", "noise", "glare", "clutter"],
  photometricScene,
  {},
  textExpectation(photometricText, 0, 0, 0.65),
);

const textureText = "Texture";
const textureSymbolImage = renderSymbol(
  encodeText(textureText, {
    sizeId: 0,
    eccLevel: "high",
    compression: "none",
  }).matrix,
  5,
  4,
);
const textureLeft = 73;
const textureTop = 51;
const textureScene = placeImage(
  textureSymbolImage,
  310,
  220,
  textureLeft,
  textureTop,
);
addStructuredBackground(textureScene, {
  left: textureLeft,
  top: textureTop,
  right: textureLeft + textureSymbolImage.width,
  bottom: textureTop + textureSymbolImage.height,
});
addSuccess(
  "scene-structured-background",
  ["scene", "structured-background", "connected-components"],
  textureScene,
  {},
  textExpectation(textureText, 0, 0, 0.8),
);

const motionText = "Motion";
const motionSymbol = encodeText(motionText, {
  sizeId: 0,
  eccLevel: "high",
  compression: "none",
});
const motionScene = directionalBlur(
  placeImage(renderSymbol(motionSymbol.matrix, 6, 4), 340, 240, 72, 45),
  2,
  1,
);
addGlare(motionScene, 177, 7, 0.72);
addSuccess(
  "scene-motion-blur-and-glare",
  ["scene", "motion-blur", "glare"],
  motionScene,
  {},
  textExpectation(motionText, 0, 0, 0.65),
);

const overlappingFirst = encodeText("Upper", {
  sizeId: 2,
  eccLevel: "high",
  compression: "none",
});
const overlappingSecondText = "Lower";
const overlappingSecond = encodeText(overlappingSecondText, {
  sizeId: 2,
  eccLevel: "high",
  compression: "none",
});
const overlappingScene = solidImage(280, 260, 255);
drawMatrix(overlappingScene, overlappingFirst.matrix, 4, 30, 30);
drawMatrix(overlappingScene, overlappingSecond.matrix, 4, 80, 131);
addSuccess(
  "scene-overlapping-projections",
  ["scene", "multiple-candidates", "overlapping-projections"],
  overlappingScene,
  { maximumCandidates: 64 },
  textExpectation(overlappingSecondText, 2, 0, 0.8),
);

const reflectionText = "Reflection";
const reflectionSymbol = encodeText(reflectionText, {
  sizeId: 2,
  eccLevel: "high",
  compression: "none",
});
const reflectionScene = placeImage(
  renderSymbol(reflectionSymbol.matrix, 5, 4),
  330,
  240,
  45,
  38,
);
addReflectionPatch(reflectionScene, 181, 112, 14, 20, 0.94);
addSuccess(
  "scene-large-reflection",
  ["scene", "reflection", "ecc-correction"],
  reflectionScene,
  {},
  textExpectation(reflectionText, 2, 0, 0.65),
);

let rotated = renderSymbol(binarySymbol.matrix, 5, 4);
for (const orientation of [90, 180, 270] as const) {
  rotated = rotateClockwise(rotated);
  addSuccess(
    `rotation-${String(orientation)}`,
    ["rotation", "display"],
    rotated,
    {},
    binaryExpectation(binaryPayload, 0, orientation, 0.9),
  );
}

const perspectiveSymbol = encodeText("Perspective", {
  sizeId: 2,
  eccLevel: "high",
  compression: "none",
});
const perspectiveQuad = Object.freeze([
  Object.freeze({ x: 22, y: 18 }),
  Object.freeze({ x: 244, y: 31 }),
  Object.freeze({ x: 226, y: 176 }),
  Object.freeze({ x: 35, y: 163 }),
]) as SourceQuadrilateral;
addSuccess(
  "perspective",
  ["perspective"],
  renderPerspective(perspectiveSymbol.matrix, 270, 195, perspectiveQuad),
  { sourceQuadrilateral: perspectiveQuad, samplesPerModule: 7 },
  textExpectation("Perspective", 2, 0, 0.8),
);

const automaticPerspectiveText = "Automatic perspective";
const automaticPerspectiveSymbol = encodeText(automaticPerspectiveText, {
  sizeId: 2,
  eccLevel: "high",
  compression: "none",
});
const automaticPerspectiveQuad = Object.freeze([
  Object.freeze({ x: 42, y: 28 }),
  Object.freeze({ x: 272, y: 46 }),
  Object.freeze({ x: 248, y: 193 }),
  Object.freeze({ x: 61, y: 178 }),
]) as SourceQuadrilateral;
addSuccess(
  "perspective-automatic",
  ["perspective", "scene", "automatic-detection"],
  renderPerspective(
    automaticPerspectiveSymbol.matrix,
    320,
    225,
    automaticPerspectiveQuad,
  ),
  {},
  textExpectation(automaticPerspectiveText, 2, 0, 0.75),
);

addSuccess(
  "low-contrast",
  ["low-contrast", "print"],
  renderSymbol(textSymbol.matrix, 7, 4, false, 85, 175),
  {},
  textExpectation(text, 0, 0, 0.7),
);
addSuccess(
  "noise",
  ["noise", "print"],
  addNoise(renderSymbol(textSymbol.matrix, 7, 4), 18, 0x41c64e6d),
  {},
  textExpectation(text, 0, 0, 0.75),
);
addSuccess(
  "blur",
  ["blur", "print"],
  boxBlur(renderSymbol(textSymbol.matrix, 8, 4), 1),
  {},
  textExpectation(text, 0, 0, 0.75),
);
addSuccess(
  "shadow",
  ["shadow", "print"],
  addHorizontalShadow(renderSymbol(textSymbol.matrix, 7, 4), 35),
  {},
  textExpectation(text, 0, 0, 0.75),
);

const partialOcclusion = renderSymbol(binarySymbol.matrix, 7, 4);
damageBodyModules(partialOcclusion, binarySymbol.sizeId, 7, 4, [0, 1]);
addSuccess(
  "partial-occlusion-correctable",
  ["partial-occlusion"],
  partialOcclusion,
  {},
  binaryExpectation(binaryPayload, 0, 0, 0.7),
);
addSuccess(
  "inverted",
  ["inverted", "display"],
  renderSymbol(textSymbol.matrix, 6, 4, true),
  { tryInverted: true },
  textExpectation(text, 0, 0, 0.9),
);

const randomMatrix = Array.from({ length: 16 }, (_, y) =>
  Array.from({ length: 24 }, (_, x) => ((x * 37 + y * 61 + 11) & 1) === 1),
);
addFailure(
  "random-rectangular-pattern",
  ["random-pattern", "negative"],
  renderSymbol(randomMatrix, 6, 4),
  {},
  ["NO_CANDIDATE"],
);

const beyondEcc = renderSymbol(binarySymbol.matrix, 7, 4);
damageBodyModules(beyondEcc, binarySymbol.sizeId, 7, 4, [0, 1, 2, 3, 4]);
addFailure(
  "damage-beyond-ecc",
  ["partial-occlusion", "negative"],
  beyondEcc,
  {},
  ["NO_CANDIDATE"],
);

const badAnchorMatrix = binarySymbol.matrix.map((row) => [...row]);
for (let y = 0; y < 4; y += 1) {
  for (let x = 0; x < 4; x += 1) badAnchorMatrix[y]![x] = false;
}
addFailure(
  "incomplete-quiet-zone-and-bad-anchor",
  ["quiet-zone", "negative"],
  renderSymbol(badAnchorMatrix, 7, 2),
  {},
  ["NO_CANDIDATE"],
);
addFailure("blank", ["blank", "negative"], solidImage(160, 120, 255), {}, [
  "NO_CANDIDATE",
]);

export function buildCanonicalImageVectorSuite(): CanonicalImageFixtureSuite {
  return Object.freeze({
    suite: createImageVectorSuite(vectors),
    files,
  });
}

function addSuccess(
  id: string,
  categories: readonly string[],
  image: RasterImage,
  options: ImageVectorOptions,
  expectation: ImageSuccessExpectation,
): void {
  const asset = addAsset(id, image);
  vectors.push(
    createImageSuccessVector(
      id,
      categories,
      asset,
      image,
      options,
      expectation,
    ),
  );
}

function addFailure(
  id: string,
  categories: readonly string[],
  image: RasterImage,
  options: ImageVectorOptions,
  allowedErrorCodes: readonly string[],
): void {
  const asset = addAsset(id, image);
  vectors.push(
    createImageFailureVector(
      id,
      categories,
      asset,
      image,
      options,
      allowedErrorCodes,
    ),
  );
}

function addAsset(id: string, image: RasterImage) {
  const file = `images/${id}.pgm`;
  const bytes = serializePgm(image);
  files.set(file, bytes);
  return Object.freeze({
    file,
    width: image.width,
    height: image.height,
    crc32cHex: uint32ToHex(crc32c(bytes)),
  });
}

function textExpectation(
  value: string,
  sizeId: 0 | 1 | 2 | 3 | 4 | 5 | 6,
  orientationDegrees: 0 | 90 | 180 | 270,
  minimumOverallConfidence: number,
): ImageSuccessExpectation {
  return {
    type: "utf8",
    text: value,
    sizeId,
    orientationDegrees,
    minimumOverallConfidence,
  };
}

function binaryExpectation(
  value: Uint8Array,
  sizeId: 0 | 1 | 2 | 3 | 4 | 5 | 6,
  orientationDegrees: 0 | 90 | 180 | 270,
  minimumOverallConfidence: number,
): ImageSuccessExpectation {
  return {
    type: "binary",
    payloadHex: bytesToHex(value),
    sizeId,
    orientationDegrees,
    minimumOverallConfidence,
  };
}

function renderSymbol(
  matrix: BooleanMatrix,
  moduleSize: number,
  quietZone: number,
  inverted = false,
  blackValue = 20,
  whiteValue = 235,
): RasterImage {
  const width = (matrix[0]!.length + quietZone * 2) * moduleSize;
  const height = (matrix.length + quietZone * 2) * moduleSize;
  const image = solidImage(width, height, inverted ? blackValue : whiteValue);
  for (let y = 0; y < matrix.length; y += 1) {
    for (let x = 0; x < matrix[0]!.length; x += 1) {
      const black = matrix[y]![x]!;
      fillRectangle(
        image,
        (x + quietZone) * moduleSize,
        (y + quietZone) * moduleSize,
        moduleSize,
        moduleSize,
        (black ? !inverted : inverted) ? blackValue : whiteValue,
      );
    }
  }
  return image;
}

function renderPerspective(
  matrix: BooleanMatrix,
  width: number,
  height: number,
  quadrilateral: SourceQuadrilateral,
): RasterImage {
  const image = solidImage(width, height, 245);
  const inverse = invertHomography(
    buildHomography(matrix[0]!.length, matrix.length, quadrilateral),
  );
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const point = project(inverse, x + 0.5, y + 0.5);
      if (
        point.x >= 0 &&
        point.y >= 0 &&
        point.x < matrix[0]!.length &&
        point.y < matrix.length
      ) {
        const black = matrix[Math.floor(point.y)]![Math.floor(point.x)]!;
        setGray(image, x, y, black ? 18 : 238);
      }
    }
  }
  return image;
}

function placeImage(
  source: RasterImage,
  width: number,
  height: number,
  left: number,
  top: number,
): RasterImage {
  const image = solidImage(width, height, 255);
  for (let y = 0; y < source.height; y += 1) {
    for (let x = 0; x < source.width; x += 1) {
      setGray(
        image,
        left + x,
        top + y,
        source.data[(y * source.width + x) * 4]!,
      );
    }
  }
  return image;
}

function addIlluminationGradient(
  image: RasterImage,
  leftWhite: number,
  rightWhite: number,
): RasterImage {
  const result = copyImage(image);
  for (let y = 0; y < result.height; y += 1) {
    for (let x = 0; x < result.width; x += 1) {
      const white =
        leftWhite +
        ((rightWhite - leftWhite) * x) / Math.max(1, result.width - 1);
      const source = result.data[(y * result.width + x) * 4]!;
      setGray(result, x, y, Math.round((source * white) / 255));
    }
  }
  return result;
}

function addImpulseNoise(
  image: RasterImage,
  count: number,
  seed: number,
): void {
  let state = seed >>> 0;
  for (let index = 0; index < count; index += 1) {
    state ^= state << 13;
    state ^= state >>> 17;
    state ^= state << 5;
    const pixel = state % (image.width * image.height);
    setGray(
      image,
      pixel % image.width,
      Math.floor(pixel / image.width),
      (state & 1) === 0 ? 0 : 255,
    );
  }
}

function addGlare(
  image: RasterImage,
  left: number,
  width: number,
  strength: number,
): void {
  for (let y = 0; y < image.height; y += 1) {
    for (let x = left; x < left + width; x += 1) {
      const source = image.data[(y * image.width + x) * 4]!;
      setGray(image, x, y, Math.round(source + (255 - source) * strength));
    }
  }
}

function addStructuredBackground(
  image: RasterImage,
  protectedArea: {
    readonly left: number;
    readonly top: number;
    readonly right: number;
    readonly bottom: number;
  },
): void {
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
      setGray(image, x, y, stroke ? 45 : texture);
    }
  }
}

function directionalBlur(
  image: RasterImage,
  horizontalRadius: number,
  verticalRadius: number,
): RasterImage {
  const result = solidImage(image.width, image.height, 255);
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
      setGray(result, x, y, Math.round(sum / count));
    }
  }
  return result;
}

function drawMatrix(
  image: RasterImage,
  matrix: BooleanMatrix,
  moduleSize: number,
  left: number,
  top: number,
): void {
  for (let moduleY = 0; moduleY < matrix.length; moduleY += 1) {
    for (let moduleX = 0; moduleX < matrix[0]!.length; moduleX += 1) {
      fillRectangle(
        image,
        left + moduleX * moduleSize,
        top + moduleY * moduleSize,
        moduleSize,
        moduleSize,
        matrix[moduleY]![moduleX]! ? 20 : 235,
      );
    }
  }
}

function addReflectionPatch(
  image: RasterImage,
  left: number,
  top: number,
  width: number,
  height: number,
  strength: number,
): void {
  for (let y = top; y < top + height; y += 1) {
    for (let x = left; x < left + width; x += 1) {
      const source = image.data[(y * image.width + x) * 4]!;
      setGray(image, x, y, Math.round(source + (255 - source) * strength));
    }
  }
}

function rotateClockwise(image: RasterImage): RasterImage {
  const result = solidImage(image.height, image.width, 255);
  for (let y = 0; y < image.height; y += 1) {
    for (let x = 0; x < image.width; x += 1) {
      setGray(
        result,
        image.height - 1 - y,
        x,
        image.data[(y * image.width + x) * 4]!,
      );
    }
  }
  return result;
}

function addNoise(
  image: RasterImage,
  amplitude: number,
  seed: number,
): RasterImage {
  const result = copyImage(image);
  let state = seed >>> 0;
  for (let y = 0; y < result.height; y += 1) {
    for (let x = 0; x < result.width; x += 1) {
      state ^= state << 13;
      state ^= state >>> 17;
      state ^= state << 5;
      const noise = (state % (amplitude * 2 + 1)) - amplitude;
      const source = result.data[(y * result.width + x) * 4]!;
      setGray(result, x, y, clampByte(source + noise));
    }
  }
  return result;
}

function boxBlur(image: RasterImage, radius: number): RasterImage {
  const result = copyImage(image);
  for (let y = 0; y < image.height; y += 1) {
    for (let x = 0; x < image.width; x += 1) {
      let sum = 0;
      let count = 0;
      for (let dy = -radius; dy <= radius; dy += 1) {
        for (let dx = -radius; dx <= radius; dx += 1) {
          const sourceX = Math.max(0, Math.min(image.width - 1, x + dx));
          const sourceY = Math.max(0, Math.min(image.height - 1, y + dy));
          sum += image.data[(sourceY * image.width + sourceX) * 4]!;
          count += 1;
        }
      }
      setGray(result, x, y, Math.round(sum / count));
    }
  }
  return result;
}

function addHorizontalShadow(
  image: RasterImage,
  amplitude: number,
): RasterImage {
  const result = copyImage(image);
  for (let y = 0; y < result.height; y += 1) {
    for (let x = 0; x < result.width; x += 1) {
      const offset = ((x / Math.max(1, result.width - 1)) * 2 - 1) * amplitude;
      const source = result.data[(y * result.width + x) * 4]!;
      setGray(result, x, y, clampByte(source + offset));
    }
  }
  return result;
}

function damageBodyModules(
  image: RasterImage,
  sizeId: 0 | 1 | 2 | 3 | 4 | 5 | 6,
  moduleSize: number,
  quietZone: number,
  byteIndices: readonly number[],
): void {
  const body = buildScanOrder(getSymbolSize(sizeId)).slice(HEADER_BITS);
  for (const byteIndex of byteIndices) {
    const coordinate = body[byteIndex * 8]!;
    const x = (coordinate.x + quietZone) * moduleSize;
    const y = (coordinate.y + quietZone) * moduleSize;
    const current = image.data[(y * image.width + x) * 4]!;
    fillRectangle(
      image,
      x,
      y,
      moduleSize,
      moduleSize,
      current < 128 ? 235 : 20,
    );
  }
}

function solidImage(width: number, height: number, value: number): RasterImage {
  const image = {
    width,
    height,
    data: new Uint8ClampedArray(width * height * 4),
  };
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) setGray(image, x, y, value);
  }
  return image;
}

function copyImage(image: RasterImage): RasterImage {
  return { width: image.width, height: image.height, data: image.data.slice() };
}

function fillRectangle(
  image: RasterImage,
  x: number,
  y: number,
  width: number,
  height: number,
  value: number,
): void {
  for (let dy = 0; dy < height; dy += 1) {
    for (let dx = 0; dx < width; dx += 1) {
      setGray(image, x + dx, y + dy, value);
    }
  }
}

function setGray(
  image: RasterImage,
  x: number,
  y: number,
  value: number,
): void {
  const offset = (y * image.width + x) * 4;
  image.data[offset] = value;
  image.data[offset + 1] = value;
  image.data[offset + 2] = value;
  image.data[offset + 3] = 255;
}

function clampByte(value: number): number {
  return Math.max(0, Math.min(255, Math.round(value)));
}

function serializePgm(image: RasterImage): Uint8Array {
  const header = `P5\n${String(image.width)} ${String(image.height)}\n255\n`;
  const headerBytes = Uint8Array.from(header, (character) =>
    character.charCodeAt(0),
  );
  const result = new Uint8Array(
    headerBytes.length + image.width * image.height,
  );
  result.set(headerBytes);
  for (let index = 0; index < image.width * image.height; index += 1) {
    result[headerBytes.length + index] = image.data[index * 4]!;
  }
  return result;
}
