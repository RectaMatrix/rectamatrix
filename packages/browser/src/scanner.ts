import { decodeVideoFrame, defaultBrowserEnvironment } from "./capture.js";
import {
  BrowserAdapterError,
  type BrowserEnvironment,
  type CameraScannerOptions,
  type MediaStreamLike,
  type VideoElementLike,
} from "./types.js";

const DEFAULT_SCAN_INTERVAL_MILLISECONDS = 200;
const DEFAULT_CONSTRAINTS: MediaStreamConstraints = Object.freeze({
  audio: false,
  video: Object.freeze({
    facingMode: Object.freeze({ ideal: "environment" }),
  }),
});

export class RectaMatrixCameraScanner {
  readonly #video: VideoElementLike;
  readonly #options: CameraScannerOptions;
  readonly #environment: BrowserEnvironment;
  #stream: MediaStreamLike | undefined;
  #ownsStream = false;
  #timer: number | undefined;
  #running = false;
  #generation = 0;

  public constructor(video: VideoElementLike, options: CameraScannerOptions) {
    validateScannerOptions(options);
    this.#video = video;
    this.#options = options;
    this.#environment = options.environment ?? defaultBrowserEnvironment;
  }

  public get running(): boolean {
    return this.#running;
  }

  public async start(stream?: MediaStreamLike): Promise<void> {
    if (this.#running) {
      throw new BrowserAdapterError(
        "ALREADY_RUNNING",
        "The camera scanner is already running.",
      );
    }
    this.#running = true;
    this.#generation += 1;
    const generation = this.#generation;
    const ownsStream = stream === undefined;
    let selectedStream = stream;
    try {
      selectedStream ??= await this.#environment.getUserMedia(
        this.#options.constraints ?? DEFAULT_CONSTRAINTS,
      );
      if (!this.#isActiveGeneration(generation)) {
        if (ownsStream || this.#options.stopProvidedStream === true) {
          stopTracks(selectedStream);
        }
        return;
      }
      this.#ownsStream = ownsStream;
      this.#stream = selectedStream;
      this.#video.srcObject = this.#stream;
      await this.#video.play();
      if (!this.#isActiveGeneration(generation)) return;
      this.#schedule(generation, 0);
    } catch (error) {
      if (generation === this.#generation) {
        this.#running = false;
        this.#video.pause();
        this.#video.srcObject = null;
        this.#stopOwnedTracks();
      }
      if (error instanceof BrowserAdapterError) throw error;
      throw new BrowserAdapterError(
        "CAMERA_START_FAILED",
        "The camera scanner could not be started.",
        error,
      );
    }
  }

  public scanNow() {
    return decodeVideoFrame(this.#video, this.#options);
  }

  public stop(): void {
    this.#running = false;
    this.#generation += 1;
    if (this.#timer !== undefined) {
      this.#environment.clearTimeout(this.#timer);
      this.#timer = undefined;
    }
    this.#video.pause();
    this.#video.srcObject = null;
    if (this.#ownsStream || this.#options.stopProvidedStream === true) {
      this.#stopTracks();
    }
    this.#stream = undefined;
    this.#ownsStream = false;
  }

  #schedule(generation: number, delayMilliseconds: number): void {
    this.#timer = this.#environment.setTimeout(() => {
      this.#timer = undefined;
      if (!this.#running || generation !== this.#generation) return;
      try {
        const result = this.scanNow();
        this.#options.onDecode(result);
        if (result.ok && (this.#options.stopOnSuccess ?? true)) {
          this.stop();
          return;
        }
      } catch (error) {
        const adapterError =
          error instanceof BrowserAdapterError
            ? error
            : new BrowserAdapterError(
                "FRAME_CAPTURE_FAILED",
                "The current camera frame could not be processed.",
                error,
              );
        this.#options.onError?.(adapterError);
      }
      if (this.#isActiveGeneration(generation)) {
        this.#schedule(
          generation,
          this.#options.scanIntervalMilliseconds ??
            DEFAULT_SCAN_INTERVAL_MILLISECONDS,
        );
      }
    }, delayMilliseconds);
  }

  #stopOwnedTracks(): void {
    if (this.#ownsStream) this.#stopTracks();
    this.#stream = undefined;
    this.#ownsStream = false;
  }

  #stopTracks(): void {
    if (this.#stream !== undefined) stopTracks(this.#stream);
  }

  #isActiveGeneration(generation: number): boolean {
    return this.#running && generation === this.#generation;
  }
}

function stopTracks(stream: MediaStreamLike): void {
  for (const track of stream.getTracks()) track.stop();
}

function validateScannerOptions(options: CameraScannerOptions): void {
  if (typeof options.onDecode !== "function") {
    throw new BrowserAdapterError(
      "INVALID_OPTIONS",
      "Camera scanner requires an onDecode callback.",
    );
  }
  const interval =
    options.scanIntervalMilliseconds ?? DEFAULT_SCAN_INTERVAL_MILLISECONDS;
  if (!Number.isInteger(interval) || interval < 50 || interval > 60_000) {
    throw new BrowserAdapterError(
      "INVALID_OPTIONS",
      "Scan interval must be an integer from 50 through 60000 milliseconds.",
    );
  }
}
