import { RectaMatrixCameraScanner } from "@rectamatrix/browser";

const video = document.querySelector("video[data-rectamatrix]");
if (!(video instanceof HTMLVideoElement)) {
  throw new Error("A <video data-rectamatrix> element is required.");
}

const scanner = new RectaMatrixCameraScanner(video, {
  scanIntervalMilliseconds: 200,
  detector: {
    maximumCandidates: 48,
    minimumModulePixels: 3,
  },
  onDecode(result) {
    if (!result.ok) return;
    if (result.type === "utf8") {
      console.log(result.text);
    } else {
      console.log(result.bytes);
    }
  },
  onError(error) {
    console.warn(error.code, error.message);
  },
});

await scanner.start();
window.addEventListener(
  "pagehide",
  () => {
    scanner.stop();
  },
  { once: true },
);
