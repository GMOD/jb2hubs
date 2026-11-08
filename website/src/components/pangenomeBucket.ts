// A graph's files live in the bucket's `pangenome/<bucketDir>/`, which
// `website/pangenome-config/<bucketDir>/` mirrors and `upload.sh` publishes;
// its config is `pangenome-config/<bucketDir>.json`, published as
// `pangenome/<bucketDir>/config.json`.

const BUCKET = 'https://jbrowse.org/pangenome'

export interface InBucket {
  bucketDir: string
}

export const bucketUrl = ({ bucketDir }: InBucket, path: string) =>
  `${BUCKET}/${bucketDir}/${path}`

// The working-tree copy, relative to `website/`
export const mirroredFile = ({ bucketDir }: InBucket, path: string) =>
  `pangenome-config/${bucketDir}/${path}`

export const inBucket = (bucketDir: string) => ({
  bucketDir,
  configUrl: bucketUrl({ bucketDir }, 'config.json'),
})
