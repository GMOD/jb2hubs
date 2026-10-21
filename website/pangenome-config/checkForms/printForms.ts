// The forms the page draws for each window of a local sidecar, one JSON line
// per window, for scoreForms.py to check against the assemblies.
//
//   node printForms.ts <sidecar.tsv.gz> <windows.tsv> > forms.jsonl
//
// windows.tsv: name chrom start end, 0-based half-open.
import fs from 'fs'
import zlib from 'zlib'

import { structuralPanel } from '../../src/components/pangenomePanels.ts'
import {
  minCarriersFor,
  parseSvStateRow,
  structuralForms,
} from '../../src/components/pangenomeSvStates.ts'

import type { SvStateRow } from '../../src/components/pangenomeSvStates.ts'

const [sidecar, windowsFile] = process.argv.slice(2)
if (!sidecar || !windowsFile) {
  throw new Error('usage: node printForms.ts <sidecar.tsv.gz> <windows.tsv>')
}

const [header = '', ...lines] = zlib
  .gunzipSync(fs.readFileSync(sidecar))
  .toString()
  .trim()
  .split('\n')
const haplotypes = header.split('\t')[1]!.split(',')
const byChrom = new Map<string, SvStateRow[]>()
for (const line of lines) {
  const row = parseSvStateRow(line)
  byChrom.set(row.chrom, [...(byChrom.get(row.chrom) ?? []), row])
}

for (const line of fs.readFileSync(windowsFile, 'utf8').trim().split('\n')) {
  const [name, chrom = '', s, e] = line.split(/\s+/)
  const start = Number(s)
  const end = Number(e)
  // the rows a tabix query returns, as the page reads them
  const rows = (byChrom.get(chrom) ?? []).filter(
    r => r.start < end && r.end >= start,
  )
  const forms = structuralForms(
    rows,
    haplotypes,
    minCarriersFor(haplotypes.length),
  )
  const panel = structuralPanel(forms, { windowBp: end - start })
  process.stdout.write(
    `${JSON.stringify({
      name,
      chrom,
      start,
      end,
      rowSpan: rows.length
        ? [
            Math.min(...rows.map(r => r.start)),
            Math.max(...rows.map(r => r.end)),
          ]
        : null,
      unplaced: forms.unplaced,
      rareCarriers: forms.rareCarriers,
      lanes: panel?.lanes.length ?? 0,
      forms: forms.forms.map(f => ({
        members: f.members,
        deltas: f.deltas,
        marks: f.marks.map(({ kind, bp, start, end }) => ({
          kind,
          bp,
          start,
          end,
        })),
        unsized: f.uncalled + f.inversions + f.rarer + f.bypassed,
      })),
    })}\n`,
  )
}
