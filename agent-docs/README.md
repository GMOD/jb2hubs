# agent-docs

Working notes: design docs, surveys, and handoffs written while building
features here. They are point-in-time records, not maintained reference — each
one states when it was written and what was measured. For invariants that must
stay true, see [../CLAUDE.md](../CLAUDE.md); for how to run the pipelines, see
[../DEVELOPERS.md](../DEVELOPERS.md).

## Decisions that still bind

- [architectural-decision-records/0001-bgzf-index-cache-control.md](architectural-decision-records/0001-bgzf-index-cache-control.md)
  — cache headers for bgzf data and its indexes
- [architectural-decision-records/0002-config-compat-across-jbrowse-versions.md](architectural-decision-records/0002-config-compat-across-jbrowse-versions.md)
  — why config URLs are unversioned, and what that costs
- [architectural-decision-records/0003-mirror-assembly-sidecars.md](architectural-decision-records/0003-mirror-assembly-sidecars.md)
  — why chrom.sizes/chromAlias/cytoBand are served from our bucket, and why all
  three had to be
- [ENCODE_TRACKS.md](ENCODE_TRACKS.md) — which ENCODE content is converted,
  which is dropped, and the numbers behind that split

## Feature designs and handoffs

- [SYNTENY_ALIGNMENT_STRATEGY.md](SYNTENY_ALIGNMENT_STRATEGY.md) — alignment
  tiers behind the multi-way gene-order view
- [HALSYNTENY_EXTRACTION_PIPELINE.md](HALSYNTENY_EXTRACTION_PIPELINE.md) —
  sourcing pairwise synteny from a Cactus/HAL alignment as a pipeline stage
- [ORTHOLOGS_LAUNCH_FOLLOWUPS.md](ORTHOLOGS_LAUNCH_FOLLOWUPS.md) — what
  `/orthologs` knowingly left behind at launch
- [MOUSE_PANGENOME_PLAN.md](MOUSE_PANGENOME_PLAN.md) — mm39 analog of the HPRC
  pangenome explorer
- [ucsc-ncbi-gff-detection-handoff.md](ucsc-ncbi-gff-detection-handoff.md) —
  running the pipeline after NCBI GFF tracks became detected rather than listed,
  and what the first run should show
- [MAF_CROSS_VIEW_NAVIGATION.md](MAF_CROSS_VIEW_NAVIGATION.md) — MAF row → other
  genome navigation, portal half
- [OFFLINE_BUNDLES_DESIGN.md](OFFLINE_BUNDLES_DESIGN.md) — self-contained
  per-assembly bundles for JBrowse Desktop
- [genark-taxon-images-prd.md](genark-taxon-images-prd.md) — taxon-level image
  lookup (implemented) and the taxonomy-walk follow-up
- [OTHER_IDEAS.md](OTHER_IDEAS.md) — keeping JBrowse Desktop in sync with this
  portal's content

## Surveys

- [ncbi-gff-feature-type-survey.md](ncbi-gff-feature-type-survey.md) — feature
  types and parent/child structure across the full RefSeq corpus

## Other

- [TODO.md](TODO.md) — loose ends
- [archive/](archive/) — superseded scratch notes, kept only for provenance
