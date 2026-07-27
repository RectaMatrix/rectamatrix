export type CameraLensKind =
  "front" | "main" | "other" | "telephoto" | "ultrawide";

export interface RankedCameraDevice {
  readonly device: MediaDeviceInfo;
  readonly kind: CameraLensKind;
  readonly score: number;
}

const REAR_PATTERN = /\b(back|rear|environment|hinten|r[üu]ck)\b/i;
const FRONT_PATTERN = /\b(front|user|vorne|selfie)\b/i;
const MAIN_PATTERN =
  /\b(main|primary|standard|wide camera)|1(?:[.,]0)?\s*[x×]/i;
const ULTRAWIDE_PATTERN = /\b(ultra[\s-]?wide|super[\s-]?wide)|0[.,]5\s*[x×]/i;
const TELEPHOTO_PATTERN = /\b(tele(?:photo)?|optical zoom)|[2-9]\s*[x×]/i;
const AUXILIARY_PATTERN = /\b(macro|depth|tof|infrared|ir camera)\b/i;
const ANDROID_MAIN_CAMERA_PATTERN = /\bcamera2?\s*0\b/i;

export function rankCameraDevices(
  devices: readonly MediaDeviceInfo[],
): readonly RankedCameraDevice[] {
  return devices
    .filter((device) => device.kind === "videoinput")
    .map((device, index) => rankCameraDevice(device, index))
    .sort((left, right) => right.score - left.score);
}

export function cameraOptionLabel(
  ranked: RankedCameraDevice,
  index: number,
): string {
  const label = ranked.device.label.trim() || `Kamera ${String(index + 1)}`;
  switch (ranked.kind) {
    case "main":
      return `${label} · Hauptkamera`;
    case "ultrawide":
      return `${label} · Ultraweitwinkel`;
    case "telephoto":
      return `${label} · Tele`;
    case "front":
      return `${label} · Frontkamera`;
    default:
      return label;
  }
}

function rankCameraDevice(
  device: MediaDeviceInfo,
  index: number,
): RankedCameraDevice {
  const label = device.label.normalize("NFKD").toLowerCase();
  let score = -index;
  let kind: CameraLensKind = "other";

  if (REAR_PATTERN.test(label)) score += 300;
  if (ANDROID_MAIN_CAMERA_PATTERN.test(label)) {
    score += 180;
    kind = "main";
  }
  if (MAIN_PATTERN.test(label)) {
    score += 220;
    kind = "main";
  }
  if (TELEPHOTO_PATTERN.test(label)) {
    score -= 120;
    kind = "telephoto";
  }
  if (AUXILIARY_PATTERN.test(label)) score -= 260;
  if (ULTRAWIDE_PATTERN.test(label)) {
    score -= 500;
    kind = "ultrawide";
  }
  if (FRONT_PATTERN.test(label)) {
    score -= 1_000;
    kind = "front";
  }

  return { device, kind, score };
}
