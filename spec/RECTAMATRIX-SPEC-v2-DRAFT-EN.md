# RectaMatrix v2 – Architecture Draft

Status: **working draft, non-normative**

This draft describes the planned fundamental redesign of RectaMatrix. It does
not supersede the v1 specification until encoder, decoder, detector, reference
vectors, and both language editions agree.

## 1. Goals

RectaMatrix v2 is intended to:

* encode short structured data substantially more densely than raw bytes,
* support rectangular 3:2, 2:1, and 3:1 families,
* provide finer size increments,
* remain robustly locatable and projectively recoverable in smartphone images,
* use compact, independently protected format information,
* support arbitrary binary data and complete Unicode without loss,
* keep error correction separate from end-to-end integrity,
* permit feature evolution without consuming a wire version for every feature.

## 2. Compatibility Decision

Version 1 is treated as a prototype. Version 2 may incompatibly change the
Header, Body framing, geometries, locator, and high-level encoding.

An implementation MUST NOT emit v2 as stable until normative conformance vectors
exist. Until then, generated v2 symbols are experimental.

## 3. Format Version

The format version occupies a fixed four-bit field.

```text
0000  reserved
0001  former v1 representation
0010  RectaMatrix v2
0011–1110  future wire versions
1111  reserved for an extended version mechanism
```

A variable two-/four-bit prefix is not used. Saving two bits does not justify
the parser complexity. Encodings, integrity algorithms, and masks evolve through
separate fields and therefore do not consume a new wire version.

## 4. Geometry Families

The v2 core family uses these heights:

```text
16, 20, 24, 28, 32, 40, 48, 64, 80, 96 modules
```

Three aspect ratios are provided for each height:

| Family | Sizes (width × height) |
| --- | --- |
| 3:2 | 24×16, 30×20, 36×24, 42×28, 48×32, 60×40, 72×48, 96×64, 120×80, 144×96 |
| 2:1 | 32×16, 40×20, 48×24, 56×28, 64×32, 80×40, 96×48, 128×64, 160×80, 192×96 |
| 3:1 | 48×16, 60×20, 72×24, 84×28, 96×32, 120×40, 144×48, 192×64, 240×80, 288×96 |

Width and height are recovered from the locator and clocking structures. They
are not repeated as a Size ID in the Format Header.

The larger geometry set MUST NOT cause a linear trial of all 30 sizes. The
detector first estimates aspect ratio and clocking period, then evaluates only a
bounded number of neighboring grids.

## 5. Locator and Alignment Goals

The v1 Anchor, whose area grows quadratically with symbol size, is replaced.

The final v2 locator MUST:

* identify orientation unambiguously,
* make all four projective outer edges recoverable,
* remain stable for 3:1 symbols,
* cap its area share in large symbols,
* support fast ROI discovery,
* avoid confusion with QR, Data Matrix, and Aztec locators.

Planned structure:

* one asymmetric primary anchor at the top left,
* clocking structures on at least two orthogonal edges,
* small alignment marks at remote corners for homography estimation,
* spatially distributed Format Header modules.

Exact locator cells become normative only after a detector bake-off against the
camera fixtures. Until then, density calculations MUST explicitly identify the
locator candidate being evaluated.

## 6. Format Header

The v2 Header occupies 64 modules, or eight bytes:

```text
4 information bytes
4 Reed–Solomon parity bytes over GF(256)
```

The Header RS code corrects up to two unknown erroneous bytes, four known byte
erasures, or mixtures satisfying `2 × errors + erasures <= 4`.

### 6.1 Information Word

The 32-bit information word is allocated as follows:

| Bits | Count | Field |
| --- | ---: | --- |
| 31..28 | 4 | Magic `1010` |
| 27..24 | 4 | Format version |
| 23..22 | 2 | Body ECC profile |
| 21 | 1 | Payload semantics |
| 20..18 | 3 | Codec ID |
| 17..15 | 3 | Mask ID |
| 14..3 | 12 | Encoded Data Length |
| 2..1 | 2 | Integrity profile |
| 0 | 1 | reserved, MUST be zero |

Before placement, the protected Header is XORed with a fixed balanced 64-bit
whitening sequence. Whitening consumes no additional modules.

### 6.2 Length Field

Values `0` through `4094` give the encoded data-stream length in bytes. Value
`4095` is an escape value for future Extended Framing and MUST NOT be emitted by
v2 Core encoders.

All v2 Core geometries are bounded so twelve length bits suffice. A future larger
wire version may use `4095` to announce an extended length prefix protected by a
fixed Body RS layout.

### 6.3 Fields Removed from the Header

* Geometry is derived from the sampled grid.
* The Header RS profile is implied by the format version.
* Original length is stored only by codecs that require it.
* High-level mode changes are self-describing inside the data stream.

## 7. Header Placement

The 64 Header modules MUST NOT form one compact block. A width- and
height-derived permutation distributes codewords over multiple separated
regions. The eight bits of one GF(256) codeword remain spatially local while the
eight Header codewords are separated. A local defect should therefore damage as
few RS symbols as possible.

This prevents one stain, reflection, or damaged edge from destroying several
consecutive Header codewords.

The exact permutation must be normatively defined before implementation.

## 8. Payload Semantics

```text
0  binary data; the decoder returns bytes
1  Unicode text; the decoder returns strictly validated text
```

Unicode text is semantically a sequence of Unicode scalar values. The byte
fallback uses UTF-8. Invalid UTF-8 MUST NOT be returned as a successful text
result.

## 9. Codec IDs

```text
000  Raw Byte Stream
001  RectaMatrix High-Level Encoding 1 (RM-HLE1)
010  RM-LZ1 over Raw Bytes
011  reserved for future general compression
100–111  reserved
```

`auto` is an encoder option, never a wire value. An auto encoder creates every
allowed candidate and selects the shortest including Header, segment, and
padding costs.

A compressing codec MUST store its expected output length as a bounded variable
prefix in the RS-protected data stream. Before allocating output, a decoder MUST
enforce an implementation- and geometry-dependent limit.

## 10. RM-HLE1

RM-HLE1 is a bit-packed, lossless high-level stream. It supports at least:

* Numeric: three digits in ten bits, with four- and seven-bit remainder groups,
* Alphanumeric: pairs from a normative 45-character table in eleven bits,
* Lower Text: common lower-case letters and punctuation through compact tables,
* Upper Text: common upper-case letters and punctuation through compact tables,
* URL Tokens: a small normative table of common language-neutral prefixes and
  separators,
* Byte Shift: arbitrary byte sequences,
* UTF-8 Fallback: complete Unicode without loss,
* End of Data.

Normative table contents and exact prefix-free Latch, Shift, length, and
termination codes are defined in a dedicated RM-HLE1 chapter.

The reference encoder MUST use dynamic programming or an equivalent method. It
MUST NOT choose mode changes that enlarge the complete stream. Raw Byte Stream
remains the universal fallback.

A URL table MUST NOT contain changing web statistics or a language-dependent
word list. Only stable syntax such as scheme prefixes, `www.`, common ASCII
separators, and selected TLD markers may be included.

## 11. Body ECC

The Body ECC field provides four profiles. Final ratios and minimum parity are
fixed normatively after camera testing.

Provisional targets:

```text
00  Dense       approximately 7%
01  Balanced    approximately 15%
10  Robust      approximately 25%
11  Maximum     approximately 35%
```

Long symbols use interleaved Reed–Solomon blocks. The interleaving permutation
MUST distribute spatial burst damage across blocks, especially in 2:1 and 3:1
symbols.

## 12. Integrity Profiles

Reed–Solomon corrects local transmission errors. An integrity check independently
confirms the fully reconstructed semantic result.

```text
00  CRC-32C (default for camera and general use)
01  CRC-24 (optional Dense profile)
10  CRC-16 (controlled applications only)
11  reserved
```

General camera decoders SHOULD accept CRC-32C and CRC-24 by default. CRC-16
requires explicit opt-in.

The checksum binds a normative domain separator, Payload Semantics, reconstructed
original length, and original Payload bytes. It therefore protects both bytes
and their interpretation.

## 13. Masking

Three Header bits permit up to eight masks. v2 defines eight Body mask functions
and a deterministic penalty score. Locator, clocking, alignment marks, and
Header are not changed by the Body mask.

The encoder evaluates all eight masks. The decoder applies only the mask selected
in the protected Header.

## 14. Quiet-Zone Profiles

```text
Camera    2 modules, recommended
Dense     1 module, controlled background and print only
Extended  4 modules, difficult environments
```

The Quiet Zone does not change internal Payload capacity. It changes physical
footprint and segmentation reliability only.

## 15. Open Normative Decisions

Before v2 can become stable, the following must be fixed:

1. exact locator and alignment cells,
2. spatial Header permutation and 64-bit whitening sequence,
3. RM-HLE1 tables and prefix-free control codes,
4. exact ECC ratios and minimum parity,
5. eight mask functions and penalty score,
6. CRC-24 polynomial and all checksum vectors,
7. Body framing, padding, and interleaving for every geometry,
8. maximum decompressed length per geometry and codec.

## 16. Implementation Order

1. Geometry table and capacity calculator without detector changes.
2. 64-bit Header with existing Body bytes and CRC-32C.
3. RM-HLE1 including optimal mode selection.
4. Encoder and matrix decoder with conformance vectors.
5. New locator and spatial Header placement.
6. 2:1 and 3:1 detection plus projective refinement.
7. CRC-24/CRC-16 and Dense Quiet Zone only after negative testing.
