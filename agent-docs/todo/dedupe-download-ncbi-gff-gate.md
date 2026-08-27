# Two near-duplicate `downloadNcbiGff.sh`

genark2jbrowse and ucsc2jbrowse each have one. The downloaders genuinely differ
(`wget -N` vs `datasets download`), but the re-download gate — `FETCH_UPDATES`
plus a file-existence check — is the same logic written twice, so it will drift.

Minimum a cross-reference comment; better, lift the gate decision into
`lib/common.sh`.

Left over from the shell-hardening review.
