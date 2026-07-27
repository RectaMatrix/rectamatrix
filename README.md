# RectaMatrix

[![CI](https://github.com/RectaMatrix/rectamatrix/actions/workflows/ci.yml/badge.svg)](https://github.com/RectaMatrix/rectamatrix/actions/workflows/ci.yml)
[![License](https://img.shields.io/badge/license-Apache--2.0-blue.svg)](LICENSE)
[![Status](https://img.shields.io/badge/format-v2%20draft-orange.svg)](spec/RECTAMATRIX-SPEC-v2-DRAFT-EN.md)

**[Open the RectaMatrix live demo](https://rectamatrix.github.io/rectamatrix/apps/demo/)**

RectaMatrix is an experimental rectangular binary 2D barcode with 3:2, 2:1,
and 3:1 geometry families. This repository contains the format specification, the official
TypeScript reference implementation, conformance vectors, examples, and an
interactive browser demo.

> [!IMPORTANT]
> RectaMatrix is currently a **Version 2 working draft**, not a stable industry
> standard. Symbols should be used together with a compatible RectaMatrix
> decoder. Format changes remain possible before the first stable release.

## At a glance

| Property         | Current format                                           |
| ---------------- | -------------------------------------------------------- |
| Geometry         | Rectangular, 3:2, 2:1, and 3:1                           |
| Symbol sizes     | 30 geometries from 24×16 through 288×96 modules          |
| Payloads         | Binary and strict UTF-8 text                             |
| Error correction | Reed–Solomon over GF(256), four ECC levels               |
| Compression      | Deterministic RM-LZ1                                     |
| Quiet Zone       | Standard 4 modules; Compact 2 modules for controlled use |
| Output           | SVG, PNG, JPEG, and ZPL                                  |
| Input            | Sampled matrices, image data, and browser camera frames  |

## Repository map

- [`spec/`](spec/) — English normative specification and German translation.
- [`packages/`](packages/) — TypeScript encoder, decoder, detector, browser,
  core, and conformance packages.
- [`apps/demo/`](apps/demo/) — interactive encoder, export, image decode, and
  live-camera demo.
- [`conformance/`](conformance/) — schemas, canonical vectors, and generated
  interoperability artifacts.
- [`examples/`](examples/) — focused API examples.
- [`docs/`](docs/) — architecture, compatibility, conformance, and roadmap.

## Quick start

Requirements: Node.js 22 or newer and pnpm 11.9.0.

```sh
git clone https://github.com/RectaMatrix/rectamatrix.git
cd rectamatrix
pnpm install --frozen-lockfile
pnpm check
pnpm demo
```

The local demo is then available at `http://127.0.0.1:5173/`. The latest
`main` build is published as the
[RectaMatrix live demo](https://rectamatrix.github.io/rectamatrix/apps/demo/).

## Encode and export

```ts
import { encodeText, renderSvg, renderZpl } from "@rectamatrix/encoder";

const symbol = encodeText("Hello RectaMatrix!", {
  eccLevel: "medium",
  compression: "auto",
});

const svg = renderSvg(symbol, { moduleSize: 8 });
const zpl = renderZpl(symbol, { moduleSize: 8 });
```

Browser applications can additionally use `renderPng` and `renderJpeg` from
`@rectamatrix/browser`. See [`examples/`](examples/) for complete samples,
including a ready-to-save [ZPL label](examples/generate-zpl.ts).

## Decode

```ts
import { decodeSampledSymbol } from "@rectamatrix/decoder";

const result = decodeSampledSymbol({ modules: symbol.matrix });
if (result.ok && result.type === "utf8") {
  console.log(result.text, result.metadata.quality);
}
```

Use `@rectamatrix/detector` for RGBA/PGM image data and
`@rectamatrix/browser` for managed camera scanning.

## Packages

| Package                    | Purpose                                                                   |
| -------------------------- | ------------------------------------------------------------------------- |
| `@rectamatrix/core`        | Format constants, geometry, compression, CRC, and Reed–Solomon primitives |
| `@rectamatrix/encoder`     | Binary/text encoding, trace data, SVG, and ZPL output                     |
| `@rectamatrix/decoder`     | Sampled-matrix decoding and confidence-guided erasures                    |
| `@rectamatrix/detector`    | Image detection, projective sampling, and image decoding                  |
| `@rectamatrix/browser`     | Canvas export, video capture, and camera scanning                         |
| `@rectamatrix/conformance` | Language-neutral vector validation and verification                       |

The packages intentionally remain private during the format-candidate phase.
Preview releases are distributed as source and conformance archives on GitHub;
no npm stability promise is made yet.

## Specification and conformance

Version 1 is retained as the documented prototype but is no longer emitted by
the reference implementation. The active format is the experimental Version 2
redesign. The
[English v2 architecture draft](spec/RECTAMATRIX-SPEC-v2-DRAFT-EN.md) and its
[German counterpart](spec/RECTAMATRIX-SPEC-v2-DRAFT-DE.md) define the proposed
64-bit Header, high-level encoding, finer 3:2 sizes, and new 2:1 and 3:1
geometry families. These drafts remain non-normative while RM-HLE1 and the new
locator are completed and tested.

The current suite contains 164 canonical artifacts: 107 encoder vectors, 15
positive decoder vectors, 19 negative decoder vectors, and 23 portable image
vectors. `pnpm verify:vectors` performs byte-, bit-, and matrix-exact
verification.

See [Compatibility](docs/COMPATIBILITY.md) before persisting symbols and
[Conformance](docs/CONFORMANCE.md) before claiming interoperability.

## Development

```sh
pnpm check          # formatting, lint, types, tests, spec, and vectors
pnpm build          # build all packages and the demo
pnpm release:check  # full release gate
```

Changes to the wire format must update both specification languages, the
machine-readable constants, and the conformance vectors in the same pull
request. Details are in [CONTRIBUTING.md](CONTRIBUTING.md).

## Project policy

- [Roadmap](docs/ROADMAP.md)
- [Governance](GOVERNANCE.md)
- [Security policy](SECURITY.md)
- [Code of conduct](CODE_OF_CONDUCT.md)
- [Changelog](CHANGELOG.md)

Licensed under the [Apache License 2.0](LICENSE).
