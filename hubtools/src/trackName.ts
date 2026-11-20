// what may stand between a set's label and the rest of a member's
const SEPARATOR = /^[\s:,–-]+(?=\S)/
const WORD = /[\p{L}\p{N}]/u

function withoutOpening(
  label: string,
  opening: string,
  isTaken: (label: string) => boolean,
) {
  const rest = label.slice(opening.length)
  const separator = SEPARATOR.exec(rest)
  const said = separator ? rest.slice(separator[0].length) : ''
  return label.toLowerCase().startsWith(opening.toLowerCase()) &&
    WORD.test(said) &&
    !isTaken(said)
    ? said
    : label
}

/**
 * A track's name from its ancestors' short labels and its own, outermost
 * first, joined by " - ". A label that opens with the one before it drops
 * those words, so the set is said once and still leads every member:
 * "ClinGen Haploinsufficiency" under "ClinGen" is
 * "ClinGen - Haploinsufficiency". A label stays whole when it only runs on
 * from the one before it ("dbVar Somatic SVs" under "dbVar Somatic SV"), when
 * what is left names nothing ("Riken CAGE +"), or when `isTaken` says another
 * track of the set already carries what is left.
 */
export function trackNameFromLabels(
  labels: (string | undefined)[],
  isTaken: (label: string) => boolean = () => false,
) {
  const said = [
    ...new Set(
      labels.filter(label => label !== undefined).filter(label => label !== ''),
    ),
  ]
  return said
    .map((label, i) => {
      const before = said[i - 1]
      return before === undefined
        ? label
        : withoutOpening(label, before, isTaken)
    })
    .join(' - ')
}
