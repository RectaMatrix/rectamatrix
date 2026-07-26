# Contributing to RectaMatrix

Thank you for helping improve the format and its reference implementation.

## Set up the workspace

Install Node.js 22 or newer and pnpm 11.9.0, then run:

```sh
pnpm install --frozen-lockfile
pnpm release:check
```

Use `pnpm demo` for the interactive browser application.

## Make a change

1. Open an issue before making a wire-format or compatibility change.
2. Keep implementation changes focused and include tests.
3. Run `pnpm release:check` before opening a pull request.
4. Explain user-visible and compatibility effects in the pull request.

Format changes must update, in one pull request:

- the normative English specification;
- the informative German translation;
- the machine-readable constants and implementation;
- affected schemas, generators, and canonical vectors;
- `spec/CHANGELOG.md` and the repository changelog.

Run `pnpm generate:vectors` only when the expected canonical output changes,
then inspect and commit the generated diff. Do not hand-edit generated vectors.

## Compatibility promises

The project is in a preview phase. New behavior must be explicit, deterministic,
and testable by an independent implementation. Reserved values may not be used
without a specification change. See [`docs/COMPATIBILITY.md`](docs/COMPATIBILITY.md).

## Contributions and licensing

By submitting a contribution, you agree that it is provided under the Apache
License 2.0, as described in Section 5 of that license. Mark material that is
not intended as a contribution clearly before submitting it.
