export interface PostSource {
  id: string
  body?: string
  data: { title: string; date: string; description?: string; image?: string }
}

export interface PostImage {
  src: string
  alt: string
  start: number
  end: number
}

const IMAGE =
  /!\[(?<mdAlt>[^\]]*)\]\((?<mdSrc>[^)\s]+)\)|<img\s(?<attrs>[^>]*)>/g

function attribute(attrs: string, name: string) {
  return new RegExp(`\\b${name}="([^"]*)"`).exec(attrs)?.[1]
}

export function postImages(body: string): PostImage[] {
  return [...body.matchAll(IMAGE)].flatMap(match => {
    const { mdAlt, mdSrc, attrs } = match.groups ?? {}
    const src = mdSrc ?? (attrs ? attribute(attrs, 'src') : undefined)
    const alt = mdAlt ?? (attrs ? attribute(attrs, 'alt') : undefined) ?? ''
    return src
      ? [{ src, alt, start: match.index, end: match.index + match[0].length }]
      : []
  })
}

export const postHref = (id: string) => `/blog/${id}/`

// Newest first, grouped by year. A post's thumbnail is its frontmatter image,
// or else its first picture.
export function blogFeed(posts: PostSource[]) {
  const years: { year: string; posts: ReturnType<typeof feedPost>[] }[] = []
  for (const post of posts.toSorted((a, b) =>
    b.data.date.localeCompare(a.data.date),
  )) {
    const year = post.data.date.slice(0, 4)
    if (years.at(-1)?.year !== year) {
      years.push({ year, posts: [] })
    }
    years.at(-1)?.posts.push(feedPost(post))
  }
  return years
}

function feedPost(post: PostSource) {
  return {
    href: postHref(post.id),
    title: post.data.title,
    date: post.data.date,
    day: new Date(`${post.data.date}T00:00:00Z`).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      timeZone: 'UTC',
    }),
    description: post.data.description,
    image: post.data.image ?? postImages(post.body ?? '')[0]?.src,
  }
}
