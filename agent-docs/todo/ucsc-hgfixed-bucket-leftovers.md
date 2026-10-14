---
name: ucsc-hgfixed-bucket-leftovers
description:
  Two objects under s3://jbrowse.org/ucsc/hgFixed/ survive every sync because
  the upload excludes *.bak and *.checked; one rclone delete clears them.
metadata:
  category: ready
  area: ucsc2jbrowse
  first_move: 'rclone delete the two hgFixed objects the sync excludes.'
  order: 2
---

# Clear what is left of `/ucsc/hgFixed/` in the bucket

`hgFixed` stopped getting a config on 2026-08-30
(`agent-docs/reference/TRACK_URL_CHECKS.md`), and its built directory is gone
from `/mnt/sdb/cdiesh/jb2hubs/ucscBuilt/`. `/ucsc/hgFixed/config.json` 404s.
Checked 2026-10-14, the bucket still holds:

```
ucsc/hgFixed/config.json.bak    1740 bytes, 2025-10-19
ucsc/hgFixed/liftOver/.checked  0 bytes, 2026-04-13
```

`ucsc2jbrowse/uploadAll.sh` excludes `*.bak` and `*.checked` on both sides, so
no sync removes them. Run `rclone delete` on the `ucsc/hgFixed/` prefix once and
delete this file.
