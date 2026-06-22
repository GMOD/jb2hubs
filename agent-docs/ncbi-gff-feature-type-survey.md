# NCBI RefSeq GFF3 Feature-Type & Parent/Child Survey

Survey of the full jb2hubs RefSeq corpus to drive canvas-renderer glyph routing.

- **Corpus:** `hubs/**/*_genomic.gff.gz`
- **Files scanned:** 42,704 (41 GB compressed) — full passes, no sampling
- **Parent resolution:** every `Parent=` reference resolved within-file — **zero
  `<unknown>` parents**, so the parent→child table is exact.
- **Distinct feature types:** 115

---

## 1. Type histogram (type → number of distinct genomes)

Sorted by **breadth** (genomes), which is the priority signal.

| type | genomes |
|---|---|
| region | 42704 |
| CDS | 42670 |
| gene | 42636 |
| exon | 29622 |
| tRNA | 29001 |
| pseudogene | 27498 |
| rRNA | 26732 |
| RNase_P_RNA | 24707 |
| SRP_RNA | 24128 |
| riboswitch | 22520 |
| tmRNA | 22204 |
| ncRNA | 12698 |
| sequence_feature | 10868 |
| direct_repeat | 9598 |
| binding_site | 4023 |
| mRNA | 3022 |
| transcript | 2080 |
| cDNA_match | 1908 |
| lnc_RNA | 1810 |
| snoRNA | 1685 |
| snRNA | 1671 |
| V_gene_segment | 1092 |
| C_gene_segment | 1090 |
| three_prime_UTR | 898 |
| five_prime_UTR | 876 |
| mature_protein_region_of_CDS | 630 |
| repeat_region | 567 |
| pseudogenic_tRNA | 485 |
| terminator | 468 |
| guide_RNA | 461 |
| antisense_RNA | 448 |
| D_loop | 424 |
| hammerhead_ribozyme | 421 |
| origin_of_replication | 372 |
| stem_loop | 300 |
| promoter | 298 |
| inverted_repeat | 244 |
| polyA_signal_sequence | 199 |
| scaRNA | 197 |
| ribosome_entry_site | 179 |
| lncRNA | 169 |
| intron | 149 |
| match | 136 |
| TATA_box | 126 |
| primary_transcript | 125 |
| long_terminal_repeat | 123 |
| miRNA | 121 |
| sequence_alteration | 89 |
| tandem_repeat | 68 |
| recombination_feature | 68 |
| regulatory_region | 62 |
| polyA_site | 60 |
| minus_10_signal | 60 |
| minus_35_signal | 57 |
| mobile_genetic_element | 56 |
| signal_peptide_region_of_CDS | 55 |
| protein_binding_site | 54 |
| primer_binding_site | 46 |
| gap | 40 |
| telomerase_RNA | 32 |
| RNase_MRP_RNA | 28 |
| sequence_difference | 26 |
| sequence_secondary_structure | 24 |
| microsatellite | 19 |
| sequence_uncertainty | 17 |
| dispersed_repeat | 16 |
| biological_region | 13 |
| scRNA | 11 |
| CAAT_signal | 11 |
| piRNA | 8 |
| sequence_conflict | 7 |
| enhancer | 7 |
| centromere | 7 |
| pseudogenic_rRNA | 5 |
| propeptide_region_of_CDS | 5 |
| J_gene_segment | 5 |
| D_gene_segment | 5 |
| telomere | 4 |
| satellite_DNA | 4 |
| modified_DNA_base | 4 |
| LONG_TERMINAL_REPEAT | 4 |
| Y_RNA | 3 |
| transcriptional_cis_regulatory_region | 3 |
| STS | 3 |
| silencer | 3 |
| response_element | 3 |
| replication_regulatory_region | 3 |
| nucleotide_motif | 3 |
| matrix_attachment_site | 3 |
| locus_control_region | 3 |
| imprinting_control_region | 3 |
| enhancer_blocking_element | 3 |
| conserved_region | 3 |
| autocatalytically_spliced_intron | 3 |
| attenuator | 3 |
| TSS | 2 |
| operon | 2 |
| minisatellite | 2 |
| GC_rich_promoter_region | 2 |
| DNaseI_hypersensitive_site | 2 |
| vault_RNA | 1 |
| terminal%2Cinverted | 1 |
| telomeric_repeat | 1 |
| sequence_comparison | 1 |
| sequence_alteration_artifact | 1 |
| replication_start_site | 1 |
| repeat_instability_region | 1 |
| nucleotide_cleavage_site | 1 |
| non_allelic_homologous_recombination_region | 1 |
| mitotic_recombination_region | 1 |
| meiotic_recombination_region | 1 |
| insulator | 1 |
| epigenetically_modified_region | 1 |
| DNAseI_hypersensitive_site | 1 |
| chromosome_breakpoint | 1 |
| CAGE_cluster | 1 |

---

## 2. Parent → child table (corpus-wide occurrence counts)

```
912172708  mRNA              exon
859502225  mRNA              CDS
 97364016  gene              CDS          <- prokaryote single-level model
 88676570  gene              mRNA
 32832376  transcript        exon
 29097900  lnc_RNA           exon
 10492535  pseudogene        exon
  7435585  gene              lnc_RNA
  4648419  tRNA              exon
  4404493  gene              tRNA
  3050418  gene              transcript
  2458579  lncRNA            exon
  1887982  pseudogene        CDS
  1502829  rRNA              exon
  1501976  gene              rRNA
   993446  snRNA             exon
   993429  gene              snRNA
   769667  snoRNA            exon
   769605  gene              snoRNA
   631031  gene              lncRNA
   221757  V_gene_segment    exon
   217657  V_gene_segment    CDS
   186995  pseudogene        transcript
   106702  gene              exon
    98448  gene              V_gene_segment
    79028  C_gene_segment    exon
    72581  C_gene_segment    CDS
    62179  gene              intron
    51633  miRNA             exon
    49748  primary_transcript miRNA
    42286  ncRNA             exon
    38689  gene              ncRNA
    37184  primary_transcript exon
    37177  gene              primary_transcript
    31966  pseudogene        mRNA
    24945  RNase_P_RNA       exon     (+ gene RNase_P_RNA 24945)
    24474  SRP_RNA           exon     (+ gene SRP_RNA 24472)
    22719  tmRNA             exon     (+ gene tmRNA 22718)
    19554  gene              ribosome_entry_site
    18399  gene              C_gene_segment
    15466  piRNA             exon     (+ gene piRNA 15376)
    12016  pseudogenic_rRNA  exon     (+ pseudogene pseudogenic_rRNA 12016)
     9833  gene              five_prime_UTR
     8363  gene              three_prime_UTR
     8026  guide_RNA         exon     (+ gene guide_RNA 8026)
     6252  gene              polyA_site
     5536  CDS               mature_protein_region_of_CDS
     3032  pseudogene        tRNA
     2984  scaRNA            exon     (+ gene scaRNA 2984)
     2325  pseudogenic_tRNA  exon
     2232  antisense_RNA     exon
     2081  gene              polyA_signal_sequence
     1865  gene              miRNA
     1693  pseudogene        pseudogenic_tRNA
     1452  gene              antisense_RNA
     1083  gene              promoter
      663  hammerhead_ribozyme exon   (+ gene hammerhead_ribozyme 663)
      605  pseudogene        V_gene_segment
      557  gene              TATA_box
      512  pseudogene        intron
      334  gene              terminator
      325  J_gene_segment    exon
      321  J_gene_segment    CDS
      310  CDS               signal_peptide_region_of_CDS
      305  gene              minus_35_signal
      304  gene              minus_10_signal
      283  gene              J_gene_segment
      121  gene              regulatory_region
      119  D_gene_segment    exon
      119  D_gene_segment    CDS
       91  gene              D_gene_segment
       63  scRNA             exon     (+ gene scRNA 63)
       61  pseudogene        lnc_RNA
       58  pseudogene        snoRNA
       56  gene              pseudogenic_tRNA
       35  pseudogene        J_gene_segment
       33  telomerase_RNA    exon     (+ gene telomerase_RNA 33)
       28  RNase_MRP_RNA     exon     (+ gene RNase_MRP_RNA 28)
       25  pseudogene        rRNA
       20  pseudogene        D_gene_segment
       15  CDS               propeptide_region_of_CDS
       14  pseudogene        snRNA
       10  gene              enhancer
        9  pseudogene        C_gene_segment
        8  Y_RNA             exon     (+ gene Y_RNA 8)
        6  pseudogene        three_prime_UTR
        5  autocatalytically_spliced_intron exon
        5  pseudogene        five_prime_UTR
        4  vault_RNA         exon     (+ gene vault_RNA 4)
        4  pseudogene        ribosome_entry_site
        3  pseudogene        ncRNA
        2  pseudogene        miRNA
        2  gene              CAAT_signal
        1  pseudogene        SRP_RNA
        1  gene              attenuator
```

---

## 3. Derived lists

### 3a. Types with a direct `CDS` child → SHOULD route to a transcript/processed-transcript glyph

```
gene            (prokaryotic: gene->CDS directly, no mRNA level)
mRNA
pseudogene
V_gene_segment  <- NOT in transcriptTypes default
C_gene_segment  <- NOT in transcriptTypes default
J_gene_segment  <- NOT in transcriptTypes default
D_gene_segment  <- NOT in transcriptTypes default
```

### 3b. Child types under `CDS` (polyprotein sub-region family) — complete corpus set is exactly 3

```
mature_protein_region_of_CDS
signal_peptide_region_of_CDS
propeptide_region_of_CDS
```

Note: `transit_peptide_region_of_CDS` (predicted in the handoff) **does not occur
anywhere** in the corpus.

### 3c. Types with `exon` children (container/transcript-like, 33 types)

```
mRNA, transcript, primary_transcript, lnc_RNA, lncRNA, ncRNA,
tRNA, rRNA, snRNA, snoRNA, scaRNA, scRNA, miRNA, piRNA,
antisense_RNA, guide_RNA, hammerhead_ribozyme, autocatalytically_spliced_intron,
SRP_RNA, RNase_P_RNA, RNase_MRP_RNA, tmRNA, telomerase_RNA, vault_RNA, Y_RNA,
V_gene_segment, C_gene_segment, J_gene_segment, D_gene_segment,
gene, pseudogene, pseudogenic_rRNA, pseudogenic_tRNA
```

---

## 4. Case / synonym anomalies (non-empty → case-insensitive matching is worth doing)

```
long_terminal_repeat (123 genomes)   vs  LONG_TERMINAL_REPEAT (4 genomes)
DNaseI_hypersensitive_site (2)        vs  DNAseI_hypersensitive_site (1)
```

Plus two **non-casing** vocabulary issues worth knowing:

- **Synonym, not case:** `lnc_RNA` (1810 genomes) coexists with `lncRNA` (169
  genomes) — underscore difference, both are long-non-coding-RNA containers with
  `exon` children. A canonicalization map (not just `tolower`) catches this.
- **Malformed type (1 genome):** `terminal%2Cinverted` — URL-encoded
  `terminal,inverted` leaked into column 3.

---

## 5. Classification of remaining types (none unclassifiable)

**Never a parent → render as plain boxes (low priority), 80 leaf types:** all the
regulatory/repeat/region types — `region, enhancer, silencer, promoter,
terminator, riboswitch, binding_site, *_signal, *_repeat, match, cDNA_match,
sequence_*, biological_region, mobile_genetic_element, origin_of_replication,
D_loop, stem_loop, gap, centromere, telomere, operon, intron, exon,
three_prime_UTR, five_prime_UTR`, etc. The three `*_region_of_CDS` types also
appear here as leaves (they are children of CDS, handled by the polyprotein glyph
in 3b).

---

## Bottom line for the renderer

1. **The one real, high-breadth gap:** add `V_gene_segment`, `C_gene_segment`,
   `J_gene_segment`, `D_gene_segment` to `transcriptTypes`. They carry
   `CDS`+`exon` children and currently fall through to the dumb "segments" glyph.
   `V`/`C` segments appear in ~1090 genomes each (not just human); `J`/`D` are
   rarer (5 genomes) but identical structure.
2. **`mature_protein_region*` set is exactly 3 types**
   (`mature/signal/propeptide_region_of_CDS`). A `*_region_of_CDS` regex is the
   future-proof match and already covers what exists.
3. **`containerTypes` default `proteoform_orf` is never used** in NCBI RefSeq —
   moot for this corpus.
4. **`transcript` and `primary_transcript` are non-coding here** (never parent a
   CDS; `primary_transcript`->`miRNA` is the pre-miRNA model). Keeping them in
   `transcriptTypes` is harmless; they just never trigger CDS handling.
5. **Prokaryotic `gene`->`CDS` directly** (97M occurrences, ~all
   bacteria/archaea): confirm a `gene` with a direct `CDS` child renders as a
   processed transcript rather than a stacked container — this is the dominant
   coding pattern by raw count.
6. **Add case-insensitive (better: canonical) type matching** — two real casing
   collisions plus the `lnc_RNA`/`lncRNA` synonym prove non-canonical types reach
   the renderer.
