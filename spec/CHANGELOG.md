# RectaMatrix format changelog

This file records changes to the encoded symbol format, independently of
implementation-only changes.

## Format Candidate 1 - 2026-07-26

- Defines Version 1 rectangular symbols at a fixed 3:2 aspect ratio.
- Defines Sizes 0–6, including 120×80 and 144×96 modules.
- Defines deterministic fixed-header whitening.
- Defines Standard (4-module) and Compact (2-module) Quiet Zone profiles.
- Defines Binary and UTF-8 payloads, RM-LZ1 compression, CRC-32C, and four
  Reed–Solomon error-correction levels.

Earlier development symbols are prototypes and are not covered by the
compatibility guarantees of Format Candidate 1.
