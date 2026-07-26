import type { RECTAMATRIX_SIZES } from "./generated/spec-constants.js";

export type SizeId = 0 | 1 | 2 | 3 | 4 | 5 | 6;
export type EccLevel = "low" | "medium" | "high";
export type CompressionMode = "none" | "rm-lz1";
export type PayloadType = "binary" | "utf8";
export type MaskId = 0 | 1 | 2 | 3;
export type SymbolSize = (typeof RECTAMATRIX_SIZES)[number];

export interface Coordinate {
  readonly x: number;
  readonly y: number;
}

export type BooleanMatrix = readonly (readonly boolean[])[];
export type ConfidenceMatrix = readonly (readonly number[])[];

export interface SampledSymbol {
  readonly modules: BooleanMatrix;
  readonly confidence?: ConfidenceMatrix;
}
