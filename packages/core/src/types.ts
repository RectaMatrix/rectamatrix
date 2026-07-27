import type { RECTAMATRIX_SIZES } from "./generated/spec-constants.js";

export type SizeId =
  | 0
  | 1
  | 2
  | 3
  | 4
  | 5
  | 6
  | 7
  | 8
  | 9
  | 10
  | 11
  | 12
  | 13
  | 14
  | 15
  | 16
  | 17
  | 18
  | 19
  | 20
  | 21
  | 22
  | 23
  | 24
  | 25
  | 26
  | 27
  | 28
  | 29;
export type EccLevel = "low" | "medium" | "high";
export type CompressionMode = "none" | "rm-hle1" | "rm-lz1";
export type PayloadType = "binary" | "utf8";
export type MaskId = 0 | 1 | 2 | 3;
export type IntegrityProfile = "crc32c";
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
