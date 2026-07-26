import type { ImageDataLike } from "./types.js";

export interface GrayscaleImage {
  readonly width: number;
  readonly height: number;
  readonly pixels: Float64Array;
}

const DEFAULT_MAXIMUM_PIXELS = 25_000_000;

export function toGrayscale(
  image: ImageDataLike,
  maximumPixels = DEFAULT_MAXIMUM_PIXELS,
): GrayscaleImage {
  validateImage(image, maximumPixels);
  const pixels = new Float64Array(image.width * image.height);
  for (let index = 0; index < pixels.length; index += 1) {
    const offset = index * 4;
    const alpha = image.data[offset + 3]! / 255;
    const red = alpha * image.data[offset]! + (1 - alpha) * 255;
    const green = alpha * image.data[offset + 1]! + (1 - alpha) * 255;
    const blue = alpha * image.data[offset + 2]! + (1 - alpha) * 255;
    pixels[index] = 0.299 * red + 0.587 * green + 0.114 * blue;
  }
  return Object.freeze({ width: image.width, height: image.height, pixels });
}

export function otsuThreshold(image: GrayscaleImage): number {
  const histogram = new Uint32Array(256);
  for (const value of image.pixels) {
    histogram[Math.max(0, Math.min(255, Math.round(value)))]! += 1;
  }
  const total = image.pixels.length;
  let weightedTotal = 0;
  for (let value = 0; value < histogram.length; value += 1) {
    weightedTotal += value * histogram[value]!;
  }
  let backgroundWeight = 0;
  let backgroundSum = 0;
  let maximumVariance = -1;
  let threshold = 127;
  for (let value = 0; value < histogram.length; value += 1) {
    backgroundWeight += histogram[value]!;
    if (backgroundWeight === 0) continue;
    const foregroundWeight = total - backgroundWeight;
    if (foregroundWeight === 0) break;
    backgroundSum += value * histogram[value]!;
    const backgroundMean = backgroundSum / backgroundWeight;
    const foregroundMean = (weightedTotal - backgroundSum) / foregroundWeight;
    const difference = backgroundMean - foregroundMean;
    const variance =
      backgroundWeight * foregroundWeight * difference * difference;
    if (variance > maximumVariance) {
      maximumVariance = variance;
      threshold = value;
    }
  }
  return threshold;
}

export function sampleBilinear(
  image: GrayscaleImage,
  x: number,
  y: number,
): number {
  const clampedX = Math.max(0, Math.min(image.width - 1, x));
  const clampedY = Math.max(0, Math.min(image.height - 1, y));
  const x0 = Math.floor(clampedX);
  const y0 = Math.floor(clampedY);
  const x1 = Math.min(image.width - 1, x0 + 1);
  const y1 = Math.min(image.height - 1, y0 + 1);
  const fx = clampedX - x0;
  const fy = clampedY - y0;
  const top =
    image.pixels[y0 * image.width + x0]! * (1 - fx) +
    image.pixels[y0 * image.width + x1]! * fx;
  const bottom =
    image.pixels[y1 * image.width + x0]! * (1 - fx) +
    image.pixels[y1 * image.width + x1]! * fx;
  return top * (1 - fy) + bottom * fy;
}

function validateImage(image: ImageDataLike, maximumPixels: number): void {
  const runtimeImage: unknown = image;
  const candidate =
    typeof runtimeImage === "object" && runtimeImage !== null
      ? (runtimeImage as Record<string, unknown>)
      : undefined;
  if (
    typeof candidate?.width !== "number" ||
    typeof candidate.height !== "number" ||
    !Number.isInteger(candidate.width) ||
    !Number.isInteger(candidate.height) ||
    candidate.width < 1 ||
    candidate.height < 1
  ) {
    throw new DetectorInputError(
      "INVALID_IMAGE",
      "Image dimensions must be positive integers.",
    );
  }
  const width = candidate.width;
  const height = candidate.height;
  if (
    !Number.isInteger(maximumPixels) ||
    maximumPixels < 1 ||
    width * height > maximumPixels
  ) {
    throw new DetectorInputError(
      "IMAGE_TOO_LARGE",
      "Image exceeds the configured pixel limit.",
    );
  }
  const data = candidate.data;
  if (typeof data !== "object" || data === null || !("length" in data)) {
    throw new DetectorInputError(
      "INVALID_IMAGE",
      "RGBA data length does not match image dimensions.",
    );
  }
  const runtimeData = data as {
    readonly length: unknown;
    readonly [key: number]: unknown;
  };
  if (
    typeof runtimeData.length !== "number" ||
    runtimeData.length !== width * height * 4
  ) {
    throw new DetectorInputError(
      "INVALID_IMAGE",
      "RGBA data length does not match image dimensions.",
    );
  }
  for (let index = 0; index < runtimeData.length; index += 1) {
    const value = runtimeData[index];
    if (
      typeof value !== "number" ||
      !Number.isFinite(value) ||
      value < 0 ||
      value > 255
    ) {
      throw new DetectorInputError(
        "INVALID_IMAGE",
        "RGBA channels must be finite bytes.",
      );
    }
  }
}

export class DetectorInputError extends Error {
  public constructor(
    public readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "DetectorInputError";
  }
}
