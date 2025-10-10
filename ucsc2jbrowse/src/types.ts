export interface JBrowseConfig {
  configuration?: Record<string, unknown>
  tracks: {
    category?: string[]
    assemblyNames: string[]
    name: string
    metadata?: Record<string, unknown>
    trackId: string
    adapter: Record<string, unknown>
    // Add other common track properties if needed
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
  plugins?: unknown[]
  aggregateTextSearchAdapters?: Record<string, unknown>[]
}

export interface TrackDbEntry {
  tableName: string
  settings: string
  html: string
  longLabel: string
  grp: string
  shortLabel: string
  type: string
}
