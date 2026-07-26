import type {
  DetectorOptions,
  ImageDataLike,
  ImageDecodeResult,
} from "@rectamatrix/detector";
import type { SvgRenderOptions } from "@rectamatrix/encoder";

export interface CanvasContextLike {
  drawImage(
    source: unknown,
    sourceX: number,
    sourceY: number,
    sourceWidth: number,
    sourceHeight: number,
    destinationX: number,
    destinationY: number,
    destinationWidth: number,
    destinationHeight: number,
  ): void;
  getImageData(
    sourceX: number,
    sourceY: number,
    sourceWidth: number,
    sourceHeight: number,
  ): ImageDataLike;
}

export interface CanvasSurfaceLike {
  width: number;
  height: number;
  getContext(
    contextId: "2d",
    options?: { readonly willReadFrequently?: boolean },
  ): CanvasContextLike | null;
  readonly convertToBlob?: (options: {
    readonly type: string;
    readonly quality?: number;
  }) => Promise<Blob>;
  readonly toBlob?: (
    callback: (blob: Blob | null) => void,
    type?: string,
    quality?: number,
  ) => void;
}

export interface RasterCanvasContextLike extends CanvasContextLike {
  fillStyle: string;
  fillRect(x: number, y: number, width: number, height: number): void;
}

export interface RasterCanvasSurfaceLike extends CanvasSurfaceLike {
  getContext(
    contextId: "2d",
    options?: { readonly willReadFrequently?: boolean },
  ): RasterCanvasContextLike | null;
}

export interface VideoElementLike {
  readonly videoWidth: number;
  readonly videoHeight: number;
  readonly readyState?: number;
  srcObject: unknown;
  play(): Promise<void>;
  pause(): void;
}

export interface MediaStreamTrackLike {
  stop(): void;
}

export interface MediaStreamLike {
  getTracks(): readonly MediaStreamTrackLike[];
}

export interface BrowserEnvironment {
  readonly createCanvas: (width: number, height: number) => CanvasSurfaceLike;
  readonly getUserMedia: (
    constraints: MediaStreamConstraints,
  ) => Promise<MediaStreamLike>;
  readonly setTimeout: (
    callback: () => void,
    delayMilliseconds: number,
  ) => number;
  readonly clearTimeout: (handle: number) => void;
}

export interface FrameCaptureOptions {
  readonly maximumPixels?: number;
  readonly maximumDimension?: number;
  readonly environment?: Pick<BrowserEnvironment, "createCanvas">;
}

export interface DecodeVideoFrameOptions extends FrameCaptureOptions {
  readonly detector?: DetectorOptions;
}

export interface CameraScannerOptions extends DecodeVideoFrameOptions {
  readonly scanIntervalMilliseconds?: number;
  readonly stopOnSuccess?: boolean;
  readonly stopProvidedStream?: boolean;
  readonly constraints?: MediaStreamConstraints;
  readonly onDecode: (result: ImageDecodeResult) => void;
  readonly onError?: (error: BrowserAdapterError) => void;
  readonly environment?: BrowserEnvironment;
}

export interface RasterRenderOptions extends SvgRenderOptions {
  readonly quality?: number;
  readonly maximumPixels?: number;
  readonly environment?: Pick<BrowserEnvironment, "createCanvas">;
}

export type BrowserAdapterErrorCode =
  | "ALREADY_RUNNING"
  | "CAMERA_START_FAILED"
  | "CAMERA_UNAVAILABLE"
  | "CANVAS_UNAVAILABLE"
  | "FRAME_CAPTURE_FAILED"
  | "FRAME_TOO_LARGE"
  | "INVALID_OPTIONS"
  | "RASTER_EXPORT_FAILED"
  | "VIDEO_NOT_READY";

export class BrowserAdapterError extends Error {
  public constructor(
    public readonly code: BrowserAdapterErrorCode,
    message: string,
    public override readonly cause?: unknown,
  ) {
    super(message);
    this.name = "BrowserAdapterError";
  }
}
