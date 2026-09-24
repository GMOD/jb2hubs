import { Fragment } from 'react'

import type { LaunchLink } from './pangenomeLinks.ts'

// A row of launches, one separator between each, for the loci table (rendered
// to static HTML) and the region box alike.
export default function PangenomeLaunchLinks({
  links,
}: {
  links: LaunchLink[]
}) {
  return links.map((l, i) => (
    <Fragment key={l.kind}>
      {i > 0 && ' · '}
      {l.newTab ? (
        <a
          href={l.url}
          target="_blank"
          rel="noreferrer"
        >
          {l.label}
        </a>
      ) : (
        <a href={l.url}>{l.label}</a>
      )}
    </Fragment>
  ))
}
