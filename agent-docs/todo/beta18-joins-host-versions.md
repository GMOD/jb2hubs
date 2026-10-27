---
name: beta18-joins-host-versions
description:
  The configs write main's spellings, which v5.0.0-beta.18 is the first release
  to read. Once beta.18 is hosted, add it to HOST_VERSIONS and check the tracks
  check-config-compat cannot open.
metadata:
  category: ready
  area: hubtools
  first_move:
    "Once jbrowse.org/code/jb2/v5.0.0-beta.18/ answers, put 'v5.0.0-beta.18'
    ahead of 'main' in checkConfigCompat.mjs's HOST_VERSIONS and run pnpm
    check-config-compat."
  order: 1
---

# beta.18 joins HOST_VERSIONS

The generators write main's spellings (2026-10-26: `tooltip`, `filter`
predicates, `LinearWiggleDisplay` with `rows.field`, `rows.sort`, `axis.grid`,
`rowColor.scale`, flat default-session views). beta.17 drops most of them, and
ALFA's mark color scale, an object where beta.17 takes a string, fails its
validator. `HOST_VERSIONS` therefore holds `main` alone until beta.18 is hosted.

## When beta.18 is hosted

1. Put `'v5.0.0-beta.18'` ahead of `'main'` in `scripts/checkConfigCompat.mjs`.
2. `pnpm check-config-compat`, then run the tag's `jbrowse validate` over a
   regenerated hg38 config.json:
   `node --experimental-strip-types products/jbrowse-cli/src/bin.ts validate <config.json>`
   from a jbrowse-components checkout at the tag. A config check boots the host
   but opens no track, so validate is what sees a display value the tag refuses.
3. Open `hg38-ALFA_populations` and `hg38-rmsk`'s by-class display on
   `jbrowse.org/code/jb2/v5.0.0-beta.18/`.

main's validator calls the flat `rowColor: { domain, range }` unknown even
though the schema's preprocess lifts it; trust a runtime read over that one
line.
