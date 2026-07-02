/* eslint-disable no-console */
import * as fs from 'fs'

import { hubCategories } from 'hubtools'

// Drives the category picker in JBrowse Desktop's "available genomes"
// dialog. Generated from hubCategories (the same list that drives hub
// downloading/processing) so it can't drift out of sync with the real set
// of categories, the way the old hand-uploaded categories.json did.
const categories = [
  {
    key: 'ucsc',
    title: 'UCSC Main Genomes',
    url: 'https://jbrowse.org/processedHubJson/ucsc.json',
  },
  ...hubCategories.map(c => ({
    key: c.id,
    title: c.title,
    url: `https://jbrowse.org/processedHubJson/${c.id}.json`,
  })),
]

// Written alongside make.sh/uploadAll.sh, not under processedHubJson/, since
// it's uploaded to a different S3 prefix (see uploadAll.sh) than the rest of
// that directory.
fs.writeFileSync('categories.json', JSON.stringify({ categories }, null, 2))
console.log(`Generated categories.json with ${categories.length} categories`)
