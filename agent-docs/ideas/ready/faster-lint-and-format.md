---
name: faster-lint-and-format
description:
  pnpm lint and pnpm format have never been profiled; time each half first.
---

# Optimize lint and format speed

`pnpm lint` is type-aware oxlint (tsgolint) over the whole tree and
`pnpm format` is oxfmt plus a prettier pass for `**/*.astro`; neither has been
profiled, so there is no measurement saying which of the two costs the time or
where.

Time oxlint's syntactic pass against tsgolint, and oxfmt against the prettier
pass, before changing anything.
