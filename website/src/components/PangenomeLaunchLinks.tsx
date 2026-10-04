import { Fragment } from 'react'

import type { LaunchLink } from './pangenomeLinks.ts'

// A row of launches, one separator between each, for the loci table (rendered
// to static HTML) and the region box alike. Each launch carries the separator
// after it, so a row that wraps breaks between launches and no line opens on
// a separator.
export default function PangenomeLaunchLinks({
  links,
}: {
  links: LaunchLink[]
}) {
  return links.map((l, i) => {
    const more = i < links.length - 1
    return (
      <Fragment key={l.kind}>
        <span style={{ whiteSpace: 'nowrap' }}>
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
          {more && ' ·'}
        </span>
        {more && ' '}
      </Fragment>
    )
  })
}
