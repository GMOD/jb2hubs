# Check that `aws create-invalidation` runs less

Invalidations are billed per path and the pipelines call them from several
places. Confirm each call is gated on something actually having changed, the way
`upload_if_changed` gates its uploads, rather than firing every run.

Start with the `create-invalidation` call sites in `lib/common.sh`,
`ucsc2jbrowse/uploadAll.sh` and `genark2jbrowse/`.
