# Checks

```bash
pnpm lint:fast            # oxlint, syntactic — seconds
pnpm lint                 # oxlint --type-aware (tsgolint)
pnpm typecheck            # tsc --noEmit
pnpm check-format         # oxfmt everywhere + prettier for *.astro
pnpm lint:sh              # shellcheck over every *.sh
pnpm --recursive run test # vitest suites (hubtools, converters, aws)
./lib/common.test.sh      # shell unit tests (need xxhash and pigz installed)
./lib/chainpif.test.sh
```

Before shipping regenerated configs:

```bash
pnpm check-plugin-urls    # every plugins[].url the configs name is live and sane
pnpm check-config-compat  # boot the shipped configs in every hosted JBrowse release
```

- `.github/workflows/lint.yml` runs the lint, typecheck and test set on push.
- `config-canary.yml` re-boots the published configs on a timer, because another
  repo publishes the plugin bundles they load, so they can break with nothing
  pushed here.
