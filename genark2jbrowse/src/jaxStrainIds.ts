// JAX (Jackson Laboratory) strain IDs, verified from https://www.jax.org/strain/XXXXXX
export const JAX_STRAIN_IDS: Record<string, string> = {
  '129S1/SvImJ': '002448',
  'A/J': '000646',
  'AKR/J': '000648',
  'BALB/cJ': '000651',
  'CAST/EiJ': '000928',
  'CBA/J': '000656',
  'C3H/HeJ': '000659',
  'C57BL/6J': '000664',
  'C57BL/6NJ': '005304',
  'DBA/2J': '000671',
  'FVB/NJ': '001800',
  'JF1/MsJ': '003720',
  'LP/J': '000676',
  'NOD/ShiLtJ': '001976',
  'NZO/HlLtJ': '002105',
  'PWK/PhJ': '003715',
  'SPRET/EiJ': '001146',
  'WSB/EiJ': '001145',
}

export function jaxUrl(strainId: string) {
  return `https://www.jax.org/strain/${strainId}`
}
