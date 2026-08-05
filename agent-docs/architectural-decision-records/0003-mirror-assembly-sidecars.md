# ADR 0003 — Mirror the assembly sidecar files onto our own bucket

- **Status:** Accepted for UCSC; **amended 2026-08-05 to exclude GenArk** (see
  the amendment at the end)
- **Date:** 2026-08-05
- **Affected:** `hubtools/src/mirrorSidecars.ts`,
  `ucsc2jbrowse/src/mirrorAssemblySidecars.ts`, every generated UCSC
  `config.json`, the `jbrowse.org` bucket

## Context

hgdownload goes down often enough to be a recurring support problem, and when it
does, our browsers do not degrade — they fail to open at all, with an error that
says nothing about UCSC. That is worse than it sounds, because all the data we
generate ourselves (the gene tracks, the PIFs, the trix indexes, the configs)
was already on our bucket and perfectly reachable.

The reason is that an assembly does not partially load. In
`packages/core/src/assemblyManager/assembly.ts`, `loadPre()` fetches four things
in one `Promise.all`:

| source           | where our configs pointed it                          |
| ---------------- | ----------------------------------------------------- |
| sequence regions | `bigZips/<db>.chrom.sizes` (or the 2bit's own header) |
| `refNameAliases` | `bigZips/<db>.chromAlias.txt`                         |
| `cytobands`      | `database/cytoBand.txt.gz`                            |
| genetic codes    | inline in the config (`geneticCodes`), no fetch       |

`Promise.all` rejects on the first failure, and the comment there is explicit
that this is intended: any one of them failing fails the load. So three separate
hgdownload objects were each a single point of failure for the entire session,
and hg38/hg19/mm39 have all three.

Rehosting **only** `chrom.sizes` — the obvious first move — would not have fixed
a single outage on those assemblies.

## Decision

Mirror all three sidecars into the assembly's own directory, next to the
`config.json` that names them, and rewrite the config to name them
**relatively** (`hg38.chrom.sizes`, `hg38.chromAlias.txt`,
`hg38.cytoBand.txt.gz`). They ship to the bucket with everything else in that
directory, so a UCSC outage now costs the **sequence track** and nothing more.

### The 2bit deliberately stays on hgdownload

It is the one large file of the set (hg38's is ~800MB, and there are ~51,000
GenArk assemblies). Mirroring it would multiply our storage for a file that,
when it fails, costs a track rather than the session. Sidecars are kilobytes.

### Relative, not absolute jbrowse.org URLs

The configs already name ~600 files per assembly relatively; a relative sidecar
resolves the same way and keeps a config directory self-contained (which is what
makes `config-staging.json` and `minimal.json` siblings work — see ADR 0002).

The compatibility question this raises is whether an **old** host resolves a
relative `chromSizes` against the config's URL rather than the page's.
jbrowse-web stamps `baseUri` next to every `uri` it finds while loading a config
(`packages/core/src/util/addRelativeUris.ts`), and TwoBitAdapter's
`preProcessSnapshot` has carried that `baseUri` into `chromSizesLocation` since
**v4.0.0**, our support floor (verified against the tag). The stamp lands
because the adapter node holds both `uri` (the 2bit) and `chromSizes`.

`refNameAliases` and `cytobands` are ordinary `{ uri }` nodes, so they were
never in question.

One thing this **does** require: `chromSizes` is a bare string, not a `{ uri }`
node, so `mergeAll.ts`'s relative-URI rewriter — which keyed on `uri` — had to
learn about it, or `all.json` would resolve every mirrored `chrom.sizes` against
`/ucsc/` instead of `/ucsc/<db>/`.

### Local-first on the golden-path assemblies

Two of the three are already on disk from the nightly rsync, so they are taken
from there rather than fetched:

- `chrom.sizes` == `database/chromInfo.txt.gz` columns 1–2 (column 3 is
  `fileName`)
- `cytoBand.txt.gz` == literally the file the config already names

Only `bigZips/<db>.chromAlias.txt` is fetched, because the `chromAlias` database
table is `(alias, chrom, source)` triples — a different shape from the
header-plus-matrix file `RefNameAliasAdapter` reads. This keeps ~240 assemblies
down to ~240 small requests, which matters given hgdownload's behavior under
concurrency (see the note in
`ucsc2jbrowse/src/utils/assemblyAliasesAndCytobands.ts`).

GenArk hubs have no rsynced `database/` dir and no cytoband file, so both of
their sidecars are fetched — once. The first sweep over ~51,000 hubs is the
expensive run; afterwards a mirrored file is reused and a stamp file
(`.sidecars-mirrored`, invalidated by a newer `config.json`) keeps the steady
state at two stats per hub. **(Superseded — the GenArk sweep was reverted; see
the amendment below.)**

### Failure is not fatal, and not sticky

A sidecar that can't be fetched is left pointing at its upstream URL: exactly as
good as before, and retried next run — **unless upstream answers 404**, in which
case the node is removed from the config instead (`refNameAliases` and
`cytobands` only; see "Gone is not the same as unreachable" below). The config
is only ever rewritten to name a file that exists on disk at that moment, and
downloads land via a temp file plus rename, so a truncated fetch can't become a
config target — a half-written `chrom.sizes` would load as a valid assembly with
missing contigs, which is worse than a failed load.

Because a regenerated `config.json` comes back naming upstream URLs, both
mirroring passes run over **every** assembly on every build, like
`ensureAssemblyAliasesAndCytobands`, rather than only over changed ones.

## Consequences

- A UCSC outage now degrades our browsers to "the sequence track is broken"
  instead of "nothing loads". The configs, all derived tracks, and the search
  indexes were always ours; now the assembly definition is too.
- The mirrored files are generated data living in the hub directories,
  gitignored like the gff/trix files beside them, and uploaded by the existing
  rclone sync. They are **not** committed: 51,000 hubs × 2 files would bloat the
  repo, and the labserver's working tree persists between runs.
- rclone ships a directory's objects over minutes and not atomically, so there
  is a brief window per deploy where a config names a sidecar that has not
  landed yet. Same window that already exists for every regenerated track (ADR
  0001); the backstop is the same.
- `check-config-compat --local` serves a working-tree config against production
  data, so on a config whose sidecars have not been uploaded yet, those three
  fetches 404. The probe's pass/fail keys on fatal page errors, plugin globals
  and track count, none of which this trips, but a failed assembly in that mode
  is expected rather than a regression.
- Anything that reads `chromSizes` out of a generated config has to accept a
  relative value now. `addGeneticCodes.ts` was the only such consumer, and it
  reads the mirrored file off disk instead — the same bytes, minus a fetch.

## Amendment, 2026-08-05 — Gone is not the same as unreachable

"Left pointing upstream" is the right answer for a file we could not fetch _this
time_. It is the wrong answer for one upstream does not have at all: the url
fails `loadPre()`'s `Promise.all` on every load, forever, and that fails the
**whole assembly**, not the one file. `mpxvRivers` was the proof — its
`refNameAliases` named a `chromAlias.txt` that 404s at every path variant, so
the assembly could not be opened in production, and had not been for as long as
the url had been wrong.

So a **404 or 410** now removes the node from the config, while every other
failure keeps the old behavior. The distinction is load-bearing in one
direction: a 404 is a fact about the file, but a timeout, a 429 or a 5xx is a
fact about the moment, and hgdownload produces plenty of those under
concurrency. Reading a blip as "upstream removed this" would delete a working
alias file during exactly the outage this ADR exists for — and once the config
stops naming it, nothing fetches it back. Hence `SidecarGoneError`, thrown only
on those two statuses and never retried, since retrying a definitive answer is
only a slower way to reach it.

Only `refNameAliases` and `cytobands` are droppable, because those nodes are
optional — an assembly without one loads fine. `chromSizes` is never dropped:
that would move sequence-region derivation onto the 2bit header, and nothing in
this repo demonstrates TwoBitAdapter accepts its absence back to the v4.0.0
floor (all 237 configs carry one). The only two assemblies whose `chrom.sizes`
404s are `hgFixed` and `cb1`, which `is_assembly_db` already excludes — and
`cb1`'s **2bit** 404s as well, so its config is dead at the sequence adapter
where no sidecar decision reaches.

### The guard this needed

Nothing checked sidecar reachability, which is why `mpxvRivers` sat broken.
`check-plugin-urls` only looks at `plugins[]`; `checkConfigCompat` keys on fatal
page errors, plugin globals and track count, and a failed assembly trips none of
them — this ADR said as much in its own Consequences and the implication was
missed. `pnpm check-sidecar-urls` closes it, in `gate_configs` beside
`check-plugin-urls`: relative refs must exist on disk next to the config,
absolute ones must be reachable. Once an assembly is mirrored every ref is
relative, so the steady-state run touches the network zero times. It is UCSC
only, deliberately — probing GenArk's ~101k upstream refs is the road straight
back to the sweep the amendment below reverts.

## Amendment, 2026-08-05 — GenArk reverted, UCSC kept

The GenArk half of this decision was rolled back the same day it shipped. The
reasoning above is unchanged and still holds for UCSC; what it got wrong was the
sentence "Sidecars are kilobytes". Measured after the first full sweep:

|        | assemblies | mirrored objects | bytes         | mean object |
| ------ | ---------- | ---------------- | ------------- | ----------- |
| UCSC   | ~240       | 400              | 533 MB        | 1.3 MB      |
| GenArk | 50,700     | **101,384**      | **17,630 MB** | 174 KB      |

Sidecars are not kilobytes on either side: `chromAlias` carries a row per
scaffold per naming authority, so a fragmented assembly's runs to megabytes
(`bisBis1.chromAlias.txt` is 22MB, and that is a UCSC one). What makes UCSC fine
and GenArk not is the object count — 400 against 101,384. The GenArk cost is not
mainly storage, it is 101k extra objects in every `rclone sync` listing, 50,700
rewritten `config.json` files churning the git tree each run, and a
`/hubs/genark/*` CloudFront invalidation on runs that otherwise changed nothing.

What was reverted: `genark2jbrowse/mirrorSidecars.sh`,
`genark2jbrowse/src/mirrorSidecarsBatch.ts`, both `make.sh` call sites, the
`.sidecars-mirrored` upload exclude, the `.gitignore` patterns, the local files,
and the config rewrites (all 101,384 values went back to the
`hgdownload.soe.ucsc.edu` urls they were generated with — verified before the
checkout that the working tree held no other change to those configs). The
bucket objects are removed by the next `uploadAll.sh`: `rclone sync` defaults to
`--delete-after`, so the upstream-url configs land before their sidecars go
away, never the reverse.

`hubtools/src/mirrorSidecars.ts` is untouched and stays generic — it is
`ucsc2jbrowse/src/mirrorAssemblySidecars.ts`'s library, and it is what a future
GenArk pass would be built on again.

### Consequence accepted

A GenArk assembly still fails **whole** during an hgdownload outage, for the
`Promise.all` reason this ADR opens with. UCSC does not. That asymmetry is
intentional: it buys back 17.6GB and 101k objects on the 99.5% of our assemblies
that get the least traffic, and GenArk's 2bit is on hgdownload regardless, so
even a mirrored GenArk assembly opens to a broken sequence track during an
outage.

### If this needs revisiting

Cheaper options than the sweep, roughly in order of appeal:

- Mirror only the GenArk assemblies that actually get traffic (the ones UCSC
  aliases, e.g. `rn8`, already get a UCSC-side config that **is** mirrored).
- Mirror `chrom.sizes` only and drop `refNameAliases` from the GenArk configs
  entirely rather than pointing it upstream — an assembly with no
  `refNameAliases` node loads; one with an unreachable one does not. That trades
  alias lookups for outage-independence at roughly 1/4 the bytes.
- Serve the sidecars through a CloudFront origin that proxies hgdownload, so
  nothing is stored and the cache absorbs the outage.
