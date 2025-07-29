'use client'
import React, { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'

interface PhylogeneticTreeProps {
  newickData: string
  width?: number
  height?: number
}

interface TreeNode {
  name?: string
  accession?: string
  children?: TreeNode[]
  branchLength?: number
  x?: number
  y?: number
  parent?: TreeNode
}

// Simple Newick parser
function parseNewick(newick: string): TreeNode | null {
  // Remove whitespace and trailing semicolon
  const cleanNewick = newick.trim().replace(/;$/, '')
  
  if (!cleanNewick) return null
  
  let index = 0
  
  function parseNode(): TreeNode {
    const node: TreeNode = { children: [] }
    
    if (cleanNewick[index] === '(') {
      // Internal node with children
      index++ // skip '('
      
      do {
        const child = parseNode()
        child.parent = node
        node.children!.push(child)
        
        if (cleanNewick[index] === ',') {
          index++ // skip ','
        }
      } while (cleanNewick[index] === ',' || (cleanNewick[index] !== ')' && index < cleanNewick.length))
      
      if (cleanNewick[index] === ')') {
        index++ // skip ')'
      }
    }
    
    // Parse node name
    let name = ''
    while (index < cleanNewick.length && 
           cleanNewick[index] !== ',' && 
           cleanNewick[index] !== ')' && 
           cleanNewick[index] !== '(' &&
           cleanNewick[index] !== ':') {
      name += cleanNewick[index]
      index++
    }
    
    if (name) {
      // Extract accession from name if present (format: "Species name[GCF_XXXXXXX.X]")
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
      while (index < cleanNewick.length && 
             cleanNewick[index] !== ',' && 
             cleanNewick[index] !== ')' && 
             cleanNewick[index] !== '(') {
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

// Calculate tree layout
function calculateLayout(root: TreeNode, width: number, height: number) {
  if (!root) return
  
  // First pass: calculate depths and leaf counts
  function calculateDepths(node: TreeNode, depth = 0): number {
    node.x = depth
    
    if (!node.children || node.children.length === 0) {
      return 1 // Leaf node
    }
    
    let leafCount = 0
    for (const child of node.children) {
      leafCount += calculateDepths(child, depth + 1)
    }
    
    return leafCount
  }
  
  const totalLeaves = calculateDepths(root)
  
  // Second pass: calculate Y positions
  let leafIndex = 0
  
  function calculatePositions(node: TreeNode) {
    if (!node.children || node.children.length === 0) {
      // Leaf node
      node.y = (leafIndex / (totalLeaves - 1)) * (height - 40) + 20
      leafIndex++
    } else {
      // Internal node - position at average of children
      for (const child of node.children) {
        calculatePositions(child)
      }
      
      const childYs = node.children.map(child => child.y || 0)
      node.y = childYs.reduce((sum, y) => sum + y, 0) / childYs.length
    }
    
    // Scale X position
    node.x = (node.x || 0) * (width - 100) / getMaxDepth(root) + 50
  }
  
  calculatePositions(root)
}

// Get maximum depth of tree
function getMaxDepth(node: TreeNode, depth = 0): number {
  if (!node.children || node.children.length === 0) {
    return depth
  }
  
  return Math.max(...node.children.map(child => getMaxDepth(child, depth + 1)))
}

// Collect all nodes for rendering
function collectNodes(node: TreeNode, nodes: TreeNode[] = []): TreeNode[] {
  nodes.push(node)
  if (node.children) {
    for (const child of node.children) {
      collectNodes(child, nodes)
    }
  }
  return nodes
}

export default function PhylogeneticTree({ 
  newickData, 
  width = 800, 
  height = 600 
}: PhylogeneticTreeProps) {
  const svgRef = useRef<SVGSVGElement>(null)
  const [tree, setTree] = useState<TreeNode | null>(null)
  const [error, setError] = useState<string | null>(null)
  const router = useRouter()
  
  useEffect(() => {
    try {
      const parsedTree = parseNewick(newickData)
      if (parsedTree) {
        calculateLayout(parsedTree, width, height)
        setTree(parsedTree)
        setError(null)
      } else {
        setError('Failed to parse Newick data')
      }
    } catch (err) {
      setError(`Error parsing tree: ${err}`)
      console.error('Tree parsing error:', err)
    }
  }, [newickData, width, height])
  
  const handleNodeClick = (node: TreeNode) => {
    if (node.accession) {
      router.push(`/accession/${node.accession}`)
    }
  }
  
  if (error) {
    return (
      <div className="p-4 border border-red-300 bg-red-50 rounded">
        <h3 className="text-red-800 font-semibold">Error loading phylogenetic tree</h3>
        <p className="text-red-600">{error}</p>
      </div>
    )
  }
  
  if (!tree) {
    return (
      <div className="p-4 border border-gray-300 bg-gray-50 rounded">
        <p>Loading phylogenetic tree...</p>
      </div>
    )
  }
  
  const allNodes = collectNodes(tree)
  
  return (
    <div className="phylogenetic-tree-container">
      <svg
        ref={svgRef}
        width={width}
        height={height}
        className="border border-gray-300"
      >
        {/* Render branches */}
        {allNodes.map((node, index) => {
          if (!node.children) return null
          
          return node.children.map((child, childIndex) => (
            <g key={`${index}-${childIndex}`}>
              {/* Horizontal line to child */}
              <line
                x1={node.x}
                y1={node.y}
                x2={child.x}
                y2={node.y}
                stroke="#666"
                strokeWidth="1"
              />
              {/* Vertical line to child */}
              <line
                x1={child.x}
                y1={node.y}
                x2={child.x}
                y2={child.y}
                stroke="#666"
                strokeWidth="1"
              />
            </g>
          ))
        })}
        
        {/* Render nodes */}
        {allNodes.map((node, index) => (
          <g key={index}>
            {/* Node circle */}
            <circle
              cx={node.x}
              cy={node.y}
              r={node.accession ? 4 : 2}
              fill={node.accession ? "#2563eb" : "#666"}
              stroke={node.accession ? "#1d4ed8" : "#333"}
              strokeWidth="1"
              className={node.accession ? "cursor-pointer hover:fill-blue-600" : ""}
              onClick={() => handleNodeClick(node)}
            />
            
            {/* Node label */}
            {node.name && (
              <text
                x={node.x + 8}
                y={node.y + 4}
                fontSize="10"
                fill="#333"
                className={node.accession ? "cursor-pointer hover:fill-blue-600" : ""}
                onClick={() => handleNodeClick(node)}
              >
                {node.name}
                {node.accession && (
                  <tspan fill="#666" fontSize="9">
                    {` [${node.accession}]`}
                  </tspan>
                )}
              </text>
            )}
          </g>
        ))}
      </svg>
      
      <div className="mt-2 text-sm text-gray-600">
        <p>Click on leaf nodes (blue circles) to view accession details</p>
        <p>Tree contains {allNodes.filter(n => n.accession).length} accessions</p>
      </div>
    </div>
  )
}