# Handoff: NCBI GFF tracks for detected UCSC assemblies

Written 2026-08-26. The code is committed and green (`pnpm lint`,
`pnpm typecheck`, the new `deriveNcbiAccessions.test.ts`), but **nothing has
been regenerated or uploaded** — this checkout has no `UCSC_BUILT_DIR` and no
`UCSC_DOWNLOADS_DIR`, so the pipeline could not run here. What follows is what
is done, what a run will do, and what to watch.

The design and the measurements live in `CLAUDE.md`, under "Which UCSC
assemblies are NCBI-derived is derived, not listed". This file is only the
operational half.

## What landed

- `ucsc2jbrowse/src/deriveNcbiAccessions.ts` (+ test) — db → GCF accession from
  `nibPath`, `description` and `hgFixed.asmEquivalent`, with
  `ncbiRefSeqAccessions.tsv` overriding. CLI prints a TSV.
- `ucsc2jbrowse/downloadNcbiGff.sh` — reads that instead of the TSV, and gates
  add-track on the GFF's seqids actually overlapping the assembly.
- `ucsc2jbrowse/ncbiRefSeqAccessions.tsv` — same 11 rows, rewritten header: it
  is the override layer now, and `-` turns a db off.

`make.sh` needed no edit. It already calls `./downloadNcbiGff.sh`
unconditionally in Phase 3, already rsyncs all of `goldenPath/hgFixed/database`
(which is where `asmEquivalent.txt.gz` comes from), and `PIPELINE_SOURCES`
already covers both `ucsc2jbrowse/src` and every `ucsc2jbrowse/*.sh`, so the new
code moves `PIPELINE_HASH` on its own.

## What a run will do

Roughly **64 new assemblies** get a `<db>-ncbiRefSeqGff` track, on top of the 11
that have one today. Budget for it:

- ~1.35GB of GFF from NCBI (`datasets`, measured with `--preview` over all 75).
  Not hgdownload — this does not touch the request budget in
  `scripts/checkTrackUrls.mjs`.
- One `jbrowse text-index` per new assembly, which is the slow part.
- `configs/<db>.json` and `configs-minimal/<db>.json` change for each, since
  `ncbirefseq` is already a `MINIMAL_TRACK_PATTERNS` entry.

**Do a dry run of the detection first** — it needs no build dir, only the
downloads dir:

```
node ucsc2jbrowse/src/deriveNcbiAccessions.ts \
  "$UCSC_BUILT_DIR/list.json" "$UCSC_DOWNLOADS_DIR" \
  ucsc2jbrowse/ncbiRefSeqAccessions.tsv
```

Expect ~71 rows (75 detected minus the four the addressability gate drops), a
`source` column of `curated` / `nibPath` / `description` / `asmEquivalent`, and
`partial-sequence-match` on a handful. If it prints far fewer, the likely cause
is `asmEquivalent.txt.gz` missing from
`$UCSC_DOWNLOADS_DIR/hgFixed/hgFixed/database/` — the script says so on stderr
rather than silently returning a short list.

Then scope the first real run to one assembly rather than letting it loose:

```
cd ucsc2jbrowse && ./downloadNcbiGff.sh rn8
```

rn8 is the right first case: it is why this exists, its refNames are RefSeq
accessions outright, and its GenArk twin
(`/hubs/genark/GCF/036/323/735/GCF_036323735.1/config.json`) already carries the
equivalent `-ncbiGff` track, so the two can be compared directly.

## What to check before uploading

The existing gates cover most of it — `run.sh`'s `gate_configs` runs
`check-plugin-urls`, `check-sidecar-urls`, `check-config-compat --local` and
`check-track-urls --offline`, and the last of those will notice a config naming
a GFF that is not being uploaded. Two things they cannot see:

1. **A track that loads and draws nothing.** `seqids_resolve` logs
   `<db>: N/M GFF seqids resolve` for every assembly it adds. Read those lines.
   A low ratio is expected on the partial `asmEquivalent` matches (galGal6 is
   455/464 upstream) and suspicious anywhere else. Nothing downstream checks
   this, because a track hydrates perfectly cleanly whether or not its features
   land.
2. **The four dropped assemblies staying dropped for the right reason.**
   oryCun2, musFur1 and loxAfr3 publish no RefSeq aliases at all; aptMan1's
   refNames _are_ RefSeq accessions under UCSC's dot-to-`v` mangling and it
   publishes no alias table to undo that. They should simply not appear in the
   derivation output. If one starts appearing, UCSC published an alias table and
   that is real news, not a bug.

## Loose ends, in the order I would pick them up

- **aptMan1 is recoverable and is not recovered.** `NW_013995860v1` →
  `NW_013995860.1` is a mechanical transform, and
  `ensureAssemblyAliasesAndCytobands` is where a synthesized alias would belong.
  I left it alone because it widens the change from "detect" to "manufacture
  aliases UCSC does not publish", which deserves its own decision. Worth
  checking how many of the 163 undetected assemblies share the shape before
  building it — I did not measure that.
- **163 assemblies are still undetected**, mostly old ones with no RefSeq
  equivalent registered anywhere UCSC exposes. `asmEquivalent` covers 96 of the
  238 at all, only 58 with a refseq row. I did not look for a fourth evidence
  source; NCBI's own assembly-name search would be one, and would need the same
  same-assembly-not-same-species discipline the curated file's header describes.
- **`assemblyName` for `nibPath` rows is the whole description**
  (`Jan. 2024 (GRCr8/rn8)`) rather than a clean assembly name. The column is
  documented as a note and nothing parses it, so this is cosmetic.
- **GenArk is untouched.** Its own pipeline already adds these tracks; this
  change is only about the UCSC arm having fallen behind it.
