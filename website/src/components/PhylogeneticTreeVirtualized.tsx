'use client'
import React, { useState } from 'react'
import { StickyTree } from 'react-virtualized-sticky-tree'
import { ChevronRight, ChevronDown } from 'lucide-react'

interface PhylogeneticTreeProps {
  newickData: string
  width?: number
  height?: number
}

// Demo tree data matching the library's expected format
const demoTree: { [id: string]: any } = {
  root: {
    name: 'Root Node',
    children: ['child1', 'child2', 'child3'],
    depth: 0,
  },
  child1: {
    name: 'Child 1',
    children: ['child4', 'child5'],
    depth: 1,
  },
  child2: {
    name: 'Child 2',
    depth: 1,
  },
  child3: {
    name: 'Child 3',
    children: ['child6'],
    depth: 1,
  },
  child4: {
    name: 'Child 4',
    depth: 2,
  },
  child5: {
    name: 'Child 5',
    depth: 2,
  },
  child6: {
    name: 'Child 6',
    depth: 2,
  },
}

export default function PhylogeneticTreeVirtualized({
  newickData,
  width = 800,
  height = 600,
}: PhylogeneticTreeProps) {
  const [expanded, setExpanded] = useState<Set<string>>(new Set(['root', 'child1', 'child3']))

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
    const allIds = Object.keys(demoTree).filter(id => demoTree[id].children)
    setExpanded(new Set(allIds))
  }

  const collapseAll = () => {
    setExpanded(new Set())
  }

  // Get children for StickyTree
  const getChildren = (parentNode: any) => {
    console.log('getChildren called with:', parentNode)
    const id = parentNode.id
    const node = demoTree[id]
    if (!node || !node.children || !expanded.has(id)) {
      console.log('  returning undefined')
      return undefined
    }
    const children = node.children.map((childId: string) => ({
      node: { id: childId, ...demoTree[childId] },
      height: 32,
      isSticky: true,
    }))
    console.log('  returning children:', children)
    return children
  }

  // Render row for StickyTree
  const rowRenderer = ({ node, style }: { node: any; style: React.CSSProperties }) => {
    console.log('rowRenderer called with node:', node)
    const id = node.id
    const nodeData = demoTree[id]
    if (!nodeData) return null

    const hasChildren = nodeData.children && nodeData.children.length > 0
    const isExpanded = expanded.has(id)
    const indent = nodeData.depth * 20

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
          fontFamily: 'monospace',
          fontSize: '14px',
        }}
        onClick={() => hasChildren && toggleExpand(id)}
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
          <span style={{ fontWeight: hasChildren ? '500' : 'normal' }}>
            {nodeData.name}
          </span>
          <span style={{ color: '#6b7280', fontSize: '12px' }}>
            [id: {id}]
          </span>
        </div>
      </div>
    )
  }

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
        <div
          style={{
            padding: '8px',
            backgroundColor: '#fef3c7',
            border: '1px solid #f59e0b',
            borderRadius: '4px',
            fontSize: '14px',
          }}
        >
          ⚠️ Demo mode - showing sample tree data
        </div>
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
      </div>
      <div
        style={{
          border: '1px solid #d1d5db',
          borderRadius: '4px',
          overflow: 'hidden',
        }}
      >
        <StickyTree
          root={{ node: { id: 'root', ...demoTree.root }, height: 32 }}
          width={width}
          height={height}
          getChildren={getChildren}
          rowRenderer={rowRenderer}
          renderRoot={true}
          overscanRowCount={10}
        />
      </div>
      <div style={{ marginTop: '8px', fontSize: '14px', color: '#6b7280' }}>
        <p>Demo tree with {Object.keys(demoTree).length} nodes</p>
        <p>Click nodes to expand/collapse</p>
      </div>
    </div>
  )
}
