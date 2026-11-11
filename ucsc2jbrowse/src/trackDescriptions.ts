import fs from 'node:fs'
import path from 'node:path'

import { writeIfChanged } from 'hubtools'

import {
  DESCRIPTIONS,
  descriptionAnchor,
  descriptionFile,
  linkedDescription,
} from './descriptionLink.ts'

import type { FinalizeStep } from './utils/finalizeStep.ts'

/**
 * trackDb prose is written to render inside this page, so its relative links
 * (`hgTables`, `../goldenPath/help/…`) resolve against it.
 */
const UCSC_TRACK_PAGE = 'https://genome.ucsc.edu/cgi-bin/hgTrackUi'
const LINK_ATTRIBUTE =
  /\b(href|src)(\s*=\s*)(?:"([^"]*)"|'([^']*)'|([^\s"'>]+))/gi
const ACTIVE_MARKUP = [
  /<\s*(?:script|iframe|form)\b/i,
  /<[^>]*\son[a-z]+\s*=/i,
  /javascript\s*:/i,
]

/**
 * The page is served as html from jbrowse.org, the hosted app's own origin, so
 * it runs nothing and submits nothing even when opened on its own.
 */
const HEAD = [
  '<!doctype html>',
  '<meta charset="utf-8">',
  `<meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src https: http: data:; style-src 'unsafe-inline'; form-action 'none'">`,
].join('\n')

/** Whether prose has a script, frame, form, event handler or script url. */
export function hasActiveMarkup(html: string) {
  return ACTIVE_MARKUP.some(pattern => pattern.test(html))
}

function absoluteLink(value: string) {
  return value.startsWith('#') || !URL.canParse(value, UCSC_TRACK_PAGE)
    ? undefined
    : new URL(value, UCSC_TRACK_PAGE).href
}

/**
 * A track's trackDb prose as a page of its own, each link and image resolved
 * against the UCSC page it was written for, so it reads the same wherever it
 * is served from. An in-page `#anchor` stays one.
 */
export function descriptionPage(db: string, track: string, html: string) {
  const body = html
    .replaceAll('\\', ' ')
    .replaceAll(
      LINK_ATTRIBUTE,
      (
        match: string,
        name: string,
        equals: string,
        double?: string,
        single?: string,
        bare?: string,
      ) => {
        const link = absoluteLink(double ?? single ?? bare ?? '')
        return link === undefined ? match : `${name}${equals}"${link}"`
      },
    )
  return `${HEAD}\n<title>${encodeURIComponent(db)} ${encodeURIComponent(track)}</title>\n${body.trim()}\n`
}

/**
 * Writes `descriptions/<track>.html` for every trackDb page a track of the
 * finished config links, and removes the pages none links any more. Inlined in
 * `metadata.ucsc.html`, the prose was 46% of the configs' bytes. A page with
 * active markup is not written and its tracks lose their link, so one upstream
 * edit costs a description and not the assembly's build. A build with
 * `--out-root` writes the pages there, beside its configs.
 */
export const writeTrackDescriptions = (outRoot?: string): FinalizeStep => ({
  name: 'track descriptions',
  run: ({ assemblyName, tracksDb, config, dir: builtDir }) => {
    const anchors = new Set(
      config.tracks.flatMap(track => {
        const html = track.metadata?.ucsc?.html
        return typeof html === 'string' &&
          linkedDescription(html)?.db === assemblyName
          ? [html]
          : []
      }),
    )
    const linked = Object.entries(tracksDb ?? {}).filter(([track]) =>
      anchors.has(descriptionAnchor(assemblyName, track)),
    )
    if (linked.length !== anchors.size) {
      throw new Error(
        `${assemblyName}: ${anchors.size} description links, ${linked.length} trackDb pages for them`,
      )
    }
    const refused = new Set(
      linked
        .filter(([, entry]) => hasActiveMarkup(entry.html))
        .map(([track]) => descriptionAnchor(assemblyName, track)),
    )
    for (const track of config.tracks) {
      const ucsc = track.metadata?.ucsc
      if (ucsc && typeof ucsc.html === 'string' && refused.has(ucsc.html)) {
        console.warn(
          `${track.trackId}: trackDb html has a script, frame, form, event handler or script url; not linking it`,
        )
        delete ucsc.html
      }
    }
    const pages = linked.filter(
      ([track]) => !refused.has(descriptionAnchor(assemblyName, track)),
    )
    const dir = path.join(
      outRoot ? path.join(outRoot, assemblyName) : builtDir,
      DESCRIPTIONS,
    )
    const written = pages.filter(([track, entry]) =>
      writeIfChanged(
        path.join(dir, descriptionFile(track)),
        descriptionPage(assemblyName, track, entry.html),
      ),
    )
    const wanted = new Set(pages.map(([track]) => descriptionFile(track)))
    const stale = fs.existsSync(dir)
      ? fs.readdirSync(dir).filter(file => !wanted.has(file))
      : []
    for (const file of stale) {
      fs.rmSync(path.join(dir, file))
    }
    return Object.fromEntries(
      [
        ['linked', pages.length] as const,
        ['written', written.length] as const,
        ['removed', stale.length] as const,
        ['refused', refused.size] as const,
      ].filter(([, n]) => n > 0),
    )
  },
})
