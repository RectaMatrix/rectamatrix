# Specification Implementation Notes

The English RectaMatrix 2D Barcode Specification v1.0 is normative. The German
document was read in full as an informative translation. Numeric constants and
wire-format definitions agree between the two documents.

## 1. Anchor-like mask penalty

**Reference:** English section 25.3; German section 25.3.

**Issue:** The text says to detect a sequence matching the ratio `1:1:3:1:1`
or its direct inversion, but it does not state whether runs may be scaled, how
surrounding runs affect a match, or whether overlapping seven-module windows
are counted.

**Initial decision:** Keep this rule isolated in the future penalty module. The
provisional smallest interpretation will count each exact seven-module window
`1011101` or `0100010`, including overlapping windows. A known-answer
conformance vector is required before this behavior is declared stable.

**Interoperability:** Yes. Different interpretations can select a different
mask and therefore produce different final matrices, although decoders can
still decode any explicitly signaled mask.

**Proposed erratum:** Specify the exact bit patterns, window length, overlap
behavior, boundary behavior, and whether integer-scaled run ratios count.

## 2. Adaptive compression threshold

**Reference:** Sections 15, 27, and reference pseudocode in section 57.

**Issue:** Section 15 permits compression whenever it saves one byte but
recommends requiring a two-byte saving. The reference pseudocode uses the
two-byte rule.

**Decision:** `auto` mode will use the reference-pseudocode rule:
`compressedLength + 2 <= originalLength`. Explicit `rm-lz1` mode must still
obey the normative `compressedLength < originalLength` rule and will reject an
input for which RM-LZ1 does not save at least one byte.

**Interoperability:** Matrix selection and mask choice may differ across
encoders, but both representations are decodable.

**Proposed erratum:** State one mandatory deterministic rule for the official
reference encoder and distinguish it from general conforming encoders.

## 3. RM-LZ1 final flag group

**Reference:** Sections 16.3 and 16.8.

**Issue:** Unused final flag bits must be zero, but the validation list does not
spell out how a decoder identifies them after the declared output length is
reached.

**Decision:** The token that reaches `originalLength` is the final token. All
higher flag bits in that group must be zero and no encoded bytes may remain.

**Interoperability:** Only malformed streams are affected.

**Proposed erratum:** Add the preceding rule to the normative decoder
algorithm.

## 4. Sampled-matrix orientation

**Reference:** Sections 34, 40, 50, and 62; phase-one API request.

**Issue:** Full image decoders must test four orientations, while the sampled
matrix handoff includes an orientation and the requested `SampledSymbol` API
contains only a matrix. It is unclear whether that matrix must already be
normalized.

**Decision:** The initial image-independent decoder will require a normalized,
correctly oriented `W × H` matrix. Rotation belongs to the future vision/handoff
adapter unless the public API is later extended explicitly.

**Interoperability:** No wire-format impact; API expectations are affected.

**Proposed erratum:** State whether sampled symbols are normalized before the
symbol decoder and define a separate rotation-normalization API if required.

## 5. Alternative erasure profiles

**Reference:** Sections 41, 43, and 62.5.

**Issue:** Profile A is numeric, but “slightly stricter” and “slightly more
permissive” Profiles B and C have no thresholds.

**Decision:** The decoder uses four named, bounded profiles and stops
immediately after a CRC-valid result:

1. `reference`: the exact recommended thresholds from sections 41 and 43;
2. `strict`: Header low-bit `0.35`/count `2`/mean `0.45`; Body low-bit
   `0.40`/count `2`/mean `0.50`/minimum `0.20`;
3. `permissive`: Header low-bit `0.15`/count `3`/mean `0.25`; Body low-bit
   `0.20`/count `4`/mean `0.30`/minimum `0.05`;
4. `none`: no erasures.

The last three profiles are explicitly implementation policy rather than
normative constants. Duplicate erasure sets and duplicate corrected Headers are
not retried.

**Interoperability:** Decode success at the correction boundary may vary.

**Proposed erratum:** Publish exact thresholds and the maximum attempt count.

## 6. Overall-confidence formula

**Reference:** Section 61.4.

**Issue:** Required inputs are listed but no formula or weighting is defined.

**Decision:** Treat the formula as implementation policy, not a conformance
property. Without image metadata, the reference formula is `40%` structural
agreement, `40%` average module confidence, and `20%` correction headroom.
When `imageQuality` is present, the weights are `30%`, `30%`, `20%`, and `20%`
respectively. Structural agreement is the mean of Anchor, top Clocking, and
left Clocking scores. Correction headroom decreases with corrected and erased
Header and Body codewords. Every raw metric remains available.

**Interoperability:** No bitstream impact; quality reports may differ.

**Proposed erratum:** Define a reference formula or explicitly declare the
field implementation-specific and non-comparable.

## 7. Matrix and Quiet Zone ownership

**Reference:** Sections 5, 27, 28, 29, and 63.3.

**Issue:** The Quiet Zone is not part of `W × H`, but the encoder pipeline says
to render it and the API example exposes a `matrix` without saying whether it
contains the Quiet Zone.

**Decision:** `EncodedSymbol.matrix` contains exactly `W × H` symbol modules.
Renderers add a caller-selected Quiet Zone. They default to the four-module
Standard profile and expose the two-module Compact profile only through an
explicit option. Three modules are deliberately rejected because they do not
identify either normative profile.

**Interoperability:** No wire-format impact; avoids API dimension ambiguity.

**Proposed erratum:** Define the dimensions of every matrix-bearing API field.

## 8. Licensing metadata

**Reference:** Repository requirements rather than the barcode specification.

**Issue:** No license text or copyright holder was supplied.

**Decision:** Do not invent `LICENSE` or `NOTICE` content. Add them once the
project owner provides the intended license and attribution.

**Interoperability:** None.

## 9. Body alignment at a partial-capacity boundary

**Reference:** Sections 23.2 through 23.5 and 26.3.

**Issue:** A symbol fits when the codewords plus the one-bit Terminator fit.
For the `36 × 24` size, the Body capacity is not byte-aligned. At maximum
codeword use there may be too few physical modules to append every alignment
zero described in section 23.3.

**Decision:** The finite Body region truncates the alignment zeros when it ends
before the next byte boundary. Padding begins only if a byte boundary is
reached. This follows the capacity rule in section 26.3 and never truncates a
codeword or the Terminator.

**Interoperability:** The affected positions are ignored by decoders, but a
different padding interpretation could change mask scores and the selected
matrix.

**Proposed erratum:** Explicitly state that Terminator, alignment, and padding
are written in order and truncated at the physical Body capacity.

## 10. Reference image detector policy

**Reference:** Sections 30 through 40, 61, 62, and 63.4.

**Issue:** The specification standardizes the normalized computer-vision
handoff but intentionally permits different preprocessing, contour, sampling,
confidence, and quality algorithms.

**Decision:** The TypeScript reference detector uses alpha-on-white grayscale
and a seven-sample default. Candidate discovery evaluates a global Otsu mask
and a local photometric mask. Local tiles are 32 through 96 pixels depending on
image size; their 5th, 50th, and 95th percentiles must show at least 12 intensity
levels of foreground separation and 65% of the local percentile span. Isolated
pixels with fewer than three foreground samples in a 3×3 neighborhood are
removed. Each module is sampled over its inner 20–80% through a homography and
reduced with a 10% trimmed mean. Black and white references come from the
expected Micro-Anchor and Clocking modules. Confidence combines normalized
threshold separation with within-module variance.

Image quality is `55%` normalized contrast, `35%` mean module confidence, and
`10%` quadrilateral geometry. Blur estimate combines contrast loss with a
bounded within-module-variance term. Perspective estimate is the mean absolute
deviation of quadrilateral corner angles from 90 degrees.

Automatic candidate discovery uses a fast path for one tightly cropped image
whose Quiet Zone is exactly two or four through six modules. Larger scenes use bounded
row/column foreground projections and a coarse module-scale connected-component
mask to separate regions. For each region the detector ranks axis-aligned
rectangles, foreground-extrema quadrilaterals, small inward blur compensations,
and Clocking-edge extensions for all four possible Anchor corners. Candidates
are evaluated in deterministic rank order and the first CRC-valid Payload is
returned. An explicit source quadrilateral remains available when an
application has a stronger external locator. Inverted sampling is opt-in.
Search is capped by validated pixel and candidate limits.

Merged regions outside a generous single-symbol aspect tolerance trigger a
bounded fixed-pattern search of at most 300,000 probes. Micro-Anchor evidence
has 80% weight and Clocking evidence 20%, because different Size IDs can share
the same physical outer and Anchor geometry at different module scales.
Anchor-derived rectangles are refined against foreground extrema and immediate
outer-edge contrast, deduplicated at `0.8` intersection-over-union, and capped
at 32 before entering the public candidate limit.

This deterministic locator is intended for isolated planar symbols. It covers
smooth illumination gradients, isolated impulse noise, synthetic structured
backgrounds, small detached clutter, directional blur, and glare, but does not
claim recovery of physically overprinted symbols, arbitrary natural textures,
curved surfaces, or severe motion blur. Larger Body reflections remain bounded
by the selected Reed–Solomon capacity.

**Interoperability:** Payload success and minimum quality thresholds are the
portable image-conformance criteria. Exact normalized modules and confidences
are reference artifacts for reproducing this detector, not mandatory outputs
of every conforming image detector.

**Proposed erratum:** Publish a named optional reference detector algorithm, or
state more explicitly which image-level quality fields are comparable only
within one implementation.
