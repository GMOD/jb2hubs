/**
 * Percent-encodes a GFF3 attribute value.
 *
 * The delimiters (`;=&,`) are the obvious half. The control characters are the
 * half that was missing, and GFF3 requires them too: UCSC's ncbiRefSeqLink
 * ships raw ones. droPer1's rosy gene is FlyBase-named `Dper\ry`, and that `\r`
 * reached UCSC's table as an actual carriage return -- dm6 has 262 such rows.
 *
 * Left literal, a CR inside an attribute ends the line for any reader that
 * splits on it. `jbrowse text-index` uses readline, which does, so it saw a
 * fragment with fewer than 9 columns; `col9` came back undefined and
 * `parseAttributes` threw `Cannot read properties of undefined (reading
 * 'split')`. That is why droPer1 serves a 0-byte `.ix` with no `.ixx` today,
 * and dm6 only escapes it because its NCBI RefSeq GFF pass rebuilds the same
 * index afterwards from a different file.
 *
 * `%` is deliberately not encoded. UCSC pre-encodes its own delimiters (the
 * same row carries `note=...-RA%3B GL24383-RA`), so encoding it here would
 * double-encode every value that is already correct.
 */
export function encodeGffAttribute(s: string) {
  return s
    .replaceAll(';', '%3B')
    .replaceAll('=', '%3D')
    .replaceAll('&', '%26')
    .replaceAll(',', '%2C')
    .replaceAll('\r', '%0D')
    .replaceAll('\n', '%0A')
    .replaceAll('\t', '%09')
}
