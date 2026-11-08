# CLAUDE.md

Converts UCSC GenArk and UCSC browser hubs into JBrowse 2 configs and serves
them from a static site (`docs/architecture.md`). The reason behind each rule,
and each subsystem's design record, is in `agent-docs/reference/`: read the doc
for the thing you change before changing it.

## Generated files

- **Change a generated config through its source, then regenerate**: a UCSC
  assembly's extra tracks go in `ucsc2jbrowse/ucscExtensions/<db>.json`, a
  GenArk hub's in `genark2jbrowse/genArkExtensions/`, the rest in a converter.
  The next run overwrites a hand edit (`docs/generated-files.md`).

## Configs live at permanent urls

- **v4.3.0 must boot every config and open every track**; it may lose a v5
  setting, never the session. Dropping a host from `HOST_VERSIONS`
  (`scripts/checkConfigCompat.mjs`) is Colin's call: ask first, naming what
  v4.3.0 users lose.
- **Write the spelling jbrowse-components `main` declares.** `main` lifts an old
  one with only a console line; after changing a generator, run main's
  `jbrowse validate` over a regenerated hg38 config.
- **Stage a config-level feature in the sibling `config-staging.json`**
  (`stagingEnhanceOptions`), never a separate tree: a config names its data
  relatively.
- **Run `pnpm check-config-compat --plugin Name=<path>` before publishing a
  plugin build these configs name.** The bundles publish from another repo, so a
  config here can break with nothing pushed.

## Shipping

- **Ship a converter or builder change with `./run.sh --configs-only`**, which
  runs the upload gates that a build hand-rolled from `buildConfigs.ts` skips.
- **Verify a builder change on a scratch build** (`--out-root <dir>`, then
  diff), which answers url checks from `fileAccessCache/`; any other build
  probes upstream.
- **Upload what a page reads before deploying the page**: configs, staged
  configs, `website/pangenome-config/` (`upload.sh`) and pangenome sidecars.
  `run.sh` orders its own uploads; its staging check sees only hg38's
  `config-staging.json`.
- **Keep the clock out of every synced file's bytes**, or the change-gated
  upload, CloudFront invalidation and website deploy fire on every run. For the
  same reason `.oxfmtrc.json` keeps ignoring `**/.*-uploaded.json`: a stamp is a
  byte-exact copy.
- **Start a PIF format bump on purpose.** A `@jbrowse/cli` bump that moves
  `make-pif --format-version` rebuilds and re-uploads every PIF (~930 GB) at the
  next run.

## Upstream servers

hgdownload is a research file server our users pull from, and it stalls instead
of returning an error.

- **Keep `pnpm check-track-urls` at its budget**: 300 urls a run, 1 a second.
- **Give every fetch a deadline** (`FETCH_TIMEOUT_MS`, `hubtools/src/util.ts`),
  and retry a transient failure before it counts.
- **Count a url gone only on a 404 or 410**, in every cache, sentinel and check;
  a timeout or 5xx is transient.
- **Name `hgdownload2` in no published config**; it is a fallback for our reads.
- **Mirror and bulk-probe only UCSC assemblies' sidecars.** GenArk's are ~101k
  urls; a GenArk mirror sweep of 101,384 objects was reverted, and a probe of
  them all costs as many requests.

## Code

- **A `catch` that falls back tests for the error it expects** (`isGone`, a
  typed error) and rethrows the rest. `scripts/checkCatchAlls.mjs` sees only a
  catch that never binds its error.
- **Make a gate over hundreds of inputs refuse an empty answer**: a derivation
  that yields zero is a broken run.
- **Compile under both TypeScript 7.1 and 7.0**: tsrs (7.1) runs typecheck and
  lint, while editors and `hubtools`' build use the `typescript` 7.0 package;
  code has to compile under both `lib.dom`s.
- **Call the JBrowse CLI as `$JBROWSE_CLI`** (`lib/derive.sh`), the repo's pin,
  never the `jbrowse` on PATH.
- **Guard a `.ts` entry point with
  `process.argv[1] === fileURLToPath(import.meta.url)`**: under
  `--experimental-strip-types`, `import.meta.main` is false and the script does
  nothing.
