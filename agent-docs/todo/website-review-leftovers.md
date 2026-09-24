# What the 2026-09-23 website review left open

A review of the website raised about 95 findings across six areas: protein
browser, gene and ortholog pages, synteny, pangenome, search and tables, and the
launch pages with their infrastructure. Two rounds of fixes landed on 2026-09-24
and closed nearly all of them. This file holds what neither round closed:
product decisions the code cannot make, and follow-ups the fixes turned up.
Delete an entry when it lands, and the file when it is empty.

## Decisions

- **UCSC search rows name 50 organisms by an abbreviated binomial.**
  `generateSearchIndex.ts` takes a UCSC row's common name from the genome list's
  `organism` field, which reads `D. melanogaster`, `S. cerevisiae` or
  `C. elegans` for 50 of the 238 dbs, so `fly`, `yeast` and `worm` never reach
  dm6, sacCer3 or ce11. GenArk rows for the same taxa carry NCBI's names
  (`fly D.melanogaster`, `baker's yeast S288C`, `tropical clawed frog`), and
  borrowing the commonest one by taxon id would fix search for 49 of the 50; C.
  elegans's commonest, `nematode C.elegans`, still misses `worm`. It waits
  because it changes what /search and /ucsc display for those rows.
- **Search ranking for assembly names.** The review reported `GRCh38` ranking
  the GenArk GCF_000001405.40 row above hg38, and `t2t` placing hs1 18th. Not
  re-measured since the search changes of 2026-09-24, which changed only the
  order of equal scores.
- **The 12-genome cap on "Open all N"** (`MAX_PICKED_GENOMES`). A launch URL
  past ~8 KB exceeds CloudFront's request line, so a clade launch opens the 12
  genomes nearest the reference. Carrying the launch in the URL hash would lift
  the cap, but no host has been checked with it in a browser.

## Follow-ups

- **Protein browser.** A replaced gene query's NCBI requests keep running and
  hold queue slots ahead of the new one; cancelling them needs an abort signal
  passed through the resolver. A linked complex id waits on the partner list
  without holding the launch. 1A3O's HBB homo-oligomer interface reads "no chain
  covers the range" and falls back to UniProt numbering.
- **Two HPRC haplotype lanes.** `pnpm check-pangenome-launches` fails the `defb`
  and `nphp1` lanes: genes are never fetched on HG00097#1 and HG00544#1. Main
  failed both identically on 2026-09-24, before and after that day's pangenome
  changes. Publishing is ruled out: the published `hprc-grch38.json` is
  byte-identical to the committed one, and both haplotypes' gene files and
  `.tbi` indexes answer 200, as a working haplotype's do. So the cause is in how
  those two lanes resolve their region, not in the files.
- **Stale fields in the derived loci.** The committed mouse and bovine
  `loci.json` still carry `drawable`, `fullName` and `inversion`, which the
  generator no longer writes and nothing reads. They go at the next
  regeneration.
- **One more external link.** `ProteinBrowserDialogs` builds its own new-tab
  link; `ExternalLink.tsx` could replace it.
- **State not yet in the URL:** the /search page number and the synteny view
  mode.
