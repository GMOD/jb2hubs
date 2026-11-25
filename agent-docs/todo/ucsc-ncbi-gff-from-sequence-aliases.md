---
name: ucsc-ncbi-gff-from-sequence-aliases
description:
  41 UCSC assemblies have RefSeq sequence aliases and no RefSeq GFF track, only
  because nothing names their GCF. NCBI's sequence-to-assembly lookup named one
  for 27 of them; build it as a fourth evidence source that votes over several
  sequences. Low priority: these are mostly superseded builds.
metadata:
  category: ready
  area: ucsc2jbrowse
  first_move:
    'Check that `datasets summary` lists an annotation for each of the 27 GCFs
    before writing the source.'
  order: 4
---

# A RefSeq accession from an assembly's own sequence aliases

`ucsc2jbrowse/src/deriveNcbiAccessions.ts` detects which UCSC assemblies are
NCBI-derived, and 74 of the 239 committed configs have a `<db>-ncbiRefSeqGff`
track. `agent-docs/reference/UCSC_PIPELINE.md` describes the design under
"`deriveNcbiAccessions.ts` decides which UCSC assemblies are NCBI-derived".

## What the other 165 look like

Measured on 2026-11-25 over the rsynced `database/` directories:

| chromAlias.txt.gz                  | assemblies |
| ---------------------------------- | ---------- |
| absent                             | 89         |
| present, with a `refseq` source    | 41         |
| present, without a `refseq` source | 35         |

The 41 pass `hasRefSeqAliases`, so a RefSeq GFF's seqids would resolve on them.
They get no GFF because no evidence source names an accession: none has a
`ucsc`↔`refseq` row in `asmEquivalent`, and the 14 whose genome-list entry names
an accession name a `GCA_`. They include canFam6, panTro5, rheMac8, galGal5,
danRer10, equCab2, oviAri4, felCat8 and xenTro9.

## The source

A chromAlias `refseq` alias is a versioned RefSeq sequence accession
(`NW_006223512.1`), and NCBI maps one to the assemblies that hold it:

```
https://api.ncbi.nlm.nih.gov/datasets/v2/genome/sequence_accession/<acc>/sequence_assemblies
```

Asked about two aliases per assembly, it named a GCF for 27 of the 41 and
returned `{}` for both aliases of the other 14 (allMis1, aquChr2, bisBis1,
danRer7, droPer1, echTel2, fr3, micMur2, oreNil2, ornAna1, panPan1, papAnu2,
susScr3, xenTro7).

Two sequences are too few to pick a version:

- **One sequence can sit in several assemblies.** A bosTau8 alias returned
  `GCF_000003055.6`, `GCF_000003205.4` and `GCF_002263795.3`; panTro5, petMar3,
  rhiRox1 and felCat8 also returned more than one.
- **Two UCSC dbs can share a sequence.** panTro3 and panTro4 both returned
  `GCF_000001515.6` from the aliases sampled.

So the source has to sample several sequences per assembly, prefer nuclear
scaffolds over a shared chrM, and take the one GCF every sample agrees on,
earning no row when none does. That keeps the same-assembly-not-same-species
rule the header of `ucsc2jbrowse/ncbiRefSeqAccessions.tsv` describes.

Not yet checked: whether `datasets summary` lists an annotation for each of the
27, and whether the 14 with no answer are assemblies NCBI has removed.

## Leads that are closed

- **Dot-to-`v` mangled refNames** (`NW_013995860v1`) occur on aptMan1 alone, so
  no alias is synthesized for them.
- loxAfr3, musFur1 and oryCun2 have an `asmEquivalent` refseq row and no
  `refseq` alias source, as the reference doc records.

The `assemblyName` column of a `nibPath` row holds the whole description
(`Jan. 2024 (GRCr8/rn8)`), and no code parses that column.
