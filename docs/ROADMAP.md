# Roadmap

## Format Candidate 1

- Publish the Version 1 candidate specification and TypeScript reference.
- Collect independent encoder/decoder feedback and interoperability results.
- Expand real-world print, camera, glare, blur, and damaged-symbol test data.
- Audit format capacity, reserved values, and error-correction behavior.

## Release candidate

- Resolve all known wire-format questions.
- Freeze canonical conformance vectors and their schemas.
- Document independent implementation results.
- Complete API and package-boundary review.

## Stable 1.0

- Freeze Version 1 semantics and compatibility promises.
- Publish stable packages after a separate package-security and API audit.
- Maintain backward-compatible decoding and a formal extension process.

Ideas such as alternative error-correction profiles, additional languages, and
printer integrations belong after the Version 1 format is stable unless they
provide independent interoperability evidence.
