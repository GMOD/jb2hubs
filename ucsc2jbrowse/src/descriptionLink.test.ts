import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import {
  descriptionAnchor,
  descriptionFile,
  linkedDescription,
} from './descriptionLink.ts'

describe('linkedDescription', () => {
  it('reads back the db and path descriptionAnchor wrote', () => {
    assert.equal(
      descriptionAnchor('hg38', 'umap'),
      '<a href="https://jbrowse.org/ucsc/hg38/descriptions/umap.html">Track description</a>',
    )
    assert.deepEqual(linkedDescription(descriptionAnchor('hg38', 'umap')), {
      db: 'hg38',
      path: 'descriptions/umap.html',
    })
  })

  it('gives the on-disk name of a track whose name a url has to encode', () => {
    assert.equal(descriptionFile('a+b c'), 'a%2Bb%20c.html')
    assert.equal(
      descriptionAnchor('hg38', 'a+b c'),
      '<a href="https://jbrowse.org/ucsc/hg38/descriptions/a%252Bb%2520c.html">Track description</a>',
    )
    assert.deepEqual(linkedDescription(descriptionAnchor('hg38', 'a+b c')), {
      db: 'hg38',
      path: `descriptions/${descriptionFile('a+b c')}`,
    })
  })

  it("reads nothing from a hub's own link, a deeper path or a non-string", () => {
    assert.equal(
      linkedDescription(
        '<a href="https://hgdownload.soe.ucsc.edu/gbdb/hs1/hubs/public/cat.html">cat.html</a>',
      ),
      undefined,
    )
    assert.equal(
      linkedDescription(
        '<a href="https://jbrowse.org/ucsc/hg38/descriptions/x/umap.html">Track description</a>',
      ),
      undefined,
    )
    assert.equal(linkedDescription(undefined), undefined)
  })
})
