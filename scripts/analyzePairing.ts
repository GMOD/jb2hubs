import fs from 'fs'
import path from 'path'

import { glob } from 'glob'

interface Report {
  accession?: string
  paired_accession?: string
  current_accession?: string
  assembly_info?: {
    paired_assembly?: { accession?: string; status?: string }
  }
}

interface NcbiJson {
  reports?: Report[]
}

const hubsDir = path.join(process.cwd(), 'hubs')
const files = await glob('GC*/*/*/*/*/ncbi.json', { cwd: hubsDir })

const counts = {
  total: 0,
  noPairedAccession: 0,
  selfReferential: 0,
  gcaToGcf: 0,
  gcfToGca: 0,
  unexpectedPairing: 0,
}

const issues: string[] = []

for (const file of files) {
  const hubAccession = path.basename(path.dirname(file))
  const fullPath = path.join(hubsDir, file)
  let data: NcbiJson
  try {
    data = JSON.parse(fs.readFileSync(fullPath, 'utf-8'))
  } catch {
    continue
  }

  if (!data.reports?.length) {
    continue
  }

  counts.total++

  const report =
    data.reports.find(
      r =>
        r.accession === hubAccession ||
        r.paired_accession === hubAccession ||
        r.current_accession === hubAccession,
    ) ?? data.reports[0]!

  const pairedAccession =
    report.paired_accession === hubAccession
      ? report.accession
      : (report.paired_accession ??
        report.assembly_info?.paired_assembly?.accession)

  if (!pairedAccession) {
    counts.noPairedAccession++
    continue
  }

  if (pairedAccession === hubAccession) {
    counts.selfReferential++
    issues.push(
      `SELF-REF: hub=${hubAccession} report.accession=${report.accession} paired_accession=${pairedAccession}`,
    )
    continue
  }

  const hubIsGca = hubAccession.startsWith('GCA')
  const pairedIsGcf = pairedAccession.startsWith('GCF')

  if (hubIsGca && pairedIsGcf) {
    counts.gcaToGcf++
  } else if (!hubIsGca && !pairedIsGcf) {
    counts.gcfToGca++
  } else {
    counts.unexpectedPairing++
    issues.push(`UNEXPECTED: hub=${hubAccession} paired=${pairedAccession}`)
  }
}

console.error('=== Pairing Analysis ===')
console.error(`Total hubs with ncbi.json: ${counts.total}`)
console.error(`No paired accession:       ${counts.noPairedAccession}`)
console.error(`GCA → GCF (correct):       ${counts.gcaToGcf}`)
console.error(`GCF → GCA (correct):       ${counts.gcfToGca}`)
console.error(`Self-referential (bug):    ${counts.selfReferential}`)
console.error(`Unexpected pairing:        ${counts.unexpectedPairing}`)

if (issues.length) {
  console.error('\n=== Issues ===')
  for (const issue of issues) {
    console.error(issue)
  }
}
