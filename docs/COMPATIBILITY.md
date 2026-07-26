# Compatibility policy

RectaMatrix is currently at **Format Candidate 1**. The repository version
`0.1.0-preview.1` identifies a source snapshot; the on-symbol Format Header
continues to identify wire-format Version 1.

## Current guarantees

- Equal input and options produce an identical canonical module matrix.
- Conforming decoders accept the canonical positive vectors and reject the
  canonical negative vectors.
- The English specification is normative when documentation differs.
- Reserved Header values are rejected rather than guessed.

## Preview limitations

Compatibility is not guaranteed across preview releases. In particular,
prototype symbols created before fixed-header whitening, Sizes 5 and 6, or the
current Quiet Zone rules may not be compatible with Format Candidate 1.

Applications that persist or print preview symbols should store the repository
release tag alongside them and retain the matching decoder and conformance set.

## Stable-release bar

A future stable release will freeze existing Version 1 meanings. Later versions
must use explicit version signaling and may not silently reinterpret Version 1
symbols.
