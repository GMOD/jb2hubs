import type { ReactNode } from 'react'

// A link that opens in a new tab, for the pages a result points out to (NCBI,
// Ensembl, a JBrowse launch) that a reader wants beside the answer rather than
// in place of it.
export default function ExternalLink({
  href,
  title,
  children,
}: {
  href: string
  title?: string
  children: ReactNode
}) {
  return (
    <a
      href={href}
      title={title}
      target="_blank"
      rel="noreferrer"
    >
      {children}
    </a>
  )
}
