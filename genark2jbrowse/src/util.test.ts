import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import { wikipediaImagesByTitle } from './util.ts'

const thumb = (source: string) => ({ source })

describe('wikipediaImagesByTitle', () => {
  const query = {
    normalized: [{ from: 'bos taurus', to: 'Bos taurus' }],
    redirects: [{ from: 'Bos taurus', to: 'Cattle' }],
    pages: {
      '26051975': { title: 'Cattle', thumbnail: thumb('https://x/cattle.jpg') },
      '-1': { title: 'Nopeus nopeus' },
      '40114': {
        title: 'Escherichia coli',
        thumbnail: thumb('https://x/e.jpg'),
      },
    },
  }
  const images = wikipediaImagesByTitle(query, [
    'bos taurus',
    'Nopeus nopeus',
    'Escherichia coli',
  ])

  it('follows a normalized title and then its redirect', () => {
    assert.deepEqual(images.get('bos taurus'), {
      imageUrl: 'https://x/cattle.jpg',
      pageUrl: 'https://wikipedia.org/wiki/bos taurus',
    })
  })

  it('maps a missing page to undefined', () => {
    assert.equal(images.get('Nopeus nopeus'), undefined)
    assert.ok(images.has('Nopeus nopeus'))
  })

  it('reads a page that needed no rewriting', () => {
    assert.equal(images.get('Escherichia coli')?.imageUrl, 'https://x/e.jpg')
  })

  it('answers every title when the query holds no pages', () => {
    const empty = wikipediaImagesByTitle(undefined, ['A b'])
    assert.ok(empty.has('A b'))
    assert.equal(empty.get('A b'), undefined)
  })
})
