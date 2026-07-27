# RectaMatrix format changelog

This file records changes to the encoded symbol format, independently of
implementation-only changes.

## Version 2 working draft - RM-HLE1

- Defines and implements deterministic RM-HLE1 segment framing.
- Adds Numeric, Alphanumeric, Lower, Upper, URL Token, and Byte modes.
- Uses dynamic programming to minimize the complete high-level bitstream.
- Adds automatic selection between Raw, RM-HLE1, and RM-LZ1.
- Adds RM-HLE1 encoder, decoder, negative handling, and conformance vectors.

## Version 2 architecture draft - 2026-07-27

- Proposes a 64-bit independently protected Format Header with a fixed four-bit
  version and a twelve-bit encoded-length field.
- Proposes finer 3:2 sizes and new 2:1 and 3:1 geometry families.
- Introduces the RM-HLE1 high-level encoding design for numeric,
  alphanumeric, text, URL-token, UTF-8, and binary segments.
- Separates Body ECC profiles from end-to-end integrity profiles.
- Treats Version 1 as a prototype that may be replaced once Version 2 has
  implementation-backed conformance vectors.

## Format Candidate 1 - 2026-07-26

- Defines Version 1 rectangular symbols at a fixed 3:2 aspect ratio.
- Defines Sizes 0–6, including 120×80 and 144×96 modules.
- Defines deterministic fixed-header whitening.
- Defines Standard (4-module) and Compact (2-module) Quiet Zone profiles.
- Defines Binary and UTF-8 payloads, RM-LZ1 compression, CRC-32C, and four
  Reed–Solomon error-correction levels.

Earlier development symbols are prototypes and are not covered by the
compatibility guarantees of Format Candidate 1.
