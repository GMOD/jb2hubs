import { useMemo } from 'react'
import useSWRImmutable from 'swr/immutable'

import ClientOnlyDataTable from './ClientOnlyDataTable.tsx'
import TaxonomyTreeReact from './TaxonomyTreeReact.tsx'
import { useUrlState } from '../hooks/useUrlState.ts'

import type { TaxonomyDataFile } from '../../generateTaxonomyData.ts'
import type { RowData } from './DataTable/hooks/useTableColumns.tsx'

async function fetchJson<T>(url: string): Promise<T> {
  const res = await fetch(url)
  if (!res.ok) throw new Error(`${res.status} fetching ${url}`)
  return res.json() as Promise<T>
}

function slugFromPath() {
  const parts = window.location.pathname.split('/')
  return parts[parts.length - 1] || parts[parts.length - 2] || ''
}

export default function TaxonomyPage({ slug: slugProp }: { slug?: string }) {
  const slug = slugProp ?? slugFromPath()
  const { data, isLoading, error } = useSWRImmutable<TaxonomyDataFile>(
    slug ? `/taxonomy-data/${slug}.json` : null,
    fetchJson,
  )
  const [viewParam, setView] = useUrlState('view', 'tree')
  const view = viewParam === 'table' ? 'table' : 'tree'

  const speciesMap = useMemo(() => {
    const m = new Map<string, { ncbiRefSeqCategory?: string; suppressed?: boolean; commonName?: string }>()
    for (const r of data?.rows ?? []) {
      m.set((r as RowData).accession, r as RowData)
    }
    return m
  }, [data])

  if (!slug) {
    return <p style={{ color: '#666' }}>No taxon specified.</p>
  }
  if (isLoading) {
    return <p style={{ color: '#666' }}>Loading…</p>
  }
  if (error || !data) {
    return <p style={{ color: '#c00' }}>Failed to load taxonomy data for "{slug}".</p>
  }

  const { title, lineage, subtree, rows } = data

  return (
    <div>
      {lineage.length > 1 ? (
        <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 8, fontSize: 14, marginBottom: 12 }}>
          {lineage.slice(0, -1).map((node, i) => (
            <span key={node.id} style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
              {node.taxonId ? (
                <a href={`/taxonomy/${node.taxonId}`} style={{ color: '#2563eb', textDecoration: 'none' }}>
                  {node.name ?? node.taxonId}
                </a>
              ) : (
                <span style={{ color: '#6b7280' }}>{node.name}</span>
              )}
              {i < lineage.length - 2 ? <span style={{ color: '#9ca3af' }}>›</span> : null}
            </span>
          ))}
          <span style={{ color: '#9ca3af' }}>›</span>
          <span style={{ color: '#1f2937', fontWeight: 600 }}>{title}</span>
        </div>
      ) : null}

      <h1 style={{ margin: '0 0 8px' }}>{title}</h1>

      <div style={{ marginBottom: 16, display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
        <div>
          <label style={{ marginRight: 15 }}>
            <input type="radio" name="taxonomyView" checked={view === 'tree'} onChange={() => { setView('tree') }} />
            {' '}Tree view
          </label>
          <label>
            <input type="radio" name="taxonomyView" checked={view === 'table'} onChange={() => { setView('table') }} />
            {' '}Table view
          </label>
        </div>
        <span style={{ color: '#6b7280' }}>{rows.length} accessions</span>
      </div>

      {view === 'table' ? (
        <ClientOnlyDataTable rows={rows as RowData[]} />
      ) : (
        <TaxonomyTreeReact subtree={subtree} speciesMap={speciesMap} />
      )}
    </div>
  )
}
