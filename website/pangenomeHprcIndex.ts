// HPRC's data tables, which the generators of the HPRC graph config and gene
// models read: one CSV row per haplotype, naming where its files are.
import { myfetchtextWithRetry } from 'hubtools'

const TABLES =
  'https://raw.githubusercontent.com/human-pangenomics/hprc_intermediate_assembly/main/data_tables'
export const ASSEMBLY_INDEX = `${TABLES}/assemblies_release2_v1.0.index.csv`
export const CAT_INDEX = `${TABLES}/annotation/cat/cat_genes_hprc_r2_v1.3.index.csv`

// The https url HPRC's bucket serves an `s3://` location from
export const httpsOf = (s3: string) =>
  s3.replace(/^s3:\/\/([^/]+)\//, 'https://s3-us-west-2.amazonaws.com/$1/')

// `sample_id,haplotype,...` rows keyed by PanSN prefix, `HG00097#1`.
export async function indexByHaplotype(url: string) {
  const [header, ...rows] = (await myfetchtextWithRetry(url)).trim().split('\n')
  const columns = header!.split(',')
  return new Map(
    rows.map(row => {
      const record = Object.fromEntries(
        row.split(',').map((value, i) => [columns[i]!, value]),
      )
      return [`${record.sample_id}#${record.haplotype}`, record]
    }),
  )
}
