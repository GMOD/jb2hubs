export interface JBrowseConfig {
  configuration?: Record<string, unknown>
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
    sequence?: {
      type: string
      trackId: string
      metadata?: Record<string, unknown>
      adapter: Record<string, unknown> // This is the sequence adapter
    }
  }[]
  plugins?: { name: string }[]
  aggregateTextSearchAdapters?: ({ textSearchAdapterId: string } & Record<string, unknown>)[]
}

export type BlockedFileCache = Record<
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
