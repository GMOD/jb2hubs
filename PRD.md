# GenArk Taxon Images – PRD

## Problem

Wiki images are fetched per-accession, but images are a per-taxon property. This
causes:

- **Inconsistent results**: Same species can have an image for one accession but
  not another due to transient API failures or rate limiting
- **Redundant API calls**: Multiple accessions of the same species each make
  separate Wikipedia lookups
- **37,840 species with no image** despite many having images available on
  Wikidata/Wikipedia

## Solution (implemented)

Centralized taxon-level image lookup with two-tier strategy:

1. **Wikidata SPARQL** (bulk, primary) – queries by NCBI taxon ID (P685 → P18
   image property). Most reliable since it uses stable IDs, not name matching.
2. **Wikipedia pageimages API** (serial, fallback) – by cleaned scientific name
   for taxons not found in Wikidata.

Results stored in `taxon_images/{taxonId}.json`, then copied to each accession's
hub directory.

### Key files

- `genark2jbrowse/src/getTaxonImages.ts` – centralized fetcher
- `genark2jbrowse/src/copyTaxonImages.ts` – copies taxon images to accession
  dirs

## Possible next steps

### Taxonomy tree walking

For species with no Wikidata/Wikipedia image, walk up the NCBI taxonomy tree
(using `website/taxonomyBuilder/nodes.dmp`) to find an image from an ancestor
taxon. For example, if _Cochliomyia macellaria_ has no image but the genus
_Cochliomyia_ does, use that as a fallback.

This could significantly reduce the ~37k species with no image by inheriting
genus-, family-, or order-level images.

Implementation sketch:

- Load `nodes.dmp` parent-child mapping
- For each taxonId with no image, walk up parents until one has an image in
  Wikidata
- Store with a flag indicating it's an ancestor image (e.g.
  `"ancestorTaxonId": 12345`)
- Display with a note like "Image shows genus _Cochliomyia_" rather than
  implying it's the exact species
