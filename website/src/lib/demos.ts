import { features } from '../config/features.ts'
import { PANGENOME_DATASETS } from '../pangenome/pangenomeDataset.ts'
import { postHref, postImages } from './blogPosts.ts'
import { SYNTENY_EXAMPLES } from './syntenyExamples.ts'

import type { PostSource } from './blogPosts.ts'

// The blog figures /demos shows, chosen by hand, newest post first. Each one's
// caption is its alt text and its live link the first "Open …" link after it,
// so a figure that loses either fails the build.
export const BLOG_DEMOS = [
  {
    post: '2026-10-26-plots-and-rows',
    images: [
      'gwas-after.png',
      'jaspar-after.png',
      'gnomad-after.png',
      'clinvar-after.png',
    ],
  },
  {
    post: '2026-10-14-color-keys',
    images: ['knownGene.png', 'censat.png'],
  },
  { post: '2026-10-12-protein-browser', images: ['tp53-alphamissense.png'] },
  { post: '2026-09-24-gene-search-genbank', images: ['narwhal-brca2.png'] },
  {
    post: '2026-07-24-encode-regulation',
    images: ['hg38-dnase-rows.png', 'hg19-lcr.png'],
  },
]

const OPEN_LINK =
  /\[(?<text>Open[^\]]*)\](?:\((?<url>[^)\s]+)\)|\[(?<ref>[^\]]+)\])/g

const escapeRegExp = (text: string) =>
  text.replaceAll(/[.*+?^${}()|[\]\\]/g, '\\$&')

function liveLink(body: string, from: number, to: number) {
  const match = [...body.slice(from, to).matchAll(OPEN_LINK)].find(
    link => link.groups?.text !== 'Open before',
  )
  const { url, ref } = match?.groups ?? {}
  return (
    url ??
    (ref
      ? new RegExp(`^\\[${escapeRegExp(ref)}\\]:\\s*(\\S+)`, 'm').exec(
          body,
        )?.[1]
      : undefined)
  )
}

export function blogDemos(posts: PostSource[]) {
  const byId = new Map(posts.map(post => [post.id, post]))
  return BLOG_DEMOS.flatMap(({ post: id, images }) => {
    const post = byId.get(id)
    if (!post) {
      throw new Error(`demos: no blog post ${id}`)
    }
    const body = post.body ?? ''
    const pictures = postImages(body)
    return images.map(file => {
      const src = `/blog-img/${id}/${file}`
      const index = pictures.findIndex(picture => picture.src === src)
      const picture = pictures[index]
      const live = picture
        ? liveLink(body, picture.end, pictures[index + 1]?.start ?? body.length)
        : undefined
      if (!picture?.alt || !live) {
        throw new Error(
          `demos: ${id}.md needs ${src} with alt text and an "Open …" link after it`,
        )
      }
      return {
        src,
        caption: picture.alt,
        live,
        postTitle: post.data.title,
        postHref: postHref(id),
      }
    })
  })
}

const human = PANGENOME_DATASETS.find(dataset => dataset.id === 'hprc')

// One example per tool, each a link that opens the tool on it.
export const TOOL_DEMOS = [
  {
    tool: 'Gene explorer',
    label: 'BRCA1 and its orthologs',
    href: '/gene/?gene=BRCA1',
  },
  ...SYNTENY_EXAMPLES.slice(0, 1).map(example => ({
    tool: 'Synteny browser',
    label: example.label,
    href: `/synteny/?${new URLSearchParams({
      assembly: example.assembly,
      assembly2: example.assembly2,
      gene: example.gene,
    })}`,
  })),
  {
    tool: 'Protein browser',
    label: 'TP53 beside its structure and a cross-species alignment',
    href: '/protein-browser/?gene=TP53&ref=9606',
  },
  {
    tool: 'Conserved gene order',
    label: 'HOXA13 and its neighbours across the species tree',
    href: '/conserved-gene-order/?gene=HOXA13',
  },
  ...(features.pangenome && human
    ? [
        {
          tool: 'Pangenomes',
          label: human.heading,
          href: `/pangenomes/${human.id}/`,
        },
      ]
    : []),
]
