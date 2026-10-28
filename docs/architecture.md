# Architecture

## Data flow

```
  upstream data              converters (this repo)        published output
  ─────────────              ──────────────────────        ────────────────
  UCSC goldenPath rsync ──▶  ucsc2jbrowse/make.sh    ──▶   jbrowse.org/ucsc/<db>/config.json
  UCSC GenArk hub.txt   ──▶  genark2jbrowse/make.sh  ──▶   jbrowse.org/hubs/genark/<sharded>/config.json
  NCBI GFF + metadata   ──▶     (both via hubtools/)        ...plus .gff.gz / .pif.gz / trix data files
  Wikidata, Wikipedia   ──▶
                             website/ (Astro)         ──▶   genomes.jbrowse.org
```

- **Configs and website are published separately.** Neither site serves configs:
  jbrowse-web resolves `?config=/ucsc/…` against its own origin, so configs
  always come from the jbrowse.org bucket that both sites read. `./run.sh`
  drives build → upload → deploy in the order that keeps them consistent.
- **A config lives at one permanent URL forever**, so a regenerated config has
  to keep booting on JBrowse releases years older than the one we develop
  against. `pnpm check-plugin-urls` and `pnpm check-config-compat` guard that;
  see [CLAUDE.md](../CLAUDE.md) and
  [ADR 0002](../agent-docs/architecture-decision-records/0002-config-compat-across-jbrowse-versions.md).
- **Most JSON in the tree is generated**, including all ~50,700 hub configs.
  Never hand-edit it; [generated-files.md](generated-files.md) lists what to
  edit instead.

## Repository layout

| Path               | What it is                                                                                                                                                   |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `run.sh`           | Top-level entry point: build both pipelines, gate the result, upload, deploy                                                                                 |
| `lib/`             | Shell libraries both pipelines source: `common.sh` (control plane, flag parsing, rclone sync), `derive.sh` and `chainpif.sh` (chain → PIF), with their tests |
| `scripts/`         | Repo-level node utilities: config-compat and plugin-url checks, synteny-track catalog scan                                                                   |
| `ucsc2jbrowse/`    | UCSC goldenPath → JBrowse configs (shell pipeline in `*.sh`, per-step transforms in `src/`)                                                                  |
| `genark2jbrowse/`  | UCSC GenArk hubs → JBrowse configs, same shape                                                                                                               |
| `hubtools/`        | TypeScript library shared by both converters (hub parsing, track and config generation)                                                                      |
| `website/`         | Astro + React static site, plus the `generate*.ts` build-time data generators it reads                                                                       |
| `hubs/`            | **Generated.** The GenArk hub configs, sharded by accession (symlinked as `genark2jbrowse/hubs`)                                                             |
| `pangenome-build/` | Standalone impg pangenome build behind the mouse-strain explorer; runs on a compute host, not part of `run.sh`                                               |
| `aws/`             | Two Lambdas: `config-merger` (multi-assembly configs on the fly) and `ortholog-assembler` (`/synteny-multi` backend)                                         |
| `agent-docs/`      | Design notes, handoffs and ADRs, filed per [agent-docs/CLAUDE.md](../agent-docs/CLAUDE.md)                                                                   |
