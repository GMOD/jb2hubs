import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import {
  codingSegments,
  geneRows,
  parseGenePred,
  readLinkTable,
  readNcbiTranscripts,
  structureKey,
  transcriptRows,
} from './genePredToGff.ts'

import type { GenePred } from './genePredToGff.ts'

function genePred(fields: Partial<Record<string, string>>) {
  return parseGenePred({
    name: 'NM_1.1',
    name2: 'GENEA',
    chrom: 'chr1',
    strand: '+',
    txStart: '100',
    txEnd: '400',
    cdsStart: '110',
    cdsEnd: '390',
    exonStarts: '100,200,300,',
    exonEnds: '150,250,400,',
    ...fields,
  })!
}

function columns(line: string) {
  const f = line.split('\t')
  return { type: f[2], start: f[3], end: f[4], phase: f[7], attrs: f[8] }
}

describe('parseGenePred', () => {
  it('drops a row whose exon ends before it starts', () => {
    assert.equal(
      parseGenePred({
        name: 'NM_017037',
        chrom: 'chr1',
        txStart: '0',
        txEnd: '500',
        exonStarts: '0,300,',
        exonEnds: '100,200,',
      }),
      undefined,
    )
  })

  it('gives a transcript with no gene name a gene of its own', () => {
    assert.equal(genePred({ name2: '' }).gene, 'NM_1.1-gene')
  })
})

describe('codingSegments', () => {
  it('ends the CDS at cdsEnd, stop codon included', () => {
    const cds = codingSegments(genePred({}))
    assert.deepEqual(
      cds.map(c => [c.start, c.end]),
      [
        [110, 150],
        [200, 250],
        [300, 390],
      ],
    )
  })

  it('counts phase from cdsStart on the plus strand without exonFrames', () => {
    // 40 coding bases before the second exon leave it 1 base into a codon
    assert.deepEqual(
      codingSegments(genePred({})).map(c => c.phase),
      [0, 2, 0],
    )
  })

  it('counts phase from cdsEnd on the minus strand', () => {
    // read from the right: 90 bases, then 50, then 40
    assert.deepEqual(
      codingSegments(genePred({ strand: '-' })).map(c => c.phase),
      [1, 0, 0],
    )
  })

  // A ribosomal slippage site: the frames NCBI records differ from what
  // counting bases would give, and the table's frames win.
  it('takes phase from exonFrames when the table has them', () => {
    assert.deepEqual(
      codingSegments(genePred({ exonFrames: '0,0,2,' })).map(c => c.phase),
      [0, 0, 1],
    )
  })

  it('falls back to counting when exonFrames mark a coding exon -1', () => {
    assert.deepEqual(
      codingSegments(genePred({ exonFrames: '0,-1,2,' })).map(c => c.phase),
      [0, 2, 0],
    )
  })

  it('writes no CDS for a non-coding transcript', () => {
    assert.deepEqual(
      codingSegments(genePred({ cdsStart: '400', cdsEnd: '400' })),
      [],
    )
  })
})

describe('transcriptRows', () => {
  const t: GenePred = genePred({})

  it('parents the transcript to its gene and its parts to the transcript', () => {
    const rows = transcriptRows(t, {
      source: 'ncbiRefSeq',
      geneId: 'GENEA',
    }).map(columns)
    assert.equal(rows[0]!.type, 'mRNA')
    assert.equal(
      rows[0]!.attrs,
      'ID=NM_1.1;Parent=GENEA;Name=NM_1.1;gene_id=GENEA;transcript_id=NM_1.1',
    )
    assert.deepEqual(
      rows.slice(1).map(r => [r.type, r.start, r.end, r.attrs]),
      [
        ['exon', '101', '150', 'Parent=NM_1.1'],
        ['exon', '201', '250', 'Parent=NM_1.1'],
        ['exon', '301', '400', 'Parent=NM_1.1'],
        ['CDS', '111', '150', 'Parent=NM_1.1'],
        ['CDS', '201', '250', 'Parent=NM_1.1'],
        ['CDS', '301', '390', 'Parent=NM_1.1'],
      ],
    )
  })

  it('takes the type from the Link gbkey', () => {
    const [first] = transcriptRows(
      genePred({ cdsStart: '400', cdsEnd: '400' }),
      {
        source: 's',
        geneId: 'GENEA',
        link: { gbkey: 'precursor_RNA', attributes: '' },
      },
    )
    assert.equal(columns(first!).type, 'primary_transcript')
  })

  it('copies NCBI type, tags and transl_except verbatim', () => {
    const rows = transcriptRows(t, {
      source: 's',
      geneId: 'GENEA',
      ncbi: {
        type: 'mRNA',
        attributes: 'tag=MANE Select',
        translExcept: '(pos:301..303%2Caa:Sec)',
      },
    }).map(columns)
    assert.ok(rows[0]!.attrs!.endsWith(';tag=MANE Select'))
    assert.equal(
      rows.at(-1)!.attrs,
      'Parent=NM_1.1;transl_except=(pos:301..303%2Caa:Sec)',
    )
  })

  // hg16's encodeEgasp tables put a whole GTF attribute in `name`
  it('encodes a name holding GFF3 delimiters', () => {
    const [first] = transcriptRows(
      genePred({ name: 'transcript_id "ENr231_1";' }),
      {
        source: 's',
        geneId: 'GENEA',
      },
    )
    assert.ok(
      columns(first!).attrs!.startsWith('ID=transcript_id "ENr231_1"%3B;'),
    )
  })
})

describe('geneRows', () => {
  it('namespaces a gene named like a transcript', () => {
    const [row] = geneRows(
      [{ gene: 'X', chrom: 'chr1', strand: '+', start: 0, end: 10 }],
      g => `gene:${g}`,
      's',
    )
    assert.equal(columns(row!).attrs, 'ID=gene:X;Name=X;gene_id=X')
  })
})

describe('readLinkTable', () => {
  it('renames the gene name column and splits only gene_synonym', async () => {
    const link = await readLinkTable(
      ['id', 'name', 'product', 'gene_synonym', 'gbkey'],
      ['NM_1.1\tGENEA\tvariant 1, long\tA1,A2\tmRNA'],
    )
    assert.deepEqual(link.get('NM_1.1'), {
      gbkey: 'mRNA',
      attributes:
        'gene_name=GENEA;product=variant 1%2C long;gene_synonym=A1,A2;gbkey=mRNA',
    })
  })
})

describe('readNcbiTranscripts', () => {
  const gff = [
    '##gff-version 3',
    'NC_1\tRefSeq\tgene\t101\t400\t.\t+\t.\tID=gene-GENEA;Name=GENEA',
    'NC_1\tBestRefSeq\tmRNA\t101\t400\t.\t+\t.\tID=rna-NM_1.1;Parent=gene-GENEA;transcript_id=NM_1.1;tag=MANE Select;exception=annotated by transcript or proteomic data',
    'NC_1\tBestRefSeq\texon\t301\t400\t.\t+\t.\tID=exon-1;Parent=rna-NM_1.1',
    'NC_1\tBestRefSeq\texon\t101\t150\t.\t+\t.\tID=exon-2;Parent=rna-NM_1.1',
    'NC_1\tBestRefSeq\texon\t201\t250\t.\t+\t.\tID=exon-3;Parent=rna-NM_1.1',
    'NC_1\tBestRefSeq\tCDS\t111\t150\t.\t+\t0\tID=cds-1;Parent=rna-NM_1.1;transl_except=(pos:301..303%2Caa:Sec)',
    'NC_1\tRefSeq\tcDNA_match\t101\t400\t.\t+\t.\tID=abc;Target=NM_1.1 1 200 +',
  ]

  it('keys each transcript by its exact structure', async () => {
    const ncbi = await readNcbiTranscripts(gff)
    const t = genePred({})
    assert.deepEqual(
      ncbi.get(structureKey(t.name, t.txStart, t.txEnd, t.exons)),
      {
        type: 'mRNA',
        attributes:
          'tag=MANE Select;exception=annotated by transcript or proteomic data',
        translExcept: '(pos:301..303%2Caa:Sec)',
      },
    )
  })

  it('matches nothing when the same accession has other exons', async () => {
    const ncbi = await readNcbiTranscripts(gff)
    const t = genePred({ exonEnds: '150,260,400,' })
    assert.equal(
      ncbi.get(structureKey(t.name, t.txStart, t.txEnd, t.exons)),
      undefined,
    )
  })
})
