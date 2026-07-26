import { resolveQuietZone, type EncodedSymbol } from "@rectamatrix/encoder";
import {
  BrowserAdapterError,
  type CanvasContextLike,
  type CanvasSurfaceLike,
  type RasterCanvasContextLike,
  type RasterRenderOptions,
} from "./types.js";
import { defaultBrowserEnvironment } from "./capture.js";

const DEFAULT_MODULE_SIZE = 8;
const DEFAULT_JPEG_QUALITY = 0.92;
const DEFAULT_MAXIMUM_PIXELS = 16_000_000;

export function renderPng(
  symbol: EncodedSymbol,
  options: RasterRenderOptions = {},
): Promise<Blob> {
  return renderRaster(symbol, "image/png", options);
}

export function renderJpeg(
  symbol: EncodedSymbol,
  options: RasterRenderOptions = {},
): Promise<Blob> {
  return renderRaster(symbol, "image/jpeg", options);
}

async function renderRaster(
  symbol: EncodedSymbol,
  type: "image/jpeg" | "image/png",
  options: RasterRenderOptions,
): Promise<Blob> {
  const moduleSize = options.moduleSize ?? DEFAULT_MODULE_SIZE;
  const quietZone = resolveRasterQuietZone(options);
  const maximumPixels = options.maximumPixels ?? DEFAULT_MAXIMUM_PIXELS;
  const quality =
    type === "image/jpeg"
      ? (options.quality ?? DEFAULT_JPEG_QUALITY)
      : undefined;
  validateOptions(symbol, moduleSize, quietZone, maximumPixels, quality);

  const width = (symbol.width + quietZone * 2) * moduleSize;
  const height = (symbol.height + quietZone * 2) * moduleSize;
  const createCanvas =
    options.environment?.createCanvas ?? defaultBrowserEnvironment.createCanvas;
  const canvas = createCanvas(width, height);
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d");
  if (!isRasterContext(context)) {
    throw new BrowserAdapterError(
      "CANVAS_UNAVAILABLE",
      "A writable 2D canvas context is unavailable.",
    );
  }

  context.fillStyle = "#ffffff";
  context.fillRect(0, 0, width, height);
  context.fillStyle = "#000000";
  for (let y = 0; y < symbol.height; y += 1) {
    for (let x = 0; x < symbol.width; x += 1) {
      if (symbol.matrix[y]![x]) {
        context.fillRect(
          (x + quietZone) * moduleSize,
          (y + quietZone) * moduleSize,
          moduleSize,
          moduleSize,
        );
      }
    }
  }

  return exportCanvas(canvas, type, quality);
}

async function exportCanvas(
  canvas: CanvasSurfaceLike,
  type: "image/jpeg" | "image/png",
  quality: number | undefined,
): Promise<Blob> {
  try {
    const convertToBlob = canvas.convertToBlob;
    if (convertToBlob !== undefined) {
      const options = quality === undefined ? { type } : { type, quality };
      return await convertToBlob.call(canvas, options);
    }
    const toBlob = canvas.toBlob;
    if (toBlob !== undefined) {
      return await new Promise<Blob>((resolve, reject) => {
        toBlob.call(
          canvas,
          (blob) => {
            if (blob === null) {
              reject(new Error("Canvas returned no raster data."));
            } else {
              resolve(blob);
            }
          },
          type,
          quality,
        );
      });
    }
  } catch (error) {
    if (error instanceof BrowserAdapterError) throw error;
    throw new BrowserAdapterError(
      "RASTER_EXPORT_FAILED",
      "The raster image could not be encoded.",
      error,
    );
  }
  throw new BrowserAdapterError(
    "RASTER_EXPORT_FAILED",
    "Canvas raster export is unavailable.",
  );
}

function resolveRasterQuietZone(options: RasterRenderOptions): number {
  try {
    return resolveQuietZone(options);
  } catch (error) {
    throw new BrowserAdapterError(
      "INVALID_OPTIONS",
      error instanceof Error ? error.message : "Invalid Quiet Zone options.",
      error,
    );
  }
}

function validateOptions(
  symbol: EncodedSymbol,
  moduleSize: number,
  quietZone: number,
  maximumPixels: number,
  quality: number | undefined,
): void {
  if (
    symbol.matrix.length !== symbol.height ||
    symbol.matrix.some((row) => row.length !== symbol.width)
  ) {
    throw new BrowserAdapterError(
      "INVALID_OPTIONS",
      "Encoded Symbol matrix dimensions are invalid.",
    );
  }
  if (!Number.isInteger(moduleSize) || moduleSize < 1) {
    throw new BrowserAdapterError(
      "INVALID_OPTIONS",
      "Raster module size must be a positive integer.",
    );
  }
  if (!Number.isInteger(maximumPixels) || maximumPixels < 1) {
    throw new BrowserAdapterError(
      "INVALID_OPTIONS",
      "Maximum raster pixels must be a positive integer.",
    );
  }
  const width = (symbol.width + quietZone * 2) * moduleSize;
  const height = (symbol.height + quietZone * 2) * moduleSize;
  if (width * height > maximumPixels) {
    throw new BrowserAdapterError(
      "FRAME_TOO_LARGE",
      "The raster image exceeds the configured pixel limit.",
    );
  }
  if (
    quality !== undefined &&
    (!Number.isFinite(quality) || quality < 0 || quality > 1)
  ) {
    throw new BrowserAdapterError(
      "INVALID_OPTIONS",
      "JPEG quality must be a finite number from zero through one.",
    );
  }
}

function isRasterContext(
  context: CanvasContextLike | null,
): context is RasterCanvasContextLike {
  return (
    context !== null &&
    "fillRect" in context &&
    typeof context.fillRect === "function"
  );
}
