import assert from 'node:assert'
import { test } from 'node:test'

import { usefulComments } from './comments.ts'

// The 20,270-page byte-identical case.
const pgap =
  'The annotation was added by the NCBI Prokaryotic Genome Annotation Pipeline (PGAP). Information about PGAP can be found here: https://www.ncbi.nlm.nih.gov/genome/annotation_prok/'

test('usefulComments: a comment block that is only PGAP boilerplate disappears', () => {
  assert.equal(usefulComments(pgap), undefined)
})

test('usefulComments: the older PGAP wordings are boilerplate too', () => {
  assert.equal(
    usefulComments(
      'Annotation was added by the NCBI Prokaryotic Genome Annotation Pipeline (released 2013). Information about the Pipeline can be found here: http://www.ncbi.nlm.nih.gov/genome/annotation_prok/',
    ),
    undefined,
  )
  assert.equal(
    usefulComments(
      'Annotation of non-plasmid sequences was added by the NCBI Prokaryotic Genome Annotation Pipeline (released 2013). Information about the Pipeline can be found here: http://www.ncbi.nlm.nih.gov/genome/annotation_prok/',
    ),
    undefined,
  )
  assert.equal(
    usefulComments(
      'The annotation was added by the assembly submitters using the NCBI Prokaryotic Genome Annotation Pipeline (PGAP). Information about stand-alone PGAP can be found here: https://github.com/ncbi/pgap/',
    ),
    undefined,
  )
})

test('usefulComments: assembly-specific text survives, and the gap it leaves closes', () => {
  assert.equal(
    usefulComments(`Annotated at DFAST https://dfast.nig.ac.jp/\n\n\n${pgap}`),
    'Annotated at DFAST https://dfast.nig.ac.jp/',
  )
  assert.equal(
    usefulComments(`${pgap}\nJGI Project ID: 405913\n\n\nContacts: someone`),
    'JGI Project ID: 405913\n\nContacts: someone',
  )
})

test('usefulComments: prose that merely mentions PGAP mid-sentence is kept', () => {
  const prose =
    'Autoannotation was conducted using PGAP and MiGAP, and PGAP annotation was curated by referencing to the MiGAP annotation.'
  assert.equal(usefulComments(prose), prose)
})

test('usefulComments: empty and absent inputs', () => {
  assert.equal(usefulComments(undefined), undefined)
  assert.equal(usefulComments(''), undefined)
  assert.equal(usefulComments('   \n\n  '), undefined)
})
