import {
  CALCULATED_CAPACITIES,
  HEADER_BITS,
  RECTAMATRIX_SIZES,
} from "./generated/spec-constants.js";
import type { BooleanMatrix, Coordinate, SizeId, SymbolSize } from "./types.js";

export function getSymbolSize(sizeId: SizeId): SymbolSize {
  const sizes: readonly (SymbolSize | undefined)[] = RECTAMATRIX_SIZES;
  const size = sizes[sizeId];
  if (size === undefined || size.sizeId !== sizeId) {
    throw new RangeError(`Unsupported RectaMatrix size ID: ${String(sizeId)}`);
  }
  return size;
}

export function isReservedModule(
  size: SymbolSize,
  x: number,
  y: number,
): boolean {
  assertCoordinate(size, x, y);
  return (x < size.anchorSize && y < size.anchorSize) || x === 0 || y === 0;
}

export function anchorModule(size: SymbolSize, x: number, y: number): boolean {
  if (
    !Number.isInteger(x) ||
    !Number.isInteger(y) ||
    x < 0 ||
    y < 0 ||
    x >= size.anchorSize ||
    y >= size.anchorSize
  ) {
    throw new RangeError("Anchor coordinate is outside the Micro-Anchor.");
  }
  const half = size.anchorSize / 2;
  return !(x >= half && y >= half);
}

export function topClockingModule(size: SymbolSize, x: number): boolean {
  if (!Number.isInteger(x) || x < size.anchorSize || x >= size.width) {
    throw new RangeError("Top clocking coordinate is outside its range.");
  }
  return (x - size.anchorSize) % 2 === 0;
}

export function leftClockingModule(size: SymbolSize, y: number): boolean {
  if (!Number.isInteger(y) || y < size.anchorSize || y >= size.height) {
    throw new RangeError("Left clocking coordinate is outside its range.");
  }
  return (y - size.anchorSize) % 2 === 0;
}

export function createReservedMap(size: SymbolSize): BooleanMatrix {
  return Object.freeze(
    Array.from({ length: size.height }, (_, y) =>
      Object.freeze(
        Array.from({ length: size.width }, (_, x) =>
          isReservedModule(size, x, y),
        ),
      ),
    ),
  );
}

export function createFixedPatternMatrix(size: SymbolSize): BooleanMatrix {
  const matrix = Array.from({ length: size.height }, () =>
    Array.from({ length: size.width }, () => false),
  );

  for (let y = 0; y < size.anchorSize; y += 1) {
    for (let x = 0; x < size.anchorSize; x += 1) {
      matrix[y]![x] = anchorModule(size, x, y);
    }
  }
  for (let x = size.anchorSize; x < size.width; x += 1) {
    matrix[0]![x] = topClockingModule(size, x);
  }
  for (let y = size.anchorSize; y < size.height; y += 1) {
    matrix[y]![0] = leftClockingModule(size, y);
  }

  return Object.freeze(matrix.map((row) => Object.freeze(row)));
}

export function buildScanOrder(size: SymbolSize): readonly Coordinate[] {
  const cells: Coordinate[] = [];
  let upward = true;

  for (let right = size.width - 1; right >= 1; right -= 2) {
    const left = right - 1;
    if (upward) {
      for (let y = size.height - 1; y >= 0; y -= 1) {
        appendIfAccessible(cells, size, right, y);
        appendIfAccessible(cells, size, left, y);
      }
    } else {
      for (let y = 0; y < size.height; y += 1) {
        appendIfAccessible(cells, size, right, y);
        appendIfAccessible(cells, size, left, y);
      }
    }
    upward = !upward;
  }

  return Object.freeze(cells);
}

export function calculateAccessibleModules(size: SymbolSize): number {
  return (
    size.width * size.height -
    size.anchorSize ** 2 -
    size.width -
    size.height +
    2 * size.anchorSize
  );
}

export function calculateBodyBits(size: SymbolSize): number {
  return calculateAccessibleModules(size) - HEADER_BITS;
}

export function maximumCodewordBytes(size: SymbolSize): number {
  return Math.floor((calculateBodyBits(size) - 1) / 8);
}

export function getCalculatedCapacity(sizeId: SizeId) {
  return CALCULATED_CAPACITIES[sizeId];
}

function appendIfAccessible(
  cells: Coordinate[],
  size: SymbolSize,
  x: number,
  y: number,
): void {
  if (!isReservedModule(size, x, y)) {
    cells.push(Object.freeze({ x, y }));
  }
}

function assertCoordinate(size: SymbolSize, x: number, y: number): void {
  if (
    !Number.isInteger(x) ||
    !Number.isInteger(y) ||
    x < 0 ||
    y < 0 ||
    x >= size.width ||
    y >= size.height
  ) {
    throw new RangeError(`Coordinate (${String(x)}, ${String(y)}) is invalid.`);
  }
}
