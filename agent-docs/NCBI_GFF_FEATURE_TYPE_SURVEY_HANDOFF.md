# Handoff: Survey NCBI GFF3 feature types + parent/child structure

## Who you are / where you are

You are an agent on the server that holds the full local mirror of NCBI RefSeq
GFF3 files (the jb2hubs corpus — thousands of `GCF_*_genomic.gff.gz` files,
typically under a `gff/` or `bgz/` directory). The requester runs JBrowse and
wants to know, **from the actual corpus rather than from guesses**, what feature
types exist and how they nest, so the canvas feature renderer can route every
type to the right glyph.

## Why this matters (the rendering model, in one paragraph)

JBrowse's canvas renderer picks a glyph (shape) for each feature _mostly from
its structure, not its type name_: a feature whose children are themselves
containers gets stacked (gene → transcripts), a feature with a direct `CDS`
child gets the "processed transcript" glyph (thick CDS + thin UTR + intron
lines), a `CDS` with `mature_protein_region*` children gets the polyprotein
glyph, everything else falls back to plain boxes/segments. A few decisions are
still **type-name gated** by config lists — `transcriptTypes` (default
`mRNA, transcript, primary_transcript`), `containerTypes` (default
`proteoform_orf`), and a `mature_protein_region*` set. Any _coding_ transcript
whose type name is NOT in those lists falls through to the dumb "segments" glyph
and renders CDS+exon as overlapping boxes with no UTR thinning. So the question
we need answered is:

> **Which container types actually carry `CDS` children (→ should render as
> transcripts), which types are children of `CDS` (→ polyprotein sub-regions),
> and what is the complete type vocabulary including any odd casing/synonyms?**

## What a 6-genome sample already showed (so you can focus)

Sampled E. coli, SARS-CoV-2, yeast, Arabidopsis, Drosophila, human RefSeq:

- **Confirmed gap:** `V_gene_segment`, `C_gene_segment`, `D_gene_segment`,
  `J_gene_segment` are coding (CDS+exon children) but NOT in `transcriptTypes`.
  Human alone has ~900. These are the prime suspects for "renders wrong today."
- **Confirmed real:** `mature_protein_region_of_CDS` (SARS-CoV-2 polyprotein,
  children of `CDS`). Already handled.
- Large non-coding RNA container vocabulary:
  `lnc_RNA, tRNA, rRNA, ncRNA, snRNA, snoRNA, miRNA, antisense_RNA, scaRNA, scRNA, vault_RNA, Y_RNA, SRP_RNA, RNase_P_RNA, RNase_MRP_RNA, telomerase_RNA`.
  These have exon children but no CDS and render acceptably as segments today —
  but we want the full list.
- Many leaf/region types
  (`enhancer, silencer, promoter, match, cDNA_match, biological_region, sequence_feature, mobile_genetic_element`,
  …) — render as boxes, low priority.

The sample is small. The corpus will surface types the sample missed (we
specifically expect the `*_region_of_CDS` siblings: `sig_peptide_region_of_CDS`,
`transit_peptide_region_of_CDS`, `propeptide_region_of_CDS`) and possibly
non-standard casing from older/odd annotations.

## What to produce

Run these over the WHOLE corpus (point `GFFDIR` at the mirror). The files are
bgzipped GFF3; `zcat`/`gzip -dc` works on each. Use GNU parallel or xargs -P to
fan out; each file is independent. Aggregate, don't sample.

### 1. Global type histogram (column 3) + genome breadth

How often each type occurs AND in how many distinct assemblies (breadth matters
more than raw count — a type in 1 weird genome is lower priority than one in
thousands).

```bash
GFFDIR=./gff          # <-- set to the corpus dir
# per-file: unique types in that file, tagged with the filename
find "$GFFDIR" -name '*.gff*.gz' -print0 \
| xargs -0 -P16 -I{} bash -c '
    f="{}"; gzip -dc "$f" 2>/dev/null \
    | awk -F"\t" -v g="$(basename "$f")" '"'"'$0!~/^#/ && $3!="" {print $3"\t"g}'"'"' \
    | sort -u' \
> /tmp/type_genome_pairs.tsv

# total occurrences (re-scan, counts not unique) is optional; breadth is the key metric:
echo "type<TAB>num_genomes"
cut -f1 /tmp/type_genome_pairs.tsv | sort | uniq -c | sort -rn \
| awk '{print $2"\t"$1}'
```

### 2. Parent→child type relationships (THE important one)

This is what tells us which containers carry CDS, which types live under CDS,
etc. GFF3 links children to parents via `Parent=<id>` referencing the parent's
`ID=<id>`. Resolve per file (a feature's parent may appear on an earlier or
later line), emit `parentType<TAB>childType`, aggregate across the corpus.

```bash
find "$GFFDIR" -name '*.gff*.gz' -print0 \
| xargs -0 -P16 -I{} bash -c '
    gzip -dc "{}" 2>/dev/null | awk -F"\t" '"'"'
      $0 ~ /^#/ { next }
      {
        type=$3; id=""; par=""
        n=split($9,a,";")
        for(i=1;i<=n;i++){
          if(a[i]~/^ID=/)     id=substr(a[i],4)
          if(a[i]~/^Parent=/) par=substr(a[i],8)
        }
        if(id!="") id2type[id]=type      # CDS rows share one ID across lines; fine
        if(par!="") { line[NR]=par"\x1f"type }
      }
      END{
        for(k in line){
          split(line[k],x,"\x1f")
          m=split(x[1],ps,",")           # a feature may list multiple parents
          for(j=1;j<=m;j++){
            pt=(ps[j] in id2type)?id2type[ps[j]]:"<unknown>"
            print pt"\t"x[2]
          }
        }
      }'"'"'' \
| sort | uniq -c | sort -rn \
> /tmp/parent_child.tsv
cat /tmp/parent_child.tsv
```

### 3. Derived answers (run on the aggregates above)

```bash
# Container types that carry a CDS child  → SHOULD route to the transcript glyph
echo "== types with a direct CDS child =="
awk -F'\t' '$2=="CDS"{print $1}' /tmp/parent_child.tsv | sort -u

# Types that are CHILDREN of CDS          → the mature_protein / region_of_CDS family
echo "== child types under CDS =="
awk -F'\t' '$1=="CDS"{print $2}' /tmp/parent_child.tsv | sort -u

# Container types whose children are exon but never CDS → non-coding transcripts
echo "== types with exon children =="
awk -F'\t' '$2=="exon"{print $1}' /tmp/parent_child.tsv | sort -u

# Casing / synonym anomalies: any type that is NOT already lowercase-canonical,
# e.g. cds/Cds/MRNA. Flag types differing only by case.
echo "== case-variant collisions =="
cut -f1 /tmp/type_genome_pairs.tsv | sort -u \
| awk '{print tolower($0)"\t"$0}' | sort | awk -F'\t' '{c[$1]=c[$1]" "$2} END{for(k in c){n=split(c[k],a," "); if(n>1) print k":"c[k]}}'
```

## Report back (paste these, no need to ship raw files)

1. **Type histogram** — full `type → num_genomes` table from step 1, sorted by
   breadth.
2. **Parent→child table** — full `count parentType childType` from step 2.
3. **The three derived lists** from step 3 (CDS-parents, CDS-children,
   exon-parents).
4. **Case anomalies** — any output from the last command (likely empty for NCBI;
   non-empty means real files violate canonical casing and case-insensitive
   matching is worth doing).
5. Any types in the histogram you can't classify — list them so we can decide
   box vs. segments vs. transcript.

## Notes / gotchas

- NCBI re-annotations occasionally ship `start > end`; the jb2hubs pipeline
  swaps them, but for THIS survey column 3/9 is all we read, so ignore
  coordinates.
- `gzip -dc` on a bgzipped file works (bgzip is gzip-compatible). If a file is
  `.csi`/`.tbi`, skip it — only read `*.gff*.gz`.
- Don't sample or cap with `head` — type and structure diversity lives in the
  tail (rare organisms, immune loci, organelles). Full passes only.
- Human GFF is ~1.6 GB uncompressed each; the `-P16` fan-out plus streaming
  (never write decompressed to disk) keeps this tractable. Expect the whole
  corpus pass to be I/O bound.
- If the corpus is the processed `bgz/` dir rather than raw `gff/`, it's the
  same GFF3 content (sorted) — either works.
