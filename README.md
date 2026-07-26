# RectaMatrix TypeScript Reference Implementation

This directory contains the developing official TypeScript reference
implementation of the RectaMatrix 2D barcode specification.

RectaMatrix is a new rectangular binary matrix code. The technology is not yet
widely supported, so encoded symbols should currently be used together with a
compatible decoder and the published conformance vectors.

## Status

The deterministic Version 1 codec and its canonical sampled-matrix conformance
suites are implemented. The repository currently contains:

- the monorepo and package boundaries;
- machine-readable Version 1 constants and calculated capacities;
- geometry, reserved-module, Micro-Anchor, Clocking, and scan-order primitives;
- bit/byte utilities and strict UTF-8 conversion;
- CRC-32C;
- deterministic RM-LZ1 compression and strict decompression;
- GF(256) arithmetic and polynomial operations;
- systematic Reed-Solomon encoding and decoding with erasure support;
- deterministic RS block layout, interleaving, and deinterleaving;
- Format Header construction, RS protection, correction, and validation;
- complete deterministic Binary and UTF-8 matrix encoding;
- dependency-free SVG rendering with a validated Quiet Zone;
- sampled-matrix decoding with validated module confidences;
- deterministic Header and Body erasure profiles;
- RS correction, bounded decompression, CRC validation, and strict UTF-8 output;
- standardized decode-quality metadata;
- a DOM-free reference image detector with grayscale conversion, Otsu
  thresholding, bounded scene-region and quadrilateral discovery, projective
  sampling, orientation normalization, confidence, inversion support, and
  image-quality metadata;
- a browser adapter for bounded Canvas frame capture and managed camera
  scanning, with explicit stream ownership and cleanup, plus bounded PNG and
  JPEG rendering;
- a complete encoder Trace API for normative intermediate values;
- a strict JSON Schema and runtime validator for encoder vectors;
- 32 canonical positive encoder vectors covering Unicode, Binary, compression,
  all geometries, all ECC Levels, and every uncompressed capacity boundary;
- 19 canonical negative decoder vectors covering malformed geometry,
  confidence and detector metadata, damaged structural patterns, RS failures,
  invalid Headers, truncation, CRC, UTF-8, and RM-LZ1 failures;
- 15 canonical positive decoder vectors covering unknown-error correction,
  confidence-guided Erasures, all four deterministic Erasure profiles, every
  ECC Level, compressed UTF-8, detector metadata, and multi-block correction;
- 22 portable PGM image vectors covering scene placement, automatic and
  explicit perspective, orientation, local illumination, isolated noise,
  structured backgrounds, overlapping candidate projections, motion blur,
  larger reflections, glare, small clutter, contrast, blur, shadow, occlusion,
  inversion, and negative images;
- byte-exact, bit-exact, and matrix-exact reproducibility verification.

The automatic scene search handles separated planar symbol regions, local
illumination changes, isolated noise, synthetic structured backgrounds, small
detached clutter, directional blur, glare, and all four orientations.
Overlapping candidate projections can be split while both Anchors remain
visible. Physically overprinted symbols, arbitrary natural photographic
textures, curved surfaces, and severe motion blur remain future work.

## Packages

- `@rectamatrix/core`: deterministic, image-independent primitives.
- `@rectamatrix/encoder`: deterministic symbol encoding and SVG output.
- `@rectamatrix/decoder`: sampled-matrix decoding and confidence handling.
- `@rectamatrix/detector`: RGBA/PGM image sampling and image-to-Payload decoding.
- `@rectamatrix/browser`: bounded video-frame capture and camera scanning.
- `@rectamatrix/conformance`: language-neutral vector creation, validation, and
  verification.

## Development

Node.js 22 or newer and pnpm are required.

```sh
pnpm install
pnpm check
```

Individual commands include `pnpm test`, `pnpm typecheck`, `pnpm lint`,
`pnpm build`, `pnpm verify:spec`, `pnpm generate:vectors`, and
`pnpm verify:vectors`.

Run `pnpm demo` to open the local live-camera demo.

## Encoding

```ts
import { encodeText, renderSvg, renderZpl } from "@rectamatrix/encoder";

const symbol = encodeText("Grüße – Ελληνικά – 中文 – 😀", {
  eccLevel: "medium",
  compression: "auto",
});

const svg = renderSvg(symbol);
```

## Decoding a sampled matrix

```ts
import { decodeSampledSymbol } from "@rectamatrix/decoder";

const result = decodeSampledSymbol({
  modules: symbol.matrix,
  // confidence: optional matrix of finite values in [0, 1]
});

if (result.ok && result.type === "utf8") {
  console.log(result.text, result.metadata.quality);
}
```

## Decoding image data

```ts
import { decodeImageData, parsePortableGraymap } from "@rectamatrix/detector";

const image = parsePortableGraymap(pgmBytes);
const result = decodeImageData(image, {
  maximumCandidates: 48,
  minimumModulePixels: 3,
});

if (result.ok) {
  console.log(result.bytes, result.vision.orientationDegrees);
}
```

## Scanning with a browser camera

```ts
import { RectaMatrixCameraScanner } from "@rectamatrix/browser";

const video = document.querySelector("video");
if (!(video instanceof HTMLVideoElement)) throw new Error("Missing video");

const scanner = new RectaMatrixCameraScanner(video, {
  onDecode(result) {
    if (result.ok) console.log(result.bytes);
  },
});

await scanner.start();
```

The scanner requests the environment-facing camera by default, samples at a
bounded interval, and stops its own media tracks after the first successful
decode. Call `scanner.stop()` when leaving the page. Camera permission and the
secure-context requirement are controlled by the host browser. See
`examples/scan-camera.ts` for a minimal lifecycle example or
`packages/browser-demo` for the interactive live-camera interface.

## Rendering files in a browser

```ts
import { renderJpeg, renderPng } from "@rectamatrix/browser";
import { encodeText, renderSvg } from "@rectamatrix/encoder";

const symbol = encodeText("Hallo RectaMatrix!", { eccLevel: "medium" });
const svg = renderSvg(symbol, { moduleSize: 8, quietZone: 4 });
const png = await renderPng(symbol, { moduleSize: 8, quietZone: 4 });
const jpeg = await renderJpeg(symbol, {
  moduleSize: 8,
  quietZone: 4,
  quality: 0.94,
});
const zpl = renderZpl(symbol, { moduleSize: 8, quietZone: 4 });

// Explicit compact output for controlled backgrounds:
const compactSvg = renderSvg(symbol, {
  moduleSize: 8,
  quietZoneProfile: "compact",
});
```

SVG is the preferred lossless print output. PNG is the preferred raster format
for scanning tests; JPEG is provided for workflows that require photographic
files. ZPL output uses an uncompressed ASCII-hexadecimal `^GFA` graphic inside
a complete `^XA`/`^XZ` label format.

The English specification under `rspec/` is normative. The German document is
an informative translation. Implementation decisions and unresolved questions
are tracked in `docs/SPEC-IMPLEMENTATION-NOTES.md`.

Licensing metadata has not yet been supplied and must be settled before the
reference implementation is published.
