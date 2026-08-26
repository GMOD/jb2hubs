import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { describe, it } from 'node:test'
import zlib from 'node:zlib'

import {
  deriveNcbiAccessions,
  hasRefSeqAliases,
  parseAsmEquivalent,
  parseCuratedTsv,
} from './deriveNcbiAccessions.ts'

// Real rows, trimmed to the seven columns the parser reads.
const ASM_EQUIVALENT = [
  'bosTau9\tGCF_002263795.1_ARS-UCD1.2\tucsc\trefseq\t2211\t2211\t2211',
  'bosTau9\tGCA_002263795.2_ARS-UCD1.2\tucsc\tgenbank\t2210\t2211\t2211',
  'Bos_taurus.ARS-UCD1.2\tbosTau9\tensembl\tucsc\t2211\t2211\t2211',
  'galGal6\tGCF_000002315.6_GRCg6a\tucsc\trefseq\t464\t464\t455',
  'oryCun2\tGCF_000003625.3_OryCun2.0\tucsc\trefseq\t3242\t3242\t3100',
].join('\n')

function chromAliasDir(rows: string | undefined) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'jb2hubs-alias-'))
  if (rows !== undefined) {
    fs.writeFileSync(
      path.join(dir, 'chromAlias.txt.gz'),
      zlib.gzipSync(Buffer.from(rows)),
    )
  }
  return dir
}

const REFSEQ_ALIASES = 'NC_037328.1\tchr1\trefseq\n1\tchr1\tensembl\n'
const ENSEMBL_ONLY_ALIASES = '1\tchr1\tensembl\n10\tchr10\tensembl\n'

describe('parseAsmEquivalent', () => {
  it('keeps only ucsc<->refseq rows, in either direction', () => {
    const rows = parseAsmEquivalent(ASM_EQUIVALENT)
    assert.deepEqual(
      rows.get('bosTau9')?.map(r => r.accession),
      ['GCF_002263795.1'],
    )
  })

  it('flags a pair whose sequences do not all match', () => {
    const rows = parseAsmEquivalent(ASM_EQUIVALENT)
    assert.equal(rows.get('bosTau9')?.[0]?.exact, true)
    assert.equal(rows.get('galGal6')?.[0]?.exact, false)
  })

  it('splits the assembly name off the accession', () => {
    assert.equal(
      parseAsmEquivalent(ASM_EQUIVALENT).get('bosTau9')?.[0]?.assemblyName,
      'ARS-UCD1.2',
    )
  })
})

describe('hasRefSeqAliases', () => {
  it('is true when the alias table has a refseq row', () => {
    assert.equal(hasRefSeqAliases(chromAliasDir(REFSEQ_ALIASES)), true)
  })

  it('is false when no alias is a RefSeq name', () => {
    assert.equal(hasRefSeqAliases(chromAliasDir(ENSEMBL_ONLY_ALIASES)), false)
  })

  it('is false when the assembly publishes no alias table', () => {
    assert.equal(hasRefSeqAliases(chromAliasDir(undefined)), false)
  })

  it('reads a comma-joined source column', () => {
    // real cavPor3 shape: `DS562855.1  scaffold_0  genbank,ensembl`
    assert.equal(
      hasRefSeqAliases(chromAliasDir('NT_176419.1\tscaffold_0\trefseq,ncbi\n')),
      true,
    )
  })
})

describe('parseCuratedTsv', () => {
  it('skips comments and blank lines', () => {
    const curated = parseCuratedTsv(
      '# a comment\n\nhg38\tGCF_000001405.40\tGRCh38.p14\n',
    )
    assert.deepEqual([...curated.keys()], ['hg38'])
  })
})

describe('deriveNcbiAccessions', () => {
  const asmEquivalent = parseAsmEquivalent(ASM_EQUIVALENT)
  const derive = (
    genomes: Record<string, Record<string, string>>,
    {
      curated = new Map(),
      aliases = REFSEQ_ALIASES,
    }: { curated?: Map<string, any>; aliases?: string } = {},
  ) =>
    deriveNcbiAccessions({
      genomes,
      curated,
      asmEquivalent,
      dbDirFor: () => chromAliasDir(aliases),
    })

  it('reads a GenArk-backed alias out of its own nibPath', () => {
    // rn8: the accession is the hub the assembly was built from, not a claim
    const row = derive({
      rn8: {
        nibPath: 'hub:/gbdb/genark/GCF/036/323/735/GCF_036323735.1',
        description: 'Jan. 2024 (GRCr8/rn8)',
      },
    })[0]!
    assert.equal(row.accession, 'GCF_036323735.1')
    assert.equal(row.source, 'nibPath')
  })

  it('reads a native hub assembly out of its description', () => {
    const row = derive({
      mpxvRivers: {
        nibPath: 'hub:/gbdb/mpxvRivers/hubs',
        description: 'MPXV-M5312_HM12_Rivers (MT903340.1/GCF_014621545.1)',
      },
    })[0]!
    assert.equal(row.accession, 'GCF_014621545.1')
    assert.equal(row.source, 'description')
  })

  it('ignores the GenBank accession a golden-path sourceName names', () => {
    // hg38's GCA_000001405.15 is the submission, whose seqids a RefSeq GFF
    // never uses; without an asmEquivalent row there is nothing to fall back to
    assert.deepEqual(
      derive({
        hg38: {
          nibPath: '/gbdb/hg38',
          sourceName: 'GRCh38 Genome Reference Consortium (GCA_000001405.15)',
        },
      }),
      [],
    )
  })

  it('falls back to asmEquivalent for a golden-path assembly', () => {
    const row = derive({ bosTau9: { nibPath: '/gbdb/bosTau9' } })[0]!
    assert.equal(row.accession, 'GCF_002263795.1')
    assert.equal(row.source, 'asmEquivalent')
  })

  it('drops an asmEquivalent match the assembly cannot address', () => {
    // oryCun2 is equivalent to GCF_000003625.3 and aliases only Ensembl names,
    // so every NC_/NW_ seqid in that GFF would resolve to no refName
    assert.deepEqual(
      derive(
        { oryCun2: { nibPath: '/gbdb/oryCun2' } },
        { aliases: ENSEMBL_ONLY_ALIASES },
      ),
      [],
    )
  })

  it('keeps a partial sequence match, flagged', () => {
    const row = derive({ galGal6: { nibPath: '/gbdb/galGal6' } })[0]!
    assert.equal(row.accession, 'GCF_000002315.6')
    assert.equal(row.exact, false)
  })

  it('lets a curated row override the derived one', () => {
    const row = derive(
      { bosTau9: { nibPath: '/gbdb/bosTau9' } },
      {
        curated: new Map([
          [
            'bosTau9',
            { accession: 'GCF_002263795.3', assemblyName: 'ARS-UCD2.0' },
          ],
        ]),
      },
    )[0]!
    assert.equal(row.accession, 'GCF_002263795.3')
    assert.equal(row.source, 'curated')
  })

  it('lets a curated `-` turn an assembly off', () => {
    assert.deepEqual(
      derive(
        {
          rn8: { nibPath: 'hub:/gbdb/genark/GCF/036/323/735/GCF_036323735.1' },
        },
        { curated: new Map([['rn8', { accession: '-', assemblyName: '' }]]) },
      ),
      [],
    )
  })
})
