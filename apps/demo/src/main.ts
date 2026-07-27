import {
  BrowserAdapterError,
  RectaMatrixCameraScanner,
  renderJpeg,
  renderPng,
  type ImageDecodeResult,
} from "@rectamatrix/browser";
import {
  encodeText,
  renderSvg,
  renderZpl,
  type EncodedSymbol,
  type QuietZoneProfile,
} from "@rectamatrix/encoder";
import { cameraOptionLabel, rankCameraDevices } from "./camera.js";
import "./style.css";

const video = requiredElement("camera", HTMLVideoElement);
const startButton = requiredElement("start-button", HTMLButtonElement);
const stopButton = requiredElement("stop-button", HTMLButtonElement);
const copyButton = requiredElement("copy-button", HTMLButtonElement);
const scannerStatus = requiredElement("scanner-status", HTMLSpanElement);
const cameraBadgeText = requiredElement("camera-badge-text", HTMLSpanElement);
const cameraNote = requiredElement("camera-note", HTMLParagraphElement);
const cameraDevice = requiredElement("camera-device", HTMLSelectElement);
const cameraZoomControl = requiredElement(
  "camera-zoom-control",
  HTMLLabelElement,
);
const cameraZoom = requiredElement("camera-zoom", HTMLInputElement);
const cameraZoomValue = requiredElement("camera-zoom-value", HTMLOutputElement);
const resultTitle = requiredElement("result-title", HTMLHeadingElement);
const resultCount = requiredElement("result-count", HTMLSpanElement);
const resultOutput = requiredElement("result-output", HTMLDivElement);
const confidenceValue = requiredElement("confidence-value", HTMLElement);
const orientationValue = requiredElement("orientation-value", HTMLElement);
const correctionValue = requiredElement("correction-value", HTMLElement);
const eccValue = requiredElement("ecc-value", HTMLElement);
const lastScanTime = requiredElement("last-scan-time", HTMLSpanElement);
const generatorForm = requiredElement("generator-form", HTMLFormElement);
const generatorInput = requiredElement("generator-input", HTMLTextAreaElement);
const generatorEcc = requiredElement("generator-ecc", HTMLSelectElement);
const generatorModuleSize = requiredElement(
  "generator-module-size",
  HTMLSelectElement,
);
const generatorQuietZone = requiredElement(
  "generator-quiet-zone",
  HTMLSelectElement,
);
const generatorStatus = requiredElement(
  "generator-status",
  HTMLParagraphElement,
);
const generatorImage = requiredElement("generator-image", HTMLImageElement);
const generatorGeometry = requiredElement(
  "generator-geometry",
  HTMLSpanElement,
);
const generatorBytes = requiredElement("generator-bytes", HTMLElement);
const generatorMask = requiredElement("generator-mask", HTMLElement);
const generatorCompression = requiredElement(
  "generator-compression",
  HTMLElement,
);
const downloadSvgButton = requiredElement("download-svg", HTMLButtonElement);
const downloadPngButton = requiredElement("download-png", HTMLButtonElement);
const downloadJpegButton = requiredElement("download-jpeg", HTMLButtonElement);
const copyZplButton = requiredElement("copy-zpl", HTMLButtonElement);
const zplOutput = requiredElement("zpl-output", HTMLTextAreaElement);

let successfulScans = 0;
let copyValue = "";
let generatedCode: GeneratedCode | undefined;
let previewUrl: string | undefined;
let selectedCameraDeviceId: string | undefined;
let activeCameraTrack: MediaStreamTrack | undefined;

interface CameraCapabilities extends MediaTrackCapabilities {
  readonly exposureMode?: readonly string[];
  readonly focusMode?: readonly string[];
  readonly zoom?: MediaSettingsRange;
}

interface CameraSettings extends MediaTrackSettings {
  readonly zoom?: number;
}

interface GeneratedCode {
  readonly symbol: EncodedSymbol;
  readonly svg: string;
  readonly zpl: string;
  readonly moduleSize: number;
  readonly quietZoneProfile: QuietZoneProfile;
}

const scanner = new RectaMatrixCameraScanner(video, {
  scanIntervalMilliseconds: 160,
  stopOnSuccess: false,
  stopProvidedStream: true,
  maximumDimension: 720,
  maximumPixels: 500_000,
  regionOfInterest: Object.freeze({
    left: 0.08,
    top: 0.08,
    width: 0.84,
    height: 0.84,
  }),
  detector: {
    maximumCandidates: 8,
    minimumModulePixels: 3,
  },
  onDecode(result) {
    if (result.ok) displayResult(result);
  },
  onError(error) {
    showError(error);
  },
});

startButton.addEventListener("click", () => {
  void startCamera();
});
stopButton.addEventListener("click", () => {
  stopCamera();
});
cameraDevice.addEventListener("change", () => {
  selectedCameraDeviceId = cameraDevice.value || undefined;
  if (scanner.running) void restartCamera();
});
cameraZoom.addEventListener("input", () => {
  cameraZoomValue.value = formatZoom(Number(cameraZoom.value));
});
cameraZoom.addEventListener("change", () => {
  void applyCameraZoom();
});
copyButton.addEventListener("click", () => {
  void copyResult();
});
generatorForm.addEventListener("submit", (event) => {
  event.preventDefault();
  generateCode();
});
downloadSvgButton.addEventListener("click", () => {
  downloadSvg();
});
downloadPngButton.addEventListener("click", () => {
  void downloadRaster("png");
});
downloadJpegButton.addEventListener("click", () => {
  void downloadRaster("jpeg");
});
copyZplButton.addEventListener("click", () => {
  void copyZpl();
});
window.addEventListener(
  "pagehide",
  () => {
    scanner.stop();
    if (previewUrl !== undefined) URL.revokeObjectURL(previewUrl);
  },
  { once: true },
);

generateCode();

async function startCamera(): Promise<void> {
  setInterfaceState("starting", "Kamerazugriff wird angefragt …");
  startButton.disabled = true;
  cameraDevice.disabled = true;
  let stream: MediaStream | undefined;
  try {
    stream = await openPreferredCamera();
    const track = requireVideoTrack(stream);
    await configureCameraTrack(track);
    await scanner.start(stream);
    activeCameraTrack = track;
    setInterfaceState("running", "Suche nach einem RectaMatrix-Code");
    stopButton.disabled = false;
    cameraDevice.disabled = cameraDevice.options.length < 2;
  } catch (error) {
    if (stream !== undefined) stopStream(stream);
    activeCameraTrack = undefined;
    showError(error);
    startButton.disabled = false;
    stopButton.disabled = true;
    cameraDevice.disabled = cameraDevice.options.length < 2;
  }
}

async function restartCamera(): Promise<void> {
  scanner.stop();
  activeCameraTrack = undefined;
  stopButton.disabled = true;
  await startCamera();
}

function stopCamera(): void {
  scanner.stop();
  activeCameraTrack = undefined;
  cameraZoom.disabled = true;
  setInterfaceState("idle", "Kamera wurde gestoppt");
  startButton.disabled = false;
  stopButton.disabled = true;
}

async function openPreferredCamera(): Promise<MediaStream> {
  const mediaDevices = navigator.mediaDevices;
  let stream = await mediaDevices.getUserMedia(
    cameraConstraints(selectedCameraDeviceId),
  );
  try {
    const rankedDevices = rankCameraDevices(
      await mediaDevices.enumerateDevices(),
    );
    const currentDeviceId = requireVideoTrack(stream).getSettings().deviceId;
    const preferredDevice =
      rankedDevices.find(
        ({ device }) => device.deviceId === selectedCameraDeviceId,
      )?.device ?? rankedDevices[0]?.device;

    if (
      preferredDevice !== undefined &&
      preferredDevice.deviceId !== currentDeviceId
    ) {
      stopStream(stream);
      try {
        stream = await mediaDevices.getUserMedia(
          cameraConstraints(preferredDevice.deviceId),
        );
      } catch {
        stream = await mediaDevices.getUserMedia(cameraConstraints());
      }
    }

    const selectedDeviceId = requireVideoTrack(stream).getSettings().deviceId;
    selectedCameraDeviceId = selectedDeviceId || preferredDevice?.deviceId;
    populateCameraDevices(rankedDevices, selectedCameraDeviceId);
    return stream;
  } catch (error) {
    stopStream(stream);
    throw error;
  }
}

function cameraConstraints(deviceId?: string): MediaStreamConstraints {
  return {
    audio: false,
    video: {
      ...(deviceId === undefined
        ? { facingMode: { ideal: "environment" } }
        : { deviceId: { exact: deviceId } }),
      width: { ideal: 1920 },
      height: { ideal: 1080 },
      frameRate: { ideal: 30, max: 30 },
    },
  };
}

function populateCameraDevices(
  rankedDevices: ReturnType<typeof rankCameraDevices>,
  selectedDeviceId: string | undefined,
): void {
  cameraDevice.replaceChildren();
  for (const [index, ranked] of rankedDevices.entries()) {
    const option = document.createElement("option");
    option.value = ranked.device.deviceId;
    option.textContent = cameraOptionLabel(ranked, index);
    option.selected = ranked.device.deviceId === selectedDeviceId;
    cameraDevice.append(option);
  }
  if (cameraDevice.options.length === 0) {
    const option = document.createElement("option");
    option.textContent = "Aktive Rückkamera";
    cameraDevice.append(option);
  }
}

async function configureCameraTrack(track: MediaStreamTrack): Promise<void> {
  const capabilities = track.getCapabilities() as CameraCapabilities;
  const advanced: Record<string, string> = {};
  if (capabilities.focusMode?.includes("continuous") === true) {
    advanced.focusMode = "continuous";
  }
  if (capabilities.exposureMode?.includes("continuous") === true) {
    advanced.exposureMode = "continuous";
  }
  if (Object.keys(advanced).length > 0) {
    try {
      await track.applyConstraints({
        advanced: [advanced],
      });
    } catch {
      // Optional camera controls differ considerably between mobile browsers.
    }
  }

  const settings = track.getSettings() as CameraSettings;
  const width = settings.width;
  const height = settings.height;
  cameraNote.textContent =
    width === undefined || height === undefined
      ? "Rückkamera · Verarbeitung im Browser"
      : `${String(width)} × ${String(height)} · Verarbeitung im Browser`;
  configureZoomControl(capabilities.zoom, settings.zoom);
}

function configureZoomControl(
  zoom: MediaSettingsRange | undefined,
  currentZoom: number | undefined,
): void {
  cameraZoom.disabled = true;
  const minimum = zoom?.min;
  const maximum = zoom?.max;
  const step = zoom?.step;
  const available =
    typeof minimum === "number" &&
    typeof maximum === "number" &&
    Number.isFinite(minimum) &&
    Number.isFinite(maximum) &&
    maximum > minimum;
  cameraZoomControl.hidden = !available;
  if (!available) return;

  cameraZoom.min = String(minimum);
  cameraZoom.max = String(maximum);
  cameraZoom.step = String(typeof step === "number" && step > 0 ? step : 0.1);
  cameraZoom.value = String(
    Math.min(maximum, Math.max(minimum, currentZoom ?? 1)),
  );
  cameraZoomValue.value = formatZoom(Number(cameraZoom.value));
  cameraZoom.disabled = false;
}

async function applyCameraZoom(): Promise<void> {
  const track = activeCameraTrack;
  if (track === undefined) return;
  const zoom = Number(cameraZoom.value);
  try {
    await track.applyConstraints({
      advanced: [{ zoom } as MediaTrackConstraintSet],
    });
  } catch {
    scannerStatus.textContent = "Der gewählte Zoom wird nicht unterstützt";
  }
}

function requireVideoTrack(stream: MediaStream): MediaStreamTrack {
  const track = stream.getVideoTracks()[0];
  if (track === undefined) {
    stopStream(stream);
    throw new BrowserAdapterError(
      "CAMERA_START_FAILED",
      "Die Kamera liefert kein Videobild.",
    );
  }
  return track;
}

function stopStream(stream: MediaStream): void {
  for (const track of stream.getTracks()) track.stop();
}

function formatZoom(value: number): string {
  return `${value.toLocaleString("de-DE", { maximumFractionDigits: 1 })}×`;
}

function displayResult(result: Extract<ImageDecodeResult, { ok: true }>): void {
  successfulScans += 1;
  copyValue = result.type === "utf8" ? result.text : formatBytes(result.bytes);

  resultTitle.textContent =
    result.type === "utf8" ? "Text erkannt" : "Binärdaten erkannt";
  resultCount.textContent = String(successfulScans).padStart(2, "0");
  resultOutput.replaceChildren();

  const value = document.createElement("p");
  value.className = "output-value";
  value.textContent = copyValue;
  resultOutput.append(value);

  confidenceValue.textContent = formatPercent(
    result.metadata.quality.overallConfidence,
  );
  orientationValue.textContent = String(result.vision.orientationDegrees) + "°";
  correctionValue.textContent = String(
    result.metadata.quality.correctedCodewords,
  );
  eccValue.textContent = result.metadata.eccLevel;
  lastScanTime.textContent = `Erkannt um ${new Intl.DateTimeFormat("de-DE", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).format(new Date())}`;
  copyButton.disabled = false;

  document.body.classList.remove("scan-found");
  requestAnimationFrame(() => {
    document.body.classList.add("scan-found");
  });
  scannerStatus.textContent = "Code erkannt · Scanner bleibt aktiv";
}

async function copyResult(): Promise<void> {
  if (copyValue.length === 0) return;
  try {
    await navigator.clipboard.writeText(copyValue);
    copyButton.textContent = "Kopiert";
    window.setTimeout(() => {
      copyButton.textContent = "Kopieren";
    }, 1600);
  } catch {
    scannerStatus.textContent = "Kopieren wurde vom Browser blockiert";
  }
}

function showError(error: unknown): void {
  const message =
    error instanceof BrowserAdapterError
      ? browserErrorMessage(error)
      : "Die Kamera konnte nicht gestartet werden.";
  setInterfaceState("error", message);
}

function browserErrorMessage(error: BrowserAdapterError): string {
  switch (error.code) {
    case "CAMERA_UNAVAILABLE":
      return "Dieser Browser stellt keine Kamera bereit.";
    case "CAMERA_START_FAILED":
      return "Kamerazugriff abgelehnt oder Kamera bereits belegt.";
    case "VIDEO_NOT_READY":
      return "Das Kamerabild ist noch nicht bereit.";
    default:
      return error.message;
  }
}

function setInterfaceState(
  state: "error" | "idle" | "running" | "starting",
  message: string,
): void {
  document.body.dataset.scanner = state;
  scannerStatus.textContent = message;
  cameraBadgeText.textContent =
    state === "running"
      ? "Live"
      : state === "starting"
        ? "Verbindet"
        : state === "error"
          ? "Fehler"
          : "Offline";
}

function formatBytes(bytes: Uint8Array): string {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join(
    " ",
  );
}

function formatPercent(value: number): string {
  return String(Math.round(value * 100)) + " %";
}

function generateCode(): void {
  try {
    const content = generatorInput.value;
    const moduleSize = Number(generatorModuleSize.value);
    const quietZoneProfile = parseQuietZoneProfile(generatorQuietZone.value);
    const symbol = encodeText(content, {
      eccLevel: parseEccLevel(generatorEcc.value),
      compression: "auto",
    });
    const svg = renderSvg(symbol, { moduleSize, quietZoneProfile });
    const zpl = renderZpl(symbol, { moduleSize, quietZoneProfile });
    generatedCode = { symbol, svg, zpl, moduleSize, quietZoneProfile };
    updateGeneratorPreview(generatedCode);
    generatorStatus.textContent = "Code wurde erfolgreich erzeugt.";
    generatorStatus.dataset.state = "success";
  } catch (error) {
    generatedCode = undefined;
    generatorStatus.textContent =
      error instanceof Error
        ? error.message
        : "Der Code konnte nicht erzeugt werden.";
    generatorStatus.dataset.state = "error";
  }
}

function updateGeneratorPreview(code: GeneratedCode): void {
  if (previewUrl !== undefined) URL.revokeObjectURL(previewUrl);
  previewUrl = URL.createObjectURL(
    new Blob([code.svg], { type: "image/svg+xml;charset=utf-8" }),
  );
  generatorImage.src = previewUrl;
  generatorGeometry.textContent =
    String(code.symbol.width) +
    " × " +
    String(code.symbol.height) +
    " Module · " +
    (code.quietZoneProfile === "compact" ? "Compact QZ 2" : "Standard QZ 4");
  generatorBytes.textContent = String(code.symbol.originalLength) + " Byte";
  generatorMask.textContent = "M" + String(code.symbol.maskId);
  generatorCompression.textContent = code.symbol.compression;
  zplOutput.value = code.zpl;
}

function downloadSvg(): void {
  if (generatedCode === undefined) return;
  downloadBlob(
    new Blob([generatedCode.svg], { type: "image/svg+xml;charset=utf-8" }),
    "rectamatrix.svg",
  );
}

async function downloadRaster(format: "jpeg" | "png"): Promise<void> {
  if (generatedCode === undefined) return;
  setDownloadButtonsDisabled(true);
  try {
    const options = {
      moduleSize: generatedCode.moduleSize,
      quietZoneProfile: generatedCode.quietZoneProfile,
    };
    const blob =
      format === "png"
        ? await renderPng(generatedCode.symbol, options)
        : await renderJpeg(generatedCode.symbol, {
            ...options,
            quality: 0.94,
          });
    downloadBlob(blob, "rectamatrix." + (format === "png" ? "png" : "jpg"));
    generatorStatus.textContent = format.toUpperCase() + " wurde erstellt.";
    generatorStatus.dataset.state = "success";
  } catch (error) {
    generatorStatus.textContent =
      error instanceof Error
        ? error.message
        : "Die Rasterdatei konnte nicht erstellt werden.";
    generatorStatus.dataset.state = "error";
  } finally {
    setDownloadButtonsDisabled(false);
  }
}

function setDownloadButtonsDisabled(disabled: boolean): void {
  downloadSvgButton.disabled = disabled;
  downloadPngButton.disabled = disabled;
  downloadJpegButton.disabled = disabled;
  copyZplButton.disabled = disabled;
}

async function copyZpl(): Promise<void> {
  if (generatedCode === undefined) return;
  try {
    await navigator.clipboard.writeText(generatedCode.zpl);
    generatorStatus.textContent = "ZPL-Code wurde kopiert.";
    generatorStatus.dataset.state = "success";
  } catch {
    zplOutput.focus();
    zplOutput.select();
    generatorStatus.textContent =
      "Automatisches Kopieren blockiert – ZPL-Code ist markiert.";
    generatorStatus.dataset.state = "error";
  }
}

function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  window.setTimeout(() => {
    URL.revokeObjectURL(url);
  }, 0);
}

function parseEccLevel(value: string): "high" | "low" | "medium" {
  if (value === "low" || value === "medium" || value === "high") return value;
  throw new Error("Unbekanntes Fehlerkorrektur-Level.");
}

function parseQuietZoneProfile(value: string): QuietZoneProfile {
  if (value === "compact" || value === "standard") return value;
  throw new RangeError("Unbekanntes Ruhezone-Profil.");
}

function requiredElement<T extends Element>(
  id: string,
  constructor: new (...arguments_: never[]) => T,
): T {
  const element = document.getElementById(id);
  if (!(element instanceof constructor)) {
    throw new Error(`Required element #${id} is missing.`);
  }
  return element;
}
