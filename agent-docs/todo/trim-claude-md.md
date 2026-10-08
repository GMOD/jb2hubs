---
name: trim-claude-md
description:
  The root CLAUDE.md is 20,855 words loaded into every session. Colin asked on
  2026-09-26 for it to be trimmed.
metadata:
  category: ready
  area: docs
  first_move:
    'Move the incident narratives and dated measurements to
    agent-docs/reference/, keeping each rule, invariant and trap.'
  order: 2
---

# Trim the root CLAUDE.md

Colin asked on 2026-09-26 to trim `CLAUDE.md` and drop its version-specific
notes. Keep the rules, invariants and traps. Move the incident narratives and
dated measurements that justify them to `agent-docs/reference/`, or drop them
where git already holds the story.

Two stale lines the 2026-09-26 shell review found are still there:

- `CLAUDE.md`'s PIF and CLI sections narrate `5.0.0-beta.1` and `beta.2`;
  `package.json` pins `5.0.0-beta.7`.
- A comment in `lib/common.sh` says genark hands the url to `wget -N`, where
  `genark2jbrowse/downloadNcbiGff.sh` uses `curl -z`. `lib/common.sh` is in
  `PIPELINE_SOURCES`, so the edit reprocesses all 238 UCSC assemblies once.
