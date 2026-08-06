/**
 * Splits a golden-path table dump into one string per record.
 *
 * A field's embedded newline is written as a trailing backslash, so a record
 * spans physical lines until one that does not end in a backslash. That
 * terminator line carries no content of its own: every record's last field
 * (`settings`) ends with an escaped newline, so the line that closes it is
 * empty.
 *
 * Lines are split on `\n` alone, with a trailing `\r` stripped so CRLF input
 * behaves the same. This used `readline`, which also treats a *lone* `\r` as a
 * line terminator -- and hg16 and hg17's trackDb each carry exactly one, inside
 * an html blob (`<H2>Credits</H2>\r\`). readline cut that one physical line in
 * two: the first half did not end in a backslash, so it closed the record
 * early, and the remainder opened a bogus one with every column shifted by
 * one -- an entry keyed by a paragraph of HTML, with `longLabel` holding the
 * settings blob and no `settings` field at all. That is what crashed
 * mergeMultiWigTracks' parseSettings and failed the whole build, and it stayed
 * hidden for as long as those two assemblies were never reprocessed.
 */
export function* splitTableRecords(text: string) {
  let current = ''
  for (const rawLine of text.split('\n')) {
    const line = rawLine.endsWith('\r') ? rawLine.slice(0, -1) : rawLine
    if (line.endsWith('\\')) {
      current += line.slice(0, -1) + '\n'
    } else if (current) {
      yield current
      current = ''
    }
  }
}
