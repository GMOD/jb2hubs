---
name: gtex-eqtl-variant-to-gene-display
description:
  GTEx eQTLs open packed because every display tried so far misreads them; mock
  up arcs from each variant to its target gene, filtered by causal probability.
---

# A display for GTEx eQTLs that shows which gene each variant drives

`hg38-gtexEqtlCaviar` and `hg38-gtexEqtlDapg` open as packed features. The
packed view, rows by tissue and a point per variant were each tried on
2026-10-26 and pulled. The note at the top of `hubtools/src/columnDisplays.ts`
says so for anyone tempted to retry rows.

## What a record is

- A BED12 of two blocks, the target gene's body and the 1 bp variant, joined by
  a line. One record spans up to about 1 Mb.
- Columns: `eqtlPos` (`chr1:109297274-109297274`), `eqtlName` (rsID), `genePos`,
  `geneName`, `geneStrand`, `tissue`, and the fine-mapping probability (`cpp`
  for CAVIAR, `pip` for DAP-G). `score` is always 1000, and the BED `strand` is
  not the gene's strand.
- JBrowse reads a strand-bearing BED12 as a transcript and drops `thickStart`
  and `thickEnd` from the feature, so a config can't place the variant from
  them. Without that, two thirds of the records near SORT1 went missing. Parse
  `eqtlPos` instead, with a `formula` transform:
  `jexl:parseInt(split(feature.eqtlPos, '-')[1])` is the variant's end.

## What failed, near SORT1 (chr1:109,200,000-109,400,000)

- **Rows by tissue:** about 44 rows of gene bodies and links from off-screen
  variants. Colin: "quite complex, I dunno what's really going on there".
- **A point per record** (x = variant, y = probability, color = gene): one
  variant drives several genes, often across many tissues, and those points
  share a pixel. rs12740374 drives SORT1, PSRC1 and CELSR2 at probability 1.0,
  and only one of the three showed.
- **One point per variant and gene** (`aggregate`, `max` probability): this
  fixes the stacking, but 200 kb holds 41 target genes and 20 kb holds 34. Color
  can no longer name the gene, and which gene is the question a reader brings.
- A point mark can't take `size` from a field (only a link maps a field, to
  stroke width), so a tissue count can't size the point.

## What to try next

Arcs, with a `link` mark from the variant to the gene's TSS. The far end then
names the gene by where it lands, and color is free for something else.

- **Variant:** formula over `eqtlPos`, as above.
- **TSS:** formula over `genePos` and `geneStrand`, the gene's start on `+` and
  its end on `-`.
- **Filter:** keep the probability at 0.5 or above, or the arcs become a
  hairball. Without a cut, the window above holds about 190 variant–gene pairs.
- **Aggregate:** first, so each variant–gene pair draws one arc at its best
  tissue.
- **DAP-G:** most `pip` values sit near zero (median 0.03, against 0.17 for
  CAVIAR's `cpp`), so it needs its own cut. CAVIAR's floor is about 0.1,
  apparently a UCSC cut, so the two tracks aren't comparable at one threshold.

Capture both tracks at 200 kb and 20 kb near SORT1 and check that rs12740374
shows three confident arcs. Judge whether the result reads before adding it as a
display beside the packed one. A headless capture can come back as a blank view
at random, so retake one before calling it a bug.
