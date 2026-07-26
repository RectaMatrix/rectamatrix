import type { Coordinate, MaskId } from "./types.js";

export function maskCondition(maskId: MaskId, x: number, y: number): boolean {
  if (!Number.isInteger(x) || !Number.isInteger(y) || x < 0 || y < 0) {
    throw new RangeError("Mask coordinates must be non-negative integers.");
  }
  const runtimeMaskId: number = maskId;
  if (runtimeMaskId === 0) return (x + y) % 2 === 0;
  if (runtimeMaskId === 1) return y % 2 === 0;
  if (runtimeMaskId === 2) return x % 3 === 0;
  if (runtimeMaskId === 3) return (x + 2 * y) % 3 === 0;
  throw new RangeError(`Unsupported Mask ID: ${String(maskId)}.`);
}

export function applyBodyMask(
  bits: readonly boolean[],
  coordinates: readonly Coordinate[],
  maskId: MaskId,
): readonly boolean[] {
  if (bits.length !== coordinates.length) {
    throw new RangeError(
      "Body bit count and Body coordinate count must be identical.",
    );
  }
  return Object.freeze(
    bits.map(
      (bit, index) =>
        bit !==
        maskCondition(maskId, coordinates[index]!.x, coordinates[index]!.y),
    ),
  );
}
