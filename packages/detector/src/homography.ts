import type { ImagePoint, SourceQuadrilateral } from "./types.js";

export type Homography = readonly [
  number,
  number,
  number,
  number,
  number,
  number,
  number,
  number,
  number,
];

export function buildHomography(
  width: number,
  height: number,
  quadrilateral: SourceQuadrilateral,
): Homography {
  const source = [
    { x: 0, y: 0 },
    { x: width, y: 0 },
    { x: width, y: height },
    { x: 0, y: height },
  ] as const;
  const system = Array.from({ length: 8 }, () => Array<number>(9).fill(0));
  for (let index = 0; index < 4; index += 1) {
    const { x, y } = source[index]!;
    const target = quadrilateral[index]!;
    const row = index * 2;
    system[row] = [x, y, 1, 0, 0, 0, -target.x * x, -target.x * y, target.x];
    system[row + 1] = [
      0,
      0,
      0,
      x,
      y,
      1,
      -target.y * x,
      -target.y * y,
      target.y,
    ];
  }
  const solution = solve(system);
  return Object.freeze([...solution, 1]) as Homography;
}

export function project(
  homography: Homography,
  x: number,
  y: number,
): ImagePoint {
  const denominator = homography[6] * x + homography[7] * y + homography[8];
  if (Math.abs(denominator) < 1e-12) {
    throw new RangeError("Degenerate projective mapping.");
  }
  return Object.freeze({
    x: (homography[0] * x + homography[1] * y + homography[2]) / denominator,
    y: (homography[3] * x + homography[4] * y + homography[5]) / denominator,
  });
}

export function invertHomography(homography: Homography): Homography {
  const [a, b, c, d, e, f, g, h, i] = homography;
  const determinant =
    a * (e * i - f * h) - b * (d * i - f * g) + c * (d * h - e * g);
  if (Math.abs(determinant) < 1e-12) {
    throw new RangeError("Homography is not invertible.");
  }
  return Object.freeze([
    (e * i - f * h) / determinant,
    (c * h - b * i) / determinant,
    (b * f - c * e) / determinant,
    (f * g - d * i) / determinant,
    (a * i - c * g) / determinant,
    (c * d - a * f) / determinant,
    (d * h - e * g) / determinant,
    (b * g - a * h) / determinant,
    (a * e - b * d) / determinant,
  ]);
}

function solve(matrix: number[][]): readonly number[] {
  for (let column = 0; column < 8; column += 1) {
    let pivot = column;
    for (let row = column + 1; row < 8; row += 1) {
      if (Math.abs(matrix[row]![column]!) > Math.abs(matrix[pivot]![column]!)) {
        pivot = row;
      }
    }
    if (Math.abs(matrix[pivot]![column]!) < 1e-12) {
      throw new RangeError("Source quadrilateral is degenerate.");
    }
    [matrix[column], matrix[pivot]] = [matrix[pivot]!, matrix[column]!];
    const divisor = matrix[column]![column]!;
    for (let index = column; index <= 8; index += 1) {
      matrix[column]![index] = matrix[column]![index]! / divisor;
    }
    for (let row = 0; row < 8; row += 1) {
      if (row === column) continue;
      const factor = matrix[row]![column]!;
      for (let index = column; index <= 8; index += 1) {
        matrix[row]![index] =
          matrix[row]![index]! - factor * matrix[column]![index]!;
      }
    }
  }
  return Object.freeze(matrix.map((row) => row[8]!));
}
