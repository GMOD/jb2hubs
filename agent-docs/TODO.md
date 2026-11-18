---
name: todo
description:
  Index of the open action items in todo/, grouped by what to do first. Read
  when picking up work, and before filing anything new here.
---

# Todo

One file per item under [todo/](todo/). Each item's frontmatter holds its table
row: `metadata.category` picks the table, `area` and `first_move` are the
columns, and `order` sets the row's position. No script generates this index, so
add or remove a row here when you add or remove an entry.

Commitment, not size, separates an item here from a proposal in
[ideas/](ideas/).

## Ready to take

| Item                                                                              | Area    | First move                                                                                       |
| --------------------------------------------------------------------------------- | ------- | ------------------------------------------------------------------------------------------------ |
| [Catch JBrowse main's renames automatically](todo/catch-main-spelling-renames.md) | scripts | Rebase main-spellings and check droppedSpellings.mjs's patterns against main's current warnings. |
| [derive.sh: temp cleanup and a dead helper](todo/derive-sh-temp-cleanup.md)       | lib     | Ride along with the next lib/derive.sh change; do not start a re-derivation for it alone.        |

## Measure first

| Item                                                                       | Area       | First move                                                                                     |
| -------------------------------------------------------------------------- | ---------- | ---------------------------------------------------------------------------------------------- |
| [Pangenome assemblies outside NCBI](todo/pangenome-non-ncbi-assemblies.md) | pangenomes | Look up whether Panagram's dog haplotypes and Zhou 2022's tomato set have NCBI accessions yet. |
