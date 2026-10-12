// A region of one protein worth opening a session on: an InterPro domain or
// site, a PDBe-KB partner interface or ligand site. Every coordinate is on the
// UniProt canonical sequence, 1-based inclusive; the launched transcript may
// translate to another isoform, and focus.ts carries a range across.

export type RegionKind =
  | 'domain'
  | 'repeat'
  | 'site'
  | 'interface'
  | 'ligand'
  | 'residue'

export interface SiteLigand {
  id: string
  name: string
  residues: number[]
}

export interface ProteinRegion {
  kind: RegionKind
  name: string
  // 1-based inclusive residues on the UniProt canonical sequence
  start: number
  end: number
  // InterPro accession for a domain/site; the partner's accession for an
  // interface (or `DNA`/`RNA`); the PDB chemical component id of a ligand
  // site's best-attested ligand
  accession?: string
  // the Pfam family under this entry, which is what has a seed alignment
  pfam?: string
  // the Pfam match's own residues, when narrower than the entry's
  pfamSpan?: { start: number; end: number }
  // interface and ligand only: which residues actually touch the partner or
  // the ligand, and which PDB entries hold them, most-covering first
  residues?: number[]
  pdbIds?: string[]
  // ligand only: every ligand seen at the site, best-attested first, with the
  // residues it touches, a site pooling ligands that touch different ones
  ligands?: SiteLigand[]
}
