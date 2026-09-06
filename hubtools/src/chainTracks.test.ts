import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import { isAccession, normalizeAssemblyName } from './chainTracks.ts'

describe('normalizeAssemblyName', () => {
  it('lowercases the first letter of a UCSC name', () => {
    assert.equal(normalizeAssemblyName('Hg38'), 'hg38')
    assert.equal(normalizeAssemblyName('Mm39'), 'mm39')
  })

  it('leaves a bare accession alone', () => {
    assert.equal(normalizeAssemblyName('GCF_000001735.4'), 'GCF_000001735.4')
  })

  // GCF_000001735.4's hub has a chain to GCF_000001735.3_TAIR10, which is the
  // asmId of the hub we publish as GCF_000001735.3. Left as the asmId, its
  // synteny track named an assembly nothing declares.
  it('reduces an asmId-spelled accession to the accession', () => {
    assert.equal(
      normalizeAssemblyName('GCF_000001735.3_TAIR10'),
      'GCF_000001735.3',
    )
    assert.equal(
      normalizeAssemblyName('GCA_003448975.1_ASM344897v1'),
      'GCA_003448975.1',
    )
  })

  it('recognizes both accession prefixes and nothing else', () => {
    assert.equal(isAccession('GCF_000001735.4'), true)
    assert.equal(isAccession('GCA_003448975.1'), true)
    assert.equal(isAccession('hg38'), false)
  })
})
