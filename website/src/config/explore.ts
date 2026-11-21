import { features } from './features.ts'

// Every entry point, ordered the way you reach them: the two you start from
// with nothing in hand, an assembly (Assembly search) or a gene (Gene explorer,
// the /gene hub holding the ortholog table), then the tools one of those hands
// you off to. Each name is the page's own <h1>. The header lists the names
// under Explore and the home page lists them with their blurbs.
export const exploreItems = [
  {
    name: 'Assembly search',
    href: '/search/',
    blurb: 'search assembly by common name, scientific name or accession',
  },
  {
    name: 'Gene explorer',
    href: '/gene/',
    blurb: "a gene's orthologs across every hosted genome",
  },
  {
    name: 'Synteny browser',
    href: '/synteny/',
    blurb: 'the whole-genome alignment between two assemblies',
  },
  {
    name: 'Protein browser',
    href: '/protein-browser/',
    blurb: 'a gene with its structure and a cross-species protein alignment',
  },
  {
    name: 'Orthologs',
    href: '/orthologs/',
    blurb: 'every hosted genome with an ortholog of a gene, grouped by clade',
  },
  {
    name: 'Conserved gene order',
    href: '/conserved-gene-order/',
    blurb: "a gene's neighbouring genes drawn across the species tree",
  },
  ...(features.pangenome
    ? [
        {
          name: 'Pangenomes',
          href: '/pangenomes/',
          blurb: 'pangenome graphs you can open at any gene or region',
        },
      ]
    : []),
]
