# ADR 0003 — Mirror the assembly sidecar files onto our own bucket

- **Status:** Accepted for UCSC; **amended 2026-08-05 to exclude GenArk** (see
  "GenArk reverted, UCSC kept")
- **Date:** 2026-08-05
- **Affected:** `hubtools/src/mirrorSidecars.ts`,
  `ucsc2jbrowse/src/mirrorAssemblySidecars.ts`, every generated UCSC
  `config.json`, the `jbrowse.org` bucket

## Context

hgdownload goes down often enough to be a recurring support problem, and when it
does, our browsers fail to open at all, with an error that says nothing about
UCSC. All the data we generate ourselves (the gene tracks, the PIFs, the trix
indexes, the configs) was already on our bucket and reachable, and the browsers
still failed.

An assembly loads completely or not at all. In
`packages/core/src/assemblyManager/assembly.ts`, `loadPre()` fetches four things
in one `Promise.all`:

| source           | where our configs pointed it                          |
| ---------------- | ----------------------------------------------------- |
| sequence regions | `bigZips/<db>.chrom.sizes` (or the 2bit's own header) |
| `refNameAliases` | `bigZips/<db>.chromAlias.txt`                         |
| `cytobands`      | `database/cytoBand.txt.gz`                            |
| genetic codes    | inline in the config (`geneticCodes`), no fetch       |

`Promise.all` rejects on the first failure, and the comment there says this is
intended: any one of them failing fails the load. Each of three separate
hgdownload objects was therefore a single point of failure for the entire
session, and hg38, hg19 and mm39 have all three.

Rehosting **only** `chrom.sizes`, the obvious first move, would not have fixed a
single outage on those assemblies.

## Decision

Mirror all three sidecars into the assembly's own directory, next to the
`config.json` that names them, and rewrite the config to name them
**relatively** (`hg38.chrom.sizes`, `hg38.chromAlias.txt`,
`hg38.cytoBand.txt.gz`). They ship to the bucket with everything else in that
directory, so a UCSC outage now costs the **sequence track** and nothing more.

### The 2bit deliberately stays on hgdownload

The 2bit is the one large file of the set (hg38's is ~800MB, and there are
~51,000 GenArk assemblies). Mirroring it would multiply our storage for a file
whose failure costs a track rather than the session. Sidecars are kilobytes.

### Relative, not absolute jbrowse.org URLs

The configs already name ~600 files per assembly relatively. A relative sidecar
resolves the same way and keeps a config directory self-contained, which is what
lets `config-staging.json` and `minimal.json` work as siblings (see ADR 0002).

Relative paths raise one compatibility question: does an **old** host resolve a
relative `chromSizes` against the config's URL rather than the page's?
jbrowse-web sets `baseUri` next to every `uri` it finds while loading a config
(`packages/core/src/util/addRelativeUris.ts`), and TwoBitAdapter's
`preProcessSnapshot` has passed that `baseUri` into `chromSizesLocation` since
**v4.0.0**, our support floor (verified against the tag). jbrowse-web sets it on
the adapter node because that node holds both `uri` (the 2bit) and `chromSizes`.

`refNameAliases` and `cytobands` are ordinary `{ uri }` nodes, so they resolve
relatively on every host.

The change does require one fix: `chromSizes` is a bare string, not a `{ uri }`
node, so `mergeAll.ts`'s relative-URI rewriter, which keyed on `uri`, had to
handle it explicitly. Without that, `all.json` would resolve every mirrored
`chrom.sizes` against `/ucsc/` instead of `/ucsc/<db>/`.

### Local-first on the golden-path assemblies

The nightly rsync already puts two of the three on disk, so the mirror copies
them from there instead of fetching them:

- `chrom.sizes` == `database/chromInfo.txt.gz` columns 1–2 (column 3 is
  `fileName`)
- `cytoBand.txt.gz` == literally the file the config already names

The mirror fetches only `bigZips/<db>.chromAlias.txt`, because the `chromAlias`
database table holds `(alias, chrom, source)` triples, a different format from
the header-plus-matrix file `RefNameAliasAdapter` reads. ~240 assemblies
therefore cost ~240 small requests, which matters given hgdownload's behavior
under concurrency (see the note in
`ucsc2jbrowse/src/utils/assemblyAliasesAndCytobands.ts`).

### A failed fetch is neither fatal nor permanent

The mirror leaves a sidecar it can't fetch pointing at its upstream URL, which
is exactly as good as before, and retries it on the next run. The exception is
an upstream **404**: then the build removes the node from the config
(`refNameAliases` and `cytobands` only; see "Gone is not the same as
unreachable" below). The mirror rewrites the config only to name a file that
exists on disk at that moment, and downloads go through a temp file plus rename,
so a truncated fetch can't become a config target. A half-written `chrom.sizes`
would load as a valid assembly with missing contigs, which is worse than a
failed load.

A regenerated `config.json` comes back naming upstream URLs, so both mirroring
passes run over **every** assembly on every build, like
`ensureAssemblyAliasesAndCytobands`, rather than only over changed ones.

## Consequences

- A UCSC outage now leaves our browsers with a broken sequence track instead of
  nothing loading. The configs, all derived tracks and the search indexes were
  always on our bucket, and now the assembly definition is too.
- The mirrored files are generated data in the hub directories, gitignored like
  the gff/trix files beside them, and uploaded by the existing rclone sync. They
  are **not** committed: 51,000 hubs × 2 files would bloat the repo, and the
  labserver's working tree persists between runs.
- rclone uploads a directory's objects over minutes and not atomically, so for a
  brief window per deploy a config names a sidecar that is not in the bucket
  yet. Every regenerated track already has the same window (ADR 0001), and the
  same backstop covers both.
- `check-config-compat --local` serves a working-tree config against production
  data, so for a config whose sidecars have not been uploaded yet, those three
  fetches 404. The probe passes or fails on fatal page errors, plugin globals
  and track count, and none of those change, but a failed assembly in that mode
  is expected and not a regression.
- Anything that reads `chromSizes` out of a generated config has to accept a
  relative value now. `addMitochondrion.ts` is the only such consumer, and it
  reads the mirrored file off disk instead (`localChromSizesPath` in
  `ucsc2jbrowse/src/mitoCodes.ts`), which gives the same bytes without a fetch.

## Amendment, 2026-08-05 — Gone is not the same as unreachable

"Left pointing upstream" is the right answer for a file we could not fetch _this
time_. It is the wrong answer for a file upstream does not have at all: the url
fails `loadPre()`'s `Promise.all` on every load, forever, and that fails the
**whole assembly**. `mpxvRivers` showed it: its `refNameAliases` named a
`chromAlias.txt` that 404s at every path variant, so nobody could open the
assembly in production, for as long as the url had been wrong.

A **404 or 410** now removes the node from the config, and every other failure
keeps the old behavior. A 404 is a fact about the file, but a timeout, a 429 or
a 5xx is a fact about the moment, and hgdownload produces plenty of those under
concurrency. Treating one of them as "upstream removed this" would delete a
working alias file during exactly the outage this ADR is about, and once the
config stops naming the file, nothing fetches it back. The mirror therefore
throws `SidecarGoneError` only on those two statuses and never retries it, since
a retry would only reach the same answer more slowly.

Only `refNameAliases` and `cytobands` can be dropped, because those nodes are
optional and an assembly without one loads. `chromSizes` is never dropped:
dropping it would move sequence-region derivation onto the 2bit header, and
nothing in this repo shows TwoBitAdapter accepting its absence back to the
v4.0.0 floor (all 237 configs have one). The only two assemblies whose
`chrom.sizes` 404s are `hgFixed` and `cb1`, which `is_assembly_db` already
excludes, and `cb1`'s **2bit** 404s as well, so its config fails at the sequence
adapter, before any sidecar matters. (That sentence should have been read as an
alarm rather than an exemption; see the 2026-08-30 amendment.)

### The guard this needed

`mpxvRivers` stayed broken because no check covered sidecar reachability.
`check-plugin-urls` looks only at `plugins[]`, and `checkConfigCompat` passes or
fails on fatal page errors, plugin globals and track count, none of which a
failed assembly changes. This ADR's own Consequences said so, and we missed the
implication. `pnpm check-sidecar-urls` now covers it, in `gate_configs` beside
`check-plugin-urls`: relative refs must exist on disk next to the config, and
absolute ones must be reachable. Once an assembly is mirrored every ref is
relative, so the steady-state run makes no network requests. The check is UCSC
only, deliberately, because probing GenArk's ~101k upstream refs would repeat
the request load of the sweep that the amendment below reverts.

## Amendment, 2026-08-05 — GenArk reverted, UCSC kept

We rolled back the GenArk half of this decision the same day it shipped. GenArk
hubs have no rsynced `database/` dir and no cytoband file, so the sweep fetched
both of their sidecars once, and a `.sidecars-mirrored` stamp kept the steady
state at two stats per hub. The reasoning above still holds for UCSC, and the
sentence it got wrong was "Sidecars are kilobytes". After the first full sweep:

|        | assemblies | mirrored objects | bytes         | mean object |
| ------ | ---------- | ---------------- | ------------- | ----------- |
| UCSC   | ~240       | 400              | 533 MB        | 1.3 MB      |
| GenArk | 50,700     | **101,384**      | **17,630 MB** | 174 KB      |

Sidecars are larger than kilobytes on both sides: `chromAlias` has a row per
scaffold per naming authority, so a fragmented assembly's file runs to megabytes
(`bisBis1.chromAlias.txt` is 22MB, and that is a UCSC one). The object count,
400 against 101,384, is what separates UCSC from GenArk. Storage is a minor part
of the GenArk cost; the larger parts are 101k extra objects in every
`rclone sync` listing, 50,700 rewritten `config.json` files changing the git
tree each run, and a `/hubs/genark/*` CloudFront invalidation on runs that
otherwise changed nothing.

We reverted `genark2jbrowse/mirrorSidecars.sh`,
`genark2jbrowse/src/mirrorSidecarsBatch.ts`, both `make.sh` call sites, the
`.sidecars-mirrored` upload exclude, the `.gitignore` patterns, the local files,
and the config rewrites. All 101,384 values went back to the
`hgdownload.soe.ucsc.edu` urls they were generated with, after we checked that
the working tree held no other change to those configs. The next `uploadAll.sh`
removes the bucket objects: `rclone sync` defaults to `--delete-after`, so the
upstream-url configs reach the bucket before their sidecars are deleted, never
the reverse.

`hubtools/src/mirrorSidecars.ts` is untouched and stays generic. It is
`ucsc2jbrowse/src/mirrorAssemblySidecars.ts`'s library, and a future GenArk pass
would be built on it again.

### Consequence accepted

A GenArk assembly still fails **whole** during an hgdownload outage, for the
`Promise.all` reason this ADR opens with, and a UCSC assembly does not. We chose
that asymmetry: it saves 17.6GB and 101k objects on the 99.5% of our assemblies
that get the least traffic, and GenArk's 2bit is on hgdownload regardless, so
even a mirrored GenArk assembly opens to a broken sequence track during an
outage.

### If this needs revisiting

These options cost less than the sweep, roughly in order of appeal:

- Mirror only the GenArk assemblies that get traffic (the ones UCSC aliases,
  e.g. `rn8`, already get a UCSC-side config that **is** mirrored).
- Mirror `chrom.sizes` only and drop `refNameAliases` from the GenArk configs
  entirely rather than pointing it upstream, since an assembly with no
  `refNameAliases` node loads and one with an unreachable one does not. That
  gives up alias lookups for outage-independence at roughly 1/4 the bytes.
- Serve the sidecars through a CloudFront origin that proxies hgdownload, so we
  store nothing and the cache covers the outage.

## Amendment, 2026-08-30 — "not an assembly" was excusing a broken url

The first amendment dismisses `cb1` and `hgFixed` as the only assemblies whose
`chrom.sizes` 404s, on the grounds that `is_assembly_db` excludes them. `cb1` is
a real assembly and now builds like any other, its `chrom.sizes` derived from
its rsynced `chromInfo.txt.gz`; `hgFixed` is UCSC's metadata database and no
longer gets a config. `chromSizes` still has no `drop`, and now has no
counterexample either. The full history is in
`agent-docs/reference/TRACK_URL_CHECKS.md` ("Not a real assembly" was excusing a
url we publish).
