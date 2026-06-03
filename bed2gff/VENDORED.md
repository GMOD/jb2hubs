# Vendored bed2gff

This is our fork of `bed2gff`, brought into the monorepo so the gene-track build
no longer depends on a binary installed in `$HOME`. **This repo is now the
maintained home of the fork** — edit the Rust source here directly.

Originally imported from:

- https://github.com/cmdcolin/bed2gff @ 6f5f547b40a6873235fb076a935a2ceb68c97e39
- Original project: https://github.com/alejandrogzi/bed2gff3 (MIT, see LICENSE)

We no longer track or sync with those repos; the source here is authoritative.

## Build

```
cargo build --release        # from this directory
# or, from the repo root:
pnpm build:bed2gff
```

The release binary lands at `bed2gff/target/release/bed2gff`, which
`ucsc2jbrowse/createGeneTracksForGoldenPath.sh` resolves automatically. The
`target/` directory is gitignored.
