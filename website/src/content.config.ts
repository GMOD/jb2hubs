import { glob } from 'astro/loaders'
import { z } from 'astro/zod'
import { defineCollection } from 'astro:content'

const blog = defineCollection({
  loader: glob({ pattern: '**/*.md', base: './src/content/blog' }),
  schema: z.object({
    title: z.string(),
    date: z.string(),
    // Rendered as the page's meta + og:description, so a shared link previews
    // with something. Optional: a post without one just has no description,
    // exactly as before.
    description: z.string().optional(),
  }),
})

export const collections = { blog }
