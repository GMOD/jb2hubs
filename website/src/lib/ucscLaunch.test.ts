import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import { stringToJexlExpression } from '@jbrowse/core/util/jexlStrings'
import { UCSC_LAUNCH_URL, ucscFormatDetails } from 'hubtools'

import { ucscLaunchUrl } from './ucscLaunch.ts'

const JB = 'https://jbrowse.org/code/jb2/main/?config='
const defaults = { mm39: ['mm39-ncbiRefSeq'], hg38: ['hg38-ncbiRefSeq'] }

describe('ucscLaunchUrl', () => {
  it('opens the position with the defaultSession tracks plus the shown one', () => {
    assert.equal(
      ucscLaunchUrl(
        '?db=mm39&position=chr11:69471173-69482698&ncbiOrtho=pack',
        defaults,
      ),
      `${JB}%2Fucsc%2Fmm39%2Fconfig.json&assembly=mm39&loc=chr11%3A69471173-69482698&tracks=mm39-ncbiRefSeq,mm39-ncbiOrtho`,
    )
  })

  it('keeps a position with commas for JBrowse to parse', () => {
    assert.match(
      ucscLaunchUrl('?db=hg38&position=chr1:168,110,001-168,220,000', defaults),
      /&loc=chr1%3A168%2C110%2C001-168%2C220%2C000&/,
    )
  })

  it('ignores settings that are not a visibility, and hide', () => {
    const url = ucscLaunchUrl(
      '?db=hg38&position=chr1:1-2&hgsid=123&knownGene=hide&cons=full',
      defaults,
    )
    assert.match(url, /&tracks=hg38-ncbiRefSeq,hg38-cons$/)
  })

  it('does not list a track twice', () => {
    assert.match(
      ucscLaunchUrl('?db=hg38&ncbiRefSeq=pack', defaults),
      /&tracks=hg38-ncbiRefSeq$/,
    )
  })

  it('sends a db we do not host to UCSC', () => {
    assert.equal(
      ucscLaunchUrl('?db=danRer11&position=chr5:1-2', defaults),
      'https://genome.ucsc.edu/cgi-bin/hgTracks?db=danRer11&position=chr5%3A1-2',
    )
    assert.match(
      ucscLaunchUrl('?db=constructor', defaults),
      /^https:\/\/genome\.ucsc\.edu\//,
    )
  })
})

// The chain a reader clicks through: the config's formatDetails, evaluated by
// JBrowse's own jexl on a real ncbiOrtho row (hg38 TP53), then this page. The
// details panel hands the callback the feature as a plain object, not a Feature
// with get(), which is what the context here is.
describe('ncbiOrtho links', () => {
  const url =
    'zebrafish:<a href="hgTracks?db=danRer11&position=chr5:24086226-24097804&ncbiOrtho=pack">tp53</a><br>' +
    'mouse:<a href="hgTracks?db=mm39&position=chr11:69471173-69482698&ncbiOrtho=pack">Trp53</a><br>'

  const formatted = stringToJexlExpression(
    ucscFormatDetails({ track: 'ncbiOrtho' }, undefined)!.feature!,
  ).eval({ feature: { url } }) as { url: string }
  const hrefs = [...formatted.url.matchAll(/href="([^"]+)"/g)].map(m => m[1]!)

  it('makes every link absolute, on this page', () => {
    assert.equal(hrefs.length, 2)
    for (const href of hrefs) {
      assert.ok(href.startsWith(`${UCSC_LAUNCH_URL}?db=`), href)
    }
    assert.equal(new URL(UCSC_LAUNCH_URL).pathname, '/ucsc/launch/')
  })

  it('leaves a feature without the column alone', () => {
    const empty = stringToJexlExpression(
      ucscFormatDetails({ track: 'ncbiOrtho' }, undefined)!.feature!,
    ).eval({ feature: {} }) as { url?: string }
    assert.equal(empty.url, undefined)
  })

  it('lands on the ortholog in our config', () => {
    assert.equal(
      ucscLaunchUrl(new URL(hrefs[1]!).search, defaults),
      `${JB}%2Fucsc%2Fmm39%2Fconfig.json&assembly=mm39&loc=chr11%3A69471173-69482698&tracks=mm39-ncbiRefSeq,mm39-ncbiOrtho`,
    )
  })
})
