# Structured payload profiles

RectaMatrix is a general binary and Unicode-text symbol. Frequent structured
payloads can nevertheless use dedicated, lossless coding without turning the
core format into a collection of website-specific shortcuts.

## Proposed architecture

RM-HLE1 remains the general text codec. It has one inline Web URL segment
because HTTP(S) links commonly occur inside prose. Pure URLs may use the same
RM-URL1 grammar through a future whole-payload structured profile and avoid the
inline segment overhead.

For whole structured payloads, reserve one Header Codec ID for an `RM-SP1`
dispatcher rather than one Codec ID per application. A short profile selector
would precede the profile data. No production selector values are assigned
until each profile has a grammar, exact round-trip tests, malformed-input
rules, limits, and corpus evidence.

Every auto encoder must compare the complete stored candidate, including the
profile selector, byte padding, Header, and CRC. Merely recognizing a syntax is
not sufficient reason to select a profile. Accepted input must round-trip
exactly; semantic normalization belongs in a separately requested application
operation, never in compression.

## Candidate order

| Priority | Candidate                            | Why it is structured enough to help                                                               |
| -------- | ------------------------------------ | ------------------------------------------------------------------------------------------------- |
| 0        | HTTP(S) Web URL                      | Implemented experimentally as RM-URL1; useful both alone and inline                               |
| 1        | EPC QR / GiroCode                    | Fixed SEPA payment fields, constrained currencies, amount, IBAN/BIC, and purpose fields           |
| 1        | GS1 element strings and Digital Link | Standard identifiers, application identifiers, numeric fields, and URI structure                  |
| 1        | vCard                                | Repeated field names and parameter grammar; requires explicit vCard-version and escaping handling |
| 2        | Wi-Fi configuration                  | Small fixed field vocabulary such as authentication, SSID, password, and hidden flag              |
| 2        | iCalendar event                      | Repeated property names and date/time forms, but folding and parameter rules add complexity       |
| 2        | `mailto:`, `tel:`, and `sms:` URIs   | Useful compact URI subtypes after Web URL results stabilize                                       |

Generic JSON, XML, arbitrary prose, and compressed binary data should continue
to compete through RM-HLE1, RM-LZ1, Raw, and any future general compressor.
Their vocabularies are too application-specific for a permanent fixed token
table in the symbol standard.

## Admission criteria

A structured profile should be assigned only when it has:

1. a stable external syntax or standard,
2. byte-exact decoding for every accepted input,
3. strict rejection plus general-codec fallback outside its subset,
4. a bounded decoder with no uncontrolled allocation,
5. a representative, redistributable test corpus,
6. a measurable stored-bit or symbol-size win over every general codec, and
7. independent conformance vectors for valid, edge, and malformed streams.
