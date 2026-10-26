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

| Item                                                                                  | Area            | First move                                                                                                                                |
| ------------------------------------------------------------------------------------- | --------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| [Write main's spellings at beta.18](todo/write-mains-spellings-at-beta18.md)          | hubtools        | Once code/jb2/v5.0.0-beta.18/ answers, run main's `jbrowse validate` over a regenerated hg38 config and respell every legacy-key warning. |
| [Protein browser: isoforms in one view](todo/protein-browser-isoforms-in-one-view.md) | protein-browser | Make fetchGeneStructure return every isoform CDS and the entry's refseq[] map, not only the picked transcript.                            |
| [derive.sh: temp cleanup and a dead helper](todo/derive-sh-temp-cleanup.md)           | lib             | Ride along with the next lib/derive.sh change; do not start a re-derivation for it alone.                                                 |

## Measure first

| Item                                                         | Area    | First move                                     |
| ------------------------------------------------------------ | ------- | ---------------------------------------------- |
| [Slowness in conserved gene order](todo/slowness-synteny.md) | synteny | Read the ortholog Lambda logs in late October. |
