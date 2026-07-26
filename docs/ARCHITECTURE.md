# Architecture

## Package boundaries

`@rectamatrix/core` owns all deterministic, image-independent algorithms and
wire-format definitions. It must remain free of DOM, Canvas, camera, and image
processing dependencies.

`@rectamatrix/encoder` composes the core primitives into the complete
payload-to-matrix pipeline. It renders SVG directly from the module matrix and
ZPL as deterministic, uncompressed ASCII-hexadecimal `^GFA` data.
`@rectamatrix/decoder` consumes an already sampled module matrix, with optional
module confidences.

`@rectamatrix/detector` owns the image-facing reference pipeline. It converts
RGBA to grayscale, identifies tightly cropped Quiet-Zone geometry, discovers
separated foreground regions in larger scenes, or accepts an explicit source
quadrilateral. It samples projective hypotheses and passes the normalized
matrix to `@rectamatrix/decoder`. It has no DOM or Canvas dependency.

`@rectamatrix/browser` is the only package that depends on browser media and
Canvas APIs. It copies a bounded video frame into the detector's immutable
image-data handoff. The camera scanner owns streams that it requests itself,
stops their tracks on success or shutdown, and leaves caller-provided streams
open unless explicitly configured otherwise. It also renders an encoded module
matrix directly to bounded PNG or JPEG Canvas output without changing the
deterministic symbol.

`@rectamatrix/conformance` validates language-neutral fixtures without
introducing codec behavior of its own.

## Data ownership

Public matrices, coordinates, constants, and metadata are exposed as readonly
values. Core constructors freeze returned aggregate data where practical.
Binary inputs are never exposed as mutable internal storage.

## Encoding pipeline

The planned pipeline is strict input validation, UTF-8 conversion where needed,
CRC-32C, optional RM-LZ1, frame creation, RS block creation, interleaving, body
bit creation, header protection, four-mask evaluation, and final matrix
construction.

## Decoding pipeline

The decoder validates geometry and every confidence value before reading the
Header. It validates the Micro-Anchor and both Clocking Patterns, aggregates
module confidences into byte confidences, and then tries a bounded sequence of
named erasure profiles. Every corrected Header is checked against the sampled
geometry and against strict length limits.

The Body is unmasked and deinterleaved before block-level RS correction.
RM-LZ1 output is bounded by the declared original length. CRC-32C is validated
before Binary data is returned or strict UTF-8 decoding is attempted.

No corrected payload is returned before CRC validation succeeds. Alternative
attempts stop immediately after the first CRC-valid result.

## Computer vision and confidence

The stable handoff is a rectangular boolean module matrix plus an optional
same-sized matrix of finite confidence values in `[0, 1]`. The detector
additionally provides blur, perspective, orientation, source-quadrilateral, and
image-quality metadata. Anchor and Clocking scores are calculated from the
normalized matrix. The symbol decoder remains deterministic for an identical
handoff.

The reference sampler maps the inner 20–80% of each module through a
homography, takes a trimmed mean, estimates black and white references from the
Micro-Anchor and Clocking Patterns, and derives confidence from threshold
separation and within-module variance.

Automatic candidate discovery first uses a fast path for a tightly cropped
symbol with a two-module Compact or four- through six-module Standard Quiet
Zone. For larger scenes it applies
both a global Otsu hypothesis and local percentile-based thresholds over
bounded tiles. The local path requires a distinct foreground cluster within a
tile, which avoids treating a smooth illumination gradient as symbol ink. A
3×3 neighborhood filter removes isolated foreground pixels. The detector
combines bounded row/column projections with a coarse connected-component mask.
The component mask groups module-scale gaps while a valid Quiet Zone keeps the
symbol separate from nearby texture. Foreground extrema produce axis-aligned
and projective hypotheses; small inward hypotheses compensate for blur-expanded
boundaries. Fixed-pattern scores reject false positives before the
sampled-symbol decoder is invoked. Spatially separated regions produce
independent candidates, and all four orientations are tested. Ranked candidates
are tried in deterministic order and processing stops at the first CRC-valid
Payload.

If a merged foreground region no longer has a plausible single-symbol aspect
ratio, a bounded search probes Micro-Anchor and Clocking evidence at integer
module scales. Confirmed L-shaped Anchors are refined against their dark inner
and light outer edges, non-maximum suppression removes duplicate rectangles,
and at most 32 Anchor-derived hypotheses enter the normal candidate limit. This
separates overlapping candidate projections when both physical symbols and
their Anchors remain intact.

Search is bounded by `maximumPixels` and `maximumCandidates` (48 by default).
`minimumModulePixels` defaults to three and prevents undersampled hypotheses.
The current deterministic region extractor targets isolated planar symbols. It
handles illumination gradients, isolated impulse noise, synthetic structured
backgrounds, small detached clutter, moderate directional blur, and glare.
Larger Body reflections can be recovered within ECC capacity. Physically
overprinted symbols, arbitrary natural textures, curved surfaces, and severe
motion blur remain future work.

## Security model

All encoded lengths, matrix dimensions, indices, block counts, and confidence
values are validated before use. RM-LZ1 decompression is bounded by the declared
original length. Alternative erasure attempts will be finite and deterministic.

Browser capture is bounded independently by pixel count and maximum dimension.
Scanning is serialized so that a slow decode cannot overlap the next frame.
Camera access remains subject to browser permission and secure-context rules;
the adapter does not retain frames or transmit payloads.
