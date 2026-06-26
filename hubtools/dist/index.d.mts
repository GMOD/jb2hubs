import { TrackDbFile } from '@gmod/ucsc-hub'

//#region src/chainTracks.d.ts
declare function isAccession(name: string): boolean
declare function normalizeAssemblyName(name: string): string
//#endregion
//#region src/const.d.ts
declare const categoryMap: {
  map: string
  pub: string
  genes: string
  phenDis: string
  rep: string
  varRep: string
  rna: string
  neandertal: string
  denisova: string
  expression: string
  compGeno: string
  regulation: string
  singleCell: string
  hprc: string
}
//#endregion
//#region src/dedupe.d.ts
type Hasher<T> = (input: T) => string
declare function dedupe<T>(list: T[], hasher?: Hasher<T>): T[]
//#endregion
//#region src/types.d.ts
interface UCSCGenArkAssemblyEntry {
  taxId: number
  asmId: string
  genBank: string
  refSeq: string
  identical: string
  sciName: string
  comName: string
  ucscBrowser: string
}
interface AnnotationInfo {
  name?: string
  provider?: string
  release_date?: string
  busco?: {
    busco_lineage?: string
    busco_ver?: string
    complete?: number
    single_copy?: number
    duplicated?: number
    fragmented?: number
    missing?: number
    total_count?: string
  }
  stats?: {
    gene_counts?: {
      protein_coding?: number
      non_coding?: number
      pseudogene?: number
      total?: number
    }
  }
}
interface NCBIDatasetsReport {
  accession: string
  current_accession: string
  paired_accession?: string
  organism: {
    organism_name: string
    common_name?: string
    tax_id: number
    infraspecific_names?: Record<string, string>
  }
  assembly_info: {
    assembly_level: string
    assembly_name: string
    assembly_status: string
    assembly_type: string
    refseq_category?: string
    release_date: string
    submitter: string
    bioproject_accession?: string
    comments?: string
    genome_notes?: string[]
    sequencing_tech?: string
    suppression_reason?: string
    paired_assembly?: {
      accession: string
      status: string
      differences?: string
    }
  }
  assembly_stats: {
    contig_l50: number
    contig_n50: number
    scaffold_l50: number
    scaffold_n50: number
    number_of_contigs: number
    number_of_scaffolds: number
    total_number_of_chromosomes: number
    total_sequence_length: string
    total_ungapped_length: string
    gc_count?: string
    gc_percent?: number
    genome_coverage?: string
    number_of_component_sequences?: number
  }
  annotation_info?: AnnotationInfo
}
type Adapter = Record<string, unknown> & {
  type: string
}
interface NCBIDatasetsResponse {
  reports: NCBIDatasetsReport[]
  total_count: number
  downloaded_at?: number
}
interface JBrowsePlugin {
  name: string
  url?: string
}
interface Track {
  trackId: string
  [key: string]: unknown
}
interface HierarchicalConfig {
  sort?: {
    trackNames?: boolean
    categories?: boolean
  }
  defaultCollapsed?: {
    topLevelCategories?: boolean
    subCategories?: boolean
  }
}
interface JBrowseConfiguration {
  hierarchical?: HierarchicalConfig
  [key: string]: unknown
}
interface JBrowseConfig {
  plugins?: JBrowsePlugin[]
  assemblies?: unknown[]
  tracks?: Track[]
  configuration?: JBrowseConfiguration
  [key: string]: unknown
}
interface ChainTrack {
  type: string
  trackId: string
  name: string
  category: string[]
  assemblyNames: string[]
  adapter: {
    type: string
    targetAssembly: string
    queryAssembly: string
    pifGzLocation: {
      uri: string
    }
    index: {
      location: {
        uri: string
      }
      indexType?: string
    }
  }
}
//#endregion
//#region src/enhanceConfig.d.ts
/**
 * Enhances a JBrowse configuration file with standard plugins and hierarchical settings.
 * @param configPath Path to the config.json file to enhance.
 * @param plugins Optional array of plugins to add. Defaults to standard JBrowse plugins.
 */
declare function enhanceConfig(
  configPath: string,
  plugins?: JBrowsePlugin[],
): void
//#endregion
//#region src/generateHubTracks.d.ts
declare function generateHubTracks({
  trackDb,
  trackDbUrl,
  assemblyName,
  sequenceAdapter,
}: {
  trackDb: TrackDbFile
  trackDbUrl: string
  assemblyName: string
  sequenceAdapter: Adapter
}): (
  | {
      name: string
      type: string
      adapter: {
        type: string
        uri: string
        sequenceAdapter: Adapter
      }
      trackId: string
      description: string | undefined
      assemblyNames: string[]
      metadata: {
        ucsc: {
          html?: string | undefined
        }
      }
      category: string[]
    }
  | {
      name: string
      type: string
      adapter: {
        summaryLocation?:
          | {
              uri: string
            }
          | undefined
        type: string
        bigMafLocation: {
          uri: string
        }
        uri?: undefined
        sequenceAdapter?: undefined
      }
      trackId: string
      description: string | undefined
      assemblyNames: string[]
      metadata: {
        ucsc: {
          html?: string | undefined
        }
      }
      category: string[]
    }
  | {
      name: string
      type: string
      adapter: {
        disableGeneHeuristic?: boolean | undefined
        type: string
        uri: string
        sequenceAdapter?: undefined
      }
      trackId: string
      description: string | undefined
      assemblyNames: string[]
      metadata: {
        ucsc: {
          html?: string | undefined
        }
      }
      category: string[]
    }
)[]
//#endregion
//#region src/generateJBrowseConfigForAssemblyHub.d.ts
declare function generateJBrowseConfigForAssemblyHub({
  hubFileText,
  trackDbUrl,
}: {
  hubFileText: string
  trackDbUrl: string
}): {
  defaultSession?:
    | {
        name: string
        widgets: {
          hierarchicalTrackSelector: {
            id: string
            type: string
            view: string
          }
        }
        activeWidgets: {
          hierarchicalTrackSelector: string
        }
        views: {
          type: string
          id: string
          init: {
            assembly: string
            loc: string
          }
        }[]
      }
    | undefined
  assemblies: {
    refNameAliases?:
      | {
          adapter: {
            type: string
            refNameColumnHeaderName: string
            uri: string
          }
        }
      | undefined
    name: string
    displayName: string | undefined
    sequence: {
      type: string
      metadata: {
        ucsc: {
          htmlPath?: string | undefined
        }
      }
      trackId: string
      adapter: {
        type: string
        uri: string
        chromSizes: string
      }
    }
  }[]
  tracks: (
    | {
        name: string
        type: string
        adapter: {
          type: string
          uri: string
          sequenceAdapter: Adapter
        }
        trackId: string
        description: string | undefined
        assemblyNames: string[]
        metadata: {
          ucsc: {
            html?: string | undefined
          }
        }
        category: string[]
      }
    | {
        name: string
        type: string
        adapter: {
          summaryLocation?:
            | {
                uri: string
              }
            | undefined
          type: string
          bigMafLocation: {
            uri: string
          }
          uri?: undefined
          sequenceAdapter?: undefined
        }
        trackId: string
        description: string | undefined
        assemblyNames: string[]
        metadata: {
          ucsc: {
            html?: string | undefined
          }
        }
        category: string[]
      }
    | {
        name: string
        type: string
        adapter: {
          disableGeneHeuristic?: boolean | undefined
          type: string
          uri: string
          sequenceAdapter?: undefined
        }
        trackId: string
        description: string | undefined
        assemblyNames: string[]
        metadata: {
          ucsc: {
            html?: string | undefined
          }
        }
        category: string[]
      }
  )[]
}
//#endregion
//#region src/generateJBrowseConfigsForMultiGenomeHub.d.ts
declare function generateJBrowseConfigsForMultiGenomeHub(
  hubUrl: string,
): Promise<
  {
    genomeName: string
    displayName: string
    organism: string
    defaultPos: string
    config: {
      defaultSession?:
        | {
            name: string
            widgets: {
              hierarchicalTrackSelector: {
                id: string
                type: string
                view: string
              }
            }
            activeWidgets: {
              hierarchicalTrackSelector: string
            }
            views: {
              type: string
              id: string
              init: {
                assembly: string
                loc: string
              }
            }[]
          }
        | undefined
      assemblies: {
        name: string
        displayName: string
        sequence: {
          type: string
          metadata: {
            ucsc: {
              htmlPath?: string | undefined
            }
          }
          trackId: string
          adapter: {
            type: string
            uri: string
            chromSizes: string
          }
        }
      }[]
      tracks: (
        | {
            name: string
            type: string
            adapter: {
              type: string
              uri: string
              sequenceAdapter: Adapter
            }
            trackId: string
            description: string | undefined
            assemblyNames: string[]
            metadata: {
              ucsc: {
                html?: string | undefined
              }
            }
            category: string[]
          }
        | {
            name: string
            type: string
            adapter: {
              summaryLocation?:
                | {
                    uri: string
                  }
                | undefined
              type: string
              bigMafLocation: {
                uri: string
              }
              uri?: undefined
              sequenceAdapter?: undefined
            }
            trackId: string
            description: string | undefined
            assemblyNames: string[]
            metadata: {
              ucsc: {
                html?: string | undefined
              }
            }
            category: string[]
          }
        | {
            name: string
            type: string
            adapter: {
              disableGeneHeuristic?: boolean | undefined
              type: string
              uri: string
              sequenceAdapter?: undefined
            }
            trackId: string
            description: string | undefined
            assemblyNames: string[]
            metadata: {
              ucsc: {
                html?: string | undefined
              }
            }
            category: string[]
          }
      )[]
    }
  }[]
>
//#endregion
//#region src/hubCategories.d.ts
declare const hubCategories: {
  id: string
  description: string
  tag: string
}[]
//#endregion
//#region src/notEmpty.d.ts
declare function notEmpty<T>(value: T | null | undefined): value is T
//#endregion
//#region src/parseAssemblyEntry.d.ts
declare function parseAssemblyEntry({
  entry,
}: {
  entry: UCSCGenArkAssemblyEntry
}):
  | {
      stats: undefined
      seqReleaseDate: undefined
      submitterOrg: undefined
      ncbiOrganism: undefined
      ncbiAssemblyName: undefined
      ncbiRefSeqCategory: undefined
      suppressed: boolean
      assemblyType: undefined
      assemblyStatus: undefined
      pairedAccession: undefined
      pairedAssemblyStatus: undefined
      pairedAssemblyDifferences: undefined
      genomeNotes: undefined
      suppressionReason: undefined
      infraspecificNames: undefined
      comments: undefined
      gcPercent: undefined
      genomeCoverage: undefined
      sequencingTech: undefined
      bioprojectAccession: undefined
      annotationInfo: undefined
      ncbiDownloadedAt: undefined
      ncbiMissing: boolean
      accession: string
      assembly: string
      scientificName: string
      commonName: string
      taxonId: string | number
      jbrowseLink: string
      jbrowseConfig: string
      ncbiGff: string
      ncbiLink: string
      ucscDataLink: string
      ucscBrowserLink: string
      igvBrowserLink: string
      ncbiName: string
      ncbiBrowserLink: string
    }
  | {
      stats: {
        contig_count: number
        contig_l50: number
        contig_n50: number
        scaffold_count: number
        scaffold_l50: number
        scaffold_n50: number
        chromosome_count: number
        total_length: string
        ungapped_length: string
      }
      seqReleaseDate: string
      submitterOrg: string
      ncbiOrganism: string
      ncbiAssemblyName: string
      ncbiRefSeqCategory: string | undefined
      suppressed: boolean
      assemblyType: string
      assemblyStatus: string
      pairedAccession: string | undefined
      pairedAssemblyStatus: string | undefined
      pairedAssemblyDifferences: string | undefined
      genomeNotes: string[] | undefined
      suppressionReason: string | undefined
      infraspecificNames: Record<string, string> | undefined
      comments: string | undefined
      gcPercent: number | undefined
      genomeCoverage: string | undefined
      sequencingTech: string | undefined
      bioprojectAccession: string | undefined
      annotationInfo: AnnotationInfo | undefined
      ncbiDownloadedAt: number | undefined
      ncbiMissing: boolean
      accession: string
      assembly: string
      scientificName: string
      commonName: string
      taxonId: string | number
      jbrowseLink: string
      jbrowseConfig: string
      ncbiGff: string
      ncbiLink: string
      ucscDataLink: string
      ucscBrowserLink: string
      igvBrowserLink: string
      ncbiName: string
      ncbiBrowserLink: string
    }
  | undefined
//#endregion
//#region src/util.d.ts
declare function resolve(uri: string, baseUri: string | URL): string
declare function myfetch(url: string): Promise<Response>
declare function myfetchtext(url: string): Promise<string>
declare function readJSON<T = unknown>(filePath: string): T
declare function readJSONAsync<T = unknown>(filePath: string): Promise<T>
declare function writeJSON(filePath: string, data: unknown): void
declare function makeDefaultSession(
  assemblyName: string,
  loc: string,
): {
  name: string
  widgets: {
    hierarchicalTrackSelector: {
      id: string
      type: string
      view: string
    }
  }
  activeWidgets: {
    hierarchicalTrackSelector: string
  }
  views: {
    type: string
    id: string
    init: {
      assembly: string
      loc: string
    }
  }[]
}
declare function splitOnFirst(str: string, sep: string): [string, string]
/**
 * Replaces specific relative links in a string with absolute UCSC genome links.
 * This is typically used for HTML content from UCSC track databases.
 * @param htmlContent The string containing HTML content.
 * @returns The string with replaced links.
 */
declare function replaceLink(htmlContent: string): string
/**
 * Decodes a URI component, gracefully handling malformed URIs.
 * @param uri The URI component to decode.
 * @returns The decoded URI component, or the original URI if decoding fails.
 */
declare function decodeURIComponentNoThrow(uri: string): string
declare function requireArg(arg: string | undefined, usage: string): string
/**
 * Splits a GenArk accession (e.g. GCF_000001405.40) into the path components
 * UCSC uses for hubs: { base: 'GCF', b1, b2, b3 } where b1/b2/b3 are 3-char
 * chunks of the digit portion. Returns undefined for malformed input.
 */
declare function accessionChunks(accession: string):
  | {
      base: string
      b1: string
      b2: string
      b3: string
    }
  | undefined
//#endregion
export {
  Adapter,
  AnnotationInfo,
  ChainTrack,
  HierarchicalConfig,
  JBrowseConfig,
  JBrowseConfiguration,
  JBrowsePlugin,
  NCBIDatasetsReport,
  NCBIDatasetsResponse,
  Track,
  UCSCGenArkAssemblyEntry,
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
