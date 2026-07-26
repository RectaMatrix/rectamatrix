import { RECTAMATRIX_SIZES, type SizeId } from "@rectamatrix/core";
import { decodeSampledSymbol } from "@rectamatrix/decoder";
import {
  DetectorInputError,
  otsuThreshold,
  toGrayscale,
  type GrayscaleImage,
} from "./image.js";
import { sampleCandidate } from "./sampler.js";
import { detectSceneQuadrilaterals } from "./scene.js";
import type {
  DetectorOptions,
  ImageDataLike,
  ImageDecodeResult,
  OrientationDegrees,
  SourceQuadrilateral,
  VisionSample,
} from "./types.js";

const ORIENTATIONS = [0, 90, 180, 270] as const;
const DEFAULT_SAMPLES_PER_MODULE = 7;
const DEFAULT_MINIMUM_MODULE_PIXELS = 3;

interface LocatedCandidate {
  readonly quadrilateral: SourceQuadrilateral;
  readonly sizeIds: readonly SizeId[];
}

export function detectCandidates(
  image: ImageDataLike,
  options: DetectorOptions = {},
): readonly SourceQuadrilateral[] {
  const grayscale = toGrayscale(image, options.maximumPixels);
  validateAutomaticSearchOptions(options);
  if (options.sourceQuadrilateral !== undefined) {
    validateQuadrilateral(options.sourceQuadrilateral, image);
    return Object.freeze([copyQuadrilateral(options.sourceQuadrilateral)]);
  }
  const tightCandidates = detectTightQuietZoneCandidates(grayscale);
  return Object.freeze(
    (tightCandidates.length > 0
      ? tightCandidates
      : detectSceneCandidates(grayscale, options)
    ).map(({ quadrilateral }) => quadrilateral),
  );
}

export function sampleVisionCandidate(
  image: ImageDataLike,
  quadrilateral: SourceQuadrilateral,
  sizeId: SizeId,
  orientationDegrees: OrientationDegrees,
  options: DetectorOptions = {},
): VisionSample {
  const grayscale = toGrayscale(image, options.maximumPixels);
  validateQuadrilateral(quadrilateral, image);
  const samplesPerModule =
    options.samplesPerModule ?? DEFAULT_SAMPLES_PER_MODULE;
  validateSamplesPerModule(samplesPerModule);
  return sampleCandidate(
    grayscale,
    copyQuadrilateral(quadrilateral),
    sizeId,
    orientationDegrees,
    {
      samplesPerModule,
      allowInverted: options.tryInverted ?? false,
    },
  );
}

export function decodeImageData(
  image: ImageDataLike,
  options: DetectorOptions = {},
): ImageDecodeResult {
  try {
    const grayscale = toGrayscale(image, options.maximumPixels);
    const samplesPerModule =
      options.samplesPerModule ?? DEFAULT_SAMPLES_PER_MODULE;
    validateSamplesPerModule(samplesPerModule);
    validateAutomaticSearchOptions(options);
    const minimumModulePixels =
      options.minimumModulePixels ?? DEFAULT_MINIMUM_MODULE_PIXELS;
    const tightCandidates =
      options.sourceQuadrilateral === undefined
        ? detectTightQuietZoneCandidates(grayscale)
        : [];
    const quadrilaterals =
      options.sourceQuadrilateral === undefined
        ? tightCandidates.length > 0
          ? tightCandidates
          : detectSceneCandidates(grayscale, options)
        : [
            Object.freeze({
              quadrilateral: copyQuadrilateral(options.sourceQuadrilateral),
              sizeIds: RECTAMATRIX_SIZES.map(({ sizeId }) => sizeId),
            }),
          ];
    if (options.sourceQuadrilateral !== undefined) {
      validateQuadrilateral(options.sourceQuadrilateral, image);
    }
    for (const located of quadrilaterals) {
      for (const sizeId of located.sizeIds) {
        const size = RECTAMATRIX_SIZES[sizeId];
        for (const orientationDegrees of ORIENTATIONS) {
          if (
            !isPlausibleAssignment(
              located.quadrilateral,
              size.width,
              size.height,
              orientationDegrees,
              minimumModulePixels,
            )
          ) {
            continue;
          }
          let sample: VisionSample;
          try {
            sample = sampleCandidate(
              grayscale,
              located.quadrilateral,
              size.sizeId,
              orientationDegrees,
              {
                samplesPerModule,
                allowInverted: options.tryInverted ?? false,
              },
            );
          } catch {
            continue;
          }
          if (
            sample.scores.anchor < 0.8 ||
            sample.scores.anchorCutout < 0.8 ||
            sample.scores.topClock < 0.75 ||
            sample.scores.leftClock < 0.75 ||
            (sample.scores.topClock + sample.scores.leftClock) / 2 < 0.82
          ) {
            continue;
          }
          const decoded = decodeSampledSymbol({
            modules: sample.modules,
            confidence: sample.confidence,
            detectorMetadata: {
              imageQuality: sample.imageQuality,
              blurEstimate: sample.blurEstimate,
              perspectiveEstimateDegrees: sample.perspectiveEstimateDegrees,
            },
          });
          if (decoded.ok) {
            return imageSuccess(decoded, sample, samplesPerModule);
          }
        }
      }
    }
    return failure(
      "NO_CANDIDATE",
      "No image candidate produced a CRC-valid RectaMatrix Payload.",
    );
  } catch (error) {
    if (error instanceof DetectorInputError) {
      return failure(error.code, error.message);
    }
    if (error instanceof RangeError || error instanceof TypeError) {
      return failure("INVALID_IMAGE", error.message);
    }
    throw error;
  }
}

function imageSuccess(
  decoded: Extract<
    ReturnType<typeof decodeSampledSymbol>,
    { readonly ok: true }
  >,
  sample: VisionSample,
  samplesPerModule: number,
): ImageDecodeResult {
  return Object.freeze({
    ...decoded,
    vision: Object.freeze({
      sourceQuadrilateral: sample.sourceQuadrilateral,
      orientationDegrees: sample.orientationDegrees,
      inverted: sample.inverted,
      samplesPerModule,
      blackReference: sample.blackReference,
      whiteReference: sample.whiteReference,
      threshold: sample.threshold,
      scores: sample.scores,
    }),
  });
}

function detectSceneCandidates(
  image: GrayscaleImage,
  options: DetectorOptions,
): readonly LocatedCandidate[] {
  const sizeIds = Object.freeze(RECTAMATRIX_SIZES.map(({ sizeId }) => sizeId));
  return Object.freeze(
    detectSceneQuadrilaterals(image, {
      ...(options.minimumModulePixels === undefined
        ? {}
        : { minimumModulePixels: options.minimumModulePixels }),
      ...(options.maximumCandidates === undefined
        ? {}
        : { maximumCandidates: options.maximumCandidates }),
      tryInverted: options.tryInverted ?? false,
    }).map((quadrilateral) =>
      Object.freeze({
        quadrilateral,
        sizeIds,
      }),
    ),
  );
}

function detectTightQuietZoneCandidates(
  image: GrayscaleImage,
): readonly LocatedCandidate[] {
  const threshold = otsuThreshold(image);
  let darkPixels = 0;
  for (const value of image.pixels) {
    if (value <= threshold) darkPixels += 1;
  }
  if (darkPixels === 0) return Object.freeze([]);
  const candidates = new Map<string, LocatedCandidate>();
  for (const size of RECTAMATRIX_SIZES) {
    for (const rotated of [false, true]) {
      const width = rotated ? size.height : size.width;
      const height = rotated ? size.width : size.height;
      for (const quietZone of [2, 4, 5, 6]) {
        const scaleX = image.width / (width + quietZone * 2);
        const scaleY = image.height / (height + quietZone * 2);
        if (!Number.isInteger(scaleX) || scaleX < 4 || scaleX !== scaleY) {
          continue;
        }
        const left = quietZone * scaleX;
        const top = quietZone * scaleX;
        const right = left + width * scaleX;
        const bottom = top + height * scaleX;
        const quadrilateral = Object.freeze([
          Object.freeze({ x: left, y: top }),
          Object.freeze({ x: right, y: top }),
          Object.freeze({ x: right, y: bottom }),
          Object.freeze({ x: left, y: bottom }),
        ]) as SourceQuadrilateral;
        const key = quadrilateral
          .map(({ x, y }) => `${String(x)},${String(y)}`)
          .join(";");
        const existing = candidates.get(key);
        candidates.set(
          key,
          Object.freeze({
            quadrilateral,
            sizeIds: Object.freeze([...(existing?.sizeIds ?? []), size.sizeId]),
          }),
        );
      }
    }
  }
  return Object.freeze([...candidates.values()]);
}

function isPlausibleAssignment(
  quadrilateral: SourceQuadrilateral,
  width: number,
  height: number,
  orientation: OrientationDegrees,
  minimumModulePixels: number,
): boolean {
  const offset = orientation / 90;
  const topLeft = quadrilateral[offset % 4]!;
  const topRight = quadrilateral[(offset + 1) % 4]!;
  const bottomRight = quadrilateral[(offset + 2) % 4]!;
  const bottomLeft = quadrilateral[(offset + 3) % 4]!;
  const horizontalSpan =
    (distance(topLeft, topRight) + distance(bottomLeft, bottomRight)) / 2;
  const verticalSpan =
    (distance(topRight, bottomRight) + distance(topLeft, bottomLeft)) / 2;
  const ratio = horizontalSpan / verticalSpan;
  return (
    ratio >= 1.2 &&
    ratio <= 1.8 &&
    horizontalSpan / width >= minimumModulePixels &&
    verticalSpan / height >= minimumModulePixels
  );
}

function distance(
  left: { readonly x: number; readonly y: number },
  right: { readonly x: number; readonly y: number },
): number {
  return Math.hypot(right.x - left.x, right.y - left.y);
}

function validateQuadrilateral(
  quadrilateral: SourceQuadrilateral,
  image: ImageDataLike,
): void {
  const runtimeQuadrilateral: unknown = quadrilateral;
  if (
    !Array.isArray(runtimeQuadrilateral) ||
    runtimeQuadrilateral.length !== 4
  ) {
    throw new DetectorInputError(
      "INVALID_QUADRILATERAL",
      "Source quadrilateral must contain four points.",
    );
  }
  for (const rawPoint of runtimeQuadrilateral as unknown[]) {
    const point =
      typeof rawPoint === "object" && rawPoint !== null
        ? (rawPoint as Record<string, unknown>)
        : undefined;
    const x = point?.x;
    const y = point?.y;
    if (
      typeof x !== "number" ||
      typeof y !== "number" ||
      !Number.isFinite(x) ||
      !Number.isFinite(y) ||
      x < -0.5 ||
      y < -0.5 ||
      x > image.width - 0.5 ||
      y > image.height - 0.5
    ) {
      throw new DetectorInputError(
        "INVALID_QUADRILATERAL",
        "Source quadrilateral points must be finite and inside the image.",
      );
    }
  }
}

function validateSamplesPerModule(value: number): void {
  if (!Number.isInteger(value) || value < 5 || value > 9) {
    throw new DetectorInputError(
      "INVALID_OPTIONS",
      "Samples per module must be an integer from 5 to 9.",
    );
  }
}

function validateAutomaticSearchOptions(options: DetectorOptions): void {
  const minimumModulePixels =
    options.minimumModulePixels ?? DEFAULT_MINIMUM_MODULE_PIXELS;
  if (
    !Number.isInteger(minimumModulePixels) ||
    minimumModulePixels < 2 ||
    minimumModulePixels > 16
  ) {
    throw new DetectorInputError(
      "INVALID_OPTIONS",
      "Minimum module pixels must be an integer from 2 to 16.",
    );
  }
  const maximumCandidates = options.maximumCandidates ?? 48;
  if (
    !Number.isInteger(maximumCandidates) ||
    maximumCandidates < 1 ||
    maximumCandidates > 256
  ) {
    throw new DetectorInputError(
      "INVALID_OPTIONS",
      "Maximum candidates must be an integer from 1 to 256.",
    );
  }
}

function copyQuadrilateral(
  quadrilateral: SourceQuadrilateral,
): SourceQuadrilateral {
  return Object.freeze([
    Object.freeze({ ...quadrilateral[0] }),
    Object.freeze({ ...quadrilateral[1] }),
    Object.freeze({ ...quadrilateral[2] }),
    Object.freeze({ ...quadrilateral[3] }),
  ]);
}

function failure(code: string, message: string): ImageDecodeResult {
  return Object.freeze({
    ok: false,
    error: Object.freeze({ code, message }),
  });
}
