import type { FlatNodeData } from '../utils/taxonomyCache'

interface SpeciesInfo {
  ncbiRefSeqCategory?: string
  suppressed?: boolean
  commonName?: string
}

function NodeContent({
  node,
  species,
}: {
  node: FlatNodeData
  species: SpeciesInfo | undefined
}) {
  return (
    <div style={{ display: 'inline' }}>
      {node.taxonId ? (
        <a
          href={`/taxonomy/${node.taxonId}`}
          style={{ color: '#1f2937', textDecoration: 'none', fontWeight: 500, marginRight: 8 }}
        >
          {node.name ?? 'Unnamed'}
        </a>
      ) : (
        <span style={{ color: '#1f2937', marginRight: 8 }}>{node.name ?? 'Unnamed'}</span>
      )}
      {species?.commonName ? (
        <span style={{ color: '#6b7280', marginRight: 8 }}>({species.commonName})</span>
      ) : null}
      {node.accession ? (
        <>
          <a
            href={`/accession/${node.accession}`}
            style={{ color: '#2563eb', textDecoration: 'underline', marginRight: 8 }}
          >
            (info)
          </a>
          <span
            style={{
              color: '#2563eb',
              background: '#eff6ff',
              padding: '2px 6px',
              borderRadius: 4,
              marginRight: 8,
            }}
          >
            {node.accession}
          </span>
        </>
      ) : null}
      {species?.ncbiRefSeqCategory === 'reference genome' ? (
        <span title="NCBI designated reference" style={{ marginRight: 8 }}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="orange" stroke="orange" strokeWidth="0" style={{ display: 'inline-block', verticalAlign: 'middle' }}>
            <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
          </svg>
        </span>
      ) : null}
      {species?.suppressed ? (
        <span title="NCBI RefSeq suppressed" style={{ marginRight: 8 }}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="red" strokeWidth="2" style={{ display: 'inline-block', verticalAlign: 'middle' }}>
            <line x1="18" y1="6" x2="6" y2="18" />
            <line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </span>
      ) : null}
      {node.branchLength !== undefined && node.branchLength !== 1.0 ? (
        <span style={{ color: '#6b7280' }}>[{node.branchLength.toFixed(4)}]</span>
      ) : null}
    </div>
  )
}

const rowStyle: React.CSSProperties = {
  padding: '2px 8px',
  borderBottom: '1px solid #e5e7eb',
}

const summaryStyle: React.CSSProperties = {
  ...rowStyle,
  display: 'flex',
  alignItems: 'center',
  cursor: 'pointer',
  listStyle: 'none',
}

function TreeNodeComponent({
  node,
  speciesMap,
}: {
  node: FlatNodeData
  speciesMap: Map<string, SpeciesInfo>
}) {
  const species = node.accession ? speciesMap.get(node.accession) : undefined
  const bg = node.depth % 2 === 0 ? '#ffffff' : '#f9fafb'

  if (node.children && node.children.length > 0) {
    return (
      <details open style={{ paddingLeft: 20, margin: 0 }}>
        <summary style={{ ...summaryStyle, background: bg }}>
          <NodeContent node={node} species={species} />
        </summary>
        {node.children.map(child => (
          <TreeNodeComponent key={child.id} node={child} speciesMap={speciesMap} />
        ))}
      </details>
    )
  }

  return (
    <div style={{ ...rowStyle, paddingLeft: 20, display: 'flex', alignItems: 'center', background: bg }}>
      <span style={{ marginRight: 8 }}>•</span>
      <NodeContent node={node} species={species} />
    </div>
  )
}

export default function TaxonomyTreeReact({
  subtree,
  speciesMap,
}: {
  subtree: FlatNodeData
  speciesMap: Map<string, SpeciesInfo>
}) {
  return (
    <div style={{ fontFamily: 'inherit', fontSize: '14px' }}>
      <TreeNodeComponent node={subtree} speciesMap={speciesMap} />
    </div>
  )
}
