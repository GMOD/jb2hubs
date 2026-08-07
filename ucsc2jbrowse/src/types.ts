import type { JBrowsePlugin } from 'hubtools'

export type { JBrowsePlugin }

export interface DefaultSession {
  name: string
  views: {
    id: string
    type: string
    init: {
      loc: string
      assembly: string
      // Optional because two producers disagree, and only one of them is in
      // this package. generateDefaultSessions writes an array (empty when the
      // assembly has no gene track it recognizes), but hubtools'
      // makeDefaultSession -- what generateJBrowseConfigForAssemblyHub and
      // generateJBrowseConfigsForMultiGenomeHub emit -- writes an init with no
      // `tracks` key at all, and generateDefaultSessions only runs for
      // assemblies list.json still names. Declaring it required did not make it
      // present; it just moved the failure to runtime, where minimalTracks'
      // `for (const trackId of view.init.tracks)` throws on a session hubtools
      // built. Consumers must treat it as absent.
      tracks?: string[]
    }
  }[]
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
}

export interface JBrowseConfig {
  configuration?: Record<string, unknown>
  defaultSession?: DefaultSession
  tracks: {
    category?: string[]
    assemblyNames: string[]
    name: string
    metadata?: {
      addedByJBrowseTeam?: boolean
      ucsc?: Record<string, unknown>
    }
    trackId: string
    description?: string
    adapter: Record<string, unknown>
  }[]
  assemblies: {
    name: string
    displayName?: string
    aliases?: string[]
    sequence?: {
      type: string
      trackId: string
      metadata?: Record<string, unknown>
      adapter: Record<string, unknown> // This is the sequence adapter
    }
    refNameAliases?: { adapter: Record<string, unknown> }
    cytobands?: { adapter: Record<string, unknown> }
    geneticCodes?: Record<string, number>
  }[]
  // Reuses hubtools' JBrowsePlugin rather than restating `{ name }`: `url` is
  // not decoration, it is the one field that can kill a whole session
  // (PluginLoader runs Promise.all over the list). Declaring it away here meant
  // mergeAll could not tell two entries for the same plugin apart -- see the
  // dedupe in mergeAll.ts.
  plugins?: JBrowsePlugin[]
  aggregateTextSearchAdapters?: ({ textSearchAdapterId: string } & Record<
    string,
    unknown
  >)[]
}

/**
 * A hand-authored overlay from `ucscExtensions/`, merged into a generated
 * config by makeUcscExtensions.ts.
 *
 * Distinct from JBrowseConfig because the two are not the same artifact. A
 * generated config always has `assemblies` and `tracks`; an extension is a
 * patch, and every section of it is optional -- hg19.json and hg38.json ship
 * `assemblies: []`, and an extension that only adds tracks has no `assemblies`
 * key at all. Typing these as a full JBrowseConfig is what let
 * `extensionConfig.tracks.map(...)` and `extensionConfig.assemblies[0]`
 * typecheck against a file that has neither.
 */
export type ConfigExtension = Partial<JBrowseConfig>

/**
 * An entry exactly as `api.genome.ucsc.edu/list/ucscGenomes` returns it, which
 * make.sh saves as `list.json.raw`. Every field named here was present on all
 * 236 entries as of 2026-08-05; the index signature covers the rest.
 *
 * Note what is NOT here: the raw response has no `id`, `name` or `accession`.
 * transformGenomeList.ts stamps those on, which is what makes the entries below
 * usable on their own -- so UcscGenome describes the transformed list.json, and
 * anything reading the raw file wants this type instead.
 */
export interface UcscGenomeRaw {
  organism: string
  description: string
  defaultPos: string
  scientificName: string
  sourceName: string
  nibPath: string
  taxId: number
  [key: string]: unknown
}

/** An entry of list.json's `ucscGenomes`, as served by api.genome.ucsc.edu. */
export interface UcscGenome {
  id: string
  description: string
  defaultPos: string
  organism?: string
  [key: string]: unknown
}

export interface UcscGenomeList {
  ucscGenomes: Record<string, UcscGenome>
}

// One entry per URL we have HEAD'd, blocked and accessible alike — an
// accessible entry is what suppresses the re-probe for 90 days.
export type FileAccessCache = Record<
  string,
  {
    lastChecked: number
    blocked: boolean
    trackName?: string
  }
>

export interface TrackDbEntry {
  tableName: string
  settings: string
  html: string
  longLabel: string
  grp: string
  shortLabel: string
  type: string
}
