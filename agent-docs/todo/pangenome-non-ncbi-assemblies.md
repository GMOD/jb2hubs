---
name: pangenome-non-ncbi-assemblies
description:
  The new dog, rice, fly and tomato pangenomes are built from NCBI-deposited
  assemblies only. Panagram's 12 HiFi dog haplotypes (Dropbox) and Zhou 2022's
  31 HiFi tomato assemblies (SGN) wait until they are deposited, or until their
  terms are settled.
metadata:
  category: measure
  area: pangenomes
  first_move:
    "Look up whether Panagram's dog haplotypes and Zhou 2022's tomato set have
    NCBI accessions yet."
  order: 3
---

# Pangenome assemblies outside NCBI

Colin's rule for the new species (2026-11-13): build from NCBI depositions only,
and investigate the rest later. Two strong sets sit outside NCBI.

- **Panagram's dog haplotypes** (Jenike et al., bioRxiv
  10.64898/2026.10.21.760756): 6 dogs, 12 HiFi haplotypes, 7.99 GB, RagTag
  scaffolded onto canFam4 (`chrN_RagTag` names). Listed at
  http://data.schatz-lab.org/panagram/dogs/, hosted on Dropbox; the page says
  NCBI deposition is in progress and asks users to cite the study. Raw reads are
  under SRA PRJNA1544221.
- **Zhou et al. 2022's tomato assemblies** (Nature, 10.1038/s41586-022-04808-9):
  31 HiFi assemblies against SL5.0, on SGN
  (https://solgenomics.net/ftp/genomes/TGG/genome/), with no stated licence.

When either set reaches NCBI, add its haplotypes to that species' panel and
rebuild the graph and sidecar. Until then, adding one needs the owners' terms
settled first, since a published graph redistributes the sequence.
