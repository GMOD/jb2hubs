import fs from 'fs'
import { readFile } from 'fs/promises'
import {
  GenomesFile,
  HubFile,
  SingleFileHub,
  TrackDbFile,
} from '@gmod/ucsc-hub'
import path from 'path'
//#region src/chainTracks.ts
function isAccession(name) {
  return name.startsWith('GCF') || name.startsWith('GCA')
}
function normalizeAssemblyName(name) {
  if (isAccession(name)) return name
  return name.charAt(0).toLowerCase() + name.slice(1)
}
//#endregion
//#region src/const.ts
const categoryMap = {
  map: 'Mapping and Sequencing',
  pub: 'Literature',
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
function readJSON(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'))
}
async function readJSONAsync(filePath) {
  return JSON.parse(await readFile(filePath, 'utf8'))
}
function writeJSON(filePath, data) {
  fs.writeFileSync(filePath, JSON.stringify(data, void 0, 2))
}
function makeDefaultSession(assemblyName, loc) {
  return {
    name: assemblyName,
    widgets: {
      hierarchicalTrackSelector: {
        id: 'hierarchicalTrackSelector',
        type: 'HierarchicalTrackSelectorWidget',
        view: 'initialView',
      },
    },
    activeWidgets: { hierarchicalTrackSelector: 'hierarchicalTrackSelector' },
    views: [
      {
        type: 'LinearGenomeView',
        id: 'initialView',
        init: {
          assembly: assemblyName,
          loc,
        },
      },
    ],
  }
}
function splitOnFirst(str, sep) {
  const index = str.indexOf(sep)
  return index < 0
    ? [str, '']
    : [str.slice(0, index), str.slice(index + sep.length)]
}
/**
 * Replaces specific relative links in a string with absolute UCSC genome links.
 * This is typically used for HTML content from UCSC track databases.
 * @param htmlContent The string containing HTML content.
 * @returns The string with replaced links.
 */
function replaceLink(htmlContent) {
  return htmlContent
    .replaceAll('\\', ' ')
    .replaceAll('../../', 'https://genome.ucsc.edu/')
    .replaceAll('../', 'https://genome.ucsc.edu/')
    .replaceAll('"/cgi-bin', '"https://genome.ucsc.edu/cgi-bin')
}
/**
 * Decodes a URI component, gracefully handling malformed URIs.
 * @param uri The URI component to decode.
 * @returns The decoded URI component, or the original URI if decoding fails.
 */
function decodeURIComponentNoThrow(uri) {
  try {
    return decodeURIComponent(uri)
  } catch (_e) {
    return uri
  }
}
function requireArg(arg, usage) {
  if (!arg) {
    console.error(usage)
    process.exit(1)
  }
  return arg
}
/**
 * Splits a GenArk accession (e.g. GCF_000001405.40) into the path components
 * UCSC uses for hubs: { base: 'GCF', b1, b2, b3 } where b1/b2/b3 are 3-char
 * chunks of the digit portion. Returns undefined for malformed input.
 */
function accessionChunks(accession) {
  const [base, rest] = accession.split('_')
  const matches = rest?.match(/.{1,3}/g)
  if (!base || !matches || matches.length < 3) return
  const [b1, b2, b3] = matches
  return {
    base,
    b1,
    b2,
    b3,
  }
}
//#endregion
//#region src/enhanceConfig.ts
const defaultPlugins = [
  {
    name: 'MafViewer',
    url: 'https://jbrowse.org/plugins/jbrowse-plugin-mafviewer/dist/jbrowse-plugin-mafviewer.umd.production.min.js',
  },
  {
    name: 'Hubs',
    url: 'https://jbrowse.org/plugins/@cmdcolin/jbrowse-plugin-hubs/dist/jbrowse-plugin-hubs.umd.production.min.js',
  },
  {
    name: 'Protein3d',
    url: 'https://jbrowse.org/plugins/jbrowse-plugin-protein3d/dist/jbrowse-plugin-protein3d.umd.production.min.js',
  },
  {
    name: 'MsaView',
    url: 'https://jbrowse.org/plugins/jbrowse-plugin-msaview/dist/jbrowse-plugin-msaview.umd.production.min.js',
  },
]
/**
 * Enhances a JBrowse configuration file with standard plugins and hierarchical settings.
 * @param configPath Path to the config.json file to enhance.
 * @param plugins Optional array of plugins to add. Defaults to standard JBrowse plugins.
 */
function enhanceConfig(configPath, plugins = defaultPlugins) {
  const config = readJSON(configPath)
  config.plugins ??= []
  for (const plugin of plugins)
    if (!config.plugins.some(p => p.name === plugin.name))
      config.plugins.push(plugin)
  config.configuration ??= {}
  config.configuration.hierarchical = {
    ...config.configuration.hierarchical,
    sort: {
      ...config.configuration.hierarchical?.sort,
      trackNames: true,
      categories: true,
    },
    defaultCollapsed: {
      ...config.configuration.hierarchical?.defaultCollapsed,
      topLevelCategories: true,
      subCategories: true,
    },
  }
  writeJSON(configPath, config)
}
//#endregion
//#region src/trackUtils.ts
function createHtmlLink(html, trackDbUrl) {
  return `<a href="${resolve(html, trackDbUrl)}">${html}</a>`
}
function extractParentTracks(trackName, trackDb) {
  const parentName =
    (trackDb.data[trackName]?.data.parent ?? '').split(' ')[0] ?? ''
  return parentName
    ? [...extractParentTracks(parentName, trackDb), trackDb.data[parentName]]
    : []
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
function isChainNetTrack(obj) {
  const { shortLabel, longLabel, type } = obj.data
  return (
    (shortLabel?.includes('Chain/Net') ?? false) ||
    (longLabel?.includes('Chain/Net') ?? false) ||
    (type?.startsWith('bigChain') ?? false)
  )
}
//#endregion
//#region src/createTrackConfiguration.ts
function makeAdapterConf(
  baseTrackType,
  uri,
  sequenceAdapter,
  data,
  trackDbUrl,
) {
  if (baseTrackType === 'bam')
    return {
      type: 'AlignmentsTrack',
      adapter: {
        type: 'BamAdapter',
        uri,
      },
    }
  else if (baseTrackType === 'cram')
    return {
      type: 'AlignmentsTrack',
      adapter: {
        type: 'CramAdapter',
        uri,
        sequenceAdapter,
      },
    }
  else if (baseTrackType === 'bigWig')
    return {
      type: 'QuantitativeTrack',
      adapter: {
        type: 'BigWigAdapter',
        uri,
      },
    }
  else if (baseTrackType === 'bigMaf') {
    const summaryUri = data.summary ? resolve(data.summary, trackDbUrl) : void 0
    return {
      type: 'MafTrack',
      adapter: {
        type: 'BigMafAdapter',
        bigMafLocation: { uri },
        ...(summaryUri ? { summaryLocation: { uri: summaryUri } } : {}),
      },
    }
  } else if (baseTrackType.startsWith('big')) {
    const trackName = data.track ?? ''
    return {
      type: 'FeatureTrack',
      adapter: {
        type: 'BigBedAdapter',
        uri,
        ...(trackName.endsWith('tandemDups') || trackName.endsWith('gapOverlap')
          ? { disableGeneHeuristic: true }
          : {}),
      },
    }
  } else if (baseTrackType === 'vcfTabix')
    return {
      type: 'VariantTrack',
      adapter: {
        type: 'VcfTabixAdapter',
        uri,
      },
    }
  else if (baseTrackType === 'hic')
    return {
      type: 'HicTrack',
      adapter: {
        type: 'HicAdapter',
        uri,
      },
    }
}
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
    group ?? parentTracks.find(p => p.data.group)?.data.group
  return conf
    ? {
        metadata: {
          ucsc: {
            ...data,
            ...(html ? { html: createHtmlLink(html, trackDbUrl) } : {}),
          },
        },
        category: [effectiveGroup]
          .filter(f => !!f)
          .map(f => categoryMap[f] ?? f),
        ...conf,
        name: [
          ...new Set([
            ...parentTracks
              .map(p => trackDb.data[p.name]?.data.shortLabel)
              .filter(s => s !== void 0),
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
  const parent = data.parent ?? ''
  const bigDataUrlPre = data.bigDataUrl ?? ''
  if (data.bigDataIndex ?? '') throw new Error("Don't yet support bigDataIdx")
  const name =
    (data.shortLabel ?? '') + (bigDataUrlPre.includes('xeno') ? ' (xeno)' : '')
  let baseTrackType =
    (data.type ?? trackDb.data[parent]?.data.type ?? '').split(' ')[0] ?? ''
  if (baseTrackType === 'bam' && bigDataUrlPre.toLowerCase().endsWith('.cram'))
    baseTrackType = 'cram'
  const uri = resolve(bigDataUrlPre, trackDbUrl)
  const adapterConf = makeAdapterConf(
    baseTrackType,
    uri,
    sequenceAdapter,
    data,
    trackDbUrl,
  )
  if (!adapterConf) console.error('Unknown track:', name, baseTrackType)
  return adapterConf
    ? {
        trackId: `${assemblyName}-${data.track}`,
        description: data.longLabel,
        assemblyNames: [assemblyName],
        name,
        ...adapterConf,
      }
    : void 0
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
    .map(([trackName, track]) => {
      if (isMetaTrack(track) || isChainNetTrack(track)) return
      if (extractParentTracks(trackName, trackDb).some(p => isChainNetTrack(p)))
        return
      return createTrackConfiguration({
        track,
        trackName,
        trackDb,
        trackDbUrl,
        sequenceAdapter,
        assemblyName,
      })
    })
    .filter(notEmpty)
}
//#endregion
//#region src/generateJBrowseConfigForAssemblyHub.ts
function generateJBrowseConfigForAssemblyHub({ hubFileText, trackDbUrl }) {
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
          ucsc: {
            ...data,
            ...(htmlPath
              ? { htmlPath: createHtmlLink(htmlPath, trackDbUrl) }
              : {}),
          },
        },
        trackId: `${genomeName}-ReferenceSequenceTrack`,
        adapter: sequenceAdapter,
      },
      ...(chromAliasBb
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
        ? { defaultSession: makeDefaultSession(asm.name, defaultPos) }
        : {}),
    }
  }
  throw new Error('not a single file hub')
}
//#endregion
//#region src/generateJBrowseConfigsForMultiGenomeHub.ts
async function fetchTrackDbWithIncludes(trackDbUrl) {
  const text = await myfetchtext(trackDbUrl)
  const includes = [...text.matchAll(/^include\s+(\S+)/gm)]
  if (!includes.length) return text
  return [
    text,
    ...(await Promise.all(
      includes.map(async ([, path]) => {
        try {
          return await fetchTrackDbWithIncludes(resolve(path, trackDbUrl))
        } catch (e) {
          console.warn(`Failed to fetch included trackDb ${path}: ${e}`)
          return ''
        }
      }),
    )),
  ].join('\n\n')
}
async function generateJBrowseConfigsForMultiGenomeHub(hubUrl) {
  const genomesFileRelUrl = new HubFile(await myfetchtext(hubUrl)).data
    .genomesFile
  if (!genomesFileRelUrl)
    throw new Error('Hub file does not have a genomesFile field')
  const genomesFileUrl = resolve(genomesFileRelUrl, hubUrl)
  const genomesFile = new GenomesFile(await myfetchtext(genomesFileUrl))
  const configs = []
  for (const [genomeName, genomeStanza] of Object.entries(genomesFile.data)) {
    const { twoBitPath, trackDb, defaultPos, description, organism, htmlPath } =
      genomeStanza.data
    if (!twoBitPath || !trackDb) continue
    const twoBitUrl = resolve(twoBitPath, genomesFileUrl)
    const chromSizesUrl = twoBitUrl.replace(/\.2bit$/, '.chrom.sizes')
    const trackDbUrl = resolve(trackDb, genomesFileUrl)
    let trackDbFile
    try {
      trackDbFile = new TrackDbFile(await fetchTrackDbWithIncludes(trackDbUrl))
    } catch (e) {
      console.warn(`Failed to load trackDb for ${genomeName}: ${e}`)
      continue
    }
    const sequenceAdapter = {
      type: 'TwoBitAdapter',
      uri: twoBitUrl,
      chromSizes: chromSizesUrl,
    }
    const displayName = description ?? organism ?? genomeName
    const asm = {
      name: genomeName,
      displayName,
      sequence: {
        type: 'ReferenceSequenceTrack',
        metadata: {
          ucsc: {
            ...genomeStanza.data,
            ...(htmlPath
              ? { htmlPath: createHtmlLink(htmlPath, genomesFileUrl) }
              : {}),
          },
        },
        trackId: `${genomeName}-ReferenceSequenceTrack`,
        adapter: sequenceAdapter,
      },
    }
    const tracks = generateHubTracks({
      trackDb: trackDbFile,
      trackDbUrl,
      assemblyName: genomeName,
      sequenceAdapter,
    })
    const config = {
      assemblies: [asm],
      tracks,
      ...(defaultPos
        ? { defaultSession: makeDefaultSession(genomeName, defaultPos) }
        : {}),
    }
    configs.push({
      genomeName,
      displayName,
      organism: organism ?? '',
      defaultPos: defaultPos ?? '',
      config,
    })
  }
  return configs
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
//#region src/parseAssemblyEntry.ts
function parseAssemblyEntry({ entry }) {
  const { taxId, asmId, genBank, refSeq, sciName, comName, ucscBrowser } = entry
  const ucscAcc = path.basename(ucscBrowser)
  const accession =
    ucscAcc.startsWith('GCF_') || ucscAcc.startsWith('GCA_')
      ? ucscAcc
      : refSeq || genBank
  const chunks = accessionChunks(accession)
  if (!chunks) {
    console.error(`Unexpected accession format: ${accession}`)
    return
  }
  const { base, b1, b2, b3 } = chunks
  const hubPath = `${base}/${b1}/${b2}/${b3}/${accession}`
  const ucscBase = `https://hgdownload.soe.ucsc.edu/hubs/${hubPath}`
  const common = {
    accession,
    assembly: asmId || '',
    scientificName: sciName || '',
    commonName: comName || '',
    taxonId: taxId || '',
    jbrowseLink: `https://jbrowse.org/code/jb2/latest/?config=/hubs/genark/${hubPath}/config.json`,
    jbrowseConfig: `https://jbrowse.org/hubs/genark/${hubPath}/config.json`,
    ncbiGff: `https://ftp.ncbi.nlm.nih.gov/genomes/all/${base}/${b1}/${b2}/${b3}/${asmId}/${asmId}_genomic.gff.gz`,
    ncbiLink: `https://www.ncbi.nlm.nih.gov/assembly/${accession}`,
    ucscDataLink: ucscBase,
    ucscBrowserLink: ucscBrowser,
    igvBrowserLink: `https://igv.org/app/?hubURL=${ucscBase}/hub.txt`,
    ncbiName: asmId,
    ncbiBrowserLink: `https://www.ncbi.nlm.nih.gov/gdv/browser/genome/?id=${accession}`,
  }
  const fn = `hubs/${hubPath}/ncbi.json`
  let report
  let ncbiDownloadedAt
  try {
    const ncbiData = readJSON(fn)
    ncbiDownloadedAt = ncbiData.downloaded_at
    report = ncbiData.reports.find(
      r =>
        r.accession === accession ||
        r.paired_accession === accession ||
        r.current_accession === accession,
    )
    report ??= ncbiData.reports[0]
  } catch {
    console.error(
      `NCBI data not found for ${accession} (${comName}): ${fn} does not exist`,
    )
  }
  if (!report)
    return {
      ...common,
      stats: void 0,
      seqReleaseDate: void 0,
      submitterOrg: void 0,
      ncbiOrganism: void 0,
      ncbiAssemblyName: void 0,
      ncbiRefSeqCategory: void 0,
      suppressed: false,
      assemblyType: void 0,
      assemblyStatus: void 0,
      pairedAccession: void 0,
      pairedAssemblyStatus: void 0,
      pairedAssemblyDifferences: void 0,
      genomeNotes: void 0,
      suppressionReason: void 0,
      infraspecificNames: void 0,
      comments: void 0,
      gcPercent: void 0,
      genomeCoverage: void 0,
      sequencingTech: void 0,
      bioprojectAccession: void 0,
      annotationInfo: void 0,
      ncbiDownloadedAt: void 0,
      ncbiMissing: true,
    }
  const { assembly_info, assembly_stats, organism, annotation_info } = report
  const ncbiOrganism = organism.common_name
    ? `${organism.organism_name} (${organism.common_name})`
    : organism.organism_name
  const pairedAccession =
    report.paired_accession === accession
      ? report.accession
      : (report.paired_accession ?? assembly_info.paired_assembly?.accession)
  return {
    ...common,
    stats: {
      contig_count: assembly_stats.number_of_contigs,
      contig_l50: assembly_stats.contig_l50,
      contig_n50: assembly_stats.contig_n50,
      scaffold_count: assembly_stats.number_of_scaffolds,
      scaffold_l50: assembly_stats.scaffold_l50,
      scaffold_n50: assembly_stats.scaffold_n50,
      chromosome_count: assembly_stats.total_number_of_chromosomes,
      total_length: assembly_stats.total_sequence_length,
      ungapped_length: assembly_stats.total_ungapped_length,
    },
    seqReleaseDate: assembly_info.release_date,
    submitterOrg: assembly_info.submitter,
    ncbiOrganism,
    ncbiAssemblyName: assembly_info.assembly_name,
    ncbiRefSeqCategory: assembly_info.refseq_category,
    suppressed: assembly_info.assembly_status === 'suppressed',
    assemblyType: assembly_info.assembly_type,
    assemblyStatus: assembly_info.assembly_level,
    pairedAccession,
    pairedAssemblyStatus: assembly_info.paired_assembly?.status,
    pairedAssemblyDifferences: assembly_info.paired_assembly?.differences,
    genomeNotes: assembly_info.genome_notes,
    suppressionReason: assembly_info.suppression_reason,
    infraspecificNames: organism.infraspecific_names,
    comments: assembly_info.comments,
    gcPercent: assembly_stats.gc_percent,
    genomeCoverage: assembly_stats.genome_coverage,
    sequencingTech: assembly_info.sequencing_tech,
    bioprojectAccession: assembly_info.bioproject_accession,
    annotationInfo: annotation_info,
    ncbiDownloadedAt,
    ncbiMissing: false,
  }
}
//#endregion
export {
  accessionChunks,
  categoryMap,
  decodeURIComponentNoThrow,
  dedupe,
  enhanceConfig,
  generateHubTracks,
  generateJBrowseConfigForAssemblyHub,
  generateJBrowseConfigsForMultiGenomeHub,
  hubCategories,
  isAccession,
  makeDefaultSession,
  myfetch,
  myfetchtext,
  normalizeAssemblyName,
  notEmpty,
  parseAssemblyEntry,
  readJSON,
  readJSONAsync,
  replaceLink,
  requireArg,
  resolve,
  splitOnFirst,
  writeJSON,
}
