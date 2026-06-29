#!/usr/bin/env bash
#
# End-to-end genome-wide implicit-pangenome build for the mouse strain panel.
# Runs the whole thing on a build host (e.g. `ssh ada`): download assemblies →
# all-vs-all wfmash → impg index → project each curated locus into an MSA. With
# --graph it also builds genome-wide pangenome graphs via `impg partition` +
# `impg graph` (pggb engine).
#
# Quick start on ada:
#   ./setup-env.sh                 # one-time: conda env with all tools
#   conda activate pangenome-build
#   ./run.sh                       # full run (uses mouse-strains.tsv + mouse-loci.tsv)
#   ./run.sh --graph               # also build genome-wide GFA graphs
#
# Outputs land in $OUT (default ./build):
#   build/msa/<id>.fa   -> copy to website/public/pangenome/msa/ for the explorer
#   build/graph/        -> per-partition GFA (with --graph)
#
# Tunables via env: PANEL, LOCI, OUT, THREADS, MERGE_BP, WFMASH_PARAMS, REF_TAXON.
set -euo pipefail
cd "$(dirname "$0")"

PANEL="${PANEL:-mouse-strains.tsv}"
LOCI="${LOCI:-mouse-loci.tsv}"
OUT="${OUT:-build}"
THREADS="${THREADS:-$(nproc 2>/dev/null || echo 8)}"
MERGE_BP="${MERGE_BP:-10000}"
REF_TAXON="${REF_TAXON:-10090}" # mouse, for gene-symbol resolution
DO_GRAPH=false
for arg in "$@"; do
  case "$arg" in
  --graph) DO_GRAPH=true ;;
  -h | --help) sed -n '2,30p' "$0"; exit 0 ;;
  *) echo "unknown arg: $arg" >&2; exit 1 ;;
  esac
done

command -v datasets >/dev/null ||
  { echo "ERROR: tools missing. Run ./setup-env.sh && conda activate." >&2; exit 1; }

# 1-3. Download + PanSN concat + all-vs-all align + impg index.
./build.sh "$PANEL" "$OUT" "$THREADS"
PAF="$OUT/panel.paf"

# Reference sample name = PanSN prefix of the first (reference) panel row.
REF_SAMPLE="$(awk '!/^#/ && NF {print $2; exit}' "$PANEL")"

# Resolve a mouse gene symbol -> "accession:start-end" on the reference assembly
# via NCBI datasets (same accessions as the downloaded reference FASTA).
resolve_gene() {
  datasets summary gene symbol "$1" --taxon "$REF_TAXON" --as-json-lines 2>/dev/null |
    python3 -c '
import sys, json
for line in sys.stdin:
    try:
        g = json.loads(line).get("gene", {})
    except json.JSONDecodeError:
        continue
    for gr in g.get("genomic_ranges", []):
        acc = gr.get("accession_version")
        rng = (gr.get("range") or [{}])[0]
        if acc and rng.get("begin") and rng.get("end"):
            print(f"{acc}:{rng[\"begin\"]}-{rng[\"end\"]}")
            sys.exit(0)
'
}

# 4. Per-locus projection -> MSA.
echo ">> projecting curated loci"
while IFS=$'\t' read -r id gene flank_kb _; do
  case "$id" in '' | \#*) continue ;; esac
  coords="$(resolve_gene "$gene")" || true
  if [ -z "${coords:-}" ]; then
    echo "   !! could not resolve $gene ($id) — skipping" >&2
    continue
  fi
  acc="${coords%%:*}"
  range="${coords#*:}"
  flank=$((${flank_kb:-50} * 1000))
  start=$((${range%-*} - flank)); ((start < 1)) && start=1
  end=$((${range#*-} + flank))
  ./query.sh "$PAF" "$id" "${REF_SAMPLE}#1#${acc}:${start}-${end}" "$MERGE_BP" "$OUT"
done <"$LOCI"

# 5. Optional genome-wide graphs (heavier): window the cohort and build a GFA per
# partition with the pggb engine. vg deconstruct on these yields a VCF you can
# host for the explorer's variant charts + a served JBrowse VariantTrack.
if "$DO_GRAPH"; then
  echo ">> impg partition + graph (genome-wide)"
  mkdir -p "$OUT/graph"
  impg partition -i "$OUT/panel.impg" -w 1000000 -d 100000 \
    -o fasta --separate-files --output-folder "$OUT/graph/parts"
  for fa in "$OUT/graph/parts"/*.fa*; do
    impg graph --sequence-files "$fa" -g "$OUT/graph/$(basename "$fa").gfa" \
      --gfa-engine pggb -t "$THREADS"
  done
fi

echo
echo "Done."
echo "  MSAs:   $OUT/msa/*.fa  ->  copy into website/public/pangenome/msa/"
"$DO_GRAPH" && echo "  Graphs: $OUT/graph/*.gfa"
