#!/usr/bin/env node
/* eslint-disable no-console */
import { readFile, readdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'

interface SyntenyTrack {
  trackId: string
  name: string
  type: string
  assemblyNames: string[]
  configFile: string
  adapter?: unknown
  metadata?: unknown
}

interface Assembly {
  name: string
  displayName?: string
  sequence?: {
    metadata?: {
      commonName?: string
      scientificName?: string
      organism?: string
    }
  }
}

interface Config {
  assemblies?: Assembly[]
  tracks?: {
    type?: string
    trackId?: string
    name?: string
    assemblyNames?: string[]
    adapter?: unknown
    metadata?: unknown
  }[]
}

interface AssemblyInfo {
  commonName?: string
  scientificName?: string
  source: 'ucsc' | 'genark' | 'legacy'
  // NCBI taxonomy id, used to map assemblies to the cross-species ortholog
  // tables. Only populated for GenArk assemblies (from all.json).
  taxonId?: number
}

interface SyntenyDataset {
  trackId: string
  name: string
  assemblyNames: string[]
  configFile: string
  adapter?: unknown
  metadata?: unknown
}

interface SyntenyOutput {
  tracks: SyntenyDataset[]
  assemblyInfo: Record<string, AssemblyInfo>
}

async function* walkDirectory(
  dir: string,
  pattern: string,
): AsyncGenerator<string> {
  const entries = await readdir(dir, { withFileTypes: true })

  for (const entry of entries) {
    const path = join(dir, entry.name)

    if (entry.isDirectory()) {
      yield* walkDirectory(path, pattern)
    } else if (entry.isFile() && entry.name === pattern) {
      yield path
    }
  }
}

interface ExtractionResult {
  tracks: SyntenyDataset[]
  assemblyInfo: Record<string, Omit<AssemblyInfo, 'source'>>
}

async function extractSyntenyTracksFromFile(
  filePath: string,
): Promise<ExtractionResult> {
  try {
    const content = await readFile(filePath, 'utf-8')
    const config: Config = JSON.parse(content)

    const assemblyInfo: Record<string, Omit<AssemblyInfo, 'source'>> = {}

    if (config.assemblies && Array.isArray(config.assemblies)) {
      for (const asm of config.assemblies) {
        const meta = asm.sequence?.metadata
        const displayName = asm.displayName
        if (meta?.commonName || meta?.scientificName || displayName) {
          assemblyInfo[asm.name] = {
            commonName: meta?.commonName ?? meta?.organism ?? displayName,
            scientificName: meta?.scientificName,
          }
        }
      }
    }

    if (!config.tracks || !Array.isArray(config.tracks)) {
      return { tracks: [], assemblyInfo }
    }

    const tracks = config.tracks
      .filter((track): track is SyntenyTrack => track.type === 'SyntenyTrack')
      .map(track => ({
        trackId: track.trackId,
        name: track.name,
        assemblyNames: track.assemblyNames,
        configFile: filePath,
        adapter: track.adapter,
        metadata: track.metadata,
      }))

    return { tracks, assemblyInfo }
  } catch (error) {
    console.error(`Error processing ${filePath}:`, error)
    return { tracks: [], assemblyInfo: {} }
  }
}

async function scanDirectory(
  dir: string,
  pattern: string,
): Promise<ExtractionResult> {
  const allTracks: SyntenyDataset[] = []
  const allAssemblyInfo: Record<string, AssemblyInfo> = {}

  for await (const filePath of walkDirectory(dir, pattern)) {
    const result = await extractSyntenyTracksFromFile(filePath)
    allTracks.push(...result.tracks)
    Object.assign(allAssemblyInfo, result.assemblyInfo)
  }

  return { tracks: allTracks, assemblyInfo: allAssemblyInfo }
}

async function scanJsonFiles(dir: string): Promise<ExtractionResult> {
  const allTracks: SyntenyDataset[] = []
  const allAssemblyInfo: Record<string, AssemblyInfo> = {}

  try {
    const files = await readdir(dir)

    for (const file of files) {
      if (file.endsWith('.json')) {
        const filePath = join(dir, file)
        const result = await extractSyntenyTracksFromFile(filePath)
        allTracks.push(...result.tracks)
        Object.assign(allAssemblyInfo, result.assemblyInfo)
      }
    }
  } catch (error) {
    console.error(`Error scanning directory ${dir}:`, error)
  }

  return { tracks: allTracks, assemblyInfo: allAssemblyInfo }
}

async function loadGenArkAssemblyInfo(): Promise<Record<string, AssemblyInfo>> {
  const result: Record<string, AssemblyInfo> = {}
  try {
    const content = await readFile('website/processedHubJson/all.json', 'utf-8')
    const assemblies = JSON.parse(content) as {
      accession: string
      commonName?: string
      scientificName?: string
      taxonId?: number
    }[]
    for (const asm of assemblies) {
      if (asm.accession) {
        result[asm.accession] = {
          commonName: asm.commonName,
          scientificName: asm.scientificName,
          source: 'genark',
          taxonId: asm.taxonId,
        }
      }
    }
    console.log(`Loaded ${Object.keys(result).length} GenArk assembly records`)
  } catch (error) {
    console.error('Error loading GenArk assembly info:', error)
  }
  return result
}

const legacyUcscAssemblies: Record<string, Omit<AssemblyInfo, 'source'>> = {
  acaChl1: { commonName: "Anna's hummingbird", scientificName: 'Calypte anna' },
  allSin1: {
    commonName: 'Chinese alligator',
    scientificName: 'Alligator sinensis',
  },
  amaVit1: { commonName: 'Amazon parrot', scientificName: 'Amazona vittata' },
  anaPla1: { commonName: 'Mallard duck', scientificName: 'Anas platyrhynchos' },
  ancCey1: { commonName: 'Hookworm', scientificName: 'Ancylostoma ceylanicum' },
  angJap1: { commonName: 'Japanese eel', scientificName: 'Anguilla japonica' },
  aotNan1: {
    commonName: "Ma's night monkey",
    scientificName: 'Aotus nancymaae',
  },
  apaSpi1: {
    commonName: 'Spiny softshell turtle',
    scientificName: 'Apalone spinifera',
  },
  apaVit1: { commonName: 'Swift', scientificName: 'Apus apus' },
  apiMel3: { commonName: 'Honey bee', scientificName: 'Apis mellifera' },
  apiMel4: { commonName: 'Honey bee', scientificName: 'Apis mellifera' },
  aptFor1: {
    commonName: 'Emperor penguin',
    scientificName: 'Aptenodytes forsteri',
  },
  araMac1: { commonName: 'Scarlet macaw', scientificName: 'Ara macao' },
  ascSuu1: { commonName: 'Pig roundworm', scientificName: 'Ascaris suum' },
  astMex1: {
    commonName: 'Mexican tetra',
    scientificName: 'Astyanax mexicanus',
  },
  balPav1: { commonName: 'Saker falcon', scientificName: 'Falco cherrug' },
  bosTau1: { commonName: 'Cow', scientificName: 'Bos taurus' },
  bosTau5: { commonName: 'Cow', scientificName: 'Bos taurus' },
  bosTauMd3: { commonName: 'Cow', scientificName: 'Bos taurus' },
  braFlo2: { commonName: 'Lancelet', scientificName: 'Branchiostoma floridae' },
  bruMal2: { commonName: 'Brugia malayi', scientificName: 'Brugia malayi' },
  bucRhi1: {
    commonName: 'Rhinoceros hornbill',
    scientificName: 'Buceros rhinoceros',
  },
  burXyl1: {
    commonName: 'Pine wilt nematode',
    scientificName: 'Bursaphelenchus xylophilus',
  },
  caeAng1: { commonName: 'Nematode', scientificName: 'Caenorhabditis angaria' },
  caeAng2: { commonName: 'Nematode', scientificName: 'Caenorhabditis angaria' },
  caeJap4: {
    commonName: 'Nematode',
    scientificName: 'Caenorhabditis japonica',
  },
  caePb3: { commonName: 'Nematode', scientificName: 'Caenorhabditis brenneri' },
  'caeRem3.supers': {
    commonName: 'Nematode',
    scientificName: 'Caenorhabditis remanei',
  },
  caeRem4: { commonName: 'Nematode', scientificName: 'Caenorhabditis remanei' },
  caeSp111: { commonName: 'Nematode', scientificName: 'Caenorhabditis sp. 11' },
  caeSp51: { commonName: 'Nematode', scientificName: 'Caenorhabditis sp. 5' },
  caeSp71: { commonName: 'Nematode', scientificName: 'Caenorhabditis sp. 7' },
  caeSp91: { commonName: 'Nematode', scientificName: 'Caenorhabditis sp. 9' },
  calAnn1: { commonName: "Anna's hummingbird", scientificName: 'Calypte anna' },
  camFer1: { commonName: 'Bactrian camel', scientificName: 'Camelus ferus' },
  capCar1: { commonName: 'Rock pigeon', scientificName: 'Columba livia' },
  capHir1: { commonName: 'Goat', scientificName: 'Capra hircus' },
  carCri1: {
    commonName: 'Red-legged seriema',
    scientificName: 'Cariama cristata',
  },
  casCan1: {
    commonName: 'American beaver',
    scientificName: 'Castor canadensis',
  },
  cavApe1: { commonName: 'Guinea pig', scientificName: 'Cavia aperea' },
  cb4: { commonName: 'Nematode', scientificName: 'Caenorhabditis briggsae' },
  cebCap1: {
    commonName: 'White-faced sapajou',
    scientificName: 'Cebus capucinus',
  },
  cerAty1: {
    commonName: 'Red-tailed comet',
    scientificName: 'Sappho sparganurus',
  },
  chaVoc2: { commonName: 'Killdeer', scientificName: 'Charadrius vociferus' },
  cheMyd1: { commonName: 'Green sea turtle', scientificName: 'Chelonia mydas' },
  chiLan1: { commonName: 'Chinchilla', scientificName: 'Chinchilla lanigera' },
  chlSab1: {
    commonName: 'Green monkey',
    scientificName: 'Chlorocebus sabaeus',
  },
  chlUnd1: {
    commonName: 'Budgerigar',
    scientificName: 'Melopsittacus undulatus',
  },
  chrAsi1: {
    commonName: 'Chrysochloris asiatica',
    scientificName: 'Chrysochloris asiatica',
  },
  chrPic2: { commonName: 'Painted turtle', scientificName: 'Chrysemys picta' },
  cioSav2: { commonName: 'Sea squirt', scientificName: 'Ciona savignyi' },
  colAng1: {
    commonName: 'Angolan colobus',
    scientificName: 'Colobus angolensis',
  },
  colLiv1: { commonName: 'Rock pigeon', scientificName: 'Columba livia' },
  colStr1: {
    commonName: 'Speckled mousebird',
    scientificName: 'Colius striatus',
  },
  conCri1: {
    commonName: 'Star-nosed mole',
    scientificName: 'Condylura cristata',
  },
  corBra1: {
    commonName: 'American crow',
    scientificName: 'Corvus brachyrhynchos',
  },
  corCor1: { commonName: 'Hooded crow', scientificName: 'Corvus cornix' },
  cotJap2: {
    commonName: 'Japanese quail',
    scientificName: 'Coturnix japonica',
  },
  cucCan1: {
    commonName: 'Greater roadrunner',
    scientificName: 'Geococcyx californianus',
  },
  danRer2: { commonName: 'Zebrafish', scientificName: 'Danio rerio' },
  dasNov1: { commonName: 'Armadillo', scientificName: 'Dasypus novemcinctus' },
  dasNov2: { commonName: 'Armadillo', scientificName: 'Dasypus novemcinctus' },
  dipOrd2: { commonName: 'Kangaroo rat', scientificName: 'Dipodomys ordii' },
  dirImm1: { commonName: 'Heartworm', scientificName: 'Dirofilaria immitis' },
  dp4: { commonName: 'Fruit fly', scientificName: 'Drosophila pseudoobscura' },
  droAlb1: { commonName: 'Fruit fly', scientificName: 'Drosophila albomicans' },
  droAna3: { commonName: 'Fruit fly', scientificName: 'Drosophila ananassae' },
  droBia2: { commonName: 'Fruit fly', scientificName: 'Drosophila biarmipes' },
  droBip2: {
    commonName: 'Fruit fly',
    scientificName: 'Drosophila bipectinata',
  },
  droEle2: { commonName: 'Fruit fly', scientificName: 'Drosophila elegans' },
  droEre2: { commonName: 'Fruit fly', scientificName: 'Drosophila erecta' },
  droEug2: { commonName: 'Fruit fly', scientificName: 'Drosophila eugracilis' },
  droFic2: { commonName: 'Fruit fly', scientificName: 'Drosophila ficusphila' },
  droGri2: { commonName: 'Fruit fly', scientificName: 'Drosophila grimshawi' },
  droKik2: { commonName: 'Fruit fly', scientificName: 'Drosophila kikkawai' },
  droMir2: { commonName: 'Fruit fly', scientificName: 'Drosophila miranda' },
  droMoj3: { commonName: 'Fruit fly', scientificName: 'Drosophila mojavensis' },
  droPse3: {
    commonName: 'Fruit fly',
    scientificName: 'Drosophila pseudoobscura',
  },
  droRho2: { commonName: 'Fruit fly', scientificName: 'Drosophila rhopaloa' },
  droSim2: { commonName: 'Fruit fly', scientificName: 'Drosophila simulans' },
  droSuz1: { commonName: 'Fruit fly', scientificName: 'Drosophila suzukii' },
  droTak2: { commonName: 'Fruit fly', scientificName: 'Drosophila takahashii' },
  droVir3: { commonName: 'Fruit fly', scientificName: 'Drosophila virilis' },
  droWil1: { commonName: 'Fruit fly', scientificName: 'Drosophila willistoni' },
  droWil2: { commonName: 'Fruit fly', scientificName: 'Drosophila willistoni' },
  droYak3: { commonName: 'Fruit fly', scientificName: 'Drosophila yakuba' },
  egrGar1: { commonName: 'Great egret', scientificName: 'Ardea alba' },
  eleEdw1: {
    commonName: 'Cape elephant shrew',
    scientificName: 'Elephantulus edwardii',
  },
  eptFus1: { commonName: 'Big brown bat', scientificName: 'Eptesicus fuscus' },
  eulFla1: {
    commonName: 'Yellowhammer',
    scientificName: 'Emberiza citrinella',
  },
  eulMac1: { commonName: 'Black lemur', scientificName: 'Eulemur macaco' },
  eurHel1: { commonName: 'Hedgehog', scientificName: 'Erinaceus europaeus' },
  falChe1: { commonName: 'Saker falcon', scientificName: 'Falco cherrug' },
  falPer1: {
    commonName: 'Peregrine falcon',
    scientificName: 'Falco peregrinus',
  },
  ficAlb1: {
    commonName: 'Collared flycatcher',
    scientificName: 'Ficedula albicollis',
  },
  ficAlb2: {
    commonName: 'Collared flycatcher',
    scientificName: 'Ficedula albicollis',
  },
  fukDam1: { commonName: 'Fulmarus', scientificName: 'Fulmarus glacialis' },
  fulGla1: {
    commonName: 'Northern fulmar',
    scientificName: 'Fulmarus glacialis',
  },
  gavSte1: {
    commonName: 'Red-throated loon',
    scientificName: 'Gavia stellata',
  },
  gorGor1: { commonName: 'Gorilla', scientificName: 'Gorilla gorilla' },
  haeCon2: {
    commonName: 'Barber pole worm',
    scientificName: 'Haemonchus contortus',
  },
  halAlb1: {
    commonName: 'White-tailed eagle',
    scientificName: 'Haliaeetus albicilla',
  },
  halLeu1: {
    commonName: 'Bald eagle',
    scientificName: 'Haliaeetus leucocephalus',
  },
  hapBur1: {
    commonName: "Burton's mouthbrooder",
    scientificName: 'Haplochromis burtoni',
  },
  hetBac1: {
    commonName: 'Soybean cyst nematode',
    scientificName: 'Heterodera glycines',
  },
  hg15: { commonName: 'Human', scientificName: 'Homo sapiens' },
  jacJac1: {
    commonName: 'Lesser Egyptian jerboa',
    scientificName: 'Jaculus jaculus',
  },
  lepDis1: {
    commonName: 'Leprosy bacillus',
    scientificName: 'Mycobacterium leprae',
  },
  lepOcu1: { commonName: 'Amazon molly', scientificName: 'Poecilia formosa' },
  lepWed1: {
    commonName: 'Weddell seal',
    scientificName: 'Leptonychotes weddellii',
  },
  letCam1: {
    commonName: 'Spotted gar',
    scientificName: 'Lepisosteus oculatus',
  },
  loaLoa1: { commonName: 'Eye worm', scientificName: 'Loa loa' },
  loxAfr1: { commonName: 'Elephant', scientificName: 'Loxodonta africana' },
  macEug1: { commonName: 'Wallaby', scientificName: 'Macropus eugenii' },
  macNem1: {
    commonName: 'Pig-tailed macaque',
    scientificName: 'Macaca nemestrina',
  },
  manLeu1: { commonName: 'Drill', scientificName: 'Mandrillus leucophaeus' },
  mayZeb1: { commonName: 'Maylandia zebra', scientificName: 'Maylandia zebra' },
  melHap1: { commonName: 'Turkey', scientificName: 'Meleagris gallopavo' },
  melInc2: { commonName: 'Turkey', scientificName: 'Meleagris gallopavo' },
  merNub1: { commonName: 'Bee-eater', scientificName: 'Merops nubicus' },
  mesAur1: {
    commonName: 'Golden hamster',
    scientificName: 'Mesocricetus auratus',
  },
  mesUni1: {
    commonName: 'Unicellular organism',
    scientificName: 'Mesorhizobium sp.',
  },
  micMur3: { commonName: 'Mouse lemur', scientificName: 'Microcebus murinus' },
  micOch1: {
    commonName: 'Prairie vole',
    scientificName: 'Microtus ochrogaster',
  },
  mm4: { commonName: 'Mouse', scientificName: 'Mus musculus' },
  mm5: { commonName: 'Mouse', scientificName: 'Mus musculus' },
  mm6: { commonName: 'Mouse', scientificName: 'Mus musculus' },
  musDom2: {
    commonName: 'House mouse',
    scientificName: 'Mus musculus domesticus',
  },
  myoDav1: { commonName: "David's myotis", scientificName: 'Myotis davidii' },
  myoLuc1: { commonName: 'Microbat', scientificName: 'Myotis lucifugus' },
  myoLuc2: { commonName: 'Microbat', scientificName: 'Myotis lucifugus' },
  necAme1: { commonName: 'Hookworm', scientificName: 'Necator americanus' },
  neoBri1: {
    commonName: 'Cichlid',
    scientificName: 'Neolamprologus brichardi',
  },
  nipNip1: {
    commonName: 'Nippostrongylus',
    scientificName: 'Nippostrongylus brasiliensis',
  },
  octDeg1: { commonName: 'Degu', scientificName: 'Octodon degus' },
  odoRosDiv1: { commonName: 'Walrus', scientificName: 'Odobenus rosmarus' },
  oncVol1: {
    commonName: 'River blindness worm',
    scientificName: 'Onchocerca volvulus',
  },
  opiHoa1: { commonName: 'Hoatzin', scientificName: 'Opisthocomus hoazin' },
  orcOrc1: { commonName: 'Orca', scientificName: 'Orcinus orca' },
  oreNil1: { commonName: 'Tilapia', scientificName: 'Oreochromis niloticus' },
  oreNil3: { commonName: 'Tilapia', scientificName: 'Oreochromis niloticus' },
  oryAfe1: { commonName: 'Aardvark', scientificName: 'Orycteropus afer' },
  oryCun1: { commonName: 'Rabbit', scientificName: 'Oryctolagus cuniculus' },
  otoGar1: { commonName: 'Bushbaby', scientificName: 'Otolemur garnettii' },
  panHod1: {
    commonName: 'Tibetan antelope',
    scientificName: 'Pantholops hodgsonii',
  },
  panRed1: {
    commonName: 'Red-crowned crane',
    scientificName: 'Grus japonensis',
  },
  papAnu3: { commonName: 'Olive baboon', scientificName: 'Papio anubis' },
  pelCri1: {
    commonName: 'Dalmatian pelican',
    scientificName: 'Pelecanus crispus',
  },
  pelSin1: {
    commonName: 'Chinese softshell turtle',
    scientificName: 'Pelodiscus sinensis',
  },
  phaCar1: {
    commonName: 'Great cormorant',
    scientificName: 'Phalacrocorax carbo',
  },
  phaLep1: { commonName: 'Koala', scientificName: 'Phascolarctos cinereus' },
  phoRub1: {
    commonName: 'American flamingo',
    scientificName: 'Phoenicopterus ruber',
  },
  picPub1: {
    commonName: 'Downy woodpecker',
    scientificName: 'Dryobates pubescens',
  },
  priExs1: {
    commonName: 'Nematode',
    scientificName: 'Pristionchus exspectatus',
  },
  priPac3: { commonName: 'Nematode', scientificName: 'Pristionchus pacificus' },
  proCoq1: {
    commonName: "Coquerel's sifaka",
    scientificName: 'Propithecus coquereli',
  },
  pseHum1: {
    commonName: 'Tibetan ground-tit',
    scientificName: 'Pseudopodoces humilis',
  },
  pteAle1: {
    commonName: 'Black flying fox',
    scientificName: 'Pteropus alecto',
  },
  pteGut1: {
    commonName: 'Medium ground finch',
    scientificName: 'Geospiza fortis',
  },
  punNye1: { commonName: 'Cichlid', scientificName: 'Pundamilia nyererei' },
  pygAde1: {
    commonName: 'Adelie penguin',
    scientificName: 'Pygoscelis adeliae',
  },
  pytBiv1: {
    commonName: 'Burmese python',
    scientificName: 'Python bivittatus',
  },
  rheMac1: { commonName: 'Rhesus macaque', scientificName: 'Macaca mulatta' },
  rhiBie1: {
    commonName: 'Rhinopithecus bieti',
    scientificName: 'Rhinopithecus bieti',
  },
  serCan1: { commonName: 'Canary', scientificName: 'Serinus canaria' },
  speTri1: {
    commonName: 'Squirrel',
    scientificName: 'Ictidomys tridecemlineatus',
  },
  strCam1: { commonName: 'Ostrich', scientificName: 'Struthio camelus' },
  strRat2: { commonName: 'Threadworm', scientificName: 'Strongyloides ratti' },
  susScr1: { commonName: 'Pig', scientificName: 'Sus scrofa' },
  takFla1: {
    commonName: 'White-throated tinamou',
    scientificName: 'Tinamus guttatus',
  },
  tauEry1: { commonName: 'Zebra mbuna', scientificName: 'Maylandia zebra' },
  tinGut2: {
    commonName: 'White-throated tinamou',
    scientificName: 'Tinamus guttatus',
  },
  triCas2: {
    commonName: 'Red flour beetle',
    scientificName: 'Tribolium castaneum',
  },
  triSpi1: { commonName: 'Whipworm', scientificName: 'Trichinella spiralis' },
  triSui1: { commonName: 'Whipworm', scientificName: 'Trichuris suis' },
  tupChi1: {
    commonName: 'Chinese tree shrew',
    scientificName: 'Tupaia chinensis',
  },
  turTru1: {
    commonName: 'Bottlenose dolphin',
    scientificName: 'Tursiops truncatus',
  },
  tytAlb1: { commonName: 'Barn owl', scientificName: 'Tyto alba' },
  xipMac1: {
    commonName: 'Southern platyfish',
    scientificName: 'Xiphophorus maculatus',
  },
  zonAlb1: {
    commonName: 'White-throated sparrow',
    scientificName: 'Zonotrichia albicollis',
  },
  'GCF_000001735.3_TAIR10': {
    commonName: 'Arabidopsis',
    scientificName: 'Arabidopsis thaliana',
  },
  'GCF_000001735.4_TAIR10.1': {
    commonName: 'Arabidopsis',
    scientificName: 'Arabidopsis thaliana',
  },
  '2.GCF_000001735.4_TAIR10.1': {
    commonName: 'Arabidopsis',
    scientificName: 'Arabidopsis thaliana',
  },
  '4_TAIR10.1.Col-CEN_v1.2': {
    commonName: 'Arabidopsis',
    scientificName: 'Arabidopsis thaliana',
  },
  'GCA_001624865.1_SPRET_EiJ_v1': {
    commonName: 'Spretus mouse',
    scientificName: 'Mus spretus',
  },
  'GCA_003448975.1_ASM344897v1': { commonName: 'Assembly', scientificName: '' },
  'GCA_009914755.4': { commonName: 'Assembly', scientificName: '' },
  gSE120751_Dvir_HiC: {
    commonName: 'Fruit fly',
    scientificName: 'Drosophila virilis',
  },
}

async function loadUcscAssemblyInfo(): Promise<Record<string, AssemblyInfo>> {
  const result: Record<string, AssemblyInfo> = {}
  try {
    console.log('Fetching UCSC assembly metadata from API...')
    const response = await fetch('https://api.genome.ucsc.edu/list/ucscGenomes')
    const data = (await response.json()) as {
      ucscGenomes: Record<
        string,
        { organism?: string; scientificName?: string }
      >
    }
    for (const [name, info] of Object.entries(data.ucscGenomes)) {
      result[name] = {
        commonName: info.organism,
        scientificName: info.scientificName,
        source: 'ucsc',
      }
    }
    console.log(`Loaded ${Object.keys(result).length} UCSC assembly records`)
  } catch (error) {
    console.error('Error loading UCSC assembly info:', error)
  }
  return result
}

async function main() {
  console.log('Scanning for SyntenyTrack datasets...\n')

  // Load assembly info from external sources
  const genArkInfo = await loadGenArkAssemblyInfo()
  const ucscInfo = await loadUcscAssemblyInfo()

  // Scan hubs/ directory for config.json files
  console.log('Scanning hubs/ directory...')
  const hubsResult = await scanDirectory('hubs', 'config.json')
  console.log(
    `Found ${hubsResult.tracks.length} SyntenyTrack entries in hubs/\n`,
  )

  // Scan ucsc2jbrowse/configs/ directory for .json files
  console.log('Scanning ucsc2jbrowse/configs/ directory...')
  const ucscResult = await scanJsonFiles('ucsc2jbrowse/configs')
  console.log(
    `Found ${ucscResult.tracks.length} SyntenyTrack entries in ucsc2jbrowse/configs/\n`,
  )

  // Combine all tracks
  const allTracks = [...hubsResult.tracks, ...ucscResult.tracks]
  console.log(`Total SyntenyTrack entries found: ${allTracks.length}\n`)

  // Build legacy assembly info with source
  const legacyInfo: Record<string, AssemblyInfo> = {}
  for (const [name, info] of Object.entries(legacyUcscAssemblies)) {
    legacyInfo[name] = { ...info, source: 'legacy' }
  }

  // Add source to hub assembly info (genark)
  const hubsAssemblyInfo: Record<string, AssemblyInfo> = {}
  for (const [name, info] of Object.entries(hubsResult.assemblyInfo)) {
    hubsAssemblyInfo[name] = { ...info, source: 'genark' }
  }

  // Add source to ucsc config assembly info
  const ucscConfigAssemblyInfo: Record<string, AssemblyInfo> = {}
  for (const [name, info] of Object.entries(ucscResult.assemblyInfo)) {
    ucscConfigAssemblyInfo[name] = { ...info, source: 'ucsc' }
  }

  // Combine assembly info from all sources (later sources override earlier)
  const assemblyInfo: Record<string, AssemblyInfo> = {
    ...legacyInfo,
    ...genArkInfo,
    ...ucscInfo,
    ...hubsAssemblyInfo,
    ...ucscConfigAssemblyInfo,
  }
  console.log(
    `Total assembly info records: ${Object.keys(assemblyInfo).length}`,
  )

  // Backfill taxonId for assemblies that lack it (UCSC, legacy) by matching
  // scientificName against the GenArk assemblies that carry one. This lets
  // same-species comparisons such as hg19 vs hg38 (both Homo sapiens) reach the
  // ortholog tables, which are keyed by taxon.
  const sciNameToTaxon = new Map<string, number>()
  for (const info of Object.values(assemblyInfo)) {
    if (info.taxonId !== undefined && info.scientificName) {
      sciNameToTaxon.set(info.scientificName.toLowerCase(), info.taxonId)
    }
  }
  let backfilled = 0
  for (const info of Object.values(assemblyInfo)) {
    if (info.taxonId === undefined && info.scientificName) {
      const taxon = sciNameToTaxon.get(info.scientificName.toLowerCase())
      if (taxon !== undefined) {
        info.taxonId = taxon
        backfilled++
      }
    }
  }
  console.log(`Backfilled taxonId for ${backfilled} assemblies via name`)

  // Check for assemblies without info
  const allAssemblyNames = new Set<string>()
  for (const track of allTracks) {
    for (const name of track.assemblyNames) {
      allAssemblyNames.add(name)
    }
  }
  const missingInfo = [...allAssemblyNames].filter(name => !assemblyInfo[name])
  console.log(`Assemblies without info: ${missingInfo.length}`)
  if (missingInfo.length > 0 && missingInfo.length <= 20) {
    console.log(`  ${missingInfo.join(', ')}`)
  }

  // Write output with both tracks and assembly info
  const output: SyntenyOutput = { tracks: allTracks, assemblyInfo }
  const outputFile = 'website/src/syntenyTracks.json'
  await writeFile(outputFile, JSON.stringify(output, null, 2))
  console.log(`\nResults written to ${outputFile}`)

  // Lightweight list of GCA/GCF accessions that take part in a launchable
  // synteny track (both sides non-legacy). The accession pages import this
  // instead of the multi-megabyte syntenyTracks.json.
  const launchableAccessions = new Set<string>()
  for (const track of allTracks) {
    const usable = track.assemblyNames.every(name => {
      const info = assemblyInfo[name]
      return info && info.source !== 'legacy'
    })
    if (usable) {
      for (const name of track.assemblyNames) {
        if (name.startsWith('GCA_') || name.startsWith('GCF_')) {
          launchableAccessions.add(name)
        }
      }
    }
  }
  const accessionsFile = 'website/src/syntenyAccessions.json'
  await writeFile(
    accessionsFile,
    JSON.stringify([...launchableAccessions].sort()),
  )
  console.log(
    `Wrote ${launchableAccessions.size} synteny accessions to ${accessionsFile}`,
  )

  // Generate summary statistics
  const assemblyPairs = new Map<string, number>()
  for (const track of allTracks) {
    if (track.assemblyNames.length === 2) {
      const pair = track.assemblyNames.slice().sort().join(' <-> ')
      assemblyPairs.set(pair, (assemblyPairs.get(pair) ?? 0) + 1)
    }
  }

  console.log(`\nUnique assembly pairs: ${assemblyPairs.size}`)
  console.log('\nTop 10 most common assembly pairs:')
  const sortedPairs = [...assemblyPairs.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)

  for (const [pair, count] of sortedPairs) {
    console.log(`  ${pair}: ${count} tracks`)
  }
}

main().catch(console.error)
