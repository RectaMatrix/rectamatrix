import type {
  BooleanMatrix,
  EccLevel,
  MaskId,
  SizeId,
} from "@rectamatrix/core";

export type CompressionMode = "none" | "rm-hle1" | "rm-lz1" | "auto";

export interface EncodeOptions {
  readonly eccLevel?: EccLevel;
  readonly compression?: CompressionMode;
  readonly sizeId?: SizeId;
}

export interface EncodedSymbol {
  readonly version: 2;
  readonly sizeId: SizeId;
  readonly width: number;
  readonly height: number;
  readonly matrix: BooleanMatrix;
  readonly payloadType: "binary" | "utf8";
  readonly compression: "none" | "rm-hle1" | "rm-lz1";
  readonly eccLevel: EccLevel;
  readonly maskId: MaskId;
  readonly originalLength: number;
  readonly encodedLength: number;
}
