import {
  anchorModule,
  getSymbolSize,
  leftClockingModule,
  topClockingModule,
  type Coordinate,
  type SizeId,
} from "@rectamatrix/core";
import { buildHomography, project } from "./homography.js";
import { sampleBilinear, type GrayscaleImage } from "./image.js";
import type {
  OrientationDegrees,
  SourceQuadrilateral,
  VisionSample,
  VisionScores,
} from "./types.js";

export interface SampleOptions {
  readonly samplesPerModule: number;
  readonly allowInverted: boolean;
}

interface ModuleStatistics {
  readonly intensity: number;
  readonly deviation: number;
}

export function sampleCandidate(
  image: GrayscaleImage,
  quadrilateral: SourceQuadrilateral,
  sizeId: SizeId,
  orientationDegrees: OrientationDegrees,
  options: SampleOptions,
): VisionSample {
  const size = getSymbolSize(sizeId);
  const oriented = orientQuadrilateral(quadrilateral, orientationDegrees);
  const homography = buildHomography(size.width, size.height, oriented);
  const statistics = Array.from({ length: size.height }, (_, y) =>
    Array.from({ length: size.width }, (_, x) =>
      sampleModule(image, homography, x, y, options.samplesPerModule),
    ),
  );
  const references = referenceCoordinates(sizeId);
  const blackReference = median(
    references.black.map(({ x, y }) => statistics[y]![x]!.intensity),
  );
  const whiteReference = median(
    references.white.map(({ x, y }) => statistics[y]![x]!.intensity),
  );
  const inverted = blackReference > whiteReference;
  if (inverted && !options.allowInverted) {
    throw new RangeError("Inverted candidate is disabled.");
  }
  const contrast = Math.abs(blackReference - whiteReference);
  if (contrast < 8) throw new RangeError("Candidate contrast is too low.");
  const threshold = (blackReference + whiteReference) / 2;
  const modules = statistics.map((row) =>
    row.map(({ intensity }) =>
      inverted ? intensity > threshold : intensity < threshold,
    ),
  );
  const confidence = statistics.map((row) =>
    row.map(({ intensity, deviation }) => {
      const separation = clamp01(
        Math.abs(intensity - threshold) / Math.max(contrast / 2, 1e-9),
      );
      const noiseFactor = clamp01(1 - deviation / Math.max(contrast / 2, 1));
      return separation * noiseFactor;
    }),
  );
  const scores = calculateScores(
    modules,
    confidence,
    sizeId,
    contrast,
    quadrilateral,
  );
  const meanModuleConfidence =
    confidence.flat().reduce((sum, value) => sum + value, 0) /
    (size.width * size.height);
  const contrastQuality = clamp01(contrast / 128);
  const imageQuality = clamp01(
    contrastQuality * 0.55 +
      meanModuleConfidence * 0.35 +
      scores.geometry * 0.1,
  );
  const averageWithinModuleDeviation =
    statistics.flat().reduce((sum, module) => sum + module.deviation, 0) /
    (size.width * size.height);
  const blurEstimate = clamp01(
    1 -
      contrast / 128 +
      clamp01(averageWithinModuleDeviation / Math.max(contrast, 1)) * 0.25,
  );

  return Object.freeze({
    profile: "rmx-cv-1",
    sizeId,
    width: size.width,
    height: size.height,
    modules: Object.freeze(modules.map((row) => Object.freeze(row.slice()))),
    confidence: Object.freeze(
      confidence.map((row) => Object.freeze(row.slice())),
    ),
    sourceQuadrilateral: quadrilateral,
    orientationDegrees,
    inverted,
    blackReference,
    whiteReference,
    threshold,
    meanModuleConfidence,
    imageQuality,
    blurEstimate,
    perspectiveEstimateDegrees:
      calculatePerspectiveEstimateDegrees(quadrilateral),
    scores,
  });
}

function sampleModule(
  image: GrayscaleImage,
  homography: ReturnType<typeof buildHomography>,
  moduleX: number,
  moduleY: number,
  samplesPerModule: number,
): ModuleStatistics {
  const values: number[] = [];
  for (let sampleY = 0; sampleY < samplesPerModule; sampleY += 1) {
    for (let sampleX = 0; sampleX < samplesPerModule; sampleX += 1) {
      const x = moduleX + 0.2 + ((sampleX + 0.5) * 0.6) / samplesPerModule;
      const y = moduleY + 0.2 + ((sampleY + 0.5) * 0.6) / samplesPerModule;
      const point = project(homography, x, y);
      values.push(sampleBilinear(image, point.x, point.y));
    }
  }
  values.sort((left, right) => left - right);
  const trim = Math.floor(values.length * 0.1);
  const retained = values.slice(trim, values.length - trim);
  const intensity =
    retained.reduce((sum, value) => sum + value, 0) / retained.length;
  const deviation = Math.sqrt(
    retained.reduce(
      (sum, value) => sum + (value - intensity) * (value - intensity),
      0,
    ) / retained.length,
  );
  return Object.freeze({ intensity, deviation });
}

function referenceCoordinates(sizeId: SizeId): {
  readonly black: readonly Coordinate[];
  readonly white: readonly Coordinate[];
} {
  const size = getSymbolSize(sizeId);
  const black: Coordinate[] = [];
  const white: Coordinate[] = [];
  for (let y = 0; y < size.anchorSize; y += 1) {
    for (let x = 0; x < size.anchorSize; x += 1) {
      (anchorModule(size, x, y) ? black : white).push({ x, y });
    }
  }
  for (let x = size.anchorSize; x < size.width; x += 1) {
    (topClockingModule(size, x) ? black : white).push({ x, y: 0 });
  }
  for (let y = size.anchorSize; y < size.height; y += 1) {
    (leftClockingModule(size, y) ? black : white).push({ x: 0, y });
  }
  return Object.freeze({
    black: Object.freeze(black),
    white: Object.freeze(white),
  });
}

function calculateScores(
  modules: readonly (readonly boolean[])[],
  confidence: readonly (readonly number[])[],
  sizeId: SizeId,
  contrast: number,
  quadrilateral: SourceQuadrilateral,
): VisionScores {
  const size = getSymbolSize(sizeId);
  const anchor: Coordinate[] = [];
  const cutout: Coordinate[] = [];
  for (let y = 0; y < size.anchorSize; y += 1) {
    for (let x = 0; x < size.anchorSize; x += 1) {
      anchor.push({ x, y });
      if (x >= size.anchorSize / 2 && y >= size.anchorSize / 2) {
        cutout.push({ x, y });
      }
    }
  }
  const top = Array.from(
    { length: size.width - size.anchorSize },
    (_, index) => ({ x: size.anchorSize + index, y: 0 }),
  );
  const left = Array.from(
    { length: size.height - size.anchorSize },
    (_, index) => ({ x: 0, y: size.anchorSize + index }),
  );
  const anchorScore = agreement(modules, confidence, anchor, ({ x, y }) =>
    anchorModule(size, x, y),
  );
  const cutoutScore = agreement(modules, confidence, cutout, () => false);
  const topClock = agreement(modules, confidence, top, ({ x }) =>
    topClockingModule(size, x),
  );
  const leftClock = agreement(modules, confidence, left, ({ y }) =>
    leftClockingModule(size, y),
  );
  const contrastScore = clamp01(contrast / 128);
  const geometry = geometryScore(quadrilateral);
  return Object.freeze({
    anchor: anchorScore,
    anchorCutout: cutoutScore,
    topClock,
    leftClock,
    contrast: contrastScore,
    geometry,
    combined:
      anchorScore * 0.25 +
      cutoutScore * 0.1 +
      topClock * 0.2 +
      leftClock * 0.2 +
      contrastScore * 0.15 +
      geometry * 0.1,
  });
}

function agreement(
  modules: readonly (readonly boolean[])[],
  confidence: readonly (readonly number[])[],
  coordinates: readonly Coordinate[],
  expected: (coordinate: Coordinate) => boolean,
): number {
  let correct = 0;
  let weight = 0;
  for (const coordinate of coordinates) {
    const value = confidence[coordinate.y]![coordinate.x]!;
    weight += value;
    if (modules[coordinate.y]![coordinate.x] === expected(coordinate)) {
      correct += value;
    }
  }
  return weight === 0 ? 0 : correct / weight;
}

function orientQuadrilateral(
  quadrilateral: SourceQuadrilateral,
  orientation: OrientationDegrees,
): SourceQuadrilateral {
  const offset = orientation / 90;
  return Object.freeze([
    quadrilateral[offset % 4]!,
    quadrilateral[(offset + 1) % 4]!,
    quadrilateral[(offset + 2) % 4]!,
    quadrilateral[(offset + 3) % 4]!,
  ]);
}

function geometryScore(quadrilateral: SourceQuadrilateral): number {
  const edges = quadrilateral.map((point, index) =>
    distance(point, quadrilateral[(index + 1) % 4]!),
  );
  const horizontalBalance =
    Math.min(edges[0]!, edges[2]!) / Math.max(edges[0]!, edges[2]!);
  const verticalBalance =
    Math.min(edges[1]!, edges[3]!) / Math.max(edges[1]!, edges[3]!);
  return clamp01((horizontalBalance + verticalBalance) / 2);
}

function calculatePerspectiveEstimateDegrees(
  quadrilateral: SourceQuadrilateral,
): number {
  const angles = quadrilateral.map((point, index) => {
    const previous = quadrilateral[(index + 3) % 4]!;
    const next = quadrilateral[(index + 1) % 4]!;
    const ax = previous.x - point.x;
    const ay = previous.y - point.y;
    const bx = next.x - point.x;
    const by = next.y - point.y;
    const cosine =
      (ax * bx + ay * by) /
      Math.max(1e-12, Math.hypot(ax, ay) * Math.hypot(bx, by));
    return (Math.acos(Math.max(-1, Math.min(1, cosine))) * 180) / Math.PI;
  });
  return (
    angles.reduce((sum, angle) => sum + Math.abs(90 - angle), 0) / angles.length
  );
}

function distance(
  left: { readonly x: number; readonly y: number },
  right: { readonly x: number; readonly y: number },
): number {
  return Math.hypot(right.x - left.x, right.y - left.y);
}

function median(values: readonly number[]): number {
  const sorted = [...values].sort((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? (sorted[middle - 1]! + sorted[middle]!) / 2
    : sorted[middle]!;
}

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}
