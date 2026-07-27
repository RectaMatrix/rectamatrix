import { RECTAMATRIX_SIZES, type SizeId } from "@rectamatrix/core";
import { decodeSampledSymbol } from "@rectamatrix/decoder";
import {
  DetectorInputError,
  otsuThreshold,
  toGrayscale,
  type GrayscaleImage,
} from "./image.js";
import { sampleCandidate } from "./sampler.js";
import { detectSceneCandidates as detectLocatedSceneCandidates } from "./scene.js";
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
    let refinementAttempts = 0;
    for (const located of quadrilaterals) {
      const refinementSeeds: {
        readonly sample: VisionSample;
        readonly sizeId: SizeId;
        readonly orientationDegrees: OrientationDegrees;
        readonly rank: number;
      }[] = [];
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
          const passesFixedPatterns =
            sample.scores.anchor >= 0.8 &&
            sample.scores.anchorCutout >= 0.8 &&
            sample.scores.topClock >= 0.75 &&
            sample.scores.leftClock >= 0.75 &&
            (sample.scores.topClock + sample.scores.leftClock) / 2 >= 0.82;
          if (passesFixedPatterns) {
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

          const refinementRank =
            sample.scores.anchor * 0.4 +
            sample.scores.anchorCutout * 0.2 +
            sample.scores.combined * 0.4;
          if (
            sample.scores.anchor >= 0.82 &&
            sample.scores.anchorCutout >= 0.8 &&
            sample.scores.combined >= 0.68 &&
            !refinementSeeds.some(
              (seed) =>
                seed.sizeId === size.sizeId &&
                seed.orientationDegrees === orientationDegrees,
            )
          ) {
            refinementSeeds.push({
              sample,
              sizeId: size.sizeId,
              orientationDegrees,
              rank: refinementRank,
            });
          }
        }
      }
      if (
        options.sourceQuadrilateral === undefined &&
        refinementSeeds.length > 0 &&
        refinementAttempts < 8
      ) {
        refinementSeeds.sort((left, right) => right.rank - left.rank);
        for (const refinementSeed of refinementSeeds) {
          if (refinementAttempts >= 8) break;
          refinementAttempts += 1;
          const refined = refineAndDecodeCandidate(
            grayscale,
            located.quadrilateral,
            refinementSeed.sizeId,
            refinementSeed.orientationDegrees,
            samplesPerModule,
            options.tryInverted ?? false,
          );
          if (refined !== undefined) {
            return imageSuccess(
              refined.decoded,
              refined.sample,
              refined.samplesPerModule,
            );
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

function refineAndDecodeCandidate(
  image: GrayscaleImage,
  initial: SourceQuadrilateral,
  sizeId: SizeId,
  orientationDegrees: OrientationDegrees,
  requestedSamplesPerModule: number,
  allowInverted: boolean,
):
  | {
      readonly decoded: Extract<
        ReturnType<typeof decodeSampledSymbol>,
        { readonly ok: true }
      >;
      readonly sample: VisionSample;
      readonly samplesPerModule: number;
    }
  | undefined {
  const searchSamples = 5;
  const sample = (
    quadrilateral: SourceQuadrilateral,
  ): VisionSample | undefined => {
    try {
      return sampleCandidate(image, quadrilateral, sizeId, orientationDegrees, {
        samplesPerModule: searchSamples,
        allowInverted,
      });
    } catch {
      return undefined;
    }
  };
  let quadrilateral: SourceQuadrilateral = copyQuadrilateral(initial);
  const current = sample(quadrilateral);
  if (current === undefined) return undefined;
  const anchorCorner = orientationDegrees / 90;
  const topClockCorner = (anchorCorner + 1) % 4;
  const oppositeCorner = (anchorCorner + 2) % 4;
  const leftClockCorner = (anchorCorner + 3) % 4;

  if (current.scores.topClock < 0.9 || current.scores.leftClock < 0.9) {
    quadrilateral = optimizeCornerGrid(
      quadrilateral,
      topClockCorner,
      distance(quadrilateral[0], quadrilateral[1]) * 0.15,
      distance(quadrilateral[0], quadrilateral[1]) * 0.09,
      sample,
      (candidate) =>
        candidate.scores.topClock * 2 +
        candidate.scores.anchor +
        candidate.scores.anchorCutout,
    );
    quadrilateral = optimizeCornerGrid(
      quadrilateral,
      leftClockCorner,
      distance(quadrilateral[0], quadrilateral[3]) * 0.15,
      distance(quadrilateral[0], quadrilateral[3]) * 0.15,
      sample,
      (candidate) =>
        candidate.scores.leftClock * 2 +
        candidate.scores.anchor +
        candidate.scores.anchorCutout,
    );
    quadrilateral = optimizeCornerGrid(
      quadrilateral,
      anchorCorner,
      Math.min(
        distance(quadrilateral[0], quadrilateral[1]),
        distance(quadrilateral[0], quadrilateral[3]),
      ) * 0.07,
      Math.min(
        distance(quadrilateral[0], quadrilateral[1]),
        distance(quadrilateral[0], quadrilateral[3]),
      ) * 0.07,
      sample,
      (candidate) =>
        candidate.scores.anchor +
        candidate.scores.anchorCutout +
        candidate.scores.topClock +
        candidate.scores.leftClock,
    );
  }

  const horizontal = distance(quadrilateral[0], quadrilateral[1]);
  const vertical = distance(quadrilateral[0], quadrilateral[3]);
  for (const divisor of [12, 24, 48]) {
    const radiusX =
      horizontal * (divisor === 12 ? 0.13 : divisor === 24 ? 0.04 : 0.025);
    const radiusY =
      vertical * (divisor === 12 ? 0.18 : divisor === 24 ? 0.06 : 0.035);
    const stepX = Math.max(1, horizontal / divisor);
    const stepY = Math.max(1, vertical / divisor);
    const center = quadrilateral[oppositeCorner]!;
    let bestQuadrilateral = quadrilateral;
    let bestScore = Number.NEGATIVE_INFINITY;
    for (let dy = -radiusY; dy <= radiusY + 1e-9; dy += stepY) {
      for (let dx = -radiusX; dx <= radiusX + 1e-9; dx += stepX) {
        const candidate = mutableQuadrilateral(quadrilateral);
        candidate[oppositeCorner] = {
          x: center.x + dx,
          y: center.y + dy,
        };
        const sampled = sample(candidate);
        if (
          sampled === undefined ||
          sampled.scores.anchor < 0.8 ||
          sampled.scores.anchorCutout < 0.8 ||
          sampled.scores.topClock < 0.75 ||
          sampled.scores.leftClock < 0.75
        ) {
          continue;
        }
        const candidateScore =
          sampled.meanModuleConfidence * 0.7 + sampled.imageQuality * 0.3;
        if (candidateScore > bestScore) {
          bestQuadrilateral = copyQuadrilateral(candidate);
          bestScore = candidateScore;
        }
        const decoded = decodeSampledSymbol({
          modules: sampled.modules,
          confidence: sampled.confidence,
          detectorMetadata: {
            imageQuality: sampled.imageQuality,
            blurEstimate: sampled.blurEstimate,
            perspectiveEstimateDegrees: sampled.perspectiveEstimateDegrees,
          },
        });
        if (!decoded.ok) continue;
        if (requestedSamplesPerModule === searchSamples) {
          return Object.freeze({
            decoded,
            sample: sampled,
            samplesPerModule: searchSamples,
          });
        }
        const finalSample = sampleCandidate(
          image,
          candidate,
          sizeId,
          orientationDegrees,
          { samplesPerModule: requestedSamplesPerModule, allowInverted },
        );
        const finalDecoded = decodeSampledSymbol({
          modules: finalSample.modules,
          confidence: finalSample.confidence,
          detectorMetadata: {
            imageQuality: finalSample.imageQuality,
            blurEstimate: finalSample.blurEstimate,
            perspectiveEstimateDegrees: finalSample.perspectiveEstimateDegrees,
          },
        });
        if (finalDecoded.ok) {
          return Object.freeze({
            decoded: finalDecoded,
            sample: finalSample,
            samplesPerModule: requestedSamplesPerModule,
          });
        }
      }
    }
    quadrilateral = bestQuadrilateral;
  }
  return undefined;
}

function optimizeCornerGrid(
  initial: SourceQuadrilateral,
  corner: number,
  radiusX: number,
  radiusY: number,
  sample: (quadrilateral: SourceQuadrilateral) => VisionSample | undefined,
  score: (sample: VisionSample) => number,
): SourceQuadrilateral {
  let best = mutableQuadrilateral(initial);
  const initialSample = sample(initial);
  let bestScore =
    initialSample === undefined
      ? Number.NEGATIVE_INFINITY
      : score(initialSample);
  let stepX = Math.max(1, radiusX);
  let stepY = Math.max(1, radiusY);
  for (let iteration = 0; iteration < 7; iteration += 1) {
    for (const axis of ["x", "y"] as const) {
      const step = axis === "x" ? stepX : stepY;
      for (const direction of [-1, 1]) {
        const candidate = mutableQuadrilateral(best);
        candidate[corner]![axis] += step * direction;
        const sampled = sample(candidate);
        if (sampled === undefined) continue;
        const candidateScore = score(sampled);
        if (candidateScore > bestScore) {
          best = candidate;
          bestScore = candidateScore;
        }
      }
    }
    stepX *= 0.52;
    stepY *= 0.52;
  }
  return copyQuadrilateral(best);
}

function mutableQuadrilateral(
  quadrilateral: SourceQuadrilateral,
): [
  { x: number; y: number },
  { x: number; y: number },
  { x: number; y: number },
  { x: number; y: number },
] {
  return quadrilateral.map((point) => ({ ...point })) as [
    { x: number; y: number },
    { x: number; y: number },
    { x: number; y: number },
    { x: number; y: number },
  ];
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
  return Object.freeze(
    detectLocatedSceneCandidates(image, {
      ...(options.minimumModulePixels === undefined
        ? {}
        : { minimumModulePixels: options.minimumModulePixels }),
      ...(options.maximumCandidates === undefined
        ? {}
        : { maximumCandidates: options.maximumCandidates }),
      tryInverted: options.tryInverted ?? false,
    }).map(({ quadrilateral, sizeIds }) =>
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
