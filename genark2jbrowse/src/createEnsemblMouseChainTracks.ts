/* eslint-disable no-console */
import fs from 'fs'
import path from 'path'

const PANGENOME_OUT_DIR =
  process.env.PANGENOME_OUT_DIR ?? '/mnt/sdb/cdiesh/mousePangenome/out'

// VCF produced by cactus-pangenome, served relative to config location
const PANGENOME_VCF_URI =
  'https://genomes.jbrowse.org/hubs/genark/mouseEnsemblPangenome/mousePangenome.vcf.gz'

const MM39_ASSEMBLY = {
  name: 'mm39',
  displayName: 'Mouse (mm39)',
  sequence: {
    type: 'ReferenceSequenceTrack',
    trackId: 'mm39-refseq',
    adapter: {
      type: 'TwoBitAdapter',
      uri: 'https://hgdownload.soe.ucsc.edu/goldenPath/mm39/bigZips/mm39.2bit',
      chromSizes:
        'https://hgdownload.soe.ucsc.edu/goldenPath/mm39/bigZips/mm39.chrom.sizes',
    },
  },
  refNameAliases: {
    adapter: {
      type: 'RefNameAliasAdapter',
      uri: 'https://hgdownload.soe.ucsc.edu/goldenPath/mm39/bigZips/mm39.chromAlias.txt',
    },
  },
  cytobands: {
    adapter: {
      type: 'CytobandAdapter',
      uri: 'https://hgdownload.soe.ucsc.edu/goldenPath/mm39/database/cytoBand.txt.gz',
    },
  },
}

// Map from GCA accession to seqfile strain name used in the HAL
const STRAIN_NAMES: Record<string, string> = {
  'GCA_964188535.1': 'C57BL_6J_T2T',
  'GCA_964188545.1': 'CAST_EiJ_T2T',
  'GCA_921999865.2': 'C57BL_6NJ',
  'GCA_947593165.1': 'NZO_HlLtJ',
  'GCA_921997145.2': 'BALB_cJ',
  'GCA_921998635.2': 'FVB_NJ',
  'GCA_921998555.2': '129S1_SvImJ',
  'GCA_921997125.2': 'C3H_HeJ',
  'GCA_922000895.2': 'AKR_J',
  'GCA_921998315.2': 'DBA_2J',
  'GCA_921998355.2': 'A_J',
  'GCA_947599735.1': 'LP_J',
  'GCA_921998325.2': 'NOD_ShiLtJ',
  'GCA_921998905.2': 'CBA_J',
  'GCA_921999005.2': 'CAST_EiJ',
  'GCA_921998345.2': 'WSB_EiJ',
  'GCA_921999095.2': 'JF1_MsJ',
  'GCA_921998335.2': 'PWK_PhJ',
}

function accessionToHubDir(acc: string) {
  const [prefix, numDot] = acc.split('_') as [string, string]
  const num = numDot.split('.')[0]!
  return `hubs/${prefix}/${num.slice(0, 3)}/${num.slice(3, 6)}/${num.slice(6, 9)}/${acc}`
}

for (const [acc, strainName] of Object.entries(STRAIN_NAMES)) {
  const hubDir = accessionToHubDir(acc)
  const configPath = path.join(hubDir, 'config.json')
  const liftOverDir = path.join(hubDir, 'liftOver')

  if (!fs.existsSync(configPath)) {
    continue
  }

  const pifFile = `${strainName}Tomm39.pif.gz`
  const bigMafFile = `${strainName}Tomm39.bb`
  const hasPif =
    fs.existsSync(path.join(liftOverDir, pifFile)) &&
    fs.existsSync(path.join(liftOverDir, `${pifFile}.csi`))
  const hasMaf = fs.existsSync(path.join(liftOverDir, bigMafFile))

  if (!hasPif && !hasMaf) {
    continue
  }

  const config = JSON.parse(fs.readFileSync(configPath, 'utf8')) as {
    assemblies: { name: string }[]
    tracks: { trackId: string; [key: string]: unknown }[]
    [key: string]: unknown
  }

  const hasMm39 = config.assemblies.some(a => a.name === 'mm39')
  if (!hasMm39) {
    config.assemblies.push(MM39_ASSEMBLY)
  }

  const existingIds = new Set(config.tracks.map(t => t.trackId))
  let added = 0

  if (hasPif && !existingIds.has(`${acc}_to_mm39_synteny`)) {
    config.tracks.push({
      type: 'SyntenyTrack',
      trackId: `${acc}_to_mm39_synteny`,
      name: `${strainName} to mm39 alignments`,
      category: ['Pairwise alignments'],
      assemblyNames: [acc, 'mm39'],
      adapter: {
        type: 'PairwiseIndexedPAFAdapter',
        targetAssembly: acc,
        queryAssembly: 'mm39',
        pifGzLocation: { uri: `liftOver/${pifFile}` },
        index: {
          location: { uri: `liftOver/${pifFile}.csi` },
          indexType: 'CSI',
        },
      },
    })
    added++
  }

  if (hasMaf && !existingIds.has(`${acc}_to_mm39_maf`)) {
    config.tracks.push({
      type: 'MafTrack',
      trackId: `${acc}_to_mm39_maf`,
      name: `${strainName} vs mm39 (MAF)`,
      category: ['Pairwise alignments'],
      assemblyNames: [acc, 'mm39'],
      adapter: {
        type: 'BigMafAdapter',
        bigBedLocation: { uri: `liftOver/${bigMafFile}` },
      },
    })
    added++
  }

  // Add pangenome VCF once per strain if not already present
  const vcfTrackId = `${acc}_pangenome_sv`
  if (
    !existingIds.has(vcfTrackId) &&
    fs.existsSync(`${PANGENOME_OUT_DIR}/mousePangenome.vcf.gz`)
  ) {
    config.tracks.push({
      type: 'VariantTrack',
      trackId: vcfTrackId,
      name: 'Mouse pangenome structural variants',
      category: ['Structural variants'],
      assemblyNames: ['mm39'],
      adapter: {
        type: 'VcfTabixAdapter',
        vcfGzLocation: { uri: PANGENOME_VCF_URI },
        index: { location: { uri: `${PANGENOME_VCF_URI}.tbi` } },
      },
    })
    added++
  }

  if (!hasMm39 || added > 0) {
    fs.writeFileSync(configPath, JSON.stringify(config, null, 2) + '\n')
    console.log(
      `${acc} (${strainName}): added mm39=${!hasMm39}, tracks=${added}`,
    )
  }
}
