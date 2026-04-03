/* eslint-disable no-console */
import fs from 'fs'

interface HapInfo {
  accession: string
  jbrowseLink: string
  year: string
}

interface HPRCSample {
  sampleId: string
  hap1?: HapInfo
  hap2?: HapInfo
}

const hprcJson = JSON.parse(
  fs.readFileSync('processedHubJson/HPRC.json', 'utf8'),
) as {
  accession: string
  commonName: string
  jbrowseLink: string
}[]

const sampleMap = new Map<
  string,
  { hap1?: HapInfo; hap2?: HapInfo; extras: HapInfo[] }
>()

for (const entry of hprcJson) {
  const name = entry.commonName
  const yearMatch = / (\d{4})\)$/.exec(name)
  const year = yearMatch?.[1] ?? ''
  const hapInfo: HapInfo = {
    accession: entry.accession,
    jbrowseLink: entry.jbrowseLink,
    year,
  }

  const labeled = /^human \((\S+) (hap1|hap2|mat|pat) \d{4}\)$/.exec(name)
  const unlabeled = /^human \((\S+) \d{4}\)$/.exec(name)

  if (labeled) {
    const sampleId = labeled[1]
    const label = labeled[2]
    if (!sampleMap.has(sampleId)) {
      sampleMap.set(sampleId, { extras: [] })
    }
    const sample = sampleMap.get(sampleId)!
    if (label === 'hap1' || label === 'pat') {
      sample.hap1 = hapInfo
    } else {
      sample.hap2 = hapInfo
    }
  } else if (unlabeled) {
    const sampleId = unlabeled[1]
    if (!sampleMap.has(sampleId)) {
      sampleMap.set(sampleId, { extras: [] })
    }
    sampleMap.get(sampleId)!.extras.push(hapInfo)
  }
}

const result: HPRCSample[] = Array.from(sampleMap.entries())
  .map(([sampleId, v]) => {
    const hap1 = v.hap1 ?? v.extras[0]
    const hap2 = v.hap2 ?? v.extras[1]
    return { sampleId, hap1, hap2 }
  })
  .sort((a, b) => a.sampleId.localeCompare(b.sampleId))

fs.writeFileSync(
  '../website/src/hprcSamples.json',
  JSON.stringify(result, null, 2),
)
console.log(
  `Written ${result.length} samples to ../website/src/hprcSamples.json`,
)
