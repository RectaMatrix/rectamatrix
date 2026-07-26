import { RECTAMATRIX_SIZES, type SymbolSize } from "@rectamatrix/core";
import {
  DetectorInputError,
  otsuThreshold,
  type GrayscaleImage,
} from "./image.js";
import type { SourceQuadrilateral } from "./types.js";

const SYMBOL_ASPECT_RATIO = 1.5;
const MINIMUM_SYMBOL_SHORT_SIDE_MODULES = 16;
const DEFAULT_MINIMUM_MODULE_PIXELS = 3;
const DEFAULT_MAXIMUM_CANDIDATES = 48;

export interface SceneSearchOptions {
  readonly minimumModulePixels?: number;
  readonly maximumCandidates?: number;
  readonly tryInverted?: boolean;
}

interface Interval {
  readonly start: number;
  readonly end: number;
}

interface PixelRegion {
  readonly left: number;
  readonly top: number;
  readonly right: number;
  readonly bottom: number;
  readonly darkPixels: number;
  readonly corners: SourceQuadrilateral;
}

interface RankedQuadrilateral {
  readonly quadrilateral: SourceQuadrilateral;
  readonly rank: number;
}

export function detectSceneQuadrilaterals(
  image: GrayscaleImage,
  options: SceneSearchOptions = {},
): readonly SourceQuadrilateral[] {
  const minimumModulePixels =
    options.minimumModulePixels ?? DEFAULT_MINIMUM_MODULE_PIXELS;
  const maximumCandidates =
    options.maximumCandidates ?? DEFAULT_MAXIMUM_CANDIDATES;
  validateSceneSearchOptions(minimumModulePixels, maximumCandidates);

  const polarities = options.tryInverted === true ? [false, true] : [false];
  const ranked: RankedQuadrilateral[] = [];
  for (const brightForeground of polarities) {
    const masks = [
      createGlobalForegroundMask(image, brightForeground),
      createAdaptiveForegroundMask(image, brightForeground),
    ];
    for (const foreground of masks) {
      const regions = locateRegions(image, foreground, minimumModulePixels);
      for (const region of regions) {
        ranked.push(
          ...createRegionHypotheses(image, region, minimumModulePixels),
        );
      }
      if (!regions.some(hasPlausibleSymbolAspect)) {
        ranked.push(
          ...locateFixedPatternHypotheses(
            image,
            foreground,
            minimumModulePixels,
          ),
        );
      }
    }
  }

  ranked.sort((left, right) => left.rank - right.rank);
  const unique = new Map<string, SourceQuadrilateral>();
  for (const { quadrilateral } of ranked) {
    const key = quadrilateral
      .map(({ x, y }) => `${x.toFixed(3)},${y.toFixed(3)}`)
      .join(";");
    if (!unique.has(key)) unique.set(key, quadrilateral);
    if (unique.size >= maximumCandidates) break;
  }
  return Object.freeze([...unique.values()]);
}

function hasPlausibleSymbolAspect(region: PixelRegion): boolean {
  const ratio =
    (region.right - region.left) / Math.max(1, region.bottom - region.top);
  return (
    Math.min(
      Math.abs(ratio - SYMBOL_ASPECT_RATIO),
      Math.abs(ratio - 1 / SYMBOL_ASPECT_RATIO),
    ) <= 0.18
  );
}

function locateFixedPatternHypotheses(
  image: GrayscaleImage,
  foreground: Uint8Array,
  minimumModulePixels: number,
): readonly RankedQuadrilateral[] {
  const maximumProbes = 300_000;
  let probes = 0;
  const hypotheses: RankedQuadrilateral[] = [];

  outer: for (const size of RECTAMATRIX_SIZES) {
    for (const orientation of [0, 90, 180, 270] as const) {
      const rotated = orientation === 90 || orientation === 270;
      const moduleWidth = rotated ? size.height : size.width;
      const moduleHeight = rotated ? size.width : size.height;
      const maximumScale = Math.min(
        16,
        Math.floor(image.width / moduleWidth),
        Math.floor(image.height / moduleHeight),
      );
      for (let scale = minimumModulePixels; scale <= maximumScale; scale += 1) {
        const width = moduleWidth * scale;
        const height = moduleHeight * scale;
        const step = Math.max(1, Math.floor(scale / 2));
        for (let top = 0; top + height <= image.height; top += step) {
          for (let left = 0; left + width <= image.width; left += step) {
            probes += 1;
            if (probes > maximumProbes) break outer;
            const score = fixedPatternProbeScore(
              foreground,
              image.width,
              left,
              top,
              scale,
              size,
              orientation,
            );
            if (score < 0.84) continue;
            const refined = refineFixedPatternOrigin(
              foreground,
              image.width,
              image.height,
              left,
              top,
              step,
              scale,
              size,
              orientation,
            );
            hypotheses.push(
              Object.freeze({
                quadrilateral: rectangle(
                  image,
                  refined.left,
                  refined.top,
                  refined.left + width,
                  refined.top + height,
                ),
                rank: -score + scale * 0.000_001,
              }),
            );
          }
        }
      }
    }
  }

  hypotheses.sort((left, right) => left.rank - right.rank);
  const separated: RankedQuadrilateral[] = [];
  for (const hypothesis of hypotheses) {
    if (
      separated.some(
        ({ quadrilateral }) =>
          rectangleIntersectionOverUnion(
            hypothesis.quadrilateral,
            quadrilateral,
          ) > 0.8,
      )
    ) {
      continue;
    }
    separated.push(hypothesis);
    if (separated.length >= 32) break;
  }
  return Object.freeze(separated);
}

function refineFixedPatternOrigin(
  foreground: Uint8Array,
  imageWidth: number,
  imageHeight: number,
  initialLeft: number,
  initialTop: number,
  radius: number,
  scale: number,
  size: SymbolSize,
  orientation: 0 | 90 | 180 | 270,
): { readonly left: number; readonly top: number } {
  const rotated = orientation === 90 || orientation === 270;
  const width = (rotated ? size.height : size.width) * scale;
  const height = (rotated ? size.width : size.height) * scale;
  const estimated = estimateOriginFromAnchorExtrema(
    foreground,
    imageWidth,
    imageHeight,
    initialLeft,
    initialTop,
    width,
    height,
    size.anchorSize * scale,
    radius,
    orientation,
  );
  let best = {
    left: estimated.left,
    top: estimated.top,
    score: Number.NEGATIVE_INFINITY,
  };
  const fineRadius = Math.min(1, radius);
  for (let dy = -fineRadius; dy <= fineRadius; dy += 1) {
    const top = estimated.top + dy;
    if (top < 0 || top + height > imageHeight) continue;
    for (let dx = -fineRadius; dx <= fineRadius; dx += 1) {
      const left = estimated.left + dx;
      if (left < 0 || left + width > imageWidth) continue;
      const score = anchorBoundaryScore(
        foreground,
        imageWidth,
        left,
        top,
        scale,
        size,
        orientation,
      );
      const displacement = Math.abs(dx) + Math.abs(dy);
      const bestDisplacement =
        Math.abs(best.left - estimated.left) +
        Math.abs(best.top - estimated.top);
      if (
        score > best.score ||
        (score === best.score && displacement < bestDisplacement)
      ) {
        best = { left, top, score };
      }
    }
  }
  return Object.freeze({ left: best.left, top: best.top });
}

function estimateOriginFromAnchorExtrema(
  foreground: Uint8Array,
  imageWidth: number,
  imageHeight: number,
  left: number,
  top: number,
  width: number,
  height: number,
  anchorPixels: number,
  radius: number,
  orientation: 0 | 90 | 180 | 270,
): { readonly left: number; readonly top: number } {
  const anchorLeft =
    orientation === 90 || orientation === 180
      ? left + width - anchorPixels
      : left;
  const anchorTop =
    orientation === 180 || orientation === 270
      ? top + height - anchorPixels
      : top;
  const startX = Math.max(0, Math.floor(anchorLeft - radius));
  const endX = Math.min(
    imageWidth - 1,
    Math.ceil(anchorLeft + anchorPixels + radius),
  );
  const startY = Math.max(0, Math.floor(anchorTop - radius));
  const endY = Math.min(
    imageHeight - 1,
    Math.ceil(anchorTop + anchorPixels + radius),
  );
  let minimumX = imageWidth;
  let minimumY = imageHeight;
  let maximumX = -1;
  let maximumY = -1;
  for (let y = startY; y <= endY; y += 1) {
    for (let x = startX; x <= endX; x += 1) {
      if (foreground[y * imageWidth + x] === 0) continue;
      minimumX = Math.min(minimumX, x);
      minimumY = Math.min(minimumY, y);
      maximumX = Math.max(maximumX, x);
      maximumY = Math.max(maximumY, y);
    }
  }
  if (maximumX < minimumX || maximumY < minimumY) {
    return Object.freeze({ left, top });
  }
  if (orientation === 90) {
    return Object.freeze({
      left: maximumX + 1 - width,
      top: minimumY,
    });
  }
  if (orientation === 180) {
    return Object.freeze({
      left: maximumX + 1 - width,
      top: maximumY + 1 - height,
    });
  }
  if (orientation === 270) {
    return Object.freeze({
      left: minimumX,
      top: maximumY + 1 - height,
    });
  }
  return Object.freeze({ left: minimumX, top: minimumY });
}

function anchorBoundaryScore(
  foreground: Uint8Array,
  imageWidth: number,
  left: number,
  top: number,
  scale: number,
  size: SymbolSize,
  orientation: 0 | 90 | 180 | 270,
): number {
  let correct = 0;
  let count = 0;
  const probe = (moduleX: number, moduleY: number, expected: boolean): void => {
    const point = orientModuleCenter(
      left,
      top,
      scale,
      size,
      orientation,
      moduleX,
      moduleY,
    );
    const actual =
      foreground[Math.floor(point.y) * imageWidth + Math.floor(point.x)] !== 0;
    if (actual === expected) correct += 1;
    count += 1;
  };
  for (let index = 0; index < size.anchorSize; index += 1) {
    const position = index + 0.5;
    probe(position, 0.2, true);
    probe(position, -0.2, false);
    probe(0.2, position, true);
    probe(-0.2, position, false);
  }
  return correct / count;
}

function fixedPatternProbeScore(
  foreground: Uint8Array,
  imageWidth: number,
  left: number,
  top: number,
  scale: number,
  size: SymbolSize,
  orientation: 0 | 90 | 180 | 270,
): number {
  let anchorCorrect = 0;
  let anchorCount = 0;
  let clockCorrect = 0;
  let clockCount = 0;
  const probe = (
    moduleX: number,
    moduleY: number,
    expected: boolean,
    anchor: boolean,
  ): void => {
    const point = orientModuleCenter(
      left,
      top,
      scale,
      size,
      orientation,
      moduleX,
      moduleY,
    );
    const actual =
      foreground[Math.floor(point.y) * imageWidth + Math.floor(point.x)] !== 0;
    if (anchor) {
      if (actual === expected) anchorCorrect += 1;
      anchorCount += 1;
    } else {
      if (actual === expected) clockCorrect += 1;
      clockCount += 1;
    }
  };

  for (let y = 0; y < size.anchorSize; y += 1) {
    for (let x = 0; x < size.anchorSize; x += 1) {
      const half = size.anchorSize / 2;
      probe(x, y, !(x >= half && y >= half), true);
    }
  }
  const topChecks = Math.min(12, size.width - size.anchorSize);
  for (let offset = 0; offset < topChecks; offset += 1) {
    probe(size.anchorSize + offset, 0, offset % 2 === 0, false);
  }
  const leftChecks = Math.min(12, size.height - size.anchorSize);
  for (let offset = 0; offset < leftChecks; offset += 1) {
    probe(0, size.anchorSize + offset, offset % 2 === 0, false);
  }
  return (
    (anchorCorrect / anchorCount) * 0.8 +
    (clockCorrect / Math.max(1, clockCount)) * 0.2
  );
}

function orientModuleCenter(
  left: number,
  top: number,
  scale: number,
  size: SymbolSize,
  orientation: 0 | 90 | 180 | 270,
  moduleX: number,
  moduleY: number,
): { readonly x: number; readonly y: number } {
  if (orientation === 90) {
    return {
      x: left + (size.height - moduleY - 0.5) * scale,
      y: top + (moduleX + 0.5) * scale,
    };
  }
  if (orientation === 180) {
    return {
      x: left + (size.width - moduleX - 0.5) * scale,
      y: top + (size.height - moduleY - 0.5) * scale,
    };
  }
  if (orientation === 270) {
    return {
      x: left + (moduleY + 0.5) * scale,
      y: top + (size.width - moduleX - 0.5) * scale,
    };
  }
  return {
    x: left + (moduleX + 0.5) * scale,
    y: top + (moduleY + 0.5) * scale,
  };
}

function rectangleIntersectionOverUnion(
  left: SourceQuadrilateral,
  right: SourceQuadrilateral,
): number {
  const intersectionWidth = Math.max(
    0,
    Math.min(left[2].x, right[2].x) - Math.max(left[0].x, right[0].x),
  );
  const intersectionHeight = Math.max(
    0,
    Math.min(left[2].y, right[2].y) - Math.max(left[0].y, right[0].y),
  );
  const intersection = intersectionWidth * intersectionHeight;
  const leftArea = (left[2].x - left[0].x) * (left[2].y - left[0].y);
  const rightArea = (right[2].x - right[0].x) * (right[2].y - right[0].y);
  return intersection / Math.max(1, leftArea + rightArea - intersection);
}

function locateRegions(
  image: GrayscaleImage,
  foreground: Uint8Array,
  minimumModulePixels: number,
): readonly PixelRegion[] {
  const regions = [
    ...locateConnectedRegions(image, foreground, minimumModulePixels),
    ...locateProjectionRegions(image, foreground, minimumModulePixels),
  ];
  const unique = new Map<string, PixelRegion>();
  for (const region of regions) {
    const key = [region.left, region.top, region.right, region.bottom].join(
      ",",
    );
    if (!unique.has(key)) unique.set(key, region);
  }
  return Object.freeze([...unique.values()]);
}

function locateProjectionRegions(
  image: GrayscaleImage,
  foreground: Uint8Array,
  minimumModulePixels: number,
): readonly PixelRegion[] {
  const occupiedRows = new Uint8Array(image.height);
  const rowCounts = new Uint32Array(image.height);
  for (let y = 0; y < image.height; y += 1) {
    const offset = y * image.width;
    for (let x = 0; x < image.width; x += 1) {
      if (foreground[offset + x] !== 0) {
        occupiedRows[y] = 1;
        rowCounts[y]! += 1;
      }
    }
  }

  const maximumGap = Math.max(
    3,
    Math.min(24, Math.floor(Math.min(image.width, image.height) * 0.025)),
  );
  const rowIntervals = mergeOccupiedIntervals(occupiedRows, maximumGap);
  const minimumShortSide =
    MINIMUM_SYMBOL_SHORT_SIDE_MODULES * minimumModulePixels;
  const regions: PixelRegion[] = [];

  for (const rows of rowIntervals) {
    if (rows.end - rows.start + 1 < minimumShortSide) continue;
    const occupiedColumns = new Uint8Array(image.width);
    for (let y = rows.start; y <= rows.end; y += 1) {
      if (rowCounts[y] === 0) continue;
      const offset = y * image.width;
      for (let x = 0; x < image.width; x += 1) {
        if (foreground[offset + x] !== 0) {
          occupiedColumns[x] = 1;
        }
      }
    }
    for (const columns of mergeOccupiedIntervals(occupiedColumns, maximumGap)) {
      const width = columns.end - columns.start + 1;
      const height = rows.end - rows.start + 1;
      if (Math.min(width, height) < minimumShortSide) continue;
      const region = measureRegion(image, foreground, columns, rows);
      if (
        region !== undefined &&
        region.darkPixels >= minimumShortSide * minimumModulePixels
      ) {
        regions.push(region);
      }
    }
  }
  return Object.freeze(regions);
}

function locateConnectedRegions(
  image: GrayscaleImage,
  foreground: Uint8Array,
  minimumModulePixels: number,
): readonly PixelRegion[] {
  const cellSize = minimumModulePixels;
  const columns = Math.ceil(image.width / cellSize);
  const rows = Math.ceil(image.height / cellSize);
  const cells = columns * rows;
  const occupancy = new Uint16Array(cells);
  for (let y = 0; y < image.height; y += 1) {
    const pixelOffset = y * image.width;
    const cellOffset = Math.floor(y / cellSize) * columns;
    for (let x = 0; x < image.width; x += 1) {
      if (foreground[pixelOffset + x] !== 0) {
        occupancy[cellOffset + Math.floor(x / cellSize)]! += 1;
      }
    }
  }

  const connected = new Uint8Array(cells);
  for (let cellY = 0; cellY < rows; cellY += 1) {
    for (let cellX = 0; cellX < columns; cellX += 1) {
      const index = cellY * columns + cellX;
      if (occupancy[index]! < 2) continue;
      for (let dy = -1; dy <= 1; dy += 1) {
        const targetY = cellY + dy;
        if (targetY < 0 || targetY >= rows) continue;
        for (let dx = -1; dx <= 1; dx += 1) {
          const targetX = cellX + dx;
          if (targetX < 0 || targetX >= columns) continue;
          connected[targetY * columns + targetX] = 1;
        }
      }
    }
  }

  const visited = new Uint8Array(cells);
  const queue = new Int32Array(cells);
  const minimumShortSide =
    MINIMUM_SYMBOL_SHORT_SIDE_MODULES * minimumModulePixels;
  const regions: PixelRegion[] = [];
  for (let start = 0; start < cells; start += 1) {
    if (connected[start] === 0 || visited[start] !== 0) continue;
    let head = 0;
    let tail = 0;
    queue[tail++] = start;
    visited[start] = 1;
    let leftCell = columns;
    let topCell = rows;
    let rightCell = -1;
    let bottomCell = -1;
    let occupiedCells = 0;

    while (head < tail) {
      const index = queue[head++]!;
      const cellY = Math.floor(index / columns);
      const cellX = index - cellY * columns;
      leftCell = Math.min(leftCell, cellX);
      topCell = Math.min(topCell, cellY);
      rightCell = Math.max(rightCell, cellX);
      bottomCell = Math.max(bottomCell, cellY);
      if (occupancy[index]! >= 2) occupiedCells += 1;
      for (let dy = -1; dy <= 1; dy += 1) {
        const targetY = cellY + dy;
        if (targetY < 0 || targetY >= rows) continue;
        for (let dx = -1; dx <= 1; dx += 1) {
          const targetX = cellX + dx;
          if (targetX < 0 || targetX >= columns) continue;
          const target = targetY * columns + targetX;
          if (connected[target] === 0 || visited[target] !== 0) continue;
          visited[target] = 1;
          queue[tail++] = target;
        }
      }
    }

    const left = Math.max(0, leftCell * cellSize);
    const top = Math.max(0, topCell * cellSize);
    const right = Math.min(image.width, (rightCell + 1) * cellSize);
    const bottom = Math.min(image.height, (bottomCell + 1) * cellSize);
    if (
      Math.min(right - left, bottom - top) < minimumShortSide ||
      occupiedCells * cellSize * cellSize <
        minimumShortSide * minimumModulePixels
    ) {
      continue;
    }
    const region = measureRegion(
      image,
      foreground,
      Object.freeze({ start: left, end: right - 1 }),
      Object.freeze({ start: top, end: bottom - 1 }),
    );
    if (region !== undefined) regions.push(region);
  }
  return Object.freeze(regions);
}

function measureRegion(
  image: GrayscaleImage,
  foreground: Uint8Array,
  columns: Interval,
  rows: Interval,
): PixelRegion | undefined {
  let left = image.width;
  let top = image.height;
  let right = -1;
  let bottom = -1;
  let darkPixels = 0;
  let topLeft = { x: 0, y: 0, value: Number.POSITIVE_INFINITY };
  let topRight = { x: 0, y: 0, value: Number.NEGATIVE_INFINITY };
  let bottomRight = { x: 0, y: 0, value: Number.NEGATIVE_INFINITY };
  let bottomLeft = { x: 0, y: 0, value: Number.POSITIVE_INFINITY };

  for (let y = rows.start; y <= rows.end; y += 1) {
    const offset = y * image.width;
    for (let x = columns.start; x <= columns.end; x += 1) {
      if (foreground[offset + x] === 0) continue;
      darkPixels += 1;
      left = Math.min(left, x);
      top = Math.min(top, y);
      right = Math.max(right, x);
      bottom = Math.max(bottom, y);
      const sum = x + y;
      const difference = x - y;
      if (sum < topLeft.value) topLeft = { x, y, value: sum };
      if (difference > topRight.value) {
        topRight = { x, y, value: difference };
      }
      if (sum > bottomRight.value) bottomRight = { x, y, value: sum };
      if (difference < bottomLeft.value) {
        bottomLeft = { x, y, value: difference };
      }
    }
  }

  if (right < left || bottom < top) return undefined;
  return Object.freeze({
    left,
    top,
    right: right + 1,
    bottom: bottom + 1,
    darkPixels,
    corners: freezeQuadrilateral([
      { x: topLeft.x - 0.5, y: topLeft.y - 0.5 },
      { x: topRight.x + 0.5, y: topRight.y - 0.5 },
      { x: bottomRight.x + 0.5, y: bottomRight.y + 0.5 },
      { x: bottomLeft.x - 0.5, y: bottomLeft.y + 0.5 },
    ]),
  });
}

function createRegionHypotheses(
  image: GrayscaleImage,
  region: PixelRegion,
  minimumModulePixels: number,
): readonly RankedQuadrilateral[] {
  const width = region.right - region.left;
  const height = region.bottom - region.top;
  const minimumShortSide =
    MINIMUM_SYMBOL_SHORT_SIDE_MODULES * minimumModulePixels;
  if (Math.min(width, height) < minimumShortSide) return Object.freeze([]);

  const hypotheses: RankedQuadrilateral[] = [];
  for (const ratio of [SYMBOL_ASPECT_RATIO, 1 / SYMBOL_ASPECT_RATIO]) {
    const targetWidth = Math.max(width, height * ratio);
    const targetHeight = targetWidth / ratio;
    if (
      targetWidth > image.width * 1.05 ||
      targetHeight > image.height * 1.05
    ) {
      continue;
    }
    const horizontalSlack = targetWidth - width;
    const verticalSlack = targetHeight - height;
    for (const horizontalAlignment of [0, 0.5, 1]) {
      for (const verticalAlignment of [0, 0.5, 1]) {
        const left = region.left - horizontalSlack * horizontalAlignment;
        const top = region.top - verticalSlack * verticalAlignment;
        const quadrilateral = rectangle(
          image,
          left,
          top,
          left + targetWidth,
          top + targetHeight,
        );
        hypotheses.push(
          Object.freeze({
            quadrilateral,
            rank:
              Math.abs(width / height - ratio) +
              (horizontalAlignment === 0 ? 0 : 0.02) +
              (verticalAlignment === 0 ? 0 : 0.02),
          }),
        );
      }
    }
  }

  const cornerRatio = quadrilateralAspectRatio(region.corners);
  for (let anchorIndex = 0; anchorIndex < 4; anchorIndex += 1) {
    for (const expansion of [1.015, 1.03, 1.05]) {
      const clockExtended = extendClockEdges(
        image,
        region.corners,
        anchorIndex,
        expansion,
      );
      hypotheses.push(
        Object.freeze({
          quadrilateral: clockExtended,
          rank:
            0.06 +
            Math.min(
              Math.abs(cornerRatio - SYMBOL_ASPECT_RATIO),
              Math.abs(cornerRatio - 1 / SYMBOL_ASPECT_RATIO),
            ) +
            (expansion - 1),
        }),
      );
      for (const adjacentDirection of [-1, 1] as const) {
        hypotheses.push(
          Object.freeze({
            quadrilateral: extendOppositeCorner(
              image,
              clockExtended,
              anchorIndex,
              adjacentDirection,
              1.04,
            ),
            rank:
              0.075 +
              Math.min(
                Math.abs(cornerRatio - SYMBOL_ASPECT_RATIO),
                Math.abs(cornerRatio - 1 / SYMBOL_ASPECT_RATIO),
              ) +
              (expansion - 1),
          }),
        );
      }
    }
  }
  for (const expansion of [0.95, 0.97, 0.985, 1, 1.015, 1.03, 1.05]) {
    const quadrilateral = expandQuadrilateral(image, region.corners, expansion);
    hypotheses.push(
      Object.freeze({
        quadrilateral,
        rank:
          0.1 +
          Math.min(
            Math.abs(cornerRatio - SYMBOL_ASPECT_RATIO),
            Math.abs(cornerRatio - 1 / SYMBOL_ASPECT_RATIO),
          ) +
          Math.abs(expansion - 1),
      }),
    );
  }
  return Object.freeze(hypotheses);
}

function extendClockEdges(
  image: GrayscaleImage,
  quadrilateral: SourceQuadrilateral,
  anchorIndex: number,
  factor: number,
): SourceQuadrilateral {
  const anchor = quadrilateral[anchorIndex]!;
  const previousIndex = (anchorIndex + 3) % 4;
  const nextIndex = (anchorIndex + 1) % 4;
  return freezeQuadrilateral(
    quadrilateral.map((point, index) =>
      index === previousIndex || index === nextIndex
        ? clampPoint(
            image,
            anchor.x + (point.x - anchor.x) * factor,
            anchor.y + (point.y - anchor.y) * factor,
          )
        : point,
    ),
  );
}

function extendOppositeCorner(
  image: GrayscaleImage,
  quadrilateral: SourceQuadrilateral,
  anchorIndex: number,
  adjacentDirection: -1 | 1,
  factor: number,
): SourceQuadrilateral {
  const oppositeIndex = (anchorIndex + 2) % 4;
  const adjacentIndex = (anchorIndex + adjacentDirection + 4) % 4;
  const adjacent = quadrilateral[adjacentIndex]!;
  const opposite = quadrilateral[oppositeIndex]!;
  return freezeQuadrilateral(
    quadrilateral.map((point, index) =>
      index === oppositeIndex
        ? clampPoint(
            image,
            adjacent.x + (opposite.x - adjacent.x) * factor,
            adjacent.y + (opposite.y - adjacent.y) * factor,
          )
        : point,
    ),
  );
}

function mergeOccupiedIntervals(
  occupied: Uint8Array,
  maximumGap: number,
): readonly Interval[] {
  const intervals: Interval[] = [];
  let start = -1;
  let last = -1;
  for (let index = 0; index < occupied.length; index += 1) {
    if (occupied[index] === 0) continue;
    if (start < 0) {
      start = index;
      last = index;
      continue;
    }
    if (index - last - 1 > maximumGap) {
      intervals.push(Object.freeze({ start, end: last }));
      start = index;
    }
    last = index;
  }
  if (start >= 0) intervals.push(Object.freeze({ start, end: last }));
  return Object.freeze(intervals);
}

function createAdaptiveForegroundMask(
  image: GrayscaleImage,
  brightForeground: boolean,
): Uint8Array {
  const tileSize = Math.max(
    32,
    Math.min(96, Math.floor(Math.min(image.width, image.height) / 4)),
  );
  const raw = new Uint8Array(image.width * image.height);
  const histogram = new Uint32Array(256);

  for (let top = 0; top < image.height; top += tileSize) {
    const bottom = Math.min(image.height, top + tileSize);
    for (let left = 0; left < image.width; left += tileSize) {
      const right = Math.min(image.width, left + tileSize);
      histogram.fill(0);
      let count = 0;
      for (let y = top; y < bottom; y += 1) {
        const offset = y * image.width;
        for (let x = left; x < right; x += 1) {
          const value = Math.max(
            0,
            Math.min(255, Math.round(image.pixels[offset + x]!)),
          );
          histogram[value]! += 1;
          count += 1;
        }
      }
      const lower = histogramQuantile(histogram, count, 0.05);
      const median = histogramQuantile(histogram, count, 0.5);
      const upper = histogramQuantile(histogram, count, 0.95);
      const spread = upper - lower;
      const foregroundSeparation = brightForeground
        ? upper - median
        : median - lower;
      if (spread < 12 || foregroundSeparation < Math.max(12, spread * 0.65)) {
        continue;
      }
      const threshold = brightForeground
        ? (upper + median) / 2
        : (lower + median) / 2;
      for (let y = top; y < bottom; y += 1) {
        const offset = y * image.width;
        for (let x = left; x < right; x += 1) {
          const value = image.pixels[offset + x]!;
          if (brightForeground ? value >= threshold : value <= threshold) {
            raw[offset + x] = 1;
          }
        }
      }
    }
  }

  return removeIsolatedPixels(raw, image.width, image.height);
}

function createGlobalForegroundMask(
  image: GrayscaleImage,
  brightForeground: boolean,
): Uint8Array {
  const threshold = otsuThreshold(image);
  const raw = new Uint8Array(image.pixels.length);
  for (let index = 0; index < image.pixels.length; index += 1) {
    const value = image.pixels[index]!;
    if (brightForeground ? value > threshold : value <= threshold) {
      raw[index] = 1;
    }
  }
  return removeIsolatedPixels(raw, image.width, image.height);
}

function histogramQuantile(
  histogram: Uint32Array,
  count: number,
  quantile: number,
): number {
  const target = Math.max(1, Math.ceil(count * quantile));
  let accumulated = 0;
  for (let value = 0; value < histogram.length; value += 1) {
    accumulated += histogram[value]!;
    if (accumulated >= target) return value;
  }
  return 255;
}

function removeIsolatedPixels(
  source: Uint8Array,
  width: number,
  height: number,
): Uint8Array {
  const filtered = new Uint8Array(source.length);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const index = y * width + x;
      if (source[index] === 0) continue;
      let neighbors = 0;
      for (let dy = -1; dy <= 1; dy += 1) {
        const sampleY = y + dy;
        if (sampleY < 0 || sampleY >= height) continue;
        for (let dx = -1; dx <= 1; dx += 1) {
          const sampleX = x + dx;
          if (sampleX < 0 || sampleX >= width) continue;
          if (source[sampleY * width + sampleX] !== 0) neighbors += 1;
        }
      }
      if (neighbors >= 3) filtered[index] = 1;
    }
  }
  return filtered;
}

function rectangle(
  image: GrayscaleImage,
  left: number,
  top: number,
  right: number,
  bottom: number,
): SourceQuadrilateral {
  return freezeQuadrilateral([
    clampPoint(image, left, top),
    clampPoint(image, right, top),
    clampPoint(image, right, bottom),
    clampPoint(image, left, bottom),
  ]);
}

function expandQuadrilateral(
  image: GrayscaleImage,
  quadrilateral: SourceQuadrilateral,
  factor: number,
): SourceQuadrilateral {
  const center = {
    x:
      quadrilateral.reduce((sum, point) => sum + point.x, 0) /
      quadrilateral.length,
    y:
      quadrilateral.reduce((sum, point) => sum + point.y, 0) /
      quadrilateral.length,
  };
  return freezeQuadrilateral(
    quadrilateral.map((point) =>
      clampPoint(
        image,
        center.x + (point.x - center.x) * factor,
        center.y + (point.y - center.y) * factor,
      ),
    ),
  );
}

function clampPoint(
  image: GrayscaleImage,
  x: number,
  y: number,
): { readonly x: number; readonly y: number } {
  return Object.freeze({
    x: Math.max(-0.5, Math.min(image.width - 0.5, x)),
    y: Math.max(-0.5, Math.min(image.height - 0.5, y)),
  });
}

function quadrilateralAspectRatio(quadrilateral: SourceQuadrilateral): number {
  const horizontal =
    (distance(quadrilateral[0], quadrilateral[1]) +
      distance(quadrilateral[3], quadrilateral[2])) /
    2;
  const vertical =
    (distance(quadrilateral[1], quadrilateral[2]) +
      distance(quadrilateral[0], quadrilateral[3])) /
    2;
  return horizontal / Math.max(vertical, 1e-9);
}

function distance(
  left: { readonly x: number; readonly y: number },
  right: { readonly x: number; readonly y: number },
): number {
  return Math.hypot(right.x - left.x, right.y - left.y);
}

function freezeQuadrilateral(
  points: readonly { readonly x: number; readonly y: number }[],
): SourceQuadrilateral {
  return Object.freeze([
    Object.freeze({ ...points[0]! }),
    Object.freeze({ ...points[1]! }),
    Object.freeze({ ...points[2]! }),
    Object.freeze({ ...points[3]! }),
  ]);
}

function validateSceneSearchOptions(
  minimumModulePixels: number,
  maximumCandidates: number,
): void {
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
