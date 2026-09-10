// Derive one `chrom.sizes` per HPRC haplotype from the published gbz-base
// database, for the GBZ synteny lane in `pangenome-config/hprc-grch38.json`.
//
// Why these files have to exist at all: `MultiWaySyntenyDisplay` draws one lane
// per assembly, so every haplotype the lane names has to BE a JBrowse assembly,
// and an assembly needs a sequence adapter. There is no sequence to serve here
// — the lane draws alignments, not bases — so each is a `ChromSizesAdapter`
// over the contig lengths, which is the minimum that makes a coordinate axis.
//
// Why derive them rather than take GenArk's: the lengths have to agree with what
// the ADAPTER reports, and the adapter reads this database. GenArk publishes the
// same assemblies under UCSC-style contig names; the graph names them by their
// GenBank accession (`CM094060.1`), so the two do not even share a namespace.
//
// The one subtlety, and it is the reason this is a script rather than a field
// read: `haplotypeLength(handle)` is the length of a path FRAGMENT, not of a
// contig. Paths are fragmented — `pathsForSample('HG00097')` returns 210, five
// of them on `CM094060.1` — and `name.fragment` is that fragment's offset into
// the contig. So a contig's length is `max(fragment + length)` over its
// fragments, which is a lower bound on the true length and exactly the extent
// the graph can address.
//
// NOT wired into the build: it needs the network and reads ~18 GB of remote
// database by range request. Its output is committed. Re-run when the lane's
// haplotype set or the graph release changes:
//   node generatePangenomeHaplotypes.ts
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

import { GBZBase } from '@gmod/gbz-base'
import { RemoteFile } from 'generic-filehandle2'

import { HPRC_GBZ, HPRC_GBZ_HAPLOTYPES } from './src/components/pangenomeGbz.ts'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const OUT_DIR = path.join(__dirname, 'pangenome-config/hprc-grch38')

const db = await GBZBase.open(new RemoteFile(HPRC_GBZ.dbUrl), {
  haplotypeIndex: new RemoteFile(HPRC_GBZ.haplotypeIndexUrl),
})

fs.mkdirSync(OUT_DIR, { recursive: true })

for (const { assembly, sample, haplotype } of HPRC_GBZ_HAPLOTYPES) {
  const paths = (await db.pathsForSample(sample)).filter(
    p => p.name.haplotype === haplotype,
  )
  if (paths.length === 0) {
    throw new Error(
      `${sample}#${haplotype} has no paths in the database, so its lane would draw an empty axis`,
    )
  }
  // `PathName` has `sample`/`contig`/`haplotype`/`fragment` all required, so
  // the only thing worth guarding is the length: it comes from a second query
  // and is undefined for a path the haplotype index does not cover, which would
  // silently shorten a contig rather than fail.
  const extent = new Map<string, number>()
  for (const p of paths) {
    const length = await db.haplotypeLength(p.handle)
    if (length === undefined) {
      throw new Error(
        `${sample}#${haplotype} path ${p.handle} (${p.name.contig}) has no length in the haplotype index, so its contig's extent is unknowable`,
      )
    }
    const end = p.name.fragment + length
    extent.set(p.name.contig, Math.max(extent.get(p.name.contig) ?? 0, end))
  }
  const rows = [...extent]
    .sort((a, b) => b[1] - a[1])
    .map(([contig, length]) => `${contig}\t${length}`)
  fs.writeFileSync(
    path.join(OUT_DIR, `${assembly}.chrom.sizes`),
    `${rows.join('\n')}\n`,
  )
  console.log(
    `  ${assembly}: ${rows.length} contigs from ${paths.length} path fragments`,
  )
}

console.log(`Wrote ${HPRC_GBZ_HAPLOTYPES.length} chrom.sizes to ${OUT_DIR}`)
