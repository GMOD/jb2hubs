---
name: genark-taxon-image-ancestor-walk
description:
  Give a species with no Wikipedia or Wikidata image its genus's or family's
  image, labelled as such.
---

# Taxon images from an ancestor

`genark2jbrowse/src/getTaxonImages.ts` looks up one image per taxon (hub
`image.json`, then Wikipedia, then Wikidata) and leaves a `.notfound` sentinel
when all three come up empty, which left about 37,840 species with no image in
2026-06.

- Walk up the NCBI taxonomy (`nodes.dmp`, which
  `website/taxonomyBuilder/build_taxonomy.py` already downloads) until an
  ancestor has an image.
- Store it with `ancestorTaxonId`, so the page can label it "Image shows genus
  _Cochliomyia_" and the reader does not take it for the species.
- Re-count the species with no image first; the 37,840 predates the
  Wikipedia-first order.
