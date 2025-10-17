import fs from 'fs'
import { SingleFileHub } from '@gmod/ucsc-hub'
import path from 'path'

//#region src/const.ts
const categoryMap = {
  map: 'Mapping and Sequencing',
  genes: 'Genes and Gene Predictions',
  phenDis: 'Phenotypes, Variants, and Literature',
  rep: 'Repeats',
  varRep: 'Variation and Repeats',
  rna: 'mRNA and EST',
  neandertal: 'Neandertal Assembly and Analysis',
  denisova: 'Denisova Assembly and Analysis',
  expression: 'Expression',
  compGeno: 'Comparative Genomics',
  regulation: 'Regulation',
  singleCell: 'Single cell',
  hprc: 'Human Pangenome',
}

//#endregion
//#region src/dedupe.ts
function dedupe(list, hasher = JSON.stringify) {
  const clone = []
  const lookup = /* @__PURE__ */ new Set()
  for (const entry of list) {
    const hashed = hasher(entry)
    if (!lookup.has(hashed)) {
      clone.push(entry)
      lookup.add(hashed)
    }
  }
  return clone
}

//#endregion
//#region src/util.ts
function resolve(uri, baseUri) {
  return new URL(uri, baseUri).href
}
async function myfetch(url) {
  const res = await fetch(url)
  if (!res.ok) throw new Error(`HTTP ${res.status} fetching ${url}`)
  return res
}
async function myfetchtext(url) {
  return (await myfetch(url)).text()
}
async function myfetchjson(url) {
  return (await myfetch(url)).json()
}
function makeLoc(first, base) {
  return {
    uri: new URL(first, new URL(base.uri, base.baseUri)).href,
    locationType: 'UriLocation',
  }
}
function makeLocAlt(first, alt, base) {
  return first ? makeLoc(first, base) : makeLoc(alt, base)
}
function makeLoc2(first, alt) {
  return first
    ? {
        uri: first,
        locationType: 'LocalPath',
      }
    : {
        uri: alt,
        locationType: 'UriLocation',
      }
}
function readJSON(f) {
  return JSON.parse(fs.readFileSync(f, 'utf8'))
}
function writeJSON(f, d) {
  fs.writeFileSync(f, JSON.stringify(d, void 0, 2))
}
async function myjsonfetch(url) {
  const res = await fetch(url)
  if (!res.ok) throw new Error(`HTTP ${res.status} fetching ${url}`)
  return res.json()
}

//#endregion
//#region src/trackUtils.ts
function createHtmlLink(html, trackDbUrl) {
  return `<a href="${resolve(html, trackDbUrl)}">${html}</a>`
}
function extractParentTracks(trackName, trackDb) {
  const parentTracks = []
  let currentTrackName = trackName
  do {
    currentTrackName = trackDb.data[currentTrackName]?.data.parent ?? ''
    if (currentTrackName) {
      currentTrackName = currentTrackName.split(' ')[0]
      parentTracks.push(trackDb.data[currentTrackName])
    }
  } while (currentTrackName)
  return parentTracks.reverse()
}
function isMetaTrack(obj) {
  const parentTrackKeys = new Set([
    'superTrack',
    'compositeTrack',
    'container',
    'view',
  ])
  return Object.keys(obj.data).some(key => parentTrackKeys.has(key))
}

//#endregion
//#region src/createTrackConfiguration.ts
function createTrackConfiguration({
  track,
  trackName,
  trackDb,
  trackDbUrl,
  sequenceAdapter,
  assemblyName,
}) {
  const conf = makeTrackConfig({
    track,
    trackDbUrl,
    trackDb,
    sequenceAdapter,
    assemblyName,
  })
  const { data } = track
  const { group, html } = data
  const parentTracks = extractParentTracks(trackName, trackDb)
  const effectiveGroup =
    group || parentTracks.find(p => p.data.group)?.data.group
  return conf
    ? {
        metadata: {
          ...data,
          ...(html ? { html: createHtmlLink(html, trackDbUrl) } : {}),
        },
        category: [effectiveGroup]
          .filter(f => !!f)
          .map(f => categoryMap[f] ?? f),
        ...conf,
        name: [
          ...new Set([
            ...parentTracks.map(p => trackDb.data[p.name]?.data.shortLabel),
            conf.name,
          ]),
        ].join(' - '),
      }
    : void 0
}
function makeTrackConfig({
  track,
  trackDbUrl,
  trackDb,
  sequenceAdapter,
  assemblyName,
}) {
  const { data } = track
  const bigDataUrlPre = data.bigDataUrl ?? ''
  const name =
    (data.shortLabel ?? '') + (bigDataUrlPre.includes('xeno') ? ' (xeno)' : '')
  const conf = makeTrackConfigSub({
    track,
    trackDbUrl,
    trackDb,
    sequenceAdapter,
  })
  return conf
    ? {
        trackId: `${assemblyName}-${data.track}`,
        description: data.longLabel,
        assemblyNames: [assemblyName],
        name,
        ...conf,
      }
    : void 0
}
function makeTrackConfigSub({ track, trackDbUrl, trackDb, sequenceAdapter }) {
  const { data } = track
  const parent = data.parent ?? ''
  const bigDataUrlPre = data.bigDataUrl ?? ''
  if (data.bigDataIndex ?? '') throw new Error("Don't yet support bigDataIdx")
  const trackType = data.type ?? trackDb.data[parent].data.type ?? ''
  const name =
    (data.shortLabel ?? '') + (bigDataUrlPre.includes('xeno') ? ' (xeno)' : '')
  let baseTrackType = trackType.split(' ')[0] ?? ''
  if (baseTrackType === 'bam' && bigDataUrlPre.toLowerCase().endsWith('cram'))
    baseTrackType = 'cram'
  const bigDataUrl = new URL(bigDataUrlPre, trackDbUrl)
  if (baseTrackType === 'bam')
    return {
      type: 'AlignmentsTrack',
      adapter: {
        type: 'BamAdapter',
        uri: bigDataUrl,
      },
    }
  else if (baseTrackType === 'cram')
    return {
      type: 'AlignmentsTrack',
      adapter: {
        type: 'CramAdapter',
        uri: bigDataUrl,
        sequenceAdapter,
      },
    }
  else if (baseTrackType === 'bigWig')
    return {
      type: 'QuantitativeTrack',
      adapter: {
        type: 'BigWigAdapter',
        uri: bigDataUrl,
      },
    }
  else if (baseTrackType.startsWith('big'))
    return {
      type: 'FeatureTrack',
      adapter: {
        type: 'BigBedAdapter',
        uri: bigDataUrl,
      },
    }
  else if (baseTrackType === 'vcfTabix')
    return {
      type: 'VariantTrack',
      adapter: {
        type: 'VcfTabixAdapter',
        uri: bigDataUrl,
      },
    }
  else if (baseTrackType === 'hic')
    return {
      type: 'HicTrack',
      adapter: {
        type: 'HicAdapter',
        uri: bigDataUrl,
      },
    }
  else {
    console.error('Unknown track:', name, baseTrackType)
    return
  }
}

//#endregion
//#region src/notEmpty.ts
function notEmpty(value) {
  return value !== null && value !== void 0
}

//#endregion
//#region src/generateHubTracks.ts
function generateHubTracks({
  trackDb,
  trackDbUrl,
  assemblyName,
  sequenceAdapter,
}) {
  return Object.entries(trackDb.data)
    .map(([trackName, track]) =>
      isMetaTrack(track)
        ? void 0
        : createTrackConfiguration({
            track,
            trackName,
            trackDb,
            trackDbUrl,
            sequenceAdapter,
            assemblyName,
          }),
    )
    .filter(f => notEmpty(f))
}

//#endregion
//#region src/generateJBrowseConfigForAssemblyHub.ts
async function hasAliases(url) {
  let hasAliases$1 = false
  try {
    if (!(await fetch(url)).ok) throw new Error('Error fetching chromAlias')
    hasAliases$1 = true
  } catch (_e) {}
  return hasAliases$1
}
async function generateJBrowseConfigForAssemblyHub({
  hubFileText,
  trackDbUrl,
}) {
  if (hubFileText.includes('useOneFile on')) {
    const { genome, tracks } = new SingleFileHub(hubFileText)
    const { data } = genome
    const { twoBitPath, chromSizes, htmlPath, chromAliasBb } = data
    const genomeName = genome.name
    const defaultPos = genome.data.defaultPos
    const shortLabel = data.description
    if (!twoBitPath) throw new Error('No twoBitPath')
    if (!chromSizes) throw new Error('No chromSizes')
    const sequenceAdapter = {
      type: 'TwoBitAdapter',
      uri: resolve(twoBitPath, trackDbUrl),
      chromSizes: resolve(chromSizes, trackDbUrl),
    }
    const asm = {
      name: genomeName,
      displayName: shortLabel,
      sequence: {
        type: 'ReferenceSequenceTrack',
        metadata: {
          ...data,
          ...(htmlPath
            ? {
                htmlPath: `<a href="${resolve(htmlPath, trackDbUrl)}">${htmlPath}</a>`,
              }
            : {}),
        },
        trackId: `${genomeName}-ReferenceSequenceTrack`,
        adapter: sequenceAdapter,
      },
      ...(chromAliasBb &&
      (await hasAliases(
        resolve(chromAliasBb.replace('.bb', '.txt'), trackDbUrl),
      ))
        ? {
            refNameAliases: {
              adapter: {
                type: 'RefNameAliasAdapter',
                refNameColumnHeaderName: 'ucsc',
                uri: resolve(chromAliasBb.replace('.bb', '.txt'), trackDbUrl),
              },
            },
          }
        : {}),
    }
    return {
      assemblies: [asm],
      tracks: generateHubTracks({
        trackDb: tracks,
        trackDbUrl,
        assemblyName: genomeName,
        sequenceAdapter,
      }),
      ...(defaultPos
        ? {
            defaultSession: {
              name: asm.name,
              widgets: {
                hierarchicalTrackSelector: {
                  id: 'hierarchicalTrackSelector',
                  type: 'HierarchicalTrackSelectorWidget',
                  view: 'initialView',
                },
              },
              activeWidgets: {
                hierarchicalTrackSelector: 'hierarchicalTrackSelector',
              },
              views: [
                {
                  type: 'LinearGenomeView',
                  id: 'initialView',
                  init: {
                    assembly: asm.name,
                    loc: defaultPos,
                  },
                },
              ],
            },
          }
        : {}),
    }
  }
  throw new Error('not a single file hub')
}

//#endregion
//#region src/hubCategories.ts
const hubCategories = [
  {
    id: 'primates',
    description: 'NCBI primate genomes',
    tag: 'main',
  },
  {
    id: 'mammals',
    description: 'NCBI mammal genomes',
    tag: 'main',
  },
  {
    id: 'birds',
    description: 'NCBI bird genomes',
    tag: 'main',
  },
  {
    id: 'fish',
    description: 'NCBI fish genomes',
    tag: 'main',
  },
  {
    id: 'vertebrate',
    description: 'NCBI vertebrate genomes',
    tag: 'main',
  },
  {
    id: 'invertebrate',
    description: 'NCBI invertebrate genomes',
    tag: 'main',
  },
  {
    id: 'fungi',
    description: 'NCBI fungi genomes',
    tag: 'main',
  },
  {
    id: 'plants',
    description: 'NCBI plant genomes',
    tag: 'main',
  },
  {
    id: 'viral',
    description: 'NCBI viral genomes',
    tag: 'main',
  },
  {
    id: 'bacteria',
    description: 'NCBI bacteria genomes',
    tag: 'main',
  },
  {
    id: 'archaea',
    description: 'NCBI archaea genomes',
    tag: 'main',
  },
  {
    id: 'VGP',
    description: 'Vertebrate Genome Project',
    tag: 'other',
  },
  {
    id: 'CCGP',
    description: 'The California Conservation Genomics Project',
    tag: 'other',
  },
  {
    id: 'HPRC',
    description: 'Human Pangenome Reference Consortium',
    tag: 'other',
  },
  {
    id: 'BRC',
    description:
      'BRC Analytics - Bioinformatics Research Center (VEuPathDB and others)',
    tag: 'other',
  },
  {
    id: 'globalReference',
    description: 'Global Human Reference genomes, January 2020',
    tag: 'other',
  },
  {
    id: 'legacy',
    description: 'NCBI genomes legacy/superseded by newer versions',
    tag: 'other',
  },
]

//#endregion
//#region src/extractStats.ts
function extractStats(xmlString) {
  const stats = {}
  const statsRegex =
    /<Stat category="([^"]+)" sequence_tag="([^"]+)">([^<]+)<\/Stat>/g
  let match
  while ((match = statsRegex.exec(xmlString)) !== null)
    stats[match[1]] = match[3]
  return stats
}

//#endregion
//#region src/parseAssemblyEntry.ts
function parseAssemblyEntry({ entry }) {
  const { taxId, asmId, genBank, refSeq, sciName, comName, ucscBrowser } = entry
  const ucscAcc = path.basename(ucscBrowser)
  const accession = ucscAcc.startsWith('GC') ? ucscAcc : refSeq || genBank
  const [base, rest] = accession.split('_')
  const [b1, b2, b3] = rest.match(/.{1,3}/g)
  let ncbiData
  const fn = `hubs/${base}/${b1}/${b2}/${b3}/${accession}/ncbi.json`
  try {
    ncbiData = readJSON(fn)
  } catch {
    console.error(
      `NCBI data not found for ${accession} (${comName}): ${fn} does not exist`,
    )
  }
  const r = ncbiData?.result.uids[0]
  const r2 = r ? ncbiData?.result[r] : void 0
  if (!r2) return
  const assemblyStatus = r2.assemblystatus
  const ncbiAssemblyName = r2.assemblyname
  const seqReleaseDate = r2.seqreleasedate
  const ncbiOrganism = r2.organism
  const submitterOrg = r2.submitterorganization
  const buscoStats = r2.busco
  const ncbiRefSeqCategory = r2.refseq_category
  const ucscBase = `https://hgdownload.soe.ucsc.edu/hubs/${base}/${b1}/${b2}/${b3}/${accession}`
  return {
    stats: ncbiData ? extractStats(r2.meta) : void 0,
    buscoStats,
    seqReleaseDate,
    submitterOrg,
    ncbiOrganism,
    ncbiAssemblyName,
    ncbiRefSeqCategory,
    suppressed: r2.propertylist.includes('suppressed_refseq'),
    accession: accession || '',
    assembly: asmId || '',
    scientificName: sciName || '',
    commonName: comName || '',
    taxonId: taxId || '',
    assemblyStatus,
    jbrowseLink: `https://jbrowse.org/code/jb2/main/?config=/hubs/genark/${base}/${b1}/${b2}/${b3}/${accession}/config.json`,
    jbrowseConfig: `https://jbrowse.org/hubs/genark/${base}/${b1}/${b2}/${b3}/${accession}/config.json`,
    ncbiGff: `https://ftp.ncbi.nlm.nih.gov/genomes/all/${base}/${b1}/${b2}/${b3}/${asmId}/${asmId}_genomic.gff.gz`,
    ncbiLink: `https://www.ncbi.nlm.nih.gov/assembly/${accession}`,
    ucscDataLink: ucscBase,
    ucscBrowserLink: ucscBrowser,
    igvBrowserLink: `https://igv.org/app/?hubURL=${ucscBase}/hub.txt`,
    ncbiName: asmId,
    ncbiBrowserLink: `https://www.ncbi.nlm.nih.gov/gdv/browser/genome/?id=${accession}`,
  }
}

//#endregion
export {
  categoryMap,
  dedupe,
  generateHubTracks,
  generateJBrowseConfigForAssemblyHub,
  hubCategories,
  makeLoc,
  makeLoc2,
  makeLocAlt,
  myfetch,
  myfetchjson,
  myfetchtext,
  myjsonfetch,
  notEmpty,
  parseAssemblyEntry,
  readJSON,
  resolve,
  writeJSON,
}
