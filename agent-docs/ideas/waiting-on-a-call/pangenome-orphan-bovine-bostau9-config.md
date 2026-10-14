---
name: pangenome-orphan-bovine-bostau9-config
description:
  's3://jbrowse.org/pangenome/bovine-bostau9/config.json still answers 200 after
  the rename to bovine-arsucd12; deleting it retires a published url.'
---

# The orphaned `bovine-bostau9` config

The bovine config was renamed to `bovine-arsucd12` on 2026-09-09, and the old
key, `s3://jbrowse.org/pangenome/bovine-bostau9/config.json`, still answers 200.
Nothing in this repo names it. Deleting it retires a published url, so it waits
on Colin's call; a redirect or a copy of the current config are the alternatives
to deletion.
