# Governance

RectaMatrix is maintained in public in this repository. Repository maintainers
are responsible for releases, review, moderation, and stewardship of the format.

## Decision process

- Implementation fixes follow normal pull-request review.
- Wire-format, compatibility, or conformance changes require a public proposal
  that explains motivation, alternatives, migration, and test vectors.
- The normative English specification is the decision record. The German
  translation is updated in the same change.
- Maintainers seek technical consensus. When consensus is not possible, the
  maintainers record the decision and rationale in the proposal.

## Stability stages

Format Candidate releases may contain breaking changes, which must be called
out in both changelogs. A stable format release requires independent decoding
evidence, frozen conformance vectors, documented compatibility rules, and no
known unresolved wire-format questions.

## Releases

Only maintainers may create signed or annotated release tags. Every release
must pass the repository release gate and publish checksums with its artifacts.
