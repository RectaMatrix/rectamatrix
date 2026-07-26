# Conformance

The canonical positive encoder suite is stored in
`conformance/vectors/encoder-v1.json`. Positive and negative sampled-matrix
decoder suites are stored in `conformance/vectors/decoder-positive-v1.json` and
`conformance/vectors/decoder-negative-v1.json`. The image manifest is stored in
`conformance/vectors/image-v1.json`, with portable P5 PGM assets under
`conformance/vectors/images/`. Their normative file formats are described by
the corresponding JSON Schemas under
`conformance/schemas/` and enforced by strict runtime validators in
`@rectamatrix/conformance`.

A positive encoder vector contains the byte-exact input, selected options,
header information and parity, frame, block layout, block parity, interleaved
codewords, unmasked body bits, all mask scores, selected mask, and exact final
matrix. Byte sequences use hexadecimal strings and matrices use arrays of
equal-length strings containing only `0` and `1`.

Another implementation passes a positive vector only when all normative
intermediate values and the final matrix match exactly. The reference verifier
also decodes every final matrix and compares its recovered Payload bytes and
Payload Type with the vector input.

The 38 Version 1 encoder vectors cover empty Payloads, multilingual and
combining-character UTF-8, arbitrary Binary octets, automatic and explicit
RM-LZ1 compression, all seven geometries, every ECC Level, and all 21 exact
uncompressed capacity boundaries.

Run `pnpm generate:vectors` to deterministically regenerate the suite. Run
`pnpm verify:vectors` to validate all four stored manifests, reproduce them from
fresh fixtures, compare every field exactly, decode every final encoder matrix,
execute every sampled-matrix case, verify each PGM checksum byte-for-byte, and
run every image through the detector. A stale or manually changed artifact
causes a non-zero exit.

The 15 positive decoder vectors cover:

- clean Binary and compressed UTF-8 decoding;
- exact maximum unknown-error correction for Low, Medium, and High ECC;
- Header and Body correction from confidence-guided Erasures;
- mixed errors and Erasures at the RS correction boundary;
- deterministic fallback through `reference`, `strict`, `permissive`, and
  `none` Erasure profiles;
- detector metadata and its effect on the quality report;
- correction of 20 Erasures distributed across two RS blocks.

A positive decoder vector includes the sampled modules, optional per-module
confidence and detector metadata, recovered Payload, symbol metadata, selected
Erasure profiles, correction counts, attempt count, structural scores, and
complete `rmx-cv-1` quality report. All values must match exactly.

The 19 negative decoder vectors cover:

- unsupported and non-rectangular geometry;
- invalid confidence dimensions and values;
- invalid detector metadata;
- destroyed Micro-Anchor and Clocking patterns;
- Format Header and Body corruption beyond RS correction capacity;
- reserved Header fields, unsupported semantic values, and Size mismatch;
- a declared Body exceeding the sampled geometry;
- RS-correct Payload Frames with invalid CRC, strict UTF-8, or RM-LZ1 data.

A negative decoder vector passes only when decoding fails with one of its
allowed machine-readable error codes and no Payload is returned. The semantic
CRC, UTF-8, and RM-LZ1 cases deliberately recompute valid Body RS parity so that
they test the intended post-correction validation layer.

The 23 image vectors cover clean Standard and Compact profile output, automatic scene placement, all
four orientations, explicit and automatic projective rectification, a combined
local-illumination/noise/glare/clutter scene, low contrast, deterministic noise,
box blur, directional motion blur with a wider glare band, a structured
background isolated by the Quiet Zone, two overlapping candidate projections,
a larger ECC-corrected reflection, a horizontal illumination shadow, correctable
partial occlusion, inverted symbols, random patterns, damage beyond ECC
capability, a deficient Quiet Zone with an incorrect Anchor, and a blank image.

Positive image vectors contain the expected Payload, Type, Size ID,
orientation, minimum overall confidence, exact reference module matrix, and
exact reference confidence matrix. Image-level Payload and quality tolerances
remain portable across detectors; the exact handoff additionally guards
reproducibility of this TypeScript reference detector.

The first image suite uses deterministic synthetic raster sources. Cluttered
photographic backgrounds, motion blur, reflections, curved surfaces, and
overlapping multiple-candidate images remain future additions.

Vector schemas and generators are versioned with the frozen RectaMatrix core
version. Compatibility claims must state the core version and conformance-vector
version tested.
