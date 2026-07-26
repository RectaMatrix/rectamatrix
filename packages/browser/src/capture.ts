import {
  decodeImageData,
  type ImageDataLike,
  type ImageDecodeResult,
} from "@rectamatrix/detector";
import {
  BrowserAdapterError,
  type BrowserEnvironment,
  type CanvasSurfaceLike,
  type DecodeVideoFrameOptions,
  type FrameCaptureOptions,
  type VideoElementLike,
} from "./types.js";

const DEFAULT_MAXIMUM_CAPTURE_PIXELS = 4_000_000;
const DEFAULT_MAXIMUM_DIMENSION = 1920;

export function captureVideoFrame(
  video: VideoElementLike,
  options: FrameCaptureOptions = {},
): ImageDataLike {
  const dimensions = captureDimensions(
    video.videoWidth,
    video.videoHeight,
    options.maximumPixels ?? DEFAULT_MAXIMUM_CAPTURE_PIXELS,
    options.maximumDimension ?? DEFAULT_MAXIMUM_DIMENSION,
  );
  if (video.readyState !== undefined && video.readyState < 2) {
    throw new BrowserAdapterError(
      "VIDEO_NOT_READY",
      "The video element does not have a decodable frame yet.",
    );
  }
  const createCanvas =
    options.environment?.createCanvas ?? defaultBrowserEnvironment.createCanvas;
  const canvas = createCanvas(dimensions.width, dimensions.height);
  canvas.width = dimensions.width;
  canvas.height = dimensions.height;
  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (context === null) {
    throw new BrowserAdapterError(
      "CANVAS_UNAVAILABLE",
      "A readable 2D canvas context is unavailable.",
    );
  }
  try {
    context.drawImage(
      video,
      0,
      0,
      video.videoWidth,
      video.videoHeight,
      0,
      0,
      dimensions.width,
      dimensions.height,
    );
    const frame = context.getImageData(
      0,
      0,
      dimensions.width,
      dimensions.height,
    );
    validateCapturedFrame(frame, dimensions.width, dimensions.height);
    return Object.freeze({
      width: frame.width,
      height: frame.height,
      data: Uint8ClampedArray.from(frame.data),
    });
  } catch (error) {
    if (error instanceof BrowserAdapterError) throw error;
    throw new BrowserAdapterError(
      "FRAME_CAPTURE_FAILED",
      "The current video frame could not be read.",
      error,
    );
  }
}

export function decodeVideoFrame(
  video: VideoElementLike,
  options: DecodeVideoFrameOptions = {},
): ImageDecodeResult {
  const frame = captureVideoFrame(video, options);
  return decodeImageData(frame, options.detector);
}

export const defaultBrowserEnvironment: BrowserEnvironment = Object.freeze({
  createCanvas(width: number, height: number): CanvasSurfaceLike {
    if (typeof OffscreenCanvas !== "undefined") {
      return new OffscreenCanvas(width, height);
    }
    if (typeof document !== "undefined") {
      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      return canvas;
    }
    throw new BrowserAdapterError(
      "CANVAS_UNAVAILABLE",
      "Neither OffscreenCanvas nor a browser document is available.",
    );
  },
  getUserMedia(constraints: MediaStreamConstraints) {
    if (typeof navigator === "undefined") {
      throw new BrowserAdapterError(
        "CAMERA_UNAVAILABLE",
        "The browser camera API is unavailable.",
      );
    }
    return navigator.mediaDevices.getUserMedia(constraints);
  },
  setTimeout(callback: () => void, delayMilliseconds: number): number {
    return globalThis.setTimeout(callback, delayMilliseconds);
  },
  clearTimeout(handle: number): void {
    globalThis.clearTimeout(handle);
  },
});

function captureDimensions(
  sourceWidth: number,
  sourceHeight: number,
  maximumPixels: number,
  maximumDimension: number,
): { readonly width: number; readonly height: number } {
  if (
    !Number.isInteger(sourceWidth) ||
    !Number.isInteger(sourceHeight) ||
    sourceWidth < 1 ||
    sourceHeight < 1
  ) {
    throw new BrowserAdapterError(
      "VIDEO_NOT_READY",
      "Video dimensions must be positive integers.",
    );
  }
  if (
    !Number.isInteger(maximumPixels) ||
    maximumPixels < 1 ||
    !Number.isInteger(maximumDimension) ||
    maximumDimension < 1
  ) {
    throw new BrowserAdapterError(
      "INVALID_OPTIONS",
      "Capture limits must be positive integers.",
    );
  }
  const dimensionScale = Math.min(
    1,
    maximumDimension / Math.max(sourceWidth, sourceHeight),
  );
  const pixelScale = Math.min(
    1,
    Math.sqrt(maximumPixels / (sourceWidth * sourceHeight)),
  );
  const scale = Math.min(dimensionScale, pixelScale);
  const width = Math.max(1, Math.floor(sourceWidth * scale));
  const height = Math.max(1, Math.floor(sourceHeight * scale));
  if (width * height > maximumPixels) {
    throw new BrowserAdapterError(
      "FRAME_TOO_LARGE",
      "The captured frame exceeds the configured pixel limit.",
    );
  }
  return Object.freeze({ width, height });
}

function validateCapturedFrame(
  frame: ImageDataLike,
  width: number,
  height: number,
): void {
  if (
    frame.width !== width ||
    frame.height !== height ||
    frame.data.length !== width * height * 4
  ) {
    throw new BrowserAdapterError(
      "FRAME_CAPTURE_FAILED",
      "Canvas returned malformed RGBA frame data.",
    );
  }
}
