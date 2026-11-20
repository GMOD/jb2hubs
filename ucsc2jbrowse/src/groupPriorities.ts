import fs from 'node:fs'
import path from 'node:path'
import zlib from 'node:zlib'

/**
 * An assembly's UCSC `grp` table as `[group, priority]` rows, the order its
 * own track list runs in, or undefined for an assembly with no golden-path
 * database (a hub), which takes hubtools' usual order.
 */
export function readGroupPriorities(dbDir: string) {
  const file = path.join(dbDir, 'grp.txt.gz')
  return fs.existsSync(file)
    ? zlib
        .gunzipSync(fs.readFileSync(file))
        .toString('utf8')
        .split('\n')
        .map(line => line.split('\t'))
        .flatMap(([group, , priority]): [string, number][] =>
          group && priority !== undefined && Number.isFinite(Number(priority))
            ? [[group, Number(priority)]]
            : [],
        )
    : undefined
}
