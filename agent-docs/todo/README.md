# todo

One file per loose end we intend to close. Each states what is wrong, what was
already measured, and what "done" looks like — enough that picking one up does
not mean re-deriving it. Delete the file when the work lands.

Ideas we have not committed to live in [../ideas/](../ideas/). Something that
turns out to be a decision rather than a task belongs in
[../architectural-decision-records/](../architectural-decision-records/).

- [prune-unreferenced-derived-files.md](prune-unreferenced-derived-files.md) —
  13.09 GB across 1,814 files is derived and uploaded while no config names it.
  11.99 GB of that is provably dropped by `getTrackModifications.ts`; the
  remaining 1.10 GB is not, and one slice of it turned out to be a bug rather
  than junk, which is why the gate must mirror the drop rules rather than
  observe the config.
- [website-review-leftovers.md](website-review-leftovers.md) — what the
  2026-09-23 website review left open after two rounds of fixes: two product
  decisions (whether UCSC rows show a borrowed common name, the 12-genome launch
  cap) and the follow-ups the fixes turned up.
- [stale-ncbi-gff-release.md](stale-ncbi-gff-release.md) — about 2% of GenArk
  GFFs hold an older RefSeq release than NCBI now publishes at the same
  accession, because a GFF is fetched once. The track names the release it
  holds; the accession page names the newer one.
