- check that aws create-invalidation run less
- optimize lint and format speed somehow
- MAF tracks. Re-checked 2026-08-08 and most of this item was already stale, so
  what is actually left is smaller than it read:
  - **Done:** the 4 chainNet `.net.bb` tracks mistyped as MafTrack are dropped
    (`getTrackModifications.ts`, `CHAIN_NET_SUBTRACK`). They were pairwise nets
    typed `bigMaf` by UCSC, converted into one-row MafTracks with sample lists
    parsed out of a setting that is not a species list.
  - **Already true:** `createTrackConfiguration.ts` does emit `samples` (via
    `mafSamplesFromSpeciesOrder`) and does resolve `data.frames` into
    `annotationAdapter`, as does the golden-path twin `buildBigMafTrack.ts`.
  - **Still open:** `nhLocation` is emitted by neither builder. hg38's three
    trees are hand-written in `ucscMixins/hg38.json`, so every other assembly's
    MAF track has no tree sidebar and no way to get one. UCSC ships the `.nh`
    next to the alignment under a predictable name, so this is derivable in both
    builders rather than a per-assembly mixin.
  - Sample wiring is step one for MAF row → genome navigation,
    `agent-docs/MAF_CROSS_VIEW_NAVIGATION.md`

- **The chainNet `vs` source is implemented and never run, and should stay that
  way.** `createChainTrackPifs.sh` takes `liftOver` or `vs`; `makePifs.sh` only
  calls `liftOver`. That looks like a coverage gap and is not one. Measured
  against hgdownload 2026-08-08, counting targets rather than directories:

  | assembly | liftOver | vs  | vs-only                          |
  | -------- | -------- | --- | -------------------------------- |
  | hg38     | 239      | 171 | 1 (`self`)                       |
  | hg19     | 117      | 96  | 3 (`galGal6`, `vicPac2`, `self`) |
  | mm10     | 173      | 142 | 1 (`gorGor6`)                    |
  | mm39     | 76       | 36  | 0                                |
  | danRer11 | 8        | 4   | 1                                |
  | dm6      | 57       | 29  | 19                               |
  | ce11     | 6        | 27  | 26                               |
  | galGal6  | 11       | 78  | 74                               |

  For everything that carries traffic, `vs` is very nearly a subset of what
  liftOver already covers, and hg38's single addition is its own self-chain.

  **It is also far bigger:** hg38→mm39 is 70MB netted against 208MB all-chain,
  hg38→panTro6 12MB against 135MB. Worst exactly where coverage would be gained,
  because close relatives align almost everywhere: galGal6→melGal5 is **2.2GB**
  and galGal6→anaPla1 1.3GB, for one pair each.

  ### Does netting drop paralogs? No. Measured, because it is the obvious fear

  `netChainSubset` pulls **whole chains** that appear anywhere in the net, not
  just the top-level one, so a paralogous chain comes along with them. Do not
  describe `over.chain` as "the best chain per region" — that is wrong, and it
  is what makes dropping `all.chain` sound riskier than it is. hg38→panTro6,
  both files, 2026-08-08:

  |                                             | over.chain | all.chain |
  | ------------------------------------------- | ---------- | --------- |
  | chains                                      | 30,099     | 3,428,602 |
  | hg38 bases covered                          | 2.989 Gb   | 2.989 Gb  |
  | covered by all.chain and **not** over.chain | —          | **0**     |
  | mean alignments per covered base            | 1.18       | 2.46      |
  | max alignments on one base                  | 19         | **5,960** |

  So no hg38 territory is lost at all, and paralogy is retained rather than
  collapsed: 15% of hg38 bases and 28% of panTro6 bases sit under more than one
  chain in the netted file, up to 19 deep. The textbook case checks out too —
  SMN1 and SMN2 are each covered by several chains and both map to the same
  chimp loci, so the duplication is representable.

  What `all.chain` adds is the depth tail from ~20 to 5,960 alignments on a
  single base. A base aligning 5,960 ways is in a repeat family, not a gene
  duplication, and drawing it is the hairball. That is the whole difference:
  114x the chains, 0% new sequence.

  Measured on one close pair. The zero-extra-territory result should hold
  generally, since a chain that aligns anything is eligible for the net, but the
  depth numbers will move with divergence.

  So the `vs` files were deleted from the bucket deliberately and that was
  right. If the galGal6 bird set is ever actually wanted, source netted chains
  for it rather than turning this switch on.

  Unrelated to any of the above: mm39's GCF_003668045.3 has no `vs` directory
  either, that alignment exists only under `/gbdb/mm39/bbi/chainNet`.

Left over from the shell-hardening review, whose handoff doc is gone now that
items 1–5 have shipped (`run.sh` `set -euo pipefail`, the `--upload-only` +
`--reprocess-all` rejection, the scoped `git add -A --` allowlist, the
control-plane doc block, and `parse_flags` owning the shared flags):

- Two near-duplicate `downloadNcbiGff.sh` (genark + ucsc). Different downloaders
  (`wget -N` vs `datasets download`) but the same re-download gate
  (`FETCH_UPDATES` / file-existence), so they will drift. Minimum a
  cross-reference comment; better, lift the gate decision into `lib/common.sh`.
- `parallel … || true` on the genark chain PIFs (`genark2jbrowse/make.sh` ~156,
  ~160, ~164, and `ucsc2jbrowse/makePifs.sh`) hides a persistent failure as
  cleanly as it absorbs a one-off. Tolerating partial failure across a 50k-hub
  sweep is probably deliberate, so this wants a count-and-report rather than a
  bare removal. The other half of that item —
  `git commit … || echo "no changes"` reporting any commit failure as "nothing
  to commit" — is **done**: both sites in `run.sh` now gate on
  `git diff --cached --quiet`.
- `run.sh`'s `set -euo pipefail` has never been exercised end-to-end. One real
  `./run.sh --dry-run` on the deploy box would confirm no `-u` path fires that a
  static read cannot reach.

## Surviving a UCSC outage

Motivation: hg19/hg38 must not hang when hgdownload is down. As of 2026-08-05
they already don't — all three `loadPre()` sidecars are mirrored and were
confirmed live in the bucket (HTTP 200, non-empty), and `check-sidecar-urls`'s
`MUST_BE_LOCAL` now fails the pre-upload gate if that regresses. These are what
is left, in the order I'd do them.

- **Make the outage drill repeatable.** The check added to `check-sidecar-urls`
  proves a config _names_ local files; nothing proves the app actually opens
  without UCSC, and the 6-hourly canary boots against a working hgdownload so it
  stays green until the outage itself. `scripts/checkConfigCompat.mjs` already
  calls `page.setRequestInterception(true)`, so an `--offline-ucsc` mode that
  aborts every request to `hgdownload.soe.ucsc.edu` and then asserts hg38/hg19
  still open is small (~40 lines against existing code). Wire it into
  `config-canary.yml` and a regression surfaces within 6 hours — including one
  that originates outside this repo.
- **Decide whether to mirror the hg19 + hg38 2bits.** `hg38.2bit` is 797 MB and
  `hg19.2bit` 778 MB: **1.5 GB, 2 objects**. This is the last UCSC dependency
  for those two, and during an outage it is the one visibly broken thing (the
  assembly opens, the sequence track does not). ADR 0003 rejects mirroring
  2bits, but that was about doing it across all 238 assemblies, and what
  actually killed the GenArk sweep was object count (101,384), which two objects
  does not approach. A different decision from the one the ADR made, so it wants
  an explicit answer rather than an assumption either way.
- **Prune `configs/` instead of only documenting it.** `make.sh` copies
  `$UCSC_BUILT_DIR/<db>/config.json` to `configs/<db>.json` and never removes
  anything, which is how `renames.json` survived a year and put four `unpkg.com`
  plugin urls into `all.json`. Deleting the file fixed the symptom. Either a
  prune step in `make.sh` (drop a `configs/<db>.json` with no matching built
  dir) or an orphan assertion in `gate_configs` fixes the cause. `hgFixed` is
  the one legitimate extra.
- **GenArk still fails whole during an outage** — 50,701 assemblies, no
  protection, and nothing checks their ~101k upstream sidecar urls either
  (`check-sidecar-urls` is UCSC-only on purpose). Partly mitigated already: the
  highest-traffic GenArk genomes are the UCSC-aliased ones (`rn8` and friends),
  which get a mirrored UCSC-side config. If this is ever revisited, note that of
  the three options in ADR 0003's amendment only the CloudFront-origin proxy
  avoids putting tens of thousands of objects back in the bucket, since it
  stores nothing.

## Before the next upload

- Run `pnpm check-config-compat`. `mergeAll` now emits a deduped plugin list (4
  entries where it used to emit 12), and that has been verified structurally and
  by unit test but never booted in a real browser.
- **`rm -rf "$UCSC_BUILT_DIR/renames"` on the build machine.** This is the one
  that matters, and it has not been done: the 2026-08-05 deletion treated the
  symptom, and by 2026-08-08 `renames.json` was back in **both** trees
  (`configs/` and `configs-minimal/`). Deleted again, but nothing stops a third
  return except this line.

  It no longer comes back silently, at least. `checkPluginUrls.mjs` now fails on
  any file in those directories whose `assemblies[0]` has no name, which is what
  a swept-up `ucscRenames/hg38.json` looks like, and it is in `gate_configs` so
  it runs before every upload. The plugin check alone could never catch it: all
  four of its unpkg.com urls fetched fine and defined their globals.

  The only visible symptom for a year was that the script logged
  `scanned 476 ucsc configs` while walking 478. That number is now counted
  rather than written down.

## Orthologs index

ortholog_index.json is 9× bigger than it needs to be. It's 4.34 MB (1.11 MB
gzipped) and the page's largest asset, but only two things are actually read
from it: is this accession one we host, and its ucscDb (62 entries). The names
duplicate taxname/common_name, which every ortholog report already carries — and
NCBI's are cleaner, with no assembly parenthetical to strip. An accession list
plus the ucscDb map measures 672 KB raw / 120 KB gzipped. Worth its own change.

Scoping to a clade the reference isn't in (human TP53 → Birds) loses the ref row
and every synteny link, because taxon_filter excludes the reference's own
report. I made the page say so and name the way back; the alternative is
injecting the reference taxon into the request, which muddies the "N of M in
birds" count.

Smaller: no column sorting, no expand-all; NCBI is still browser-direct and
unkeyed (pre-existing). The ortholog payload also carries GO terms and
Ensembl/UniProt/OMIM ids that nothing shows yet.

One note if you astro dev in another checkout: synteny_pairs.json changed shape,
so run pnpm generate there. I regenerated this one.
