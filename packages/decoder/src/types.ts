import type {
  CompressionMode,
  ConfidenceMatrix,
  EccLevel,
  MaskId,
  SampledSymbol,
  SizeId,
} from "@rectamatrix/core";

export interface DetectorMetadata {
  readonly imageQuality?: number;
  readonly blurEstimate?: number;
  readonly perspectiveEstimateDegrees?: number;
}

export interface SampledSymbolInput extends SampledSymbol {
  readonly detectorMetadata?: DetectorMetadata;
}

export interface DecodeQualityReport {
  readonly profile: "rmx-v2-draft";
  readonly overallConfidence: number;
  readonly averageModuleConfidence: number;
  readonly minimumModuleConfidence: number;
  readonly anchorScore: number;
  readonly topClockScore: number;
  readonly leftClockScore: number;
  readonly correctedCodewords: number;
  readonly erasuresUsed: number;
  readonly headerCorrectedCodewords: number;
  readonly headerErasuresUsed: number;
  readonly decodeAttempts: number;
  readonly headerErasureProfile: "reference" | "strict" | "permissive" | "none";
  readonly bodyErasureProfile: "reference" | "strict" | "permissive" | "none";
  readonly crcValid: true;
  readonly imageQuality?: number;
  readonly blurEstimate?: number;
  readonly perspectiveEstimateDegrees?: number;
}

export interface DecodeMetadata {
  readonly version: 2;
  readonly sizeId: SizeId;
  readonly width: number;
  readonly height: number;
  readonly eccLevel: EccLevel;
  readonly compression: CompressionMode;
  readonly maskId: MaskId;
  readonly quality: DecodeQualityReport;
}

export type DecodeResult =
  | {
      readonly ok: true;
      readonly type: "utf8";
      readonly text: string;
      readonly bytes: Uint8Array;
      readonly metadata: DecodeMetadata;
    }
  | {
      readonly ok: true;
      readonly type: "binary";
      readonly bytes: Uint8Array;
      readonly metadata: DecodeMetadata;
    }
  | {
      readonly ok: false;
      readonly error: {
        readonly code: string;
        readonly message: string;
        readonly details?: Readonly<Record<string, unknown>>;
      };
    };

export type { ConfidenceMatrix };
