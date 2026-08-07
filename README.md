# jb2hubs

A portal that turns public genome resources into ready-to-open
[JBrowse 2](https://jbrowse.org/jb2/) sessions.

It converts the UCSC goldenPath databases and the ~50,000 UCSC
[GenArk](https://hgdownload.soe.ucsc.edu/hubs/) assembly hubs into JBrowse 2
configs, enriches them with data from NCBI, Wikidata and elsewhere, and serves a
static site for finding an assembly and launching it.

- Live site: <https://genomes.jbrowse.org>
- Staging site: <https://staging.genomes.jbrowse.org>

## How it works

```
  upstream data              converters (this repo)        published output
  ─────────────              ──────────────────────        ────────────────
  UCSC goldenPath rsync ──▶  ucsc2jbrowse/make.sh    ──▶   jbrowse.org/ucsc/<db>/config.json
  UCSC GenArk hub.txt   ──▶  genark2jbrowse/make.sh  ──▶   jbrowse.org/hubs/genark/<sharded>/config.json
  NCBI GFF + metadata   ──▶     (both via hubtools/)        ...plus .gff.gz / .pif.gz / trix data files
  Wikidata, Wikipedia   ──▶
                             website/ (Astro)         ──▶   genomes.jbrowse.org
```

Three things are worth knowing up front:

- **Configs and website are published separately.** Neither site serves configs:
  jbrowse-web resolves `?config=/ucsc/…` against its own origin, so configs
  always come from the jbrowse.org bucket that both sites read. `./run.sh`
  drives build → upload → deploy in the order that keeps them consistent.
- **A config lives at one permanent URL forever**, so a regenerated config has
  to keep booting on JBrowse releases years older than the one we develop
  against. `pnpm check-plugin-urls` and `pnpm check-config-compat` guard that;
  see [CLAUDE.md](CLAUDE.md) and
  [ADR 0002](agent-docs/architectural-decision-records/0002-config-compat-across-jbrowse-versions.md).
- **Most JSON in the tree is generated**, including all ~50,700 hub configs.
  Never hand-edit it — see
  [Generated vs source-controlled](#generated-vs-source-controlled).

## Repository layout

| Path               | What it is                                                                                                                                       |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| `run.sh`           | Top-level entry point: build both pipelines, gate the result, upload, deploy                                                                     |
| `lib/`             | Shell libraries both pipelines source — `common.sh` (control plane, flag parsing, rclone sync) and `chainpif.sh` (chain → PIF), with their tests |
| `scripts/`         | Repo-level node utilities: config-compat and plugin-url checks, synteny-track catalog scan                                                       |
| `ucsc2jbrowse/`    | UCSC goldenPath → JBrowse configs (shell pipeline in `*.sh`, per-step transforms in `src/`)                                                      |
| `genark2jbrowse/`  | UCSC GenArk hubs → JBrowse configs, same shape                                                                                                   |
| `hubtools/`        | TypeScript library shared by both converters (hub parsing, track and config generation)                                                          |
| `website/`         | Astro + React static site, plus the `generate*.ts` build-time data generators it reads                                                           |
| `hubs/`            | **Generated.** The GenArk hub configs, sharded by accession (symlinked as `genark2jbrowse/hubs`)                                                 |
| `bed2gff/`         | Vendored Rust fork used by the UCSC gene-track pipeline (see `bed2gff/VENDORED.md`)                                                              |
| `pangenome-build/` | Standalone impg pangenome build behind the mouse-strain explorer; runs on a compute host, not part of `run.sh`                                   |
| `aws/`             | Two Lambdas: `config-merger` (multi-assembly configs on the fly) and `ortholog-assembler` (`/synteny-multi` backend)                             |
| `agent-docs/`      | Design notes, handoffs and ADRs — indexed in [agent-docs/README.md](agent-docs/README.md)                                                        |

Further reading: [DEVELOPERS.md](DEVELOPERS.md) for prerequisites and how to run
things, [CLAUDE.md](CLAUDE.md) for the invariants and gotchas that bite when
changing the pipelines.

## Quick start

```bash
pnpm install
pnpm build:bed2gff        # one-time; the UCSC gene-track pipeline needs the binary

./run.sh --dry-run        # build everything locally, no upload or deploy
./run.sh                  # full incremental build + upload + deploy
```

Each pipeline and the website can also be run on its own; the full set of flags,
env vars and per-pipeline instructions is in [DEVELOPERS.md](DEVELOPERS.md).

## Checks

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

`.github/workflows/lint.yml` runs the lint/typecheck/test set on push;
`config-canary.yml` re-boots the published configs on a timer, because the
plugin bundles they load are published from another repo and can break with
nothing pushed here.

## Generated vs source-controlled

Generated — regeneration clobbers hand edits:

- `hubs/**` and
  `genark2jbrowse/{hubJson,processedHubJson,speciesDescriptions,taxon_images,categoryIndex}`
- `ucsc2jbrowse/{configs,configs-minimal,removedTracks,fileAccessCache}` and the
  merged `removedTracks.json` / `blockedFiles.json` (the latter is the
  blocked-only subset of `fileAccessCache/`)
- `website/{processedHubJson,public/searchIndex.json,src/recentlyUpdated.json}`

Source-controlled inputs that steer the output — edit these instead:

- `ucsc2jbrowse/ucscExtensions/*.json` (extra tracks merged into a generated
  config), `ucscMixins/`, `ucscRenames/`, `defaultFavs.json` (default sessions)
- `genark2jbrowse/genArkExtensions/*.json` — the same idea for GenArk hubs
- everything under `hubtools/src/`, `*/src/` and `website/src/`

## Credits

Huge thanks to the UCSC Genome Browser team for their generous data sharing
policy and for the resources this portal is built on.

This repo was written with the aid of AI tools including Claude and avante.nvim.
