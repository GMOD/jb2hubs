'use client'
import React, { useState, useMemo } from 'react'
import { StickyTree } from 'react-virtualized-sticky-tree'
import { ChevronRight, ChevronDown, Star, X } from 'lucide-react'

interface SpeciesData {
  accession: string
  commonName?: string
  scientificName?: string
  ncbiRefSeqCategory?: string
  suppressed?: boolean
  [key: string]: any
}

interface PhylogeneticTreeProps {
  newickData: string
  speciesData?: SpeciesData[]
  width?: number
  height?: number
}

interface TreeNode {
  name?: string
  accession?: string
  children?: TreeNode[]
  branchLength?: number
  parent?: TreeNode
}

interface FlatNodeData {
  id: string | number // Must match TreeNode.id type from the library
  name?: string
  accession?: string
  branchLength?: number
  children?: string[]
  depth: number
  isLeaf: boolean
}

interface FlatTree {
  [id: string]: FlatNodeData
}

// Simple Newick parser
function parseNewick(newick: string): TreeNode | null {
  const cleanNewick = newick.trim().replace(/;$/, '')
  if (!cleanNewick) return null

  let index = 0

  function parseNode(): TreeNode {
    const node: TreeNode = { children: [] }

    if (cleanNewick[index] === '(') {
      index++ // skip '('
      do {
        const child = parseNode()
        child.parent = node
        node.children!.push(child)
        if (cleanNewick[index] === ',') {
          index++ // skip ','
        }
      } while (
        cleanNewick[index] === ',' ||
        (cleanNewick[index] !== ')' && index < cleanNewick.length)
      )
      if (cleanNewick[index] === ')') {
        index++ // skip ')'
      }
    }

    // Parse node name
    let name = ''
    while (
      index < cleanNewick.length &&
      cleanNewick[index] !== ',' &&
      cleanNewick[index] !== ')' &&
      cleanNewick[index] !== '(' &&
      cleanNewick[index] !== ':'
    ) {
      name += cleanNewick[index]
      index++
    }

    if (name) {
      const accessionMatch = name.match(/^(.+?)\[([^\]]+)\]$/)
      if (accessionMatch) {
        node.name = accessionMatch[1]
        node.accession = accessionMatch[2]
      } else {
        node.name = name
      }
    }

    // Parse branch length
    if (cleanNewick[index] === ':') {
      index++ // skip ':'
      let lengthStr = ''
      while (
        index < cleanNewick.length &&
        cleanNewick[index] !== ',' &&
        cleanNewick[index] !== ')' &&
        cleanNewick[index] !== '('
      ) {
        lengthStr += cleanNewick[index]
        index++
      }
      node.branchLength = parseFloat(lengthStr) || 0
    }

    return node
  }

  try {
    return parseNode()
  } catch (error) {
    console.error('Error parsing Newick string:', error)
    return null
  }
}

// Convert TreeNode to flat map structure
function convertToFlatTree(node: TreeNode): { tree: FlatTree; rootId: string } {
  const tree: FlatTree = {}
  let nodeCounter = 0

  function traverse(n: TreeNode, depth: number): string {
    const id = `node_${nodeCounter++}`
    const childIds: string[] = []

    if (n.children && n.children.length > 0) {
      for (const child of n.children) {
        const childId = traverse(child, depth + 1)
        childIds.push(childId)
      }
    }

    tree[id] = {
      id,
      name: n.name,
      accession: n.accession,
      branchLength: n.branchLength,
      children: childIds.length > 0 ? childIds : undefined,
      depth,
      isLeaf: !n.children || n.children.length === 0,
    }

    return id
  }

  const rootId = traverse(node, 0)
  return { tree, rootId }
}

export default function PhylogeneticTreeVirtualized({
  newickData,
  speciesData = [],
  width = 800,
  height = 600,
}: PhylogeneticTreeProps) {
  const [error, setError] = useState<string | null>(null)
  const [expanded, setExpanded] = useState<Set<string>>(new Set(['node_0']))

  // Create a lookup map for species data by accession
  const speciesDataMap = useMemo(() => {
    const map = new Map<string, SpeciesData>()
    speciesData.forEach(species => {
      map.set(species.accession, species)
    })
    return map
  }, [speciesData])

  // Parse and convert tree
  const { tree, rootId } = useMemo(() => {
    try {
      const parsedTree = parseNewick(newickData)
      if (!parsedTree) {
        setError('Failed to parse Newick data')
        return { tree: {}, rootId: '' }
      }
      const result = convertToFlatTree(parsedTree)
      console.log('Tree converted:', Object.keys(result.tree).length, 'nodes')
      setError(null)
      return result
    } catch (err) {
      setError(`Error parsing tree: ${err}`)
      console.error('Tree parsing error:', err)
      return { tree: {}, rootId: '' }
    }
  }, [newickData])

  const toggleExpand = (id: string) => {
    const newExpanded = new Set(expanded)
    if (newExpanded.has(id)) {
      newExpanded.delete(id)
    } else {
      newExpanded.add(id)
    }
    setExpanded(newExpanded)
  }

  const expandAll = () => {
    const allIds = Object.keys(tree).filter(id => tree[id].children)
    setExpanded(new Set(allIds))
  }

  const collapseAll = () => {
    setExpanded(new Set())
  }

  // Expand all nodes by default when tree loads
  React.useEffect(() => {
    if (rootId && Object.keys(tree).length > 0) {
      const allIds = Object.keys(tree).filter(id => tree[id].children)
      setExpanded(new Set(allIds))
    }
  }, [rootId, tree])

  // Get children for StickyTree
  const getChildren = (parentNode: any) => {
    console.log('getChildren called, parentNode:', parentNode)
    const id = parentNode.id
    console.log('  id:', id)
    const node = tree[id]
    console.log('  node:', node)

    if (!node) {
      console.warn('  node not found for id:', id)
      return undefined
    }

    if (!node.children) {
      console.log('  no children')
      return undefined
    }

    if (!expanded.has(id)) {
      console.log('  not expanded')
      return undefined
    }

    const children = node.children.map((childId: string) => {
      const childNode = tree[childId]
      if (!childNode) {
        console.warn('  child not found:', childId)
      }
      return {
        node: childNode,
        height: 32,
        isSticky: true,
      }
    })
    console.log('  returning', children.length, 'children')
    return children
  }

  // Render row for StickyTree
  const rowRenderer = ({
    node,
    style,
  }: {
    node: FlatNodeData
    style: React.CSSProperties
  }) => {
    if (!node) return null

    const hasChildren = node.children && node.children.length > 0
    const isExpanded = expanded.has(node.id)
    const indent = node.depth * 20

    // Get species metadata if this is a leaf node with an accession
    const speciesInfo = node.accession
      ? speciesDataMap.get(node.accession)
      : undefined

    return (
      <div
        style={{
          ...style,
          display: 'flex',
          alignItems: 'center',
          paddingLeft: `${indent}px`,
          backgroundColor: node.depth % 2 === 0 ? '#ffffff' : '#f9fafb',
          borderBottom: '1px solid #e5e7eb',
          cursor: hasChildren ? 'pointer' : 'default',
          // fontSize: '13px',
        }}
        onClick={() => hasChildren && toggleExpand(node.id)}
      >
        <div style={{ width: '20px', display: 'flex', alignItems: 'center' }}>
          {hasChildren ? (
            isExpanded ? (
              <ChevronDown size={16} />
            ) : (
              <ChevronRight size={16} />
            )
          ) : (
            <span style={{ marginLeft: '4px' }}>•</span>
          )}
        </div>
        <div
          style={{
            flex: 1,
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            overflow: 'hidden',
          }}
        >
          <span
            style={{
              // fontWeight: node.isLeaf ? 'normal' : '500',
              color: node.isLeaf ? '#374151' : '#1f2937',
            }}
          >
            {node.name || 'Unnamed'}
          </span>
          {speciesInfo?.commonName && (
            <span
              style={{
                color: '#6b7280',
                // fontSize: '12px',
                // fontStyle: 'italic',
              }}
            >
              ({speciesInfo.commonName})
            </span>
          )}
          {node.accession && (
            <>
              <a
                href={`/accession/${node.accession}`}
                style={{
                  color: '#2563eb',
                  // fontSize: '12px',
                  textDecoration: 'underline',
                }}
                onClick={e => e.stopPropagation()}
              >
                (info)
              </a>
              <span
                style={{
                  color: '#2563eb',
                  // fontSize: '12px',
                  backgroundColor: '#eff6ff',
                  padding: '2px 6px',
                  borderRadius: '4px',
                  cursor: 'pointer',
                }}
                onClick={e => {
                  e.stopPropagation()
                  navigator.clipboard.writeText(node.accession!)
                }}
                title="Click to copy accession"
              >
                {node.accession}
              </span>
            </>
          )}
          {speciesInfo?.ncbiRefSeqCategory === 'reference genome' && (
            <span title="NCBI designated reference">
              <Star
                fill="orange"
                strokeWidth={0}
                size={14}
                style={{ display: 'inline-block', verticalAlign: 'middle' }}
              />
            </span>
          )}
          {speciesInfo?.suppressed && (
            <span title="NCBI RefSeq suppressed">
              <X
                stroke="red"
                size={14}
                style={{ display: 'inline-block', verticalAlign: 'middle' }}
              />
            </span>
          )}
          {node.branchLength !== undefined && node.branchLength !== 1.0 && (
            <span
              style={{
                color: '#6b7280',
                // fontSize: '11px',
              }}
            >
              [{node.branchLength.toFixed(4)}]
            </span>
          )}
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div
        style={{
          padding: '16px',
          border: '1px solid #fca5a5',
          backgroundColor: '#fef2f2',
          borderRadius: '4px',
        }}
      >
        <h3
          style={{ color: '#991b1b', fontWeight: '600', marginBottom: '8px' }}
        >
          Error loading phylogenetic tree
        </h3>
        <p style={{ color: '#dc2626' }}>{error}</p>
      </div>
    )
  }

  if (!rootId) {
    return (
      <div
        style={{
          padding: '16px',
          border: '1px solid #d1d5db',
          backgroundColor: '#f9fafb',
          borderRadius: '4px',
        }}
      >
        <p>Loading phylogenetic tree...</p>
      </div>
    )
  }

  const leafCount = Object.values(tree).filter(n => n.isLeaf).length
  const accessionCount = Object.values(tree).filter(n => n.accession).length

  return (
    <div style={{ padding: '16px' }}>
      <div
        style={{
          marginBottom: '16px',
          display: 'flex',
          gap: '8px',
          alignItems: 'center',
          flexWrap: 'wrap',
        }}
      >
        <button
          onClick={expandAll}
          style={{
            padding: '8px 16px',
            backgroundColor: '#f3f4f6',
            border: '1px solid #d1d5db',
            borderRadius: '4px',
            cursor: 'pointer',
            fontSize: '14px',
          }}
        >
          Expand All
        </button>
        <button
          onClick={collapseAll}
          style={{
            padding: '8px 16px',
            backgroundColor: '#f3f4f6',
            border: '1px solid #d1d5db',
            borderRadius: '4px',
            cursor: 'pointer',
            fontSize: '14px',
          }}
        >
          Collapse All
        </button>
        <div style={{ fontSize: '14px', color: '#6b7280', marginLeft: 'auto' }}>
          {leafCount} leaves • {accessionCount} accessions
        </div>
      </div>
      <div
        style={{
          border: '1px solid #d1d5db',
          borderRadius: '4px',
          overflow: 'hidden',
        }}
      >
        <StickyTree
          root={{ node: tree[rootId], height: 32 }}
          width={width}
          height={height}
          getChildren={getChildren}
          rowRenderer={rowRenderer}
          renderRoot={true}
          overscanRowCount={10}
        />
      </div>
      <div style={{ marginTop: '8px', fontSize: '14px', color: '#6b7280' }}>
        <p>
          Click nodes to expand/collapse • Click (info) to view details • Click
          accessions to copy •{' '}
          <Star
            fill="orange"
            strokeWidth={0}
            size={12}
            style={{ display: 'inline' }}
          />{' '}
          Designated reference •{' '}
          <X stroke="red" size={12} style={{ display: 'inline' }} /> Suppressed
        </p>
      </div>
    </div>
  )
}
