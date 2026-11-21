import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import { blogFeed, postImages } from './blogPosts.ts'

describe('postImages', () => {
  it('reads markdown and html pictures in document order', () => {
    const body = [
      '<figure><a href="/a.png"><img src="/a.png" alt="First" loading="lazy" /></a></figure>',
      '![Second](/b.png)',
    ].join('\n')
    assert.deepEqual(
      postImages(body).map(({ src, alt }) => ({ src, alt })),
      [
        { src: '/a.png', alt: 'First' },
        { src: '/b.png', alt: 'Second' },
      ],
    )
  })
})

describe('blogFeed', () => {
  it('groups posts by year, newest first, with a frontmatter image winning', () => {
    const years = blogFeed([
      { id: 'old', body: '', data: { title: 'Old', date: '2025-11-07' } },
      {
        id: 'new',
        body: '![x](/first.png)',
        data: { title: 'New', date: '2026-10-26', image: '/chosen.png' },
      },
      {
        id: 'mid',
        body: '![x](/first.png)',
        data: { title: 'Mid', date: '2026-03-17' },
      },
    ])
    assert.deepEqual(
      years.map(({ year, posts }) => [year, posts.map(post => post.title)]),
      [
        ['2026', ['New', 'Mid']],
        ['2025', ['Old']],
      ],
    )
    assert.deepEqual(
      years.flatMap(({ posts }) => posts.map(({ day, image }) => [day, image])),
      [
        ['Oct 26', '/chosen.png'],
        ['Mar 17', '/first.png'],
        ['Nov 7', undefined],
      ],
    )
  })
})
