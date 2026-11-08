// GFF3's attribute column as the pangenome pages write it (the known alleles,
// OMIA's cattle variants) and read it (the reference's genes, CAT's and
// Liftoff's gene models).

// GFF3's reserved characters, and the comma, which would split a value into a
// list.
const escapeGff = (value: string) =>
  value.replace(
    /[%;=&,\t\n]/g,
    c => `%${c.charCodeAt(0).toString(16).toUpperCase().padStart(2, '0')}`,
  )

// GFF3 escapes a reserved character in a value as %XX: NCBI names
// Arabidopsis's CYCA2;3 `CYCA2%3B3`.
const unescapeGff = (value: string) =>
  value.includes('%')
    ? value.replaceAll(/%([0-9A-Fa-f]{2})/g, (_, hex: string) =>
        String.fromCharCode(Number.parseInt(hex, 16)),
      )
    : value

export const gffAttributes = (pairs: [string, string | string[]][]) =>
  pairs
    .map(
      ([k, v]) =>
        `${k}=${(Array.isArray(v) ? v : [v]).map(escapeGff).join(',')}`,
    )
    .join(';')

// One attribute's value, found without splitting the column: CAT repeats a
// ~30-field block on every exon and CDS row of a 3.3 GB file.
export function gffAttribute(column: string, key: string) {
  const prefix = `${key}=`
  const first = column.startsWith(prefix)
  const at = first ? 0 : column.indexOf(`;${prefix}`) + 1
  const from = at + prefix.length
  const to = column.indexOf(';', from)
  return first || at > 0
    ? unescapeGff(column.slice(from, to === -1 ? undefined : to))
    : undefined
}
