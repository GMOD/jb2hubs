// A `rows` or `facet` order as JBrowse reads it: `sort`, and `domain`, the
// name a host before jbrowse-components 9687198b03 reads it by, which a newer
// host lifts to `sort`. Drop `domain` once the hosts this site opens carry
// `sort`.
export function rowOrder(names: string[]) {
  return { sort: names, domain: names }
}
