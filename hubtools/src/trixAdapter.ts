// The adapter `jbrowse text-index` writes for an assembly's index, so replacing
// ours with the CLI's after indexing changes nothing
export function trixAdapter(name: string) {
  return {
    type: 'TrixTextSearchAdapter',
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
