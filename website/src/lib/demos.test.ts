import assert from 'node:assert/strict'
import { readFileSync, readdirSync } from 'node:fs'
import { describe, it } from 'node:test'
import { fileURLToPath } from 'node:url'

import { BLOG_DEMOS, TOOL_DEMOS, blogDemos } from './demos.ts'

const blogDir = fileURLToPath(new URL('../content/blog/', import.meta.url))

const posts = readdirSync(blogDir)
  .filter(file => file.endsWith('.md'))
  .map(file => {
    const [, frontmatter = '', body = ''] = readFileSync(
      `${blogDir}${file}`,
      'utf8',
    ).split(/^---$/m)
    return {
      id: file.replace(/\.md$/, ''),
      body,
      data: {
        title: /^title: (.*)$/m.exec(frontmatter)?.[1] ?? '',
        date: /^date: '(.*)'$/m.exec(frontmatter)?.[1] ?? '',
      },
    }
  })

describe('blogDemos', () => {
  it('finds a caption and a live link for every listed figure', () => {
    const demos = blogDemos(posts)
    assert.equal(demos.length, BLOG_DEMOS.flatMap(pick => pick.images).length)
    for (const demo of demos) {
      assert.match(demo.live, /^(https:\/\/jbrowse\.org\/|\/)/)
      assert.ok(demo.caption.length > 10, demo.src)
    }
  })

  it('takes the after link, not the before link, under a before/after pair', () => {
    const gwas = blogDemos(posts).find(demo =>
      demo.src.endsWith('gwas-after.png'),
    )
    assert.match(gwas?.live ?? '', /tracks=hg38-gwasCatalog$/)
  })

  it('refuses a figure with no live link', () => {
    assert.throws(() =>
      blogDemos([
        {
          id: '2026-10-26-plots-and-rows',
          body: '![A picture](/blog-img/2026-10-26-plots-and-rows/gwas-after.png)',
          data: { title: 'Plots', date: '2026-10-26' },
        },
      ]),
    )
  })
})

describe('TOOL_DEMOS', () => {
  it('opens each tool on a same-site page', () => {
    for (const demo of TOOL_DEMOS) {
      assert.match(demo.href, /^\/[a-z-]+\//)
    }
  })
})
