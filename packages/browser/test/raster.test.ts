import { encodeText } from "@rectamatrix/encoder";
import { describe, expect, it } from "vitest";
import {
  BrowserAdapterError,
  renderJpeg,
  renderPng,
  type RasterCanvasContextLike,
  type RasterCanvasSurfaceLike,
} from "../src/index.js";

describe("browser raster rendering", () => {
  it("renders PNG modules with a four-module Quiet Zone", async () => {
    const symbol = encodeText("Raster", {
      sizeId: 0,
      eccLevel: "high",
      compression: "none",
    });
    const fills: Array<readonly [string, number, number, number, number]> = [];
    const canvas = rasterCanvas(fills);
    const blob = await renderPng(symbol, {
      moduleSize: 3,
      environment: { createCanvas: () => canvas },
    });

    expect(canvas.width).toBe((symbol.width + 8) * 3);
    expect(canvas.height).toBe((symbol.height + 8) * 3);
    expect(fills[0]).toEqual(["#ffffff", 0, 0, canvas.width, canvas.height]);
    expect(fills.length).toBeGreaterThan(1);
    expect(blob.type).toBe("image/png");
  });

  it("passes validated quality to JPEG export", async () => {
    const symbol = encodeText("JPEG");
    let exportOptions: { readonly type: string; readonly quality?: number } = {
      type: "",
    };
    const canvas = rasterCanvas([], (options) => {
      exportOptions = options;
    });
    const blob = await renderJpeg(symbol, {
      quality: 0.8,
      environment: { createCanvas: () => canvas },
    });

    expect(exportOptions).toEqual({ type: "image/jpeg", quality: 0.8 });
    expect(blob.type).toBe("image/jpeg");
  });

  it("renders the explicit two-module Compact profile", async () => {
    const symbol = encodeText("Compact");
    const canvas = rasterCanvas([]);
    await renderPng(symbol, {
      moduleSize: 3,
      quietZoneProfile: "compact",
      environment: { createCanvas: () => canvas },
    });
    expect(canvas.width).toBe((symbol.width + 4) * 3);
    expect(canvas.height).toBe((symbol.height + 4) * 3);
  });

  it("supports HTML canvas toBlob exports", async () => {
    const symbol = encodeText("Canvas");
    const canvas = rasterCanvas([], undefined, "toBlob");

    const blob = await renderPng(symbol, {
      environment: { createCanvas: () => canvas },
    });
    expect(blob.type).toBe("image/png");
  });

  it("rejects unsafe raster limits and unavailable exporters", async () => {
    const symbol = encodeText("Limits");
    await expect(
      renderPng(symbol, {
        moduleSize: 1000,
        maximumPixels: 100,
        environment: { createCanvas: () => rasterCanvas([]) },
      }),
    ).rejects.toMatchObject({ code: "FRAME_TOO_LARGE" });

    const canvas = rasterCanvas([], undefined, "none");
    await expect(
      renderPng(symbol, {
        environment: { createCanvas: () => canvas },
      }),
    ).rejects.toBeInstanceOf(BrowserAdapterError);
  });
});

function rasterCanvas(
  fills: Array<readonly [string, number, number, number, number]>,
  onExport?: (options: {
    readonly type: string;
    readonly quality?: number;
  }) => void,
  exportMethod: "convert" | "none" | "toBlob" = "convert",
): RasterCanvasSurfaceLike {
  const context: RasterCanvasContextLike = {
    fillStyle: "",
    drawImage(): void {},
    getImageData() {
      return { width: 1, height: 1, data: new Uint8ClampedArray(4) };
    },
    fillRect(x, y, width, height): void {
      fills.push([this.fillStyle, x, y, width, height]);
    },
  };
  const base = {
    width: 0,
    height: 0,
    getContext(): RasterCanvasContextLike {
      return context;
    },
  };
  if (exportMethod === "convert") {
    return {
      ...base,
      convertToBlob(options): Promise<Blob> {
        onExport?.(options);
        return Promise.resolve(new Blob(["raster"], { type: options.type }));
      },
    };
  }
  if (exportMethod === "toBlob") {
    return {
      ...base,
      toBlob(callback, type): void {
        callback(new Blob(["raster"], { type: type ?? "" }));
      },
    };
  }
  return base;
}
