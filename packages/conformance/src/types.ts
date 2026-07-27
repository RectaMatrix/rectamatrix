import type { EccLevel, MaskId, PayloadType, SizeId } from "@rectamatrix/core";
import type { CompressionMode } from "@rectamatrix/encoder";
import type {
  DetectorOptions,
  OrientationDegrees,
  SourceQuadrilateral,
} from "@rectamatrix/detector";

export type EncoderVectorInput =
  | {
      readonly type: "binary";
      readonly hex: string;
    }
  | {
      readonly type: "utf8";
      readonly text: string;
    };

export interface EncoderVectorOptions {
  readonly eccLevel: EccLevel;
  readonly compression: CompressionMode;
  readonly sizeId?: SizeId;
}

export interface EncoderVectorRsBlock {
  readonly index: number;
  readonly dataLength: number;
  readonly parityLength: number;
  readonly dataHex: string;
  readonly parityHex: string;
  readonly codewordHex: string;
}

export interface EncoderVectorExpected {
  readonly sizeId: SizeId;
  readonly width: number;
  readonly height: number;
  readonly payloadType: PayloadType;
  readonly compression: "none" | "rm-hle1" | "rm-lz1";
  readonly eccLevel: EccLevel;
  readonly maskId: MaskId;
  readonly originalLength: number;
  readonly encodedLength: number;
  readonly originalPayloadHex: string;
  readonly encodedPayloadHex: string;
  readonly crc32cHex: string;
  readonly frameHex: string;
  readonly headerInformationHex: string;
  readonly protectedHeaderHex: string;
  readonly rsBlockCount: number;
  readonly rsTotalDataBytes: number;
  readonly rsTotalParityBytes: number;
  readonly rsTotalCodewordBytes: number;
  readonly rsBlocks: readonly EncoderVectorRsBlock[];
  readonly interleavedCodewordsHex: string;
  readonly unmaskedBodyBits: string;
  readonly maskScores: readonly number[];
  readonly finalMatrix: readonly string[];
}

export interface EncoderVector {
  readonly id: string;
  readonly input: EncoderVectorInput;
  readonly options: EncoderVectorOptions;
  readonly expected: EncoderVectorExpected;
}

export interface EncoderVectorSuite {
  readonly format: "rectamatrix-conformance";
  readonly vectorVersion: 1;
  readonly coreVersion: 2;
  readonly kind: "encoder";
  readonly vectors: readonly EncoderVector[];
}

export interface VectorVerificationResult {
  readonly id: string;
  readonly verified: true;
}

export interface DecoderNegativeDetectorMetadata {
  readonly imageQuality?: number;
  readonly blurEstimate?: number;
  readonly perspectiveEstimateDegrees?: number;
}

export interface DecoderVectorInput {
  readonly modules: readonly string[];
  readonly confidence?: readonly (readonly number[])[];
  readonly detectorMetadata?: DecoderNegativeDetectorMetadata;
}

export type DecoderNegativeVectorInput = DecoderVectorInput;

export interface DecoderNegativeVectorExpected {
  readonly errorCodes: readonly string[];
}

export interface DecoderNegativeVector {
  readonly id: string;
  readonly input: DecoderNegativeVectorInput;
  readonly expected: DecoderNegativeVectorExpected;
}

export interface DecoderNegativeVectorSuite {
  readonly format: "rectamatrix-conformance";
  readonly vectorVersion: 1;
  readonly coreVersion: 2;
  readonly kind: "decoder-negative";
  readonly vectors: readonly DecoderNegativeVector[];
}

export interface DecoderPositiveQualityExpected {
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

export interface DecoderPositiveMetadataExpected {
  readonly version: 2;
  readonly sizeId: SizeId;
  readonly width: number;
  readonly height: number;
  readonly eccLevel: EccLevel;
  readonly compression: "none" | "rm-hle1" | "rm-lz1";
  readonly maskId: MaskId;
  readonly quality: DecoderPositiveQualityExpected;
}

export type DecoderPositiveExpected =
  | {
      readonly type: "binary";
      readonly payloadHex: string;
      readonly metadata: DecoderPositiveMetadataExpected;
    }
  | {
      readonly type: "utf8";
      readonly payloadHex: string;
      readonly text: string;
      readonly metadata: DecoderPositiveMetadataExpected;
    };

export type DecoderExpectedPayload =
  | {
      readonly type: "binary";
      readonly payloadHex: string;
    }
  | {
      readonly type: "utf8";
      readonly text: string;
    };

export interface DecoderPositiveVector {
  readonly id: string;
  readonly input: DecoderVectorInput;
  readonly expected: DecoderPositiveExpected;
}

export interface DecoderPositiveVectorSuite {
  readonly format: "rectamatrix-conformance";
  readonly vectorVersion: 1;
  readonly coreVersion: 2;
  readonly kind: "decoder-positive";
  readonly vectors: readonly DecoderPositiveVector[];
}

export interface ImageVectorAsset {
  readonly file: string;
  readonly width: number;
  readonly height: number;
  readonly crc32cHex: string;
}

export interface ImageVectorOptions {
  readonly sourceQuadrilateral?: SourceQuadrilateral;
  readonly samplesPerModule?: 5 | 6 | 7 | 8 | 9;
  readonly tryInverted?: boolean;
  readonly minimumModulePixels?: number;
  readonly maximumCandidates?: number;
}

export type ImageVectorExpected =
  | {
      readonly result: "success";
      readonly type: "binary";
      readonly payloadHex: string;
      readonly sizeId: SizeId;
      readonly orientationDegrees: OrientationDegrees;
      readonly minimumOverallConfidence: number;
      readonly referenceModules: readonly string[];
      readonly referenceConfidence: readonly (readonly number[])[];
    }
  | {
      readonly result: "success";
      readonly type: "utf8";
      readonly payloadHex: string;
      readonly text: string;
      readonly sizeId: SizeId;
      readonly orientationDegrees: OrientationDegrees;
      readonly minimumOverallConfidence: number;
      readonly referenceModules: readonly string[];
      readonly referenceConfidence: readonly (readonly number[])[];
    }
  | {
      readonly result: "failure";
      readonly allowedErrorCodes: readonly string[];
    };

export interface ImageVector {
  readonly id: string;
  readonly categories: readonly string[];
  readonly image: ImageVectorAsset;
  readonly options: ImageVectorOptions;
  readonly expected: ImageVectorExpected;
}

export interface ImageVectorSuite {
  readonly format: "rectamatrix-conformance";
  readonly vectorVersion: 1;
  readonly coreVersion: 2;
  readonly kind: "image";
  readonly vectors: readonly ImageVector[];
}

export type { DetectorOptions };
