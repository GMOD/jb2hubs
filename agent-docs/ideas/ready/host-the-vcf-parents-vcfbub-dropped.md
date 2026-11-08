---
name: host-the-vcf-parents-vcfbub-dropped
description:
  The HPRC Variants launch cannot show the UGT2B17 deletion, because the
  release's callset dropped every site with an allele over 100 kb. Its
  raw.vcf.gz still has them; extracting them as symbolic alleles would host them
  as a second callset row.
---

# Host the VCF parents vcfbub dropped

The HPRC release's callset removed every site with an allele over 100 kb and
kept the sites nested in it (the vcfbub section of
[PANGENOME_PORTAL.md](../../reference/PANGENOME_PORTAL.md)), so the Variants
launch cannot show the UGT2B17 deletion, one of the curated loci's headline
structures. The release's `raw.vcf.gz` holds the 426 removed parents.

Sketch: extract them, write symbolic `<DEL>`/`<INS>` alleles, and host them as a
second callset row beside the release's. Check the record size before choosing:
written with sequence, one allele is a 100 kb line. Moderate, hosting work here.

Picked up from jbrowse-components' HPRC-limits handoff (closed 2026-11-06),
which traced each limit the HPRC tutorials list to its cause.
