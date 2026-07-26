import type {
  BooleanMatrix,
  ConfidenceMatrix,
  SizeId,
} from "@rectamatrix/core";
import type { DecodeResult } from "@rectamatrix/decoder";

export interface ImageDataLike {
  readonly width: number;
  readonly height: number;
  readonly data: ArrayLike<number>;
}

export interface ImagePoint {
  readonly x: number;
  readonly y: number;
}

export type SourceQuadrilateral = readonly [
  ImagePoint,
  ImagePoint,
  ImagePoint,
  ImagePoint,
];

export type OrientationDegrees = 0 | 90 | 180 | 270;

export interface DetectorOptions {
  readonly sourceQuadrilateral?: SourceQuadrilateral;
  readonly samplesPerModule?: 5 | 6 | 7 | 8 | 9;
  readonly tryInverted?: boolean;
  readonly maximumPixels?: number;
  readonly minimumModulePixels?: number;
  readonly maximumCandidates?: number;
}

export interface VisionScores {
  readonly anchor: number;
  readonly anchorCutout: number;
  readonly topClock: number;
  readonly leftClock: number;
  readonly contrast: number;
  readonly geometry: number;
  readonly combined: number;
}

export interface VisionSample {
  readonly profile: "rmx-cv-1";
  readonly sizeId: SizeId;
  readonly width: number;
  readonly height: number;
  readonly modules: BooleanMatrix;
  readonly confidence: ConfidenceMatrix;
  readonly sourceQuadrilateral: SourceQuadrilateral;
  readonly orientationDegrees: OrientationDegrees;
  readonly inverted: boolean;
  readonly blackReference: number;
  readonly whiteReference: number;
  readonly threshold: number;
  readonly meanModuleConfidence: number;
  readonly imageQuality: number;
  readonly blurEstimate: number;
  readonly perspectiveEstimateDegrees: number;
  readonly scores: VisionScores;
}

export interface ImageDecodeVisionMetadata {
  readonly sourceQuadrilateral: SourceQuadrilateral;
  readonly orientationDegrees: OrientationDegrees;
  readonly inverted: boolean;
  readonly samplesPerModule: number;
  readonly blackReference: number;
  readonly whiteReference: number;
  readonly threshold: number;
  readonly scores: VisionScores;
}

export type ImageDecodeResult =
  | (Extract<DecodeResult, { readonly ok: true }> & {
      readonly vision: ImageDecodeVisionMetadata;
    })
  | {
      readonly ok: false;
      readonly error: {
        readonly code: string;
        readonly message: string;
        readonly details?: Readonly<Record<string, unknown>>;
      };
    };
