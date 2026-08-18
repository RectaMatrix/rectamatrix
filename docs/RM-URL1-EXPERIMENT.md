# RM-URL1 experiment

RM-URL1 is a non-normative, experimental whole-payload codec for exact ASCII
HTTP(S) URLs. It is intentionally separate from RM-HLE1 while its format and
value are evaluated. No RectaMatrix wire codec ID is assigned yet.

## Product boundary

RectaMatrix remains a general binary and Unicode-text barcode. RM-URL1 is only
an additional candidate for an encoder's future `auto` selection. Unsupported
inputs must fall back to RM-HLE1, RM-LZ1, or Raw rather than being normalized.

The experiment deliberately contains no complete hostnames and no corpus-derived
service list. Its fixed table has only 32 stable generic and country-code TLD
labels, including entries relevant to Europe, North America, China, India,
Japan, Korea, Australia, New Zealand, Brazil, and Mexico.

## Exactness

The encoder parses the original characters without `URL` or `URLSearchParams`.
It preserves path, query, fragment, empty segments, repeated parameters, ports,
and percent-escape letter case exactly. The optimized subset currently requires:

- lowercase `http://` or `https://`,
- lowercase ASCII DNS labels,
- no userinfo or IPv6 literal,
- ASCII remainder.

These are optimization eligibility rules, not restrictions on RectaMatrix
payloads. Other values use the general codecs.

RM-HLE1 can switch from ordinary text segments into byte-padded RM-URL1
segments and back with opcode `111`. The dynamic-programming encoder chooses
that segment only when the complete nested representation is cheaper. This
makes URL coding useful inside longer text without turning RectaMatrix into a
URL-only format. The v2 format is still a draft; RM-URL1 does not yet have a
standalone production wire codec ID.

## Coding structure

- one-bit HTTP/HTTPS selection and a `www.` flag,
- host labels encoded independently with a 37-character alphabet,
- a prefix-coded 32-entry final-label TLD table with literal-label fallback,
- a prefix-coded port marker: no port, explicit protocol default, `8080`, or
  exact individual port,
- 16 stable path/query tokens without complete hostnames,
- dynamic programming over context-specific Path, Query, and Fragment Lower
  tables plus Numeric, Mixed, percent-byte, delimiter, and seven-bit ASCII
  representations,
- version 0 fixed six-bit Tail run lengths and version 1 prefix-coded lengths:
  four bits for 1–8, six bits for 9–24, and eight bits for 25–64; the encoder
  emits whichever complete version is shorter,
- mandatory end marker and canonical zero padding.

Compound names such as `co.uk`, `com.au`, `co.in`, or `net.de` need no combined
entry: labels remain independently representable.

## Initial corpus result

A deterministic 10% sample of 100,025 public URLs was evaluated locally. Of
9,998 eligible ASCII HTTP(S) candidates, 9,976 (99.8%) were accepted by the
experimental subset.

| Group          | RM-HLE1 mean | RM-URL1 mean | Han Xin URI mean |
| -------------- | -----------: | -----------: | ---------------: |
| Overall        |    462.9 bit |    432.1 bit |        490.1 bit |
| Up to 40 bytes |    138.2 bit |    134.2 bit |        150.1 bit |
| 41–160 bytes   |    389.5 bit |    376.5 bit |        430.3 bit |
| Over 160 bytes |   1556.0 bit |   1341.1 bit |       1499.0 bit |

RM-URL1 is 6.7% smaller than RM-HLE1 and 11.8% smaller than Han Xin URI overall.
The gain is 2.9% against RM-HLE1 even for short URLs. A future integration must
still compare complete stored payload sizes and symbol sizes instead of
preferring RM-URL1 merely because input resembles a URL.

The benchmark script reports three distinct quantities: meaningful codec bits,
byte-padded stored payload bits, and concrete RectaMatrix framing before Body
error correction. The latter includes either the 32 information Header bits or
the 64-bit RS-protected Header plus the stored Payload and CRC-32C.

The corpus is not part of the repository, and these measurements are evidence
for further design work rather than normative constants.

## Local ha.mr control

A separate deterministic sample of 1,000 corpus rows compared RM-URL1 with the
locally checked-out ha.mr reference. RM-URL1 accepted 998 rows. ha.mr produced
an output for all of them, but only 467 outputs (46.8%) decoded to the exact
input string; URL normalization changes the rest.

On the 467 exact round trips, the mean RM-URL1 core was 349.5 bits and the mean
ha.mr integer core was 280.8 bits. That 24.5% core advantage is a useful target
for further RM-URL1 tuning. It is not yet an interchangeable codec result:
ha.mr's current compressor must first become byte-exact and its binary framing
must be specified.

The concrete containers reverse part of the result. Mean RectaMatrix framing
before any error correction was 417.0 bits (32-bit Header information, stored
RM-URL1 bytes, and CRC-32C). The actual `HTTP://HA.MR/…` QR alphanumeric stream
at QR error-correction level M occupied 443.1 data-codeword bits before QR
error correction. A hypothetical byte-packed ha.mr integer in the RectaMatrix
container would occupy about 348.3 bits, but no such interoperable ha.mr wire
format currently exists.

Therefore the next compression work should investigate ha.mr's entropy coding
and domain model without copying its service/domain corpus or its normalizing
URL parse behavior.

## Compact run-length result

Replacing every fixed six-bit Tail run length with the prefix code reduced the
five stable comparison URLs from a mean 192.6 to 188.6 meaningful bits (2.1%).
The URL embedded in the RM-HLE1 sentence fixture fell from 307 to 299 bits.
`https://example.com` remains unchanged because it has no Tail run. This is a
strict format improvement for the measured fixtures.

Because the prefix is two bits more expensive for lengths 25–64, the three-bit
RM-URL1 version field makes the choice lossless: version 0 retains fixed lengths
and version 1 uses the prefix. Both complete candidates are optimized and the
shorter is emitted. On an identical 9,993-URL deterministic sample, 3,975 URLs
improved, 6,018 stayed unchanged, and none regressed. Mean meaningful size fell
from 427.1 to 423.7 bits (0.8%).
