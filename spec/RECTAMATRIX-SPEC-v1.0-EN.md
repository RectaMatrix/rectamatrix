# RectaMatrix 2D Barcode Specification

## Version 1.0

Status: Stable Core Standard
Name: RectaMatrix
Abbreviation: RMX
Version: 1.0
Symbol type: rectangular binary 2D matrix code
Aspect ratio: 3:2
Module values: Black = 1, White = 0

---

# 1. Normative Terms

The terms **MUST**, **MUST NOT**, **SHOULD**, **SHOULD NOT**, and **MAY** are to be interpreted as normative requirements.

* **MUST**: mandatory requirement.
* **MUST NOT**: mandatory prohibition.
* **SHOULD**: recommended requirement; deviations require justification.
* **MAY**: optional capability.
* **Module**: one individual black or white grid cell.
* **Symbol**: the complete RectaMatrix excluding the Quiet Zone.
* **Data region**: all modules not reserved for the Anchor, Clocking Pattern, or Format Header.
* **Codeword**: one byte of a Reed-Solomon code block.
* **Payload**: the byte sequence supplied by the application before compression.
* **Encoded Payload**: the Payload after optional compression.
* **Frame**: the Encoded Payload including its CRC, but before Reed-Solomon encoding.

---

# 2. Design Goals

RectaMatrix Version 1 is designed for the following use cases:

* URLs
* Unicode text
* identification numbers
* contact data
* compact structured data
* arbitrary binary data
* camera-based decoding on mobile devices
* printing on paper, labels, packaging, and displays

The format is not restricted to Latin characters.

RectaMatrix Version 1 additionally standardizes the interface between computer-vision detection and symbol decoding. Decoders MAY use different internal image-processing methods, but SHOULD provide module confidences, erasures, and quality metrics in accordance with the RectaMatrix Computer Vision Profile v1.

RectaMatrix specifically supports:

* `ä`, `ö`, `ü`, `ß`
* `à`, `á`, `â`, `æ`, `å`, `ø`
* all European writing systems
* Greek and Cyrillic
* Arabic and Hebrew
* Asian writing systems
* emoji
* any other Unicode characters

Text is encoded as UTF-8. Base45 is not part of the internal RectaMatrix data format.

---

# 3. Coordinate System

The symbol has a width `W` and a height `H`.

Module coordinates start at the upper-left corner:

```text
(0,0) --------------------> x
  |
  |
  |
  v
  y
```

Valid coordinates are:

```text
0 <= x < W
0 <= y < H
```

Module `(0,0)` is part of the Micro-Anchor.

---

# 4. Symbol Sizes

RectaMatrix Version 1 supports exactly the following sizes:

| Size ID | Width W | Height H | Anchor F |
| ------: | ------: | -------: | -------: |
|       0 |      24 |       16 |        4 |
|       1 |      36 |       24 |        6 |
|       2 |      48 |       32 |        8 |
|       3 |      72 |       48 |       12 |
|       4 |      96 |       64 |       16 |
|       5 |     120 |       80 |       20 |
|       6 |     144 |       96 |       24 |

All sizes have the exact aspect ratio:

```text
W : H = 3 : 2
```

The former `18 × 12` size is not part of Version 1. For that size, `F = 3`, which would prevent the Anchor from being divided exactly into integer halves.

Size IDs `7` through `15` are reserved.

A Version 1 decoder MUST reject unknown Size IDs.

---

# 5. Quiet Zone

RectaMatrix defines two Quiet Zone profiles:

| Profile | Width Q | Intended use |
| --- | ---: | --- |
| Standard | at least 4 modules | general printing, camera capture, and unknown backgrounds |
| Compact | exactly 2 modules | controlled printing, displays, and clean backgrounds |

An encoder or renderer MUST use the Standard profile unless the caller
explicitly selects Compact. A three-module Quiet Zone is not a defined Version
1 profile and MUST NOT be emitted by a conforming renderer.

Recommended:

```text
Standard Quiet Zone = 4 modules
Compact Quiet Zone  = 2 modules
```

A Standard Quiet Zone of five or six modules SHOULD be used under difficult printing conditions.

A decoder SHOULD accept both defined profiles. Compact symbols provide less
separation from surrounding graphics and therefore MAY require a cleaner
background or an explicitly supplied source quadrilateral.

The Quiet Zone is not part of `W × H`.

---

# 6. Micro-Anchor

## 6.1 Position

When the symbol is correctly oriented, the Micro-Anchor is located at the absolute upper-left corner.

Its area is:

```text
0 <= x < F
0 <= y < F
```

where:

```text
F = H / 4
```

## 6.2 Pattern

The Anchor is generally black. Its lower-right quarter is white.

For an Anchor module:

```text
anchor(x, y) =
    0, if x >= F/2 and y >= F/2
    1, otherwise
```

Because all Version 1 sizes have an even `F`, all boundaries are integer-valued.

Example for `F = 4`:

```text
1111
1111
1100
1100
```

Example for `F = 6`:

```text
111111
111111
111111
111000
111000
111000
```

The Anchor MUST NOT be altered by masking.

The Anchor is the format's only finder anchor.

---

# 7. Clocking Pattern

## 7.1 Top Clocking Pattern

On the top row, beginning at `x = F`:

```text
matrix[x, 0] = 1, if (x - F) is even
matrix[x, 0] = 0, if (x - F) is odd
```

The sequence therefore begins with black:

```text
1, 0, 1, 0, ...
```

## 7.2 Left Clocking Pattern

On the left column, beginning at `y = F`:

```text
matrix[0, y] = 1, if (y - F) is even
matrix[0, y] = 0, if (y - F) is odd
```

This sequence also begins with black.

## 7.3 Reservation

The entire top row and the entire left column are reserved where they are not already part of the Anchor.

Clocking modules MUST NOT be masked or used as data modules.

---

# 8. Reserved Modules

A module is reserved if at least one of the following conditions is true:

```text
x < F and y < F
```

or:

```text
y == 0
```

or:

```text
x == 0
```

All remaining modules are initially accessible modules.

The first 96 accessible modules in the defined scan order are used for the Format Header.

The remaining accessible modules form the Body region.

---

# 9. Accessible Scan Order

RectaMatrix uses a vertical two-column zigzag order.

## 9.1 Basic Algorithm

The scan order begins at the lower-right corner.

Columns are processed in pairs from right to left:

```text
(W - 1, W - 2)
(W - 3, W - 4)
...
```

The first column pair is scanned from bottom to top.

The next pair is scanned from top to bottom.

The direction alternates after each column pair.

Within each row, the right column of the pair is considered first, followed by the left column.

Reserved modules are skipped.

## 9.2 Pseudocode

```js
function buildScanOrder(width, height, isReserved) {
    const cells = [];
    let upward = true;

    for (let right = width - 1; right >= 1; right -= 2) {
        const left = right - 1;

        if (upward) {
            for (let y = height - 1; y >= 0; y--) {
                if (!isReserved(right, y)) cells.push({ x: right, y });
                if (left >= 1 && !isReserved(left, y)) {
                    cells.push({ x: left, y });
                }
            }
        } else {
            for (let y = 0; y < height; y++) {
                if (!isReserved(right, y)) cells.push({ x: right, y });
                if (left >= 1 && !isReserved(left, y)) {
                    cells.push({ x: left, y });
                }
            }
        }

        upward = !upward;
    }

    return cells;
}
```

Column `x = 0` is not processed because it is fully reserved.

## 9.3 Header and Body Regions

After the scan list `S` has been generated:

```text
Header cells = S[0 ... 95]
Body cells   = S[96 ... end]
```

A symbol is invalid if fewer than 96 accessible modules are available.

---

# 10. Format Header

The Format Header consists of twelve bytes:

```text
8 information bytes
4 Reed-Solomon parity bytes
```

The Header therefore contains:

```text
12 × 8 = 96 bits
```

The Header is not masked with the Body mask. After RS protection, its twelve
bytes MUST be XORed with the following fixed whitening bytes before they are
written to the matrix:

```text
D3 91 6A C5 2E 78 B4 0F 59 E3 86 1D
```

The whitening bytes contain exactly 48 one-bits and 48 zero-bits. Whitening
does not add modules and does not alter the RS error-correction distance. A
decoder MUST XOR the twelve sampled Header bytes with the same sequence before
RS decoding. Because XOR is its own inverse, encoding and decoding use the same
operation.

All bytes are written bitwise in most-significant-bit-first order.

Example for byte `0xA6`:

```text
1 0 1 0 0 1 1 0
```

---

# 11. Format Header Fields

## 11.1 Information Bytes

| Byte | Content                              |
| ---: | ------------------------------------ |
|    0 | Sync Byte                            |
|    1 | Version and Size ID                  |
|    2 | ECC, Payload Type, Compression, Mask |
|    3 | RS Profile and reserved bits         |
|    4 | original Payload length, high byte   |
|    5 | original Payload length, low byte    |
|    6 | Encoded Payload length, high byte    |
|    7 | Encoded Payload length, low byte     |

## 11.2 Sync Byte

Byte 0 MUST be:

```text
0xA7
```

Other values are invalid for Version 1.

## 11.3 Version and Size

Byte 1:

```text
Bits 7..4: Version number
Bits 3..0: Size ID
```

For Version 1:

```text
Version = 0001
```

Example for Version 1, Size ID 2:

```text
0001 0010 = 0x12
```

## 11.4 Flags

Byte 2:

```text
Bits 7..6: ECC Level
Bits 5..4: Payload Type
Bits 3..2: Compression Mode
Bits 1..0: Mask ID
```

## 11.5 RS Profile

Byte 3:

```text
Bits 7..4: RS Profile
Bits 3..0: reserved
```

For Version 1, the RS Profile MUST be `0001`.

The reserved bits MUST be zero.

Therefore, Byte 3 in Version 1 is:

```text
0x10
```

## 11.6 Length Fields

Bytes 4 and 5 contain the length of the original Payload in bytes as an unsigned 16-bit big-endian integer.

Bytes 6 and 7 contain the length of the Encoded Payload after optional compression, also as an unsigned 16-bit big-endian integer.

Maximum representable length:

```text
65535 bytes
```

The actual usable length is substantially smaller due to symbol capacity.

---

# 12. Payload Types

| Bits | Type               | Meaning                                 |
| ---- | ------------------ | --------------------------------------- |
| `00` | Binary             | arbitrary bytes                         |
| `01` | UTF-8              | Unicode text                            |
| `10` | reserved           | future compact numeric mode             |
| `11` | Structured Payload | reserved for future structured profiles |

Version 1 decoders MUST support Binary and UTF-8.

Payload Type `11` is reserved for structured-data profiles. Version 1.0 does not yet define a wire format for this type. A Version 1.0 decoder that does not support a separately published Structured Payload Profile MUST reject this type with `UNSUPPORTED_PAYLOAD_TYPE`.

Payload Type `10` remains reserved and MUST be rejected.

---

# 13. UTF-8 Rules

## 13.1 Encoding

JavaScript strings are encoded as UTF-8.

A suitable implementation is:

```js
const bytes = new TextEncoder().encode(text);
```

## 13.2 Invalid Surrogates

Before UTF-8 encoding, the JavaScript string MUST be checked for unpaired UTF-16 surrogates.

Unpaired surrogates MUST be rejected.

They MUST NOT be silently replaced with U+FFFD.

## 13.3 Normalization

RectaMatrix does not perform Unicode normalization by default.

This preserves distinctions between different but visually similar sequences.

Example:

```text
U+00E4
```

and:

```text
U+0061 U+0308
```

are not automatically unified.

Applications MAY apply NFC normalization before encoding, but this MUST be performed outside the RectaMatrix codec.

## 13.4 Decoding

UTF-8 MUST be decoded strictly.

In JavaScript:

```js
const decoder = new TextDecoder("utf-8", { fatal: true });
const text = decoder.decode(bytes);
```

Invalid UTF-8 results in a decoding error.

---

# 14. Compression Modes

| Bits | Mode            |
| ---- | --------------- |
| `00` | no compression  |
| `01` | RM-LZ1          |
| `10` | reserved        |
| `11` | reserved        |

Version 1 encoders and decoders MUST support modes `00` and `01`.

---

# 15. Adaptive Compression Selection

An encoder MUST first produce the uncompressed Payload.

It MAY then apply RM-LZ1.

Compression may be used only if:

```text
compressedLength < originalLength
```

The stricter recommended rule is:

```text
compressedLength + 2 <= originalLength
```

This selects compression only when at least two bytes are saved.

Very short Payloads should normally remain uncompressed.

---

# 16. RM-LZ1 Compression

RM-LZ1 is a small, fully deterministic, LZSS-like byte compressor.

## 16.1 Window

Maximum backward distance:

```text
4096 bytes
```

Permitted distance:

```text
1 through 4096
```

## 16.2 Match Length

Permitted match length:

```text
3 through 18 bytes
```

## 16.3 Token Groups

The data stream consists of groups of up to eight tokens.

Each group begins with one flag byte.

Flag bits are interpreted from Bit 0 through Bit 7.

```text
0 = Literal
1 = Match
```

Unused flag bits in the final group MUST be zero.

## 16.4 Literal

A Literal consists of exactly one byte:

```text
[value]
```

## 16.5 Match

A Match consists of two bytes.

It encodes:

```text
distanceMinus1: 12 bits
lengthMinus3:    4 bits
```

Layout:

```text
Byte A: distanceMinus1 Bits 11..4
Byte B:
    Bits 7..4: distanceMinus1 Bits 3..0
    Bits 3..0: lengthMinus3
```

Calculation:

```js
const distanceMinus1 = ((byteA << 4) | (byteB >>> 4));
const distance = distanceMinus1 + 1;
const length = (byteB & 0x0F) + 3;
```

## 16.6 Encoder Search Strategy

The normative decoder is independent of the search strategy.

For reproducible encoder output, the encoder SHOULD:

1. find the longest Match at the current position,
2. choose the smallest distance when Match lengths are equal,
3. use Matches only from length 3 onward,
4. search backward by no more than 4096 bytes,
5. compare no more than 18 bytes.

An encoder MAY use a faster hash-based or dictionary-based search, provided that the generated stream remains valid.

## 16.7 Overlapping Matches

The decoder MUST support overlapping backward copies.

Example:

```text
Output so far: A
Distance: 1
Length: 5
Result: AAAAAA
```

## 16.8 Validation

An RM-LZ1 stream is invalid if:

* the Match distance is greater than the current output length,
* the output exceeds the original length specified in the Header,
* the input stream ends before the original length is reached,
* additional token bytes remain after the original length has been reached.

---

# 17. Integrity Check

The integrity of the original decompressed Payload is verified using CRC-32C.

## 17.1 CRC Parameters

Name:

```text
CRC-32C / Castagnoli
```

Reflected polynomial:

```text
0x82F63B78
```

Initial value:

```text
0xFFFFFFFF
```

Final XOR:

```text
0xFFFFFFFF
```

Input and output are reflected.

## 17.2 CRC Input

The CRC is calculated exclusively over the original Payload.

For UTF-8 text, these are the UTF-8 bytes.

## 17.3 Storage

The CRC is appended to the Encoded Payload as four big-endian bytes:

```text
Frame = EncodedPayload || CRC32C(originalPayload)
```

The Frame length is:

```text
frameLength = encodedPayloadLength + 4
```

---

# 18. ECC Levels

Byte 2, Bits 7 through 6:

| Bits | Level    | Ratio | Minimum parity per block |
| ---- | -------- | ----: | -----------------------: |
| `00` | Low      |    5% |                  4 bytes |
| `01` | Medium   |   15% |                  8 bytes |
| `10` | High     |   30% |                 12 bytes |
| `11` | reserved |     – |                        – |

The percentage is applied to the number of data bytes in an individual RS block.

Calculation:

```text
parityBytes = max(
    minimumParity,
    ceil(dataBytes × ratio)
)
```

Examples:

Low with 20 data bytes:

```text
max(4, ceil(20 × 0.05)) = 4
```

Medium with 40 data bytes:

```text
max(8, ceil(40 × 0.15)) = 8
```

High with 40 data bytes:

```text
max(12, ceil(40 × 0.30)) = 12
```

---

# 19. Reed-Solomon Definition

RectaMatrix uses Reed-Solomon over:

```text
GF(256)
```

## 19.1 Field

Primitive polynomial representation:

```text
x^8 + x^4 + x^3 + x^2 + 1
```

Hexadecimal:

```text
0x11D
```

Primitive element:

```text
α = 2
```

## 19.2 Generator Polynomial

For `r` parity bytes:

```text
g(x) = ∏(x - α^i), i = 0 through r-1
```

The first generator root is therefore:

```text
α^0
```

## 19.3 Byte Order

The first data byte is the coefficient of the highest-degree term.

Parity bytes are appended after the data bytes.

Systematic form:

```text
dataBytes || parityBytes
```

## 19.4 Correction Capability

For `r` parity bytes:

```text
2 × unknownErrors + erasures <= r
```

Without erasures, at most:

```text
floor(r / 2)
```

erroneous bytes can be corrected.

---

# 20. Header Error Correction

The eight Header information bytes are protected by four RS parity bytes.

Header code:

```text
RS(12, 8)
```

This can correct:

* up to two unknown byte errors, or
* up to four known byte erasures, or
* corresponding combinations.

After successful Header correction, the following MUST also be validated:

* Sync Byte
* Version
* Size ID
* reserved bits
* length plausibility
* ECC Level
* Payload Type
* Compression Mode
* Mask ID

---

# 21. Splitting the Data Frame into RS Blocks

The Frame consists of:

```text
Encoded Payload + 4 CRC bytes
```

Let its length be `D`.

## 21.1 Block Count

The encoder selects the smallest positive block count `B` for which every block, including its parity, contains at most 255 bytes.

Start with:

```text
B = 1
```

For each `B`, the Frame is divided as evenly as possible.

## 21.2 Block Sizes

```text
base = floor(D / B)
extra = D mod B
```

For block `i`:

```text
dataLength[i] =
    base + 1, if i < extra
    base, otherwise
```

The first `extra` blocks therefore receive one additional data byte.

## 21.3 Parity Lengths

The parity length for each block is calculated separately according to its ECC Level.

A value of `B` is valid if, for every block:

```text
dataLength[i] + parityLength[i] <= 255
```

If this condition is not met, `B` is increased.

## 21.4 Empty Blocks

Empty blocks are not permitted.

The following MUST hold:

```text
B <= D
```

Because every Frame contains at least four CRC bytes, `D >= 4`.

---

# 22. RS Block Interleaving

After RS encoding, codewords are spatially interleaved.

Assume that `B` blocks exist.

Data bytes are interleaved first:

```text
Block0.Data0
Block1.Data0
...
BlockB-1.Data0
Block0.Data1
Block1.Data1
...
```

If a block has no data byte at a given position, it is skipped.

Parity bytes are then interleaved:

```text
Block0.Parity0
Block1.Parity0
...
BlockB-1.Parity0
Block0.Parity1
...
```

Missing positions are also skipped here.

The resulting byte sequence is called the:

```text
Interleaved Codeword Stream
```

Using the Header lengths, ECC Level, and deterministic block partitioning, the decoder reconstructs the original blocks from this stream.

---

# 23. Body Bitstream

The Body Bitstream consists of:

1. Interleaved Codeword Stream
2. Terminator bit
3. byte alignment
4. padding bytes

## 23.1 Codeword Bits

Each codeword is written MSB-first.

## 23.2 Terminator

A single `1` is written after the final codeword.

## 23.3 Byte Alignment

Enough `0` bits are then appended to make the bit length a multiple of eight.

## 23.4 Padding Bytes

Remaining complete bytes are filled alternately with:

```text
0xEC
0x11
0xEC
0x11
...
```

## 23.5 Final Partial Bits

If the Body capacity is not a multiple of eight, the final incomplete positions are filled with the most significant bits of the next padding byte.

The decoder does not need the Terminator or padding for reconstruction because the expected number of codewords is calculated from the Header.

---

# 24. Masking

Only the Body region is masked.

The following are not masked:

* Anchor
* Clocking Pattern
* Format Header (it uses only its fixed whitening sequence)

## 24.1 Masks

Mask ID `0`:

```text
(x + y) mod 2 == 0
```

Mask ID `1`:

```text
y mod 2 == 0
```

Mask ID `2`:

```text
x mod 3 == 0
```

Mask ID `3`:

```text
(x + 2y) mod 3 == 0
```

If the respective condition is true, the Body bit is inverted:

```text
maskedBit = originalBit XOR 1
```

Otherwise, it remains unchanged.

---

# 25. Selecting the Best Mask

The encoder MUST test all four masks and select the mask with the lowest penalty score.

If scores are equal, the lower Mask ID wins.

The complete symbol, including the Anchor and Clocking Pattern, is evaluated.

## 25.1 Long Horizontal and Vertical Runs

For each run of identical color with a length of 5 or more:

```text
Penalty = 3 + (length - 5)
```

## 25.2 Uniform 2×2 Blocks

For each completely uniform 2×2 block:

```text
Penalty = 3
```

## 25.3 Anchor-Like Patterns

For each occurrence of a sequence matching the ratio:

```text
1:1:3:1:1
```

or its direct inversion:

```text
Penalty = 20
```

The check is performed horizontally and vertically.

## 25.4 Black-to-White Ratio

Calculate the percentage of black modules.

For every started deviation of five percentage points from 50%:

```text
Penalty = 10
```

Example:

```text
Black share 62%
Deviation 12%
ceil(12 / 5) × 10 = 30
```

---

# 26. Capacity Calculation

## 26.1 Accessible Modules

```text
accessibleModules =
    W × H
    - F × F
    - (W - F)
    - (H - F)
```

The Anchor is subtracted only once.

Simplified:

```text
accessibleModules =
    W × H - F² - W - H + 2F
```

## 26.2 Body Capacity

```text
bodyBits = accessibleModules - 96
```

```text
bodyBytesFloor = floor(bodyBits / 8)
```

## 26.3 Size Selection

For a Payload, Compression Mode, and ECC Level, the encoder MUST:

1. construct the Frame,
2. determine the RS block structure,
3. calculate the total number of RS codewords,
4. calculate the required number of bits,
5. select the smallest fitting symbol size.

Required bits:

```text
requiredBits =
    totalCodewordBytes × 8
    + 1
```

The additional bit is the Terminator.

A size fits if:

```text
requiredBits <= bodyBits
```

If no size fits, the encoder MUST report a capacity error.

---

# 27. Encoder Pipeline

A conforming encoder performs the following steps:

1. validate the input,
2. determine the Payload Type,
3. reject unpaired surrogates for text input,
4. encode text as UTF-8,
5. calculate CRC-32C over the original Payload,
6. optionally produce RM-LZ1 output,
7. select the smaller permitted representation,
8. apply the selected ECC Level,
9. for each symbol size in ascending order:

   * prepare Header values,
   * construct the Frame,
   * determine RS blocks,
   * generate RS parity,
   * interleave codewords,
   * check capacity,
10. select the smallest fitting size,
11. create reserved matrix modules,
12. generate Header information,
13. generate Header RS parity,
14. apply the fixed Header whitening sequence and write the result into the first 96 scan cells,
15. generate the Body Bitstream,
16. test all four masks,
17. select the best mask,
18. update the Mask ID in the Header,
19. regenerate the Header including parity,
20. apply the fixed whitening sequence and write the final Header,
21. write the final masked Body,
22. render the Quiet Zone.

Important: Because the Mask ID is part of the protected Header, the Header MUST be encoded again after mask selection.

---

# 28. Canvas Rendering

## 28.1 Module Size

The module size in pixels MUST be an integer.

Recommended:

```text
moduleSize >= 4 pixels
```

For camera use:

```text
moduleSize >= 6 pixels
```

## 28.2 Canvas Size

For Quiet Zone `Q`:

```text
canvasWidth  = (W + 2Q) × moduleSize
canvasHeight = (H + 2Q) × moduleSize
```

## 28.3 Rendering Rules

* Fill the entire background with white.
* Render black modules in pure black.
* Do not use antialiasing.
* Do not leave gaps between modules.
* Do not use fractional pixel coordinates.
* Do not use CSS scaling with interpolation.

Example:

```js
ctx.imageSmoothingEnabled = false;
ctx.fillStyle = "#FFFFFF";
ctx.fillRect(0, 0, canvas.width, canvas.height);

ctx.fillStyle = "#000000";

for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
        if (matrix[y][x]) {
            ctx.fillRect(
                (x + quietZone) * moduleSize,
                (y + quietZone) * moduleSize,
                moduleSize,
                moduleSize
            );
        }
    }
}
```

---

# 29. Recommended Encoder API

```js
class RectaMatrixEncoder {
    constructor(options = {}) {}

    encodeText(text, options = {}) {}

    encodeBytes(bytes, options = {}) {}

    buildMatrix(payloadBytes, metadata) {}

    renderToCanvas(canvas, result, renderOptions = {}) {}
}
```

Recommended options:

```js
{
    eccLevel: "medium",
    compression: "auto",
    size: "auto",
    quietZone: 4,
    moduleSize: 8
}
```

Recommended result object:

```js
{
    version: 1,
    width: 48,
    height: 32,
    sizeId: 2,
    eccLevel: "medium",
    payloadType: "utf8",
    compression: "rm-lz1",
    maskId: 1,
    originalLength: 96,
    encodedLength: 61,
    matrix: boolean[][]
}
```

---

# 30. Decoder Overview

The decoder logically consists of two layers:

## 30.1 Computer Vision Layer

It reconstructs a normalized module matrix and confidence values from an image. The normative handoff interface between the Computer Vision Layer and the Symbol Decoder is described in the RectaMatrix Computer Vision Profile v1.

## 30.2 Symbol Decoder

It processes:

* Anchor
* Clocking Pattern
* Header
* masking
* RS codewords
* CRC
* decompression
* UTF-8

Symbol decoding MUST be testable independently of the specific image-detection implementation.

Recommended separation:

```js
class RectaMatrixVisionDetector {}
class RectaMatrixSymbolDecoder {}
class RectaMatrixDecoder {}
```

---

# 31. Image Preprocessing

The input is an `ImageData` object.

## 31.1 Grayscale

Recommended conversion:

```text
Y = 0.299R + 0.587G + 0.114B
```

Alpha is composited onto white:

```text
effectiveChannel =
    alpha × channel + (1 - alpha) × 255
```

## 31.2 Scaling

Very large images MAY be downscaled for contour detection.

The final module-sampling stage SHOULD be performed on the original image or on a high-resolution rectification.

## 31.3 Thresholding

A decoder SHOULD use adaptive local binarization.

A local mean or Sauvola threshold is recommended.

A simple conforming implementation MAY:

1. calculate a global Otsu threshold,
2. then apply local contrast correction.

Symbol decoding MUST NOT assume exclusively that black is exactly RGB `0,0,0` and white is exactly `255,255,255`.

---

# 32. Contour Detection

## 32.1 Components

Connected dark components are identified in the binarized image.

8-connectivity is recommended.

## 32.2 Candidate Filter

A candidate SHOULD satisfy the following conditions:

* sufficiently large area,
* not extremely narrow,
* approximately rectangular convex hull,
* four dominant corners,
* an interior region containing a binary module structure.

## 32.3 Quadrilateral

A four-sided polygon is determined for each candidate.

Possible methods include:

* Douglas-Peucker approximation,
* line fitting to contour edges,
* Hough lines and intersections,
* minimum-area rectangle followed by corner refinement.

Corners SHOULD be refined to subpixel accuracy.

---

# 33. Aspect Ratio Validation

Because a rectangle captured under perspective does not directly show a 3:2 ratio, a projective rectangle model must first be estimated.

A homography is calculated for both possible assignments of the long and short sides.

After rectification, the following MUST hold:

```text
expected ratio = 1.5
```

Recommended tolerance for initial filtering:

```text
1.32 <= ratio <= 1.68
```

The final size decision is not based solely on the ratio, but on Anchor and Clocking Pattern agreement.

---

# 34. Orientation Determination

The decoder MUST NOT assume the image orientation.

For every rectangle candidate, four corner assignments are tested:

* 0°
* 90°
* 180°
* 270°

For each assignment and each permitted symbol size, the following scores are calculated:

1. Anchor Score
2. Top Clocking Score
3. Left Clocking Score
4. Contrast Score
5. Geometry Score

The assignment with the best combined score is selected.

The 3:2 aspect ratio assists in distinguishing 90° from 270°. The asymmetric Anchor position additionally resolves the distinction between 0° and 180°.

---

# 35. Perspective Rectification

For every candidate size, a homography is calculated from the image quadrilateral to a normalized rectangle.

Recommended internal resolution:

```text
Samples per module = 5 through 9
```

Example for `48 × 32` with seven samples:

```text
336 × 224 pixels
```

Sampling SHOULD not be performed only at the exact module center.

---

# 36. Module Sampling

## 36.1 Sampling Region

An inner region is evaluated for each module.

Recommended:

```text
20% through 80% of the module width
20% through 80% of the module height
```

Edges are avoided so that perspective-related and printing-related transitions are not overemphasized.

## 36.2 Intensity

The median or trimmed mean of the inner region is used as the module intensity.

The median is more robust against highlights and isolated outliers.

## 36.3 Local Black and White Reference

Black and white references are estimated from known Anchor and Clocking modules.

Recommended:

```text
blackReference = median of known black modules
whiteReference = median of known white modules
threshold = (blackReference + whiteReference) / 2
```

## 36.4 Bit Decision

```text
intensity < threshold => black => 1
intensity >= threshold => white => 0
```

For inverted images, an inverted hypothesis MAY additionally be tested.

---

# 37. Module Confidence

A confidence value between 0 and 1 is calculated for every module.

Example:

```text
confidence =
    abs(intensity - threshold)
    / max(abs(blackReference - whiteReference) / 2, epsilon)
```

The result is then clamped to the range `[0,1]`.

Additional confidence reductions SHOULD be applied for:

* high intensity noise within the module,
* strong gradients at the module center,
* proximity to the image boundary,
* an uncertain homography,
* poor local contrast.

---

# 38. Anchor Score

A weighted agreement score is calculated for the expected `F × F` Anchor modules.

```text
anchorScore =
    sum(confidence × correct)
    / sum(confidence)
```

where:

```text
correct = 1 for agreement
correct = 0 for disagreement
```

Recommended minimum values:

```text
anchorScore >= 0.80
```

For reliable detection:

```text
anchorScore >= 0.90
```

The white cutout MUST be checked separately so that a simple black block is not accepted as an Anchor.

---

# 39. Clocking Score

The known Clocking bits are compared with the expected alternating pattern.

Separate scores:

```text
topClockScore
leftClockScore
```

Recommended minimum values:

```text
topClockScore >= 0.75
leftClockScore >= 0.75
```

Recommended combined value:

```text
(topClockScore + leftClockScore) / 2 >= 0.82
```

Module spacing and homography MAY be refined iteratively using the Clocking transitions.

---

# 40. Size Detection

All seven Version 1 sizes are tested.

For each size, the following are evaluated:

* the Anchor matches `F`,
* the Clocking Pattern length matches `W` and `H`,
* alternating transitions occur at the expected positions,
* the Format Header can be RS-decoded,
* the Header Size ID matches the tested size.

A candidate may be accepted only if the Size ID in the corrected Header matches the tested geometry.

---

# 41. Header Decoding

1. Read the first 96 accessible modules according to the scan order.
2. Combine each group of eight bits into one byte.
3. XOR the twelve bytes with the fixed Header whitening sequence.
4. Aggregate bit confidences into byte confidences.
5. Mark uncertain bytes as erasures.
6. Decode RS(12,8).
7. Validate the Header fields.

Recommended byte-erasure rule:

A Header byte is marked as an erasure if:

```text
at least two bits have confidence < 0.25
```

or:

```text
mean byte confidence < 0.35
```

A decoder MAY test multiple erasure thresholds.

---

# 42. Body Decoding

After successful Header decoding:

1. read the Body modules,
2. remove the Body mask using the Mask ID,
3. calculate the expected block sizes,
4. determine the expected total number of codeword bytes,
5. read exactly that number of bytes from the Body,
6. reverse the interleaving,
7. mark uncertain codeword bytes as erasures,
8. decode each RS block,
9. concatenate the block data bytes in their original order,
10. separate the Encoded Payload and CRC,
11. decompress the Payload if required,
12. verify the original length,
13. verify CRC-32C,
14. return the Payload according to the Payload Type.

The Terminator and padding bytes do not need to be interpreted once all expected codewords have been read.

---

# 43. Body Byte Confidence and Erasures

The eight module confidences are evaluated for every codeword byte.

Recommended erasure rule:

A byte is considered an erasure if at least one of the following conditions is true:

```text
at least three bits have confidence < 0.30
```

or:

```text
mean confidence < 0.40
```

or:

```text
lowest confidence < 0.10
```

The decoder SHOULD first decode using conservative erasures.

If decoding or CRC validation fails, it MAY perform additional attempts using different erasure thresholds.

The number of attempts SHOULD be limited.

---

# 44. RS Decoding

A conforming RS decoder SHOULD implement at least the following steps:

1. syndrome calculation,
2. Erasure Locator Polynomial,
3. Berlekamp-Massey or the extended Euclidean algorithm,
4. Chien search,
5. Forney algorithm,
6. correction of affected codewords,
7. renewed syndrome validation.

A block is considered successfully corrected only if all syndromes are zero after correction.

CRC validation remains mandatory in addition.

---

# 45. Decompression and CRC Validation

For Compression Mode `00`:

```text
originalPayload = encodedPayload
```

The following MUST hold:

```text
originalLength == encodedLength
```

For Compression Mode `01`:

```text
originalPayload = RMLZ1Decode(encodedPayload, originalLength)
```

Then:

```text
actualCRC = CRC32C(originalPayload)
```

The decoder accepts the Payload only if:

```text
actualCRC == storedCRC
```

Successful RS correction without successful CRC validation is not a valid decode.

---

# 46. UTF-8 Output

For Payload Type UTF-8:

1. validate UTF-8 strictly,
2. decode it into a JavaScript string,
3. perform no normalization,
4. return both the string and the original bytes.

Recommended result:

```js
{
    ok: true,
    text: "Grüße aus København – àæå",
    bytes: Uint8Array,
    metadata: {
        version: 1,
        sizeId: 2,
        width: 48,
        height: 32,
        eccLevel: "medium",
        compression: "rm-lz1",
        maskId: 1,
        orientation: 0
    },
    report: {
        profile: "rmx-cv-1",
        overallConfidence: 0.91,
        imageQuality: 0.88,
        anchorScore: 0.96,
        topClockScore: 0.93,
        leftClockScore: 0.92,
        meanModuleConfidence: 0.89,
        correctedCodewords: 3,
        erasuresUsed: 2,
        crcValid: true
    }
}
```

---

# 47. Decoder Errors

Recommended error codes:

```text
NO_SYMBOL_FOUND
INVALID_GEOMETRY
ANCHOR_NOT_FOUND
CLOCKING_MISMATCH
UNSUPPORTED_SIZE
HEADER_RS_FAILURE
INVALID_HEADER
UNSUPPORTED_VERSION
UNSUPPORTED_PAYLOAD_TYPE
UNSUPPORTED_COMPRESSION
BODY_TRUNCATED
BODY_RS_FAILURE
DECOMPRESSION_FAILURE
LENGTH_MISMATCH
CRC_FAILURE
INVALID_UTF8
AMBIGUOUS_SYMBOL
```

Errors SHOULD be returned in machine-readable form.

---

# 48. Recommended Decoder API

```js
class RectaMatrixDecoder {
    constructor(options = {}) {}

    decodeImageData(imageData, options = {}) {}

    detectCandidates(imageData) {}

    sampleCandidate(imageData, candidate, size) {}

    decodeSampledMatrix(sampledMatrix) {}
}
```

Successful result:

```js
{
    ok: true,
    type: "utf8",
    text: "...",
    bytes: Uint8Array,
    metadata: {},
    report: {}
}
```

The `report` field SHOULD conform to the Decode Quality Report defined in Chapter 61. A decoder without an image source, such as a pure matrix decoder, MAY omit unavailable image-related fields or set them to `null`.

Error result:

```js
{
    ok: false,
    error: {
        code: "CRC_FAILURE",
        message: "Payload CRC-32C does not match."
    }
}
```

---

# 49. Encoder Conformance Requirements

A Version 1 encoder is conforming if it:

* uses only defined sizes,
* sets the Anchor and Clocking Pattern exactly,
* uses the defined scan order,
* generates the Header as RS(12,8),
* supports UTF-8 and Binary,
* calculates CRC-32C correctly,
* produces either no compression or RM-LZ1 compression,
* protects the main data using the defined RS method,
* uses the defined interleaving order,
* evaluates all four masks,
* selects the best mask deterministically,
* renders the Quiet Zone correctly.

---

# 50. Decoder Conformance Requirements

A Version 1 decoder is conforming if it at least:

* recognizes all seven Version 1 sizes,
* can process all four orientations,
* compensates for perspective distortion,
* decodes Header RS with erasures,
* supports all three defined ECC Levels,
* removes all four masks,
* reconstructs RS blocks and interleaving,
* decodes both uncompressed data and RM-LZ1,
* validates CRC-32C,
* outputs Binary and UTF-8,
* rejects invalid or unsupported symbols cleanly,
* provides a Decode Quality Report in accordance with Chapter 61 for image-based decoding, or explicitly documents which optional fields are unavailable,
* processes module confidences and RS erasures reproducibly in accordance with the CV Profile.

---

# 51. Security and Resource Limits

Decoders process potentially untrusted images and data.

An implementation MUST:

* validate lengths before memory allocation,
* validate Header lengths against symbol capacity,
* strictly limit decompression output to `originalLength`,
* reject invalid Match distances,
* limit the RS block count,
* limit image dimensions,
* prevent infinite loops in contour or RS processing,
* limit the number of alternative decode attempts.

Recommended browser image limit:

```text
maximum 25 million pixels
```

Larger images SHOULD be downscaled first or rejected.

---

# 52. Size and ECC Selection Strategy

## 52.1 Default ECC

Recommended default:

```text
Medium
```

## 52.2 Low

Low is suitable for:

* high-quality displays,
* short scanning distances,
* controlled environments,
* very small symbols.

Low SHOULD NOT be used for labels that are likely to be damaged.

## 52.3 Medium

Medium is suitable for:

* general smartphone scanning,
* paper printing,
* shipping labels,
* product packaging,
* normal lighting conditions.

## 52.4 High

High is suitable for:

* outdoor applications,
* industrial labels,
* possible scratches or contamination,
* small printed modules,
* difficult camera angles,
* long-term marking.

## 52.5 Automatic Selection

Automatic selection MAY use the following guidance:

```text
Controlled display       => Low
Standard printing        => Medium
Industrial or outdoor use => High
```

The application SHOULD deliberately store or transmit the ECC Level rather than attempting to infer it later.

---

# 53. Why Reed-Solomon Is Retained

RectaMatrix Version 1 uses Reed-Solomon not because more modern codes are unknown, but because the error profile of a printed barcode often consists of localized, contiguous damage.

Examples include:

* scratches,
* stains,
* folds,
* reflections,
* partial occlusion,
* failed module regions.

Byte-level RS combined with:

* spatial interleaving,
* soft sampling,
* erasure marking,
* CRC-32C

is robust for this use case and comparatively straightforward to implement.

LDPC or Polar Codes may be investigated as alternative profiles in later versions. They are not part of Version 1.

---

# 54. Extensibility

Unknown versions MUST be rejected.

The following are reserved:

* Size IDs 7 through 15,
* Payload Types 2 and 3,
* Compression Modes 2 and 3,
* ECC Level 3,
* RS Profiles 2 through 15.

A later version MUST NOT change the meaning of existing Version 1 values.

New methods MUST be signaled unambiguously through the Version number or profile fields.

---

# 55. Recommended Implementation Structure

```text
RectaMatrix/
├── constants.js
├── geometry.js
├── scan-order.js
├── utf8.js
├── crc32c.js
├── rmlz1.js
├── gf256.js
├── reed-solomon.js
├── interleaver.js
├── mask.js
├── penalty.js
├── header.js
├── encoder.js
├── canvas-renderer.js
├── image-utils.js
├── threshold.js
├── contours.js
├── homography.js
├── sampler.js
├── detector.js
├── symbol-decoder.js
└── decoder.js
```

All core modules SHOULD be implementable without external dependencies.

---

# 56. Mandatory Tests

A complete implementation MUST include at least the following tests.

## 56.1 Geometry

* all seven sizes,
* correct Anchor patterns,
* correct Clocking Patterns,
* reserved modules,
* identical scan order in encoder and decoder.

## 56.2 Text

* empty string,
* ASCII,
* `äöüß`,
* `àæå`,
* combining characters,
* Greek,
* Cyrillic,
* Arabic,
* CJK,
* emoji,
* rejection of unpaired surrogates.

## 56.3 Compression

* empty or short inputs,
* Literals only,
* simple repetitions,
* overlapping Matches,
* maximum distance,
* maximum Match length,
* invalid distance,
* truncated stream,
* output limiting.

## 56.4 CRC

* known CRC-32C test vectors,
* single-bit errors,
* incorrect Payload,
* incorrect decompression.

## 56.5 Reed-Solomon

* no errors,
* maximum correctable errors,
* maximum correctable erasures,
* mixed errors and erasures,
* too many errors,
* shortened blocks,
* multiple block sizes.

## 56.6 Masking

* all four masks,
* involution:

```text
unmask(mask(data)) == data
```

* deterministic penalty selection,
* tie-breaking rule.

## 56.7 Decoder Images

* 0°, 90°, 180°, 270°,
* perspective distortion,
* blur,
* uneven illumination,
* low contrast,
* partial contamination,
* module noise,
* scaled images,
* inverted images as an optional extension,
* multiple rectangles in the image,
* standardized Decode Report fields,
* erasure-threshold boundary cases,
* deterministic candidate ranking for equal scores.

---

# 57. Reference Pseudocode for Size Selection

```js
function chooseSymbol(payload, options) {
    const original = payload;
    const crc = crc32c(original);

    const candidates = [
        {
            compression: 0,
            encoded: original
        }
    ];

    const compressed = rmlz1Encode(original);

    if (compressed.length + 2 <= original.length) {
        candidates.push({
            compression: 1,
            encoded: compressed
        });
    }

    let best = null;

    for (const candidate of candidates) {
        const frame = concat(
            candidate.encoded,
            uint32ToBytesBE(crc)
        );

        for (const size of RECTAMATRIX_SIZES) {
            const blocks = buildRsBlocks(
                frame,
                options.eccLevel
            );

            const totalCodewords = blocks.reduce(
                (sum, block) =>
                    sum +
                    block.data.length +
                    block.parityLength,
                0
            );

            const requiredBits =
                totalCodewords * 8 + 1;

            const capacity =
                calculateBodyBitCapacity(size);

            if (requiredBits <= capacity) {
                const result = {
                    size,
                    compression: candidate.compression,
                    encoded: candidate.encoded,
                    frame,
                    blocks
                };

                if (
                    best === null ||
                    size.area < best.size.area ||
                    (
                        size.area === best.size.area &&
                        candidate.encoded.length <
                            best.encoded.length
                    )
                ) {
                    best = result;
                }

                break;
            }
        }
    }

    if (!best) {
        throw new RangeError(
            "Payload exceeds RectaMatrix v1 capacity."
        );
    }

    return best;
}
```

---

# 58. Reference Pseudocode for Matrix Generation

```js
function createMatrix(config) {
    const { width, height, anchorSize } = config.size;

    const matrix = Array.from(
        { length: height },
        () => Array(width).fill(false)
    );

    const reserved = Array.from(
        { length: height },
        () => Array(width).fill(false)
    );

    writeAnchor(matrix, reserved, anchorSize);
    writeClocking(matrix, reserved, anchorSize);

    const scanOrder = buildScanOrder(
        width,
        height,
        (x, y) => reserved[y][x]
    );

    const headerCells = scanOrder.slice(0, 96);
    const bodyCells = scanOrder.slice(96);

    const interleaved = interleaveBlocks(config.blocks);
    const bodyBits = createBodyBits(
        interleaved,
        bodyCells.length
    );

    let bestCandidate = null;

    for (let maskId = 0; maskId < 4; maskId++) {
        const candidate = cloneMatrix(matrix);

        const header = buildProtectedHeader({
            ...config.header,
            maskId
        });

        writeBits(candidate, headerCells, bytesToBits(applyHeaderWhitening(header)));

        const maskedBody = bodyBits.map((bit, index) => {
            const { x, y } = bodyCells[index];
            return bit ^ Number(maskCondition(maskId, x, y));
        });

        writeBits(candidate, bodyCells, maskedBody);

        const penalty = calculatePenalty(candidate);

        if (
            bestCandidate === null ||
            penalty < bestCandidate.penalty ||
            (
                penalty === bestCandidate.penalty &&
                maskId < bestCandidate.maskId
            )
        ) {
            bestCandidate = {
                matrix: candidate,
                maskId,
                penalty
            };
        }
    }

    return bestCandidate;
}
```

---

# 59. Reference Pseudocode for Symbol Decoding

```js
function decodeSampledSymbol(sampled, size) {
    validateAnchor(sampled, size);
    validateClocking(sampled, size);

    const reserved = createReservedMap(size);
    const scanOrder = buildScanOrder(
        size.width,
        size.height,
        (x, y) => reserved[y][x]
    );

    const headerCells = scanOrder.slice(0, 96);
    const bodyCells = scanOrder.slice(96);

    const headerRead = readBytesWithConfidence(
        sampled,
        headerCells,
        12
    );

    const header = decodeHeaderRS(
        applyHeaderWhitening(headerRead.bytes),
        headerRead.erasures
    );

    validateHeader(header, size);

    const structure = calculateBlockStructure(
        header.encodedLength + 4,
        header.eccLevel
    );

    const codewordCount =
        structure.totalCodewordBytes;

    const bodyRead = readBodyCodewords(
        sampled,
        bodyCells,
        codewordCount,
        header.maskId
    );

    const blocks = deinterleave(
        bodyRead.bytes,
        bodyRead.byteConfidences,
        structure
    );

    const correctedFrame = [];

    for (const block of blocks) {
        const decoded = rsDecode(
            block.codewords,
            block.parityLength,
            block.erasures
        );

        correctedFrame.push(...decoded.data);
    }

    const encodedPayload = correctedFrame.slice(
        0,
        header.encodedLength
    );

    const storedCRC = bytesToUint32BE(
        correctedFrame,
        header.encodedLength
    );

    const originalPayload =
        header.compression === 0
            ? encodedPayload
            : rmlz1Decode(
                encodedPayload,
                header.originalLength
            );

    if (
        originalPayload.length !==
        header.originalLength
    ) {
        throw new DecodeError("LENGTH_MISMATCH");
    }

    if (crc32c(originalPayload) !== storedCRC) {
        throw new DecodeError("CRC_FAILURE");
    }

    return decodePayloadByType(
        originalPayload,
        header.payloadType
    );
}
```

---

# 60. Normative Summary

RectaMatrix Version 1 uses:

```text
Geometry:
3:2 rectangle with seven fixed sizes

Orientation:
asymmetric Micro-Anchor at the upper left

Clocking:
alternating top row and left column

Text:
strict UTF-8

Binary data:
direct byte encoding

Base alphabet:
no Base45 and no internal textual base encoding

Compression:
none or RM-LZ1, selected adaptively

Integrity:
CRC-32C over the original Payload

Header protection:
RS(12,8) over GF(256)

Payload ECC:
dynamic shortened RS blocks over GF(256)

ECC Levels:
Low 5% with at least 4 parity bytes
Medium 15% with at least 8 parity bytes
High 30% with at least 12 parity bytes

Burst protection:
byte interleaving across multiple RS blocks

Mapping:
vertical two-column zigzag order

Masking:
four defined masks with deterministic selection

Rendering:
integer-sized modules and either a two-module Compact Quiet Zone or a Standard Quiet Zone of at least four modules

Image decoding:
classical contour, homography, sampling, and
thresholding methods

Soft decoding:
module confidences and RS erasures

Computer Vision Profile:
standardized handoff of matrix, confidences, and erasures

Quality reporting:
standardized Decode Quality Report

Conformance:
bitstream, matrix, and image test vectors

Final validation:
original length, CRC, and strict UTF-8 where applicable
```

These requirements are sufficient to implement encoders and decoders independently and to validate them at bitstream and matrix level using shared test vectors.

---

# 61. RectaMatrix Decode Quality Report

## 61.1 Purpose

The Decode Quality Report describes the quality and trustworthiness of a decoding operation. It changes neither the symbol nor the bitstream and is not a substitute for RS, CRC, or UTF-8 validation.

After a successful or failed decoding attempt, an image-based decoder SHOULD produce a machine-readable report.

## 61.2 Required Fields for Image-Based Decoders

A report SHOULD contain at least the following fields:

```text
profile
overallConfidence
imageQuality
anchorScore
topClockScore
leftClockScore
meanModuleConfidence
correctedCodewords
erasuresUsed
crcValid
```

Recommended API-level JSON schema:

```js
{
    profile: "rmx-cv-1",
    overallConfidence: 0.0,
    imageQuality: 0.0,
    anchorScore: 0.0,
    topClockScore: 0.0,
    leftClockScore: 0.0,
    meanModuleConfidence: 0.0,
    correctedCodewords: 0,
    erasuresUsed: 0,
    crcValid: false
}
```

All normalized quality values are in the range `[0,1]`.

## 61.3 Optional Fields

A decoder MAY additionally provide:

```text
orientationDegrees
perspectiveSkew
blurEstimate
contrastEstimate
damageRatio
headerConfidence
bodyConfidence
rsBlocksCorrected
rsBlocksFailed
decodeAttempts
decodeTimeMs
```

Optional fields MUST be described in the implementation documentation.

## 61.4 Overall Confidence

`overallConfidence` is a combined assessment of decoding reliability. It MUST NOT be derived solely from the CRC result.

A reference implementation SHOULD consider at least:

* Anchor and Clocking Scores,
* mean module confidence,
* geometric stability,
* proportion of erasures used,
* proportion of corrected codewords,
* CRC result.

A successful CRC validation is mandatory for a valid decode, but does not automatically result in `overallConfidence = 1`.

## 61.5 Image Quality

`imageQuality` assesses only the input signal, not the semantic validity of the Payload. It SHOULD consider:

* local contrast,
* sharpness,
* illumination uniformity,
* geometric distortion,
* module resolution,
* visible damage or occlusion.

## 61.6 Failure Reports

For a failed decode, the report MAY be partially populated. In this case, an error code in accordance with Chapter 47 MUST also be returned.

---

# 62. RectaMatrix Computer Vision Profile v1

## 62.1 Profile Identifier

The profile identifier is:

```text
rmx-cv-1
```

This profile standardizes the interface between image detection and the Symbol Decoder. It does not mandate a single image-processing algorithm.

## 62.2 Handoff Object

The Computer Vision Layer SHOULD provide at least the following information to the Symbol Decoder:

```js
{
    width: Number,
    height: Number,
    bits: Uint8Array,
    confidences: Float32Array,
    sourceQuadrilateral: [
        { x: Number, y: Number },
        { x: Number, y: Number },
        { x: Number, y: Number },
        { x: Number, y: Number }
    ],
    orientationDegrees: 0 | 90 | 180 | 270
}
```

`bits` and `confidences` each contain exactly `width × height` entries in row-major order.

## 62.3 Confidence Semantics

For every module:

```text
0.0 = completely uncertain
1.0 = maximally certain
```

Confidence describes the certainty of the bit decision, not the probability that the bit is black.

A value of `0.9` therefore means that the selected black-or-white decision was made with high confidence.

## 62.4 Byte Confidence

Byte confidence SHOULD be calculated from the eight associated module confidences. A reference implementation uses:

```text
byteMean = arithmetic mean of the eight confidence values
byteMin  = smallest of the eight confidence values
lowBits  = number of bits below a threshold
```

The rules defined in Chapters 41 and 43 remain the reference rules for Header and Body erasures.

## 62.5 Erasure Attempts

A decoder SHOULD first use conservative erasure thresholds. If RS or CRC validation fails, it MAY test additional threshold profiles in deterministic order.

Recommended order:

```text
Profile A: reference thresholds from Chapters 41 and 43
Profile B: slightly stricter erasures
Profile C: slightly more permissive erasures
Profile D: no erasures
```

The number of attempts MUST be limited. The order used MUST be documented and deterministic for identical inputs.

## 62.6 Reference Pipeline

The recommended pipeline, which is not algorithmically mandatory, is:

```text
Input image
→ grayscale conversion and alpha compositing
→ local contrast assessment
→ adaptive binarization
→ contour and candidate detection
→ corner refinement and homography
→ multiple samples per module
→ local black and white references
→ bit decision and module confidence
→ Header decoding with erasures
→ Body decoding with erasures
→ CRC and Payload validation
→ Decode Quality Report
```

## 62.7 Determinism

For an identical normalized handoff object, a conforming Symbol Decoder MUST produce the same decoding result.

Image detectors MAY produce different candidates or confidence values. Reference matrices and reference confidence values MUST be supplied for conformance testing.

---

# 63. Conformance Suite v1

## 63.1 Scope

The RectaMatrix Conformance Suite v1 consists of three levels:

```text
A. Bitstream test vectors
B. Matrix test vectors
C. Image test vectors
```

## 63.2 Bitstream Test Vectors

Bitstream vectors MUST include at least:

* input Payload,
* Payload Type,
* Compression Mode,
* CRC-32C,
* RS block partitioning,
* parity bytes,
* interleaved Codeword Stream,
* final Header.

## 63.3 Matrix Test Vectors

Matrix vectors MUST include at least:

* size and Size ID,
* complete unmasked Body bits,
* selected Mask ID,
* final symbol matrix without Quiet Zone,
* final symbol matrix with a four-module Standard Quiet Zone,
* final symbol matrix with a two-module Compact Quiet Zone.

## 63.4 Image Test Vectors

The official image suite SHOULD include the following categories:

```text
clean
print
display
perspective
rotation
blur
motion-blur
shadow
low-contrast
noise
partial-occlusion
reflection
multiple-candidates
```

Each image vector SHOULD include metadata containing:

```text
expectedPayload
expectedType
expectedSizeId
expectedOrientation
expectedResult
allowedErrorCode
minimumOverallConfidence, where applicable
```

## 63.5 Success Definition

An image test passes if:

* the expected Payload is reconstructed bit-exactly,
* CRC-32C succeeds,
* the Payload Type is recognized correctly,
* no unauthorized substitute decode is returned.

Quality values may vary within documented tolerances.

## 63.6 Negative Test Images

The suite MUST also contain images that must not decode successfully, including:

* random rectangular patterns,
* symbols damaged beyond the ECC capability,
* an incorrect Header Size ID,
* an invalid CRC,
* an unsupported Version,
* an incomplete Quiet Zone combined with an incorrect Anchor.

---

# 64. Versioning and Stability Rules for v1.0

## 64.1 Frozen Core

Upon publication of Version 1.0, the following symbol-bearing properties are frozen:

* seven symbol sizes and 3:2 geometry,
* Micro-Anchor,
* Clocking Pattern,
* scan order,
* Header layout,
* CRC-32C,
* RM-LZ1,
* RS definition and interleaving,
* masks and penalty calculation,
* Terminator and padding.

Future editorial changes to this specification MUST NOT alter these properties.

## 64.2 Profiles and Extensions

New Structured Payloads, alternative CV methods, or additional reporting metrics MAY be published as separate profiles. They MUST NOT change the meaning of existing Version 1.0 bit values.

## 64.3 Corrections

Documentation corrections SHOULD be published as errata. If a correction changes the behavior of conforming encoders or decoders, it MUST be identified as a new Core Version or an explicitly incompatible profile.

## 64.4 Reference Designation

The full designation of this edition is:

```text
RectaMatrix 2D Barcode Specification v1.0
Core Standard with Computer Vision Profile v1
```
