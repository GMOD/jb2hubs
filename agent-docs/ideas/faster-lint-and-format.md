# Optimize lint and format speed

Aspiration with no plan behind it yet. `pnpm lint` is type-aware oxlint
(tsgolint) over the whole tree and `pnpm format` is oxfmt plus a prettier pass
for `**/*.astro`; neither has been profiled, so there is no measurement saying
which of the two costs the time or where.

First step is a measurement, not a change.
