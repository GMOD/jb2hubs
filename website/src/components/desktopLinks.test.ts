import assert from 'node:assert'
import { test } from 'node:test'

import { desktopUrl, syntenyViewUrl } from './jbrowseLinks.ts'
import { HPRC_DATASET } from './pangenomeDataset.ts'
import {
  graphBrowserUrl,
  graphVcfLgvUrl,
  referenceSyntenyUrl,
} from './pangenomeLinks.ts'
import { PANGENOME_LOCI } from './pangenomeLoci.ts'

// Guards the jbrowse:// launch links against the two ways they break silently.
// Desktop's parser lives in another repo and cannot be imported here, so this
// asserts the properties that parser depends on rather than re-running it. Once
// `@jbrowse/app-core` 5.0 is published, importing its `parseSessionSpecUrl` and
// feeding it each url below turns these into an end-to-end check.

// A jbrowse:// link travels through argv on Windows and Linux, so an oversized
// one is dropped by the OS rather than reported. The largest real link today is
// ~1.9kB; this leaves 4x headroom and still fires long before any platform
// limit. A breach means a builder started inlining a payload into the spec
// (precomputed data belongs in a hosted config or a fetched file, not the url).
const MAX_PROTOCOL_URL_LENGTH = 8000

// Every launch url the site can hand to Desktop, built from the real datasets
// rather than fixtures, so a change to a builder or a dataset is covered here
// without anyone remembering to update a list of examples.
function everyLaunchUrl() {
  return [
    graphBrowserUrl(HPRC_DATASET),
    ...PANGENOME_LOCI.flatMap(locus => [
      graphVcfLgvUrl(HPRC_DATASET, locus),
      referenceSyntenyUrl(HPRC_DATASET, locus),
    ]),
    syntenyViewUrl(
      [
        { assembly: 'hg38', loc: 'chr6:29,700,000-33,500,000' },
        { assembly: 'hs1' },
      ],
      ['hg38_to_hs1_liftOver'],
      { colorBy: 'query', drawCurves: true, autoDiagonalize: true },
    ),
  ].filter(url => url !== undefined)
}

test('desktopUrl round-trips the launch url unchanged', () => {
  // the query separators and the spec's own JSON braces are what a naive
  // wrapper mangles, so round-trip a url carrying both
  const web =
    'https://jbrowse.org/code/jb2/main/?config=https://x/c.json&session=spec-{"views":[]}'
  assert.equal(
    new URL(desktopUrl(web)).searchParams.get('url'),
    web,
    'the wrapped url must come back out byte-identical',
  )
})

// The round trip above holds for any self-consistent wrapper, including ones
// Desktop would not recognize — it only proves this file agrees with itself.
// What has to hold is that the bytes match Desktop's `toProtocolUrl`, which
// lives in another repo and cannot be imported, so pin the exact form instead:
// the scheme, the `open` authority, and a single fully-encoded `url` parameter.
test('desktopUrl emits the exact form Desktop parses', () => {
  assert.equal(
    desktopUrl('https://jbrowse.org/x/?a=1&b=2'),
    'jbrowse://open?url=https%3A%2F%2Fjbrowse.org%2Fx%2F%3Fa%3D1%26b%3D2',
  )
})

// Renamed off "produces a link Desktop will accept", which claimed more than it
// checks. Only the scheme is something Desktop reads, and it matches that
// case-insensitively off the bare `jbrowse:` prefix, so even the `//` is ours to
// choose. `open` is not read AT ALL: it sits in the hostname slot of a url that
// has no host, and Desktop takes `jbrowse://anything?url=…` identically — see
// parseProtocolUrl in products/jbrowse-desktop/electron/launchTarget.ts, which
// explains why checking it would be a mistake rather than an oversight.
//
// Asserted anyway, because a future second action goes in a query param beside
// `url=` rather than in this slot. That makes the word `open` permanent, so a
// change to it is a change of mind and worth failing on.
test('desktopUrl keeps the scheme, and the vestigial open authority', () => {
  const url = new URL(desktopUrl('https://jbrowse.org/code/jb2/main/?x=1'))
  assert.equal(url.protocol, 'jbrowse:')
  assert.equal(url.host, 'open')
})

test('every launch url is a spec session Desktop can expand', () => {
  for (const url of everyLaunchUrl()) {
    const params = new URL(url).searchParams
    const session = params.get('session')
    assert.ok(session, `${url} carries no session`)
    assert.ok(session.startsWith('spec-'), `${url} is not a spec- session`)
    // a share-/encoded-/local- session is rejected outright by Desktop, and a
    // spec with no `views` list builds an empty session that reads as a silent
    // failure
    const spec: unknown = JSON.parse(session.slice('spec-'.length))
    assert.ok(
      spec !== null &&
        typeof spec === 'object' &&
        Array.isArray((spec as { views?: unknown }).views),
      `${url} has no views list`,
    )
    // Most configs here are site-relative (/ucsc/hg38/config.json) on purpose:
    // jbrowse.org serves both the app and the config bucket, so the path
    // resolves against the launch url's own origin. Desktop does that same
    // resolution (`new URL(config, link)`), so what has to hold is that the
    // result is a fetchable https url and not, say, a path that only resolves
    // inside genomes.jbrowse.org.
    const config = params.get('config')
    assert.ok(config, `${url} names no config`)
    const resolved = new URL(config, url)
    assert.equal(
      resolved.protocol,
      'https:',
      `${config} does not resolve to an https url`,
    )
    if (!config.startsWith('https://')) {
      // an absolute config can live anywhere (the merge API does); a relative
      // one only reaches data because jbrowse.org serves the app and the config
      // bucket from one origin, so it breaks the moment a launch is retargeted
      // off that host
      assert.equal(
        resolved.origin,
        'https://jbrowse.org',
        `relative config ${config} resolves to ${resolved.origin}, which does not serve our configs`,
      )
    }
  }
})

test('every launch url survives being wrapped as a jbrowse:// link', () => {
  for (const url of everyLaunchUrl()) {
    const wrapped = desktopUrl(url)
    assert.equal(new URL(wrapped).searchParams.get('url'), url)
    assert.ok(
      wrapped.length <= MAX_PROTOCOL_URL_LENGTH,
      `${wrapped.length} chars exceeds the ${MAX_PROTOCOL_URL_LENGTH} budget: ${url.slice(0, 120)}…`,
    )
  }
})
