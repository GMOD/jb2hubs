import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { describe, it } from 'node:test'
import { fileURLToPath } from 'node:url'

import { createStaticCatalog } from './syntenyCatalog.ts'
import {
  FEATURED_ASSEMBLIES,
  SYNTENY_EXAMPLES,
  availableExamples,
  featuredFirst,
} from './syntenyExamples.ts'

import type { SyntenyCatalogData } from './syntenyCatalog.ts'

const dataUrl = new URL('../syntenyTracks.json', import.meta.url)
const data = JSON.parse(
  readFileSync(fileURLToPath(dataUrl), 'utf8'),
) as SyntenyCatalogData
const catalog = createStaticCatalog(data)
const filter = { ucsc: true, genark: true }

describe('synteny examples', () => {
  it('every example is a pair the shipped catalog lists', () => {
    assert.deepEqual(
      availableExamples(catalog, filter).map(e => e.label),
      SYNTENY_EXAMPLES.map(e => e.label),
    )
  })

  it('drops an example whose partner is not listed', () => {
    const kept = availableExamples(catalog, filter, [
      { label: 'real', assembly: 'hg38', assembly2: 'mm39' },
      { label: 'fake', assembly: 'hg38', assembly2: 'notAnAssembly' },
    ])
    assert.deepEqual(
      kept.map(e => e.label),
      ['real'],
    )
  })

  it('drops UCSC examples when UCSC is unticked', () => {
    assert.equal(
      availableExamples(catalog, { ucsc: false, genark: true }).length,
      0,
    )
  })

  it('lists the featured assemblies first, then the rest in order', () => {
    const all = catalog.listAssemblies(filter)
    const listed = featuredFirst(all).map(a => a.id)
    assert.deepEqual(
      listed.slice(0, FEATURED_ASSEMBLIES.length),
      FEATURED_ASSEMBLIES,
    )
    assert.deepEqual(
      listed.slice(FEATURED_ASSEMBLIES.length),
      all.map(a => a.id).filter(id => !FEATURED_ASSEMBLIES.includes(id)),
    )
  })
})
