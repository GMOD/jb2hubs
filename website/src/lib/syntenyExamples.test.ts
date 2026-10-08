import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { describe, it } from 'node:test'
import { fileURLToPath } from 'node:url'

import { rankOptions } from '../utils/rankOptions.ts'
import { createStaticCatalog } from './syntenyCatalog.ts'
import {
  FEATURED_ASSEMBLIES,
  SYNTENY_EXAMPLES,
  assemblyOptions,
  availableExamples,
  featuredFirst,
} from './syntenyExamples.ts'

import type { AssemblyInfo, SyntenyCatalogData } from './syntenyCatalog.ts'

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

describe('a species name picks its newest build', () => {
  const species: Record<string, [string, string, string[]]> = {
    Mouse: ['Mus musculus', 'ucsc', ['mm7', 'mm8', 'mm9', 'mm10', 'mm39']],
    Rat: ['Rattus norvegicus', 'ucsc', ['rn3', 'rn4', 'rn5', 'rn6', 'rn7']],
    Human: ['Homo sapiens', 'ucsc', ['hg19', 'hs1', 'hg38']],
    Horse: ['Equus caballus', 'ucsc', ['equCab2', 'equCab3']],
    'Deer mouse': [
      'Peromyscus maniculatus',
      'genark',
      ['GCF_003704035.1', 'GCA_948467765.1'],
    ],
    Chicken: ['Gallus gallus', 'ucsc', ['galGal6']],
  }
  const assemblyInfo: Record<string, AssemblyInfo> = {}
  for (const [commonName, [scientificName, source, ids]] of Object.entries(
    species,
  )) {
    for (const id of ids) {
      assemblyInfo[id] = {
        commonName,
        scientificName,
        source: source as AssemblyInfo['source'],
        geneTrack: '',
      }
    }
  }
  const fixture = createStaticCatalog({
    assemblyInfo,
    tracks: Object.keys(assemblyInfo)
      .filter(id => id !== 'galGal6')
      .map(id => ({
        trackId: `${id}_to_galGal6`,
        name: id,
        assemblyNames: [id, 'galGal6'],
      })),
  })
  const options = assemblyOptions(fixture.listAssemblies(filter))
  const top = (query: string) => rankOptions(query, options)[0]?.value

  it('"mouse" picks mm39', () => {
    assert.equal(top('mouse'), 'mm39')
  })

  it('"rat" picks rn7', () => {
    assert.equal(top('rat'), 'rn7')
  })

  it('"human" picks hg38', () => {
    assert.equal(top('human'), 'hg38')
  })

  it('an organism nothing features still lists its newest build first', () => {
    assert.deepEqual(
      rankOptions('horse', options).map(o => o.value),
      ['equCab3', 'equCab2'],
    )
  })

  it('GenArk assemblies of one organism keep their order', () => {
    assert.deepEqual(
      rankOptions('deer mouse', options).map(o => o.value),
      ['GCF_003704035.1', 'GCA_948467765.1'],
    )
  })

  it('an id still finds its assembly', () => {
    assert.equal(top('mm10'), 'mm10')
  })
})
