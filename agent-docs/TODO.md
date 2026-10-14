---
name: todo
description:
  Index of the open action items in todo/, grouped by what to do first. Read
  when picking up work, and before filing anything new here.
---

# Todo

One file per item under [todo/](todo/). Each carries its table row in its own
frontmatter: `metadata.category` picks the table, `area` and `first_move` are
the columns, `order` is where it sits. This index has no generator, so add or
remove a row here when you add or remove an entry.

Commitment, not size, separates an item here from a proposal in
[ideas/](ideas/).

## Ready to take

| Item                                                                                  | Area            | First move                                                                                                     |
| ------------------------------------------------------------------------------------- | --------------- | -------------------------------------------------------------------------------------------------------------- |
| [Protein browser: isoforms in one view](todo/protein-browser-isoforms-in-one-view.md) | protein-browser | Make fetchGeneStructure return every isoform CDS and the entry's refseq[] map, not only the picked transcript. |
| [Clear hgFixed bucket leftovers](todo/ucsc-hgfixed-bucket-leftovers.md)               | ucsc2jbrowse    | rclone delete the two hgFixed objects the sync excludes.                                                       |

## Measure first

| Item                                                                         | Area         | First move                                                                             |
| ---------------------------------------------------------------------------- | ------------ | -------------------------------------------------------------------------------------- |
| [Prune unreferenced derived files](todo/prune-unreferenced-derived-files.md) | ucsc2jbrowse | Work out why the 118 unexplained files are absent from configs before gating anything. |
| [Slowness in conserved gene order](todo/slowness-synteny.md)                 | synteny      | Read the ortholog Lambda logs in late October.                                         |
