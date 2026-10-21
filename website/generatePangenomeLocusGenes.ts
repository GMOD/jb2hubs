// Print the gene models of `src/components/pangenomeLocusGenes.ts` for every
// haplotype in the graph, one JSON line per model, sorted, for
// `pangenome-config/buildHprcGenes.sh` to hand the converter. It cuts the walk
// file over each locus's GRCh38 window, range-reads each haplotype's stretch
// of the walk from HPRC's bgzipped assembly, splices GENCODE's alt-contig
// transcripts onto it with minimap2, and writes a line per locus to stderr and
// <work dir>/summary.txt, beside the fetched bases.
//   node generatePangenomeLocusGenes.ts <GRCh38.walks.bed.gz>
//     <gencode.v48.chr_patch_hapl_scaff.annotation.gff3.gz> <work dir>
import { execFile } from 'child_process'
import fs from 'fs'
import path from 'path'
import readline from 'readline'
import { promisify } from 'util'
import zlib from 'zlib'

import { BgzfFilehandle } from '@gmod/bgzf-filehandle'
import { TabixIndexedFile } from '@gmod/tabix'
import { WalkReader, panSNContig, panSNHaplotype } from '@jbrowse/graph-walks'
import { LocalFile, RemoteFile } from 'generic-filehandle2'
import { FETCH_TIMEOUT_MS, myfetchtextWithRetry } from 'hubtools'

import {
  ASSEMBLY_INDEX,
  httpsOf,
  indexByHaplotype,
} from './pangenomeHprcIndex.ts'
import {
  GENE_LOCI,
  altTranscriptReader,
  nameHits,
  spliced,
  windowHit,
} from './src/components/pangenomeLocusGenes.ts'

import type {
  LocusModel,
  WindowHit,
} from './src/components/pangenomeLocusGenes.ts'

const args = process.argv.slice(2)
if (args.length !== 3) {
  throw new Error(
    'usage: node generatePangenomeLocusGenes.ts <walks.bed.gz> <gencode.chr_patch_hapl_scaff.gff3.gz> <work dir>',
  )
}
const [walksFile, altGff, work] = args as [string, string, string]

const EFETCH =
  'https://eutils.ncbi.nlm.nih.gov/entrez/eutils/efetch.fcgi?db=nuccore&rettype=fasta'
const GRCH38_REPORT =
  'https://ftp.ncbi.nlm.nih.gov/genomes/all/GCA/000/001/405/GCA_000001405.15_GRCh38/GCA_000001405.15_GRCh38_assembly_report.txt'
const READERS = 12

const exec = promisify(execFile)
const fastaBases = (text: string) => text.split('\n').slice(1).join('')

function writeAtomically(file: string, text: string) {
  fs.mkdirSync(path.dirname(file), { recursive: true })
  fs.writeFileSync(`${file}.part`, text)
  fs.renameSync(`${file}.part`, file)
}

async function fetchRetrying(input: RequestInfo, init?: RequestInit) {
  for (let attempt = 1; ; attempt++) {
    try {
      const res = await fetch(input, {
        ...init,
        signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      })
      if (res.status < 500 || attempt === 3) {
        return res
      }
      await res.body?.cancel()
    } catch (error) {
      if (attempt === 3) {
        throw error
      }
    }
    await new Promise(r => setTimeout(r, 2000 * attempt))
  }
}

async function eachLimit<T>(
  items: T[],
  limit: number,
  fn: (item: T) => Promise<void>,
) {
  let next = 0
  await Promise.all(
    Array.from({ length: limit }, async () => {
      while (next < items.length) {
        await fn(items[next++]!)
      }
    }),
  )
}

const candidates = new Map(
  GENE_LOCI.flatMap(locus =>
    Object.entries(locus.genes).flatMap(([gene, ids]) =>
      ids.map(id => [id, { gene, locus: locus.id }] as const),
    ),
  ),
)
const reader = altTranscriptReader(new Set(candidates.keys()))
for await (const line of readline.createInterface({
  input: fs.createReadStream(altGff).pipe(zlib.createGunzip()),
  crlfDelay: Infinity,
})) {
  reader.add(line)
}

// GENCODE names an alt contig by its accession, which efetch takes, and a
// chromosome chr1..chrM, which it does not
const accessionOf = new Map(
  (await myfetchtextWithRetry(GRCH38_REPORT))
    .split('\n')
    .filter(line => line && !line.startsWith('#'))
    .map(line => {
      const f = line.trim().split('\t')
      return [f[9]!, f[4]!]
    }),
)

const cdsOf = new Map<string, [number, number]>()
let transcriptsFasta = ''
for (const id of candidates.keys()) {
  const t = reader.transcripts.get(id)
  if (!t) {
    throw new Error(`${altGff} has no exons of ${id}`)
  }
  const start = Math.min(...t.exons.map(e => e[0]))
  const end = Math.max(...t.exons.map(e => e[1]))
  const file = path.join(work, 'alt', `${t.refName}_${start}_${end}.fa`)
  if (!fs.existsSync(file)) {
    writeAtomically(
      file,
      await myfetchtextWithRetry(
        `${EFETCH}&id=${accessionOf.get(t.refName) ?? t.refName}&seq_start=${start + 1}&seq_stop=${end}`,
      ),
    )
  }
  const bases = fastaBases(fs.readFileSync(file, 'utf8'))
  if (bases.length !== end - start) {
    throw new Error(`${file} holds ${bases.length} bases of ${end - start}`)
  }
  const s = spliced(t, bases, start)
  cdsOf.set(id, s.cds)
  transcriptsFasta += `>${id}\n${s.bases}\n`
}
const transcripts = path.join(work, 'transcripts.fa')
writeAtomically(transcripts, transcriptsFasta)

interface Window {
  locus: string
  refName: string
  start: number
  end: number
}

const walks = new WalkReader(
  new TabixIndexedFile({
    filehandle: new LocalFile(walksFile),
    tbiFilehandle: new LocalFile(`${walksFile}.tbi`),
  }),
)
const windows = new Map<string, Window[]>()
for (const locus of GENE_LOCI) {
  const refName = await walks.sequenceFor('GRCh38', locus.window.refName)
  if (!refName) {
    throw new Error(`${walksFile} has no ${locus.window.refName}`)
  }
  const { fragments } = await walks.cut(refName, locus.window, {
    context: 0,
    links: false,
    expand: () => true,
  })
  for (const f of fragments) {
    const haplotype = panSNHaplotype(f.name)
    if (haplotype && !haplotype.endsWith('#0')) {
      windows.set(haplotype, [
        ...(windows.get(haplotype) ?? []),
        {
          locus: locus.id,
          refName: panSNContig(f.name),
          start: f.hapStart,
          end: f.hapEnd,
        },
      ])
    }
  }
}

const assemblies = new Map(
  [...(await indexByHaplotype(ASSEMBLY_INDEX))].map(([haplotype, r]) => [
    haplotype,
    {
      fasta: httpsOf(r.assembly!),
      fai: httpsOf(r.assembly_fai!),
      gzi: httpsOf(r.assembly_gzi!),
    },
  ]),
)

const targetName = (w: Window) => `${w.refName}:${w.start}-${w.end}`

async function windowBases(haplotype: string, ws: Window[]) {
  const dir = path.join(work, 'windows', haplotype.replace('#', '.'))
  const fileOf = (w: Window) =>
    path.join(dir, `${w.refName}_${w.start}_${w.end}.fa`)
  const missing = ws.filter(w => !fs.existsSync(fileOf(w)))
  if (missing.length) {
    const urls = assemblies.get(haplotype)
    if (!urls) {
      throw new Error(`${ASSEMBLY_INDEX} lists no assembly of ${haplotype}`)
    }
    const fai = new Map(
      (await myfetchtextWithRetry(urls.fai))
        .trim()
        .split('\n')
        .map(line => {
          const [name, ...numbers] = line.split('\t')
          return [name!, numbers.map(Number)]
        }),
    )
    const bgzf = new BgzfFilehandle({
      filehandle: new RemoteFile(urls.fasta, { fetch: fetchRetrying }),
      gziFilehandle: new RemoteFile(urls.gzi, { fetch: fetchRetrying }),
    })
    for (const w of missing) {
      const [length, offset, lineBases, lineWidth] =
        fai.get(`${haplotype}#${w.refName}`) ?? []
      if (!length || offset === undefined || !lineBases || !lineWidth) {
        throw new Error(`${urls.fai} has no ${haplotype}#${w.refName}`)
      }
      const at = (p: number) =>
        offset + Math.floor(p / lineBases) * lineWidth + (p % lineBases)
      const bytes = await bgzf.read(at(w.end) - at(w.start), at(w.start))
      const bases = new TextDecoder().decode(bytes).replaceAll('\n', '')
      if (bases.length !== w.end - w.start) {
        throw new Error(
          `${urls.fasta} gave ${bases.length} bases of ${targetName(w)}`,
        )
      }
      writeAtomically(fileOf(w), `>${targetName(w)}\n${bases}\n`)
    }
  }
  return ws.map(w => fs.readFileSync(fileOf(w), 'utf8')).join('')
}

const found: { haplotype: string; model: LocusModel }[] = []
const identities = new Map<string, number[]>()
await eachLimit([...windows], READERS, async ([haplotype, ws]) => {
  const targets = path.join(
    work,
    'windows',
    haplotype.replace('#', '.'),
    'targets.fa',
  )
  writeAtomically(targets, await windowBases(haplotype, ws))
  const { stdout } = await exec(
    'minimap2',
    [
      '-c',
      '-x',
      'splice:hq',
      '-uf',
      '-N',
      '50',
      '-p',
      '0.5',
      targets,
      transcripts,
    ],
    { maxBuffer: 1 << 28 },
  )
  const locusOf = new Map(ws.map(w => [targetName(w), w.locus]))
  const hits = new Map<string, WindowHit[]>()
  for (const line of stdout.split('\n').filter(Boolean)) {
    const [qname, , , , , target] = line.split('\t')
    const candidate = candidates.get(qname!)
    const locus = locusOf.get(target!)
    if (candidate && locus === candidate.locus) {
      hits.set(locus, [
        ...(hits.get(locus) ?? []),
        windowHit(line, candidate.gene, cdsOf.get(qname!)!),
      ])
    }
  }
  for (const [locus, locusHits] of hits) {
    for (const h of nameHits(locusHits)) {
      found.push({ haplotype, model: { ...h.model, locus } })
      identities.set(locus, [...(identities.get(locus) ?? []), h.identity])
    }
  }
})

found.sort(
  (a, b) =>
    (a.haplotype < b.haplotype ? -1 : a.haplotype > b.haplotype ? 1 : 0) ||
    (a.model.refName < b.model.refName
      ? -1
      : a.model.refName > b.model.refName
        ? 1
        : 0) ||
    a.model.start - b.model.start,
)
for (const row of found) {
  process.stdout.write(`${JSON.stringify(row)}\n`)
}
const summary = GENE_LOCI.map(locus => {
  const ids = (identities.get(locus.id) ?? []).sort((a, b) => a - b)
  const haplotypes = new Set(
    found.filter(f => f.model.locus === locus.id).map(f => f.haplotype),
  )
  if (!ids.length) {
    throw new Error(
      `no haplotype of ${windows.size} has a ${locus.id} model; refusing an empty supplement`,
    )
  }
  const { refName, start, end } = locus.window
  const counts = new Map<string, number>()
  for (const f of found) {
    if (f.model.locus === locus.id) {
      counts.set(f.model.name, (counts.get(f.model.name) ?? 0) + 1)
    }
  }
  const genes = Object.entries(locus.genes)
    .map(
      ([gene, ids]) =>
        `${gene} x${counts.get(gene) ?? 0} (${ids.map(id => `${id} on ${reader.transcripts.get(id)!.refName}`).join(', ')})`,
    )
    .join(', ')
  return `  ${genes}, in the walk across ${refName}:${start + 1}-${end}: ${ids.length} models in ${haplotypes.size} of ${windows.size} haplotypes, median identity ${(ids[Math.floor(ids.length / 2)]! * 100).toFixed(2)}%`
}).join('\n')
writeAtomically(path.join(work, 'summary.txt'), `${summary}\n`)
console.error(summary)
