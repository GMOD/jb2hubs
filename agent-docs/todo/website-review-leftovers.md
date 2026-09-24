# What the 2026-09-23 website review left open

A review of the website raised about 95 findings across six areas: protein
browser, gene and ortholog pages, synteny, pangenome, search and tables, and the
launch pages with their infrastructure. Two rounds of fixes landed on 2026-09-24
and closed nearly all of them. This file holds what neither round closed:
product decisions the code cannot make, and follow-ups the fixes turned up.
Delete an entry when it lands, and the file when it is empty.

## Decisions

- **UCSC rows still display an abbreviated binomial.** 50 of the 238 dbs show
  UCSC's `organism` field (`D. melanogaster`, `S. cerevisiae`) as their common
  name on /search and /ucsc. Search no longer depends on it: each such db
  carries the common names GenArk gives its organism as match-only `aliases`
  (`generateSearchIndex.ts`), so `yeast` puts sacCer3 first, `nematode` ce11,
  `honey bee` apiMel2, and `fly` puts the 19 UCSC Drosophila dbs first with dm6
  7th (shorter names such as `fly D.erecta` win the clutter tiebreak). `worm`
  reaches ce11 only 40th, through `roundworm`, below rows named as worms. What
  is left is whether to show a borrowed name, and the /ucsc table's own filter
  (`UCSCTable.tsx`), which reads `list.json` and still misses `fly`.
- **The 12-genome cap on "Open all N"** (`MAX_PICKED_GENOMES`). A launch URL
  past ~8 KB exceeds CloudFront's request line, so a clade launch opens the 12
  genomes nearest the reference. Carrying the launch in the URL hash would lift
  the cap, but no host has been checked with it in a browser.

## Follow-ups

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
- **p2s_mapper's `toAuthorRange` skips a SIFTS segment with no author start.**
  `authorRange` in `website/src/components/proteinFeatures.ts` derives the start
  from the segment's end first (1A3O's HBB chains need it); the same line in
  p2s_mapper would let the wrapper go.
