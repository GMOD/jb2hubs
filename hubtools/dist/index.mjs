import fs from 'fs'
import { readFile } from 'fs/promises'
import { SingleFileHub } from '@gmod/ucsc-hub'
import path from 'path'

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
/**
 * Reads a JSON file synchronously and parses its content.
 * @param filePath The path to the JSON file.
 * @returns The parsed JSON object.
 */
function readJSON(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'))
}
/**
 * Reads a JSON file asynchronously and parses its content.
 * @param filePath The path to the JSON file.
 * @returns A promise that resolves to the parsed JSON object.
 */
async function readJSONAsync(filePath) {
  return JSON.parse(await readFile(filePath, 'utf8'))
}
/**
 * Writes a JavaScript object to a JSON file.
 * @param filePath The path to the output JSON file.
 * @param data The data to write.
 */
function writeJSON(filePath, data) {
  fs.writeFileSync(filePath, JSON.stringify(data, void 0, 2))
}
async function myjsonfetch(url) {
  const res = await fetch(url)
  if (!res.ok) throw new Error(`HTTP ${res.status} fetching ${url}`)
  return res.json()
}
/**
 * Splits a string on the first occurrence of a separator.
 * @param str The string to split.
 * @param sep The separator string.
 * @returns A tuple containing the part before the separator and the part after.
 *          If the separator is not found, the second element will be an empty string.
 */
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
/**
 * Validates that a required CLI argument is provided.
 * Exits with code 1 if the argument is missing.
 * @param arg The argument value to check.
 * @param usage The usage message to display if validation fails.
 * @returns The validated argument (non-null).
 */
function requireArg(arg, usage) {
  if (!arg) {
    console.error(usage)
    process.exit(1)
  }
  return arg
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
    sort: {
      trackNames: true,
      categories: true,
    },
    defaultCollapsed: {
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
function isChainNetTrack(obj) {
  const { shortLabel, longLabel } = obj.data
  return shortLabel?.includes('Chain/Net') || longLabel?.includes('Chain/Net')
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
  else if (baseTrackType.startsWith('big')) {
    const trackName = data.track ?? ''
    return {
      type: 'FeatureTrack',
      adapter: {
        type: 'BigBedAdapter',
        uri: bigDataUrl,
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
      isMetaTrack(track) || isChainNetTrack(track)
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
  let hasAliases = false
  try {
    if (!(await fetch(url)).ok) throw new Error('Error fetching chromAlias')
    hasAliases = true
  } catch (_e) {}
  return hasAliases
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
          ucsc: {
            ...data,
            ...(htmlPath
              ? {
                  htmlPath: `<a href="${resolve(htmlPath, trackDbUrl)}">${htmlPath}</a>`,
                }
              : {}),
          },
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
//#region src/parseAssemblyEntry.ts
function parseAssemblyEntry({ entry }) {
  const { taxId, asmId, genBank, refSeq, sciName, comName, ucscBrowser } = entry
  const ucscAcc = path.basename(ucscBrowser)
  const accession = ucscAcc.startsWith('GC') ? ucscAcc : refSeq || genBank
  const [base, rest] = accession.split('_')
  const [b1, b2, b3] = rest.match(/.{1,3}/g)
  const fn = `hubs/${base}/${b1}/${b2}/${b3}/${accession}/ncbi.json`
  let report
  try {
    const ncbiData = readJSON(fn)
    report = ncbiData.reports?.find(
      r =>
        r.accession === accession ||
        r.paired_accession === accession ||
        r.current_accession === accession,
    )
    if (!report && ncbiData.reports?.[0]) report = ncbiData.reports[0]
  } catch {
    console.error(
      `NCBI data not found for ${accession} (${comName}): ${fn} does not exist`,
    )
  }
  if (!report) return
  const { assembly_info, assembly_stats, organism } = report
  const assemblyStatus = assembly_info.assembly_level
  const ncbiAssemblyName = assembly_info.assembly_name
  const seqReleaseDate = assembly_info.release_date
  const ncbiOrganism = organism.common_name
    ? `${organism.organism_name} (${organism.common_name})`
    : organism.organism_name
  const submitterOrg = assembly_info.submitter
  const ncbiRefSeqCategory = assembly_info.refseq_category
  const suppressed = assembly_info.assembly_status === 'suppressed'
  const ucscBase = `https://hgdownload.soe.ucsc.edu/hubs/${base}/${b1}/${b2}/${b3}/${accession}`
  const stats = {
    contig_count: assembly_stats.number_of_contigs,
    contig_l50: assembly_stats.contig_l50,
    contig_n50: assembly_stats.contig_n50,
    scaffold_count: assembly_stats.number_of_scaffolds,
    scaffold_l50: assembly_stats.scaffold_l50,
    scaffold_n50: assembly_stats.scaffold_n50,
    chromosome_count: assembly_stats.total_number_of_chromosomes,
    total_length: assembly_stats.total_sequence_length,
    ungapped_length: assembly_stats.total_ungapped_length,
  }
  const ncbiGffUrl = `https://ftp.ncbi.nlm.nih.gov/genomes/all/${base}/${b1}/${b2}/${b3}/${asmId}/${asmId}_genomic.gff.gz`
  return {
    stats,
    seqReleaseDate,
    submitterOrg,
    ncbiOrganism,
    ncbiAssemblyName,
    ncbiRefSeqCategory,
    suppressed,
    accession: accession || '',
    assembly: asmId || '',
    scientificName: sciName || '',
    commonName: comName || '',
    taxonId: taxId || '',
    assemblyStatus,
    jbrowseLink: `https://jbrowse.org/code/jb2/latest/?config=/hubs/genark/${base}/${b1}/${b2}/${b3}/${accession}/config.json`,
    jbrowseConfig: `https://jbrowse.org/hubs/genark/${base}/${b1}/${b2}/${b3}/${accession}/config.json`,
    ncbiGff: ncbiGffUrl,
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
  decodeURIComponentNoThrow,
  dedupe,
  enhanceConfig,
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
  readJSONAsync,
  replaceLink,
  requireArg,
  resolve,
  splitOnFirst,
  writeJSON,
}
