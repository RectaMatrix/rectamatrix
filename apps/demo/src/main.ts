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
import "./style.css";

const video = requiredElement("camera", HTMLVideoElement);
const startButton = requiredElement("start-button", HTMLButtonElement);
const stopButton = requiredElement("stop-button", HTMLButtonElement);
const copyButton = requiredElement("copy-button", HTMLButtonElement);
const scannerStatus = requiredElement("scanner-status", HTMLSpanElement);
const cameraBadgeText = requiredElement("camera-badge-text", HTMLSpanElement);
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

interface GeneratedCode {
  readonly symbol: EncodedSymbol;
  readonly svg: string;
  readonly zpl: string;
  readonly moduleSize: number;
  readonly quietZoneProfile: QuietZoneProfile;
}

const scanner = new RectaMatrixCameraScanner(video, {
  scanIntervalMilliseconds: 240,
  stopOnSuccess: false,
  detector: {
    maximumCandidates: 48,
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
  try {
    await scanner.start();
    setInterfaceState("running", "Suche nach einem RectaMatrix-Code");
    stopButton.disabled = false;
  } catch (error) {
    showError(error);
    startButton.disabled = false;
    stopButton.disabled = true;
  }
}

function stopCamera(): void {
  scanner.stop();
  setInterfaceState("idle", "Kamera wurde gestoppt");
  startButton.disabled = false;
  stopButton.disabled = true;
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
