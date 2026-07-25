// GenArk common names carry a parenthetical naming the assembly and year —
// "human (GRCh38.p14 2022)", "aardvark (SDZICR_OR568_19922 2012 Broad)". It is
// useful in a dense table column but reads as noise anywhere the assembly is
// already named, and it makes one species look like many distinct organisms.
export function bareCommonName(commonName: string) {
  return commonName.split('(')[0]!.trim()
}
