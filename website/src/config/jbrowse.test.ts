import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import {
  genarkConfigPath,
  stagingSibling,
  ucscAllConfigPath,
  ucscConfigPath,
} from './jbrowse.ts'

// The staging config has to be a sibling of the production one — same directory,
// different filename — because the config's relative data uris resolve against
// its own URL. A test that lets the suffix land anywhere else would let that
// break silently.
describe('stagingSibling', () => {
  it('suffixes the basename, not the directory', () => {
    assert.equal(
      stagingSibling('config.json', true),
      'config-staging.json',
      'per-assembly config',
    )
    assert.equal(stagingSibling('all.json', true), 'all-staging.json')
  })

  it('is the identity off staging', () => {
    assert.equal(stagingSibling('config.json', false), 'config.json')
    assert.equal(stagingSibling('all.json', false), 'all.json')
  })
})

// features.staging reads import.meta.env, which is undefined under the node test
// runner, so these exercise the production branch.
describe('config paths', () => {
  it('addresses UCSC assemblies by db name', () => {
    assert.equal(ucscConfigPath('hg38'), '/ucsc/hg38/config.json')
    assert.equal(ucscAllConfigPath(), '/ucsc/all.json')
  })

  it('shards GenArk accessions by digit triples', () => {
    assert.equal(
      genarkConfigPath('GCF_000298275.1'),
      '/hubs/genark/GCF/000/298/275/GCF_000298275.1/config.json',
    )
  })
})
