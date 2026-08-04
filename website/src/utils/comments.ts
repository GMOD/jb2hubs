// NCBI stamps this sentence on every prokaryotic RefSeq assembly: it appears in
// 23,819 of the 28,276 comment blocks we host, 20,270 of them byte-identical.
// All it says is that the annotation came from PGAP — which the Annotation
// section already states as its provider on every one of those pages — so it is
// pure duplication on 40% of the accession pages. Four wordings account for all
// 23,819; the handful of stragglers ("Annotated by PGAP") are not worth matching.
const pgapBoilerplate =
  /^(the )?annotation (of [^.]*? )?(was )?added by .*prokaryotic genome annotation pipeline\b/i

// What is left of an assembly's NCBI comments once the boilerplate is gone —
// undefined when nothing assembly-specific remains, so the page can drop the
// section entirely rather than render an empty disclosure.
export function usefulComments(comments: string | undefined) {
  let result: string | undefined
  if (comments) {
    const kept = comments
      .split('\n')
      .filter(line => !pgapBoilerplate.test(line.trim()))
      .join('\n')
      // Submitters separate paragraphs with runs of blank lines, which the
      // pre-wrap rendering would otherwise show as a gap.
      .replaceAll(/\n{3,}/g, '\n\n')
      .trim()
    if (kept) {
      result = kept
    }
  }
  return result
}
