import type { BooleanMatrix, MaskId } from "./types.js";

const ANCHOR_LIKE_PATTERN = [
  true,
  false,
  true,
  true,
  true,
  false,
  true,
] as const;

export interface MaskPenalty {
  readonly runs: number;
  readonly blocks2x2: number;
  readonly anchorLikePatterns: number;
  readonly balance: number;
  readonly total: number;
}

export interface MaskCandidate {
  readonly maskId: MaskId;
  readonly matrix: BooleanMatrix;
}

export interface ScoredMaskCandidate extends MaskCandidate {
  readonly penalty: MaskPenalty;
}

export function calculateMaskPenalty(matrix: BooleanMatrix): MaskPenalty {
  const { width, height } = validateMatrix(matrix);
  const runs = calculateRunPenalty(matrix, width, height);
  const blocks2x2 = calculateBlockPenalty(matrix, width, height);
  const anchorLikePatterns = calculateAnchorLikePenalty(matrix, width, height);
  const balance = calculateBalancePenalty(matrix, width, height);
  return Object.freeze({
    runs,
    blocks2x2,
    anchorLikePatterns,
    balance,
    total: runs + blocks2x2 + anchorLikePatterns + balance,
  });
}

export function calculateRunPenalty(
  matrix: BooleanMatrix,
  width?: number,
  height?: number,
): number {
  const dimensions =
    width === undefined || height === undefined
      ? validateMatrix(matrix)
      : { width, height };
  let penalty = 0;

  for (let y = 0; y < dimensions.height; y += 1) {
    penalty += scoreRuns(matrix[y]!);
  }
  for (let x = 0; x < dimensions.width; x += 1) {
    penalty += scoreRuns(
      Array.from({ length: dimensions.height }, (_, y) => matrix[y]![x]!),
    );
  }
  return penalty;
}

export function calculateBlockPenalty(
  matrix: BooleanMatrix,
  width?: number,
  height?: number,
): number {
  const dimensions =
    width === undefined || height === undefined
      ? validateMatrix(matrix)
      : { width, height };
  let blocks = 0;
  for (let y = 0; y < dimensions.height - 1; y += 1) {
    for (let x = 0; x < dimensions.width - 1; x += 1) {
      const value = matrix[y]![x]!;
      if (
        matrix[y]![x + 1] === value &&
        matrix[y + 1]![x] === value &&
        matrix[y + 1]![x + 1] === value
      ) {
        blocks += 1;
      }
    }
  }
  return blocks * 3;
}

export function calculateAnchorLikePenalty(
  matrix: BooleanMatrix,
  width?: number,
  height?: number,
): number {
  const dimensions =
    width === undefined || height === undefined
      ? validateMatrix(matrix)
      : { width, height };
  let matches = 0;
  for (let y = 0; y < dimensions.height; y += 1) {
    matches += countAnchorLikeWindows(matrix[y]!);
  }
  for (let x = 0; x < dimensions.width; x += 1) {
    matches += countAnchorLikeWindows(
      Array.from({ length: dimensions.height }, (_, y) => matrix[y]![x]!),
    );
  }
  return matches * 20;
}

export function calculateBalancePenalty(
  matrix: BooleanMatrix,
  width?: number,
  height?: number,
): number {
  const dimensions =
    width === undefined || height === undefined
      ? validateMatrix(matrix)
      : { width, height };
  let blackModules = 0;
  for (const row of matrix) {
    for (const module of row) {
      if (module) blackModules += 1;
    }
  }
  const totalModules = dimensions.width * dimensions.height;
  const deviationSteps = Math.ceil(
    (Math.abs(2 * blackModules - totalModules) * 10) / totalModules,
  );
  return deviationSteps * 10;
}

export function selectBestMask(
  candidates: readonly MaskCandidate[],
): ScoredMaskCandidate {
  if (candidates.length !== 4) {
    throw new RangeError("Exactly four Mask candidates are required.");
  }
  const seen = new Set<MaskId>();
  let best: ScoredMaskCandidate | undefined;
  for (const candidate of candidates) {
    if (seen.has(candidate.maskId)) {
      throw new RangeError("Mask candidate IDs must be unique.");
    }
    seen.add(candidate.maskId);
    const scored = Object.freeze({
      ...candidate,
      penalty: calculateMaskPenalty(candidate.matrix),
    });
    if (
      best === undefined ||
      scored.penalty.total < best.penalty.total ||
      (scored.penalty.total === best.penalty.total &&
        scored.maskId < best.maskId)
    ) {
      best = scored;
    }
  }
  if (best === undefined) {
    throw new Error("Internal Mask selection failure.");
  }
  return best;
}

function scoreRuns(values: readonly boolean[]): number {
  if (values.length === 0) return 0;
  let penalty = 0;
  let runLength = 1;
  for (let index = 1; index <= values.length; index += 1) {
    if (index < values.length && values[index] === values[index - 1]) {
      runLength += 1;
    } else {
      if (runLength >= 5) penalty += 3 + (runLength - 5);
      runLength = 1;
    }
  }
  return penalty;
}

function countAnchorLikeWindows(values: readonly boolean[]): number {
  let matches = 0;
  for (
    let offset = 0;
    offset + ANCHOR_LIKE_PATTERN.length <= values.length;
    offset += 1
  ) {
    let direct = true;
    let inverse = true;
    for (let index = 0; index < ANCHOR_LIKE_PATTERN.length; index += 1) {
      if (values[offset + index] !== ANCHOR_LIKE_PATTERN[index]) {
        direct = false;
      }
      if (values[offset + index] === ANCHOR_LIKE_PATTERN[index]) {
        inverse = false;
      }
    }
    if (direct || inverse) matches += 1;
  }
  return matches;
}

function validateMatrix(matrix: BooleanMatrix): {
  readonly width: number;
  readonly height: number;
} {
  if (matrix.length === 0 || matrix[0] === undefined) {
    throw new RangeError("Mask scoring requires a non-empty matrix.");
  }
  const width = matrix[0].length;
  if (width === 0 || matrix.some((row) => row.length !== width)) {
    throw new RangeError("Mask scoring requires a rectangular matrix.");
  }
  return { width, height: matrix.length };
}
