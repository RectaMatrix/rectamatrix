import type { BooleanMatrix } from "@rectamatrix/core";
import { encodeText } from "@rectamatrix/encoder";
import { describe, expect, it } from "vitest";
import {
  BrowserAdapterError,
  RectaMatrixCameraScanner,
  type BrowserEnvironment,
  type CanvasContextLike,
  type CanvasSurfaceLike,
  type ImageDataLike,
  type MediaStreamLike,
  type VideoElementLike,
} from "../src/index.js";

describe("camera scanner lifecycle", () => {
  it("opens, scans, emits, and closes an owned stream after success", async () => {
    const image = symbolImage("Live");
    const track = trackCounter();
    const stream = mediaStream(track);
    const scheduler = scheduledEnvironment(image, () =>
      Promise.resolve(stream),
    );
    const video = videoCounter(image.width, image.height);
    const decoded: string[] = [];
    const scanner = new RectaMatrixCameraScanner(video, {
      environment: scheduler.environment,
      onDecode(result): void {
        if (result.ok && result.type === "utf8") decoded.push(result.text);
      },
    });

    await scanner.start();
    expect(scanner.running).toBe(true);
    scheduler.runNext();

    expect(decoded).toEqual(["Live"]);
    expect(scanner.running).toBe(false);
    expect(track.stops).toBe(1);
    expect(video.pauses).toBe(1);
    expect(video.srcObject).toBeNull();
  });

  it("does not stop a caller-owned stream unless requested", async () => {
    const image = symbolImage("External");
    const track = trackCounter();
    const stream = mediaStream(track);
    const scheduler = scheduledEnvironment(image, () =>
      Promise.reject(new Error("Camera must not be requested.")),
    );
    const scanner = new RectaMatrixCameraScanner(
      videoCounter(image.width, image.height),
      {
        environment: scheduler.environment,
        stopOnSuccess: false,
        onDecode(): void {},
      },
    );

    await scanner.start(stream);
    scanner.stop();
    expect(track.stops).toBe(0);
  });

  it("reports frame failures and schedules the next bounded attempt", async () => {
    const image = symbolImage("Retry");
    const stream = mediaStream(trackCounter());
    const scheduler = scheduledEnvironment(image, () =>
      Promise.resolve(stream),
    );
    const video = videoCounter(image.width, image.height);
    Object.defineProperty(video, "readyState", { value: 1 });
    const errors: BrowserAdapterError[] = [];
    const scanner = new RectaMatrixCameraScanner(video, {
      environment: scheduler.environment,
      scanIntervalMilliseconds: 75,
      onDecode(): void {},
      onError(error): void {
        errors.push(error);
      },
    });

    await scanner.start();
    scheduler.runNext();
    expect(errors.map(({ code }) => code)).toEqual(["VIDEO_NOT_READY"]);
    expect(scanner.running).toBe(true);
    expect(scheduler.pending).toBe(1);
    scanner.stop();
    expect(scheduler.pending).toBe(0);
  });

  it("closes a late internally requested stream after stop", async () => {
    const image = symbolImage("Late");
    const track = trackCounter();
    const stream = mediaStream(track);
    let resolveStream: ((value: MediaStreamLike) => void) | undefined;
    const pendingStream = new Promise<MediaStreamLike>((resolve) => {
      resolveStream = resolve;
    });
    const scheduler = scheduledEnvironment(image, () => pendingStream);
    const scanner = new RectaMatrixCameraScanner(
      videoCounter(image.width, image.height),
      {
        environment: scheduler.environment,
        onDecode(): void {},
      },
    );

    const starting = scanner.start();
    scanner.stop();
    resolveStream!(stream);
    await starting;

    expect(scanner.running).toBe(false);
    expect(track.stops).toBe(1);
    expect(scheduler.pending).toBe(0);
  });

  it("rejects duplicate starts and invalid scan intervals", async () => {
    const image = symbolImage("Limits");
    const stream = mediaStream(trackCounter());
    const scheduler = scheduledEnvironment(image, () =>
      Promise.resolve(stream),
    );
    const scanner = new RectaMatrixCameraScanner(
      videoCounter(image.width, image.height),
      {
        environment: scheduler.environment,
        stopOnSuccess: false,
        onDecode(): void {},
      },
    );
    await scanner.start(stream);
    await expect(scanner.start(stream)).rejects.toMatchObject({
      code: "ALREADY_RUNNING",
    });
    scanner.stop();

    expectAdapterError(
      () =>
        new RectaMatrixCameraScanner(videoCounter(image.width, image.height), {
          environment: scheduler.environment,
          scanIntervalMilliseconds: 0,
          onDecode(): void {},
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

function scheduledEnvironment(
  image: ImageDataLike,
  getUserMedia: BrowserEnvironment["getUserMedia"],
): {
  readonly environment: BrowserEnvironment;
  readonly pending: number;
  readonly runNext: () => void;
} {
  let nextHandle = 1;
  const callbacks = new Map<number, () => void>();
  const context: CanvasContextLike = {
    drawImage(): void {},
    getImageData(): ImageDataLike {
      return image;
    },
  };
  const controller = {
    environment: {
      createCanvas(width: number, height: number): CanvasSurfaceLike {
        return {
          width,
          height,
          getContext(): CanvasContextLike {
            return context;
          },
        };
      },
      getUserMedia,
      setTimeout(callback: () => void): number {
        const handle = nextHandle;
        nextHandle += 1;
        callbacks.set(handle, callback);
        return handle;
      },
      clearTimeout(handle: number): void {
        callbacks.delete(handle);
      },
    },
    get pending(): number {
      return callbacks.size;
    },
    runNext(): void {
      const entry = callbacks.entries().next().value as
        readonly [number, () => void] | undefined;
      if (entry === undefined) throw new Error("No scheduled scan.");
      callbacks.delete(entry[0]);
      entry[1]();
    },
  };
  return controller;
}

function videoCounter(
  width: number,
  height: number,
): VideoElementLike & { pauses: number } {
  return {
    videoWidth: width,
    videoHeight: height,
    readyState: 4,
    srcObject: null,
    pauses: 0,
    async play(): Promise<void> {},
    pause(): void {
      this.pauses += 1;
    },
  };
}

function trackCounter(): { stops: number; stop(): void } {
  return {
    stops: 0,
    stop(): void {
      this.stops += 1;
    },
  };
}

function mediaStream(track: { stop(): void }): MediaStreamLike {
  return {
    getTracks(): readonly { stop(): void }[] {
      return [track];
    },
  };
}

function symbolImage(text: string): ImageDataLike {
  const symbol = encodeText(text, {
    sizeId: 0,
    eccLevel: "high",
    compression: "none",
  });
  return renderSymbol(symbol.matrix, 4, 4);
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
