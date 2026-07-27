import type { BooleanMatrix } from "@rectamatrix/core";
import { encodeText } from "@rectamatrix/encoder";
import { describe, expect, it } from "vitest";
import {
  BrowserAdapterError,
  captureVideoFrame,
  decodeVideoFrame,
  type CanvasContextLike,
  type CanvasSurfaceLike,
  type ImageDataLike,
  type VideoElementLike,
} from "../src/index.js";

describe("browser frame capture", () => {
  it("downscales video frames within both capture limits", () => {
    let canvasDimensions: readonly number[] | undefined;
    let drawArguments: readonly number[] | undefined;
    const context: CanvasContextLike = {
      drawImage(_source, ...values): void {
        drawArguments = values;
      },
      getImageData(_x, _y, width, height): ImageDataLike {
        return {
          width,
          height,
          data: new Uint8ClampedArray(width * height * 4),
        };
      },
    };
    const video = videoElement(4000, 2000);
    const frame = captureVideoFrame(video, {
      maximumPixels: 1_000_000,
      maximumDimension: 1000,
      environment: {
        createCanvas(width, height): CanvasSurfaceLike {
          canvasDimensions = [width, height];
          return canvasSurface(context, width, height);
        },
      },
    });

    expect(canvasDimensions).toEqual([1000, 500]);
    expect(drawArguments).toEqual([0, 0, 4000, 2000, 0, 0, 1000, 500]);
    expect(frame).toMatchObject({ width: 1000, height: 500 });
    expect(frame.data).toBeInstanceOf(Uint8ClampedArray);
  });

  it("captures only the normalized scanner region", () => {
    let drawArguments: readonly number[] | undefined;
    const context: CanvasContextLike = {
      drawImage(_source, ...values): void {
        drawArguments = values;
      },
      getImageData(_x, _y, width, height): ImageDataLike {
        return {
          width,
          height,
          data: new Uint8ClampedArray(width * height * 4),
        };
      },
    };
    const frame = captureVideoFrame(videoElement(4000, 2000), {
      maximumDimension: 1000,
      regionOfInterest: { left: 0.1, top: 0.2, width: 0.5, height: 0.5 },
      environment: {
        createCanvas(width, height): CanvasSurfaceLike {
          return canvasSurface(context, width, height);
        },
      },
    });

    expect(drawArguments).toEqual([400, 400, 2000, 1000, 0, 0, 1000, 500]);
    expect(frame).toMatchObject({ width: 1000, height: 500 });
  });

  it("captures and decodes a RectaMatrix video frame", () => {
    const symbol = encodeText("Camera", {
      sizeId: 0,
      eccLevel: "high",
      compression: "none",
    });
    const image = renderSymbol(symbol.matrix, 5, 4);
    const result = decodeVideoFrame(videoElement(image.width, image.height), {
      environment: {
        createCanvas(width, height): CanvasSurfaceLike {
          expect([width, height]).toEqual([image.width, image.height]);
          return canvasSurface(
            {
              drawImage(): void {},
              getImageData(): ImageDataLike {
                return image;
              },
            },
            width,
            height,
          );
        },
      },
    });

    expect(result.ok).toBe(true);
    if (result.ok && result.type === "utf8") expect(result.text).toBe("Camera");
  });

  it("returns structured adapter errors for unavailable or malformed frames", () => {
    expectAdapterError(
      () => captureVideoFrame({ ...videoElement(10, 10), readyState: 1 }),
      "VIDEO_NOT_READY",
    );
    expectAdapterError(
      () =>
        captureVideoFrame(videoElement(10, 10), {
          environment: {
            createCanvas(width, height): CanvasSurfaceLike {
              return canvasSurface(null, width, height);
            },
          },
        }),
      "CANVAS_UNAVAILABLE",
    );
    expectAdapterError(
      () => captureVideoFrame(videoElement(10, 10), { maximumPixels: 0 }),
      "INVALID_OPTIONS",
    );
    expectAdapterError(
      () =>
        captureVideoFrame(videoElement(10, 10), {
          regionOfInterest: { left: 0.5, top: 0, width: 0.6, height: 1 },
        }),
      "INVALID_OPTIONS",
    );
  });
});

function expectAdapterError(
  operation: () => unknown,
  code: BrowserAdapterError["code"],
): void {
  let thrown: unknown;
  try {
    operation();
  } catch (error) {
    thrown = error;
  }
  expect(thrown).toBeInstanceOf(BrowserAdapterError);
  expect(thrown).toMatchObject({ code });
}

function videoElement(width: number, height: number): VideoElementLike {
  return {
    videoWidth: width,
    videoHeight: height,
    readyState: 4,
    srcObject: null,
    async play(): Promise<void> {},
    pause(): void {},
  };
}

function canvasSurface(
  context: CanvasContextLike | null,
  width: number,
  height: number,
): CanvasSurfaceLike {
  return {
    width,
    height,
    getContext(): CanvasContextLike | null {
      return context;
    },
  };
}

function renderSymbol(
  matrix: BooleanMatrix,
  moduleSize: number,
  quietZone: number,
): ImageDataLike {
  const width = (matrix[0]!.length + quietZone * 2) * moduleSize;
  const height = (matrix.length + quietZone * 2) * moduleSize;
  const data = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const moduleX = Math.floor(x / moduleSize) - quietZone;
      const moduleY = Math.floor(y / moduleSize) - quietZone;
      const black =
        moduleX >= 0 &&
        moduleY >= 0 &&
        moduleX < matrix[0]!.length &&
        moduleY < matrix.length &&
        matrix[moduleY]![moduleX]!;
      const offset = (y * width + x) * 4;
      const value = black ? 20 : 235;
      data[offset] = value;
      data[offset + 1] = value;
      data[offset + 2] = value;
      data[offset + 3] = 255;
    }
  }
  return { width, height, data };
}
