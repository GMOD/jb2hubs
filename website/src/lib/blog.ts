interface PostModule {
  frontmatter: {
    title: string
    date: string
    [key: string]: unknown
  }
  default: unknown
}

export function getAllPosts() {
  const postModules = import.meta.glob<PostModule>('/src/_posts/*.md', {
    eager: true,
  })

  return Object.entries(postModules)
    .map(([path, module]) => {
      const filename = path.split('/').pop()!.replace('.md', '')
      return {
        id: filename,
        title: module.frontmatter.title,
        date: module.frontmatter.date,
      }
    })
    .sort((a, b) => b.date.localeCompare(a.date))
}
