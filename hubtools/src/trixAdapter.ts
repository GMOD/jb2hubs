// v4.3.0 requires `textSearchAdapterId` and fails the whole session without it
// ("No matching type for union"); v5 ignores it
export function trixAdapter(name: string) {
  return {
    type: 'TrixTextSearchAdapter',
    textSearchAdapterId: `${name}-index`,
    ixFilePath: { uri: `trix/${name}.ix`, locationType: 'UriLocation' },
    ixxFilePath: { uri: `trix/${name}.ixx`, locationType: 'UriLocation' },
    assemblyNames: [name],
  }
}

// An adapter is the index its .ix file is
export function trixIndexOf(adapter: Record<string, unknown>) {
  const ix = adapter.ixFilePath
  return typeof ix === 'object' && ix !== null && 'uri' in ix
    ? String(ix.uri)
    : JSON.stringify(adapter)
}

// `jbrowse text-index` from the v5 CLI rewrites its adapter without the id, so
// every config it touches goes back through this
export function addTrixAdapterIds(config: {
  aggregateTextSearchAdapters?: Record<string, unknown>[]
}) {
  let added = 0
  config.aggregateTextSearchAdapters = config.aggregateTextSearchAdapters?.map(
    adapter => {
      const name = /(?:^|\/)trix\/([^/]+)\.ix$/.exec(trixIndexOf(adapter))?.[1]
      if (
        adapter.type !== 'TrixTextSearchAdapter' ||
        adapter.textSearchAdapterId !== undefined ||
        name === undefined
      ) {
        return adapter
      }
      added++
      const { type, ...rest } = adapter
      return { type, textSearchAdapterId: `${name}-index`, ...rest }
    },
  )
  return added
}
