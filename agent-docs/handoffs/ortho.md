Landed on main as 8e9f1c5dfa3. Here's the round.

One real bug, fixed. The gene-order page's drill-down built a GenArk-sharded
config path from NCBI's bare accession and never passed ucscDb. I have to
correct my own earlier claim: I swept all 62 UCSC-native accessions, and only
hg38's GenArk 2bit/chrom.sizes 404 — so "a browser with no sequence" is
human-only, not all 62. The other 61 opened a working but far sparser config
than the rest of the site links to. Human being the default reference (and the
reference's own gene being the most-clicked glyph) is what makes it the common
case. All 62 /ucsc/<db>/config.json exist, so the fix has somewhere to point.

The fix resolves through the assembly index, which also handles "NCBI reported
against a version we don't host". I split geneDrilldownUrl out pure (like
subtreeSyntenyUrl), added 6 tests, and verified the store seam against the real
production index — human → /ucsc/hg38/config.json, mouse → mm39, dog → canFam3.

Two leads I chased that turned out to be nothing — recording so they don't get
re-chased:

- The plan.tracks.flat() level-shift I flagged can't fire. bestNeighbor refuses
  an extension whose link disagrees with the name already fixed for a node, so
  the chain never contains an adjacency the resolver would drop. There's now a
  test that fails if that guard is loosened.
- The gibbon "seqid missing from chromAlias" was my measurement error — that
  assembly puts refseq in the last column, not the first. Re-checked correctly:
  32/32 resolve.

Measured, not acted on:

- ~0.08% of hosted accessions have a dead GenArk config (1,199/1,200 in a spread
  sample; GCF_003029065.1, GCF_002831045.1). They come from searchIndex.json, so
  the accession page and search link to configs that 404 — ~40 across 52k. The
  fix belongs in whatever refreshes that index, not a client-side guard.
- ~1 in 300 GenArk hubs has no gene track at all (GCF_000924235.1), so the row's
  &tracks=<acc>-ncbiGff is inert.

Neither seemed worth machinery at those rates, but both are cheap to re-measure
if you disagree.

One thing I should flag about this whole session's work: the gene-order page is
multiSynteny: staging, so that last fix isn't on production yet — it lands when
that flag flips. The ortholog picker and the GFF track changes are production
paths.
