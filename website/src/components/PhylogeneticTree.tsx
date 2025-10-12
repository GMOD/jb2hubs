'use client'
import React, { useEffect, useRef, useState } from 'react'
import {
  useFloating,
  autoUpdate,
  offset,
  flip,
  shift,
  useHover,
  useDismiss,
  useRole,
  useInteractions,
  FloatingPortal,
  useClick,
} from '@floating-ui/react'

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
  angle?: number
  radius?: number
}

interface ClickableNode extends TreeNode {
  rect: { x: number; y: number; width: number; height: number }
  nodeCircle?: { x: number; y: number; radius: number }
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

// Calculate tree layout in a single pass
function calculateLayout(
  root: TreeNode,
  width: number,
  height: number,
  verticalZoom: number = 1,
  scrollOffset: number = 0,
) {
  if (!root) return

  let leafIndex = 0
  let maxDepth = 0

  function layout(node: TreeNode, depth: number) {
    node.x = depth
    maxDepth = Math.max(maxDepth, depth)

    if (!node.children || node.children.length === 0) {
      // Leaf node
      node.y = leafIndex * 20 * verticalZoom
      leafIndex++
    } else {
      // Internal node
      let ySum = 0
      for (const child of node.children) {
        layout(child, depth + 1)
        ySum += child.y!
      }
      node.y = ySum / node.children.length
    }
  }

  layout(root, 0)

  // Scale positions to fit the canvas
  const allNodes = collectNodes(root)
  const xFactor = (width - 100) / maxDepth
  const baseSpacing = (height - 40) / (leafIndex * 20)
  const zoomedSpacing = verticalZoom
  const actualSpacing = Math.max(baseSpacing, zoomedSpacing)

  for (const node of allNodes) {
    node.x = node.x! * xFactor + 50
    node.y = node.y! * actualSpacing + 20 - scrollOffset
  }

  return leafIndex
}

const memoizedGetTotalLeaves = (() => {
  const memo = new WeakMap<TreeNode, number>()
  return (node: TreeNode): number => {
    if (memo.has(node)) {
      return memo.get(node)!
    }
    const count = getTotalLeaves(node)
    memo.set(node, count)
    return count
  }
})()

function calculateCircularLayout(
  root: TreeNode,
  width: number,
  height: number,
) {
  if (!root) return

  let leafIndex = 0
  let maxDepth = 0
  const totalLeaves = memoizedGetTotalLeaves(root)

  function layout(node: TreeNode, depth: number) {
    node.radius = depth
    maxDepth = Math.max(maxDepth, depth)

    if (!node.children || node.children.length === 0) {
      // Leaf node
      node.angle = (leafIndex / totalLeaves) * 2 * Math.PI
      leafIndex++
    } else {
      // Internal node
      let angleSum = 0
      for (const child of node.children) {
        layout(child, depth + 1)
        angleSum += child.angle!
      }
      node.angle = angleSum / node.children.length
    }
  }

  layout(root, 0)

  const allNodes = collectNodes(root)
  const radiusFactor = Math.min(width, height) / 2 / maxDepth

  for (const node of allNodes) {
    const r = node.radius! * radiusFactor
    node.x = width / 2 + r * Math.cos(node.angle!)
    node.y = height / 2 + r * Math.sin(node.angle!)
  }
}

function getTotalLeaves(node: TreeNode): number {
  if (!node.children || node.children.length === 0) {
    return 1
  }
  let count = 0
  for (const child of node.children) {
    count += getTotalLeaves(child)
  }
  return count
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
  height = 600,
}: PhylogeneticTreeProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [tree, setTree] = useState<TreeNode | null>(null)
  const [clickableNodes, setClickableNodes] = useState<ClickableNode[]>([])
  const [error, setError] = useState<string | null>(null)
  const [progress, setProgress] = useState(0)
  const [isCircular, setIsCircular] = useState(false)
  const [verticalZoom, setVerticalZoom] = useState(1)
  const [showNonLeafText, setShowNonLeafText] = useState(false)
  const [scrollOffset, setScrollOffset] = useState(0)
  const [isDraggingScrollbar, setIsDraggingScrollbar] = useState(false)
  const animationFrameId = useRef<number | null>(null)
  const containerRef = useRef<HTMLDivElement>(null)

  // Tooltip state
  const [hoveredNode, setHoveredNode] = useState<TreeNode | null>(null)
  const [tooltipOpen, setTooltipOpen] = useState(false)

  // Context menu state
  const [contextMenuNode, setContextMenuNode] = useState<TreeNode | null>(null)
  const [contextMenuOpen, setContextMenuOpen] = useState(false)

  // Tooltip floating UI
  const {
    refs: tooltipRefs,
    floatingStyles: tooltipStyles,
    context: tooltipContext,
  } = useFloating({
    open: tooltipOpen,
    onOpenChange: setTooltipOpen,
    middleware: [
      offset(5),
      flip({
        fallbackAxisSideDirection: 'start',
      }),
      shift(),
    ],
    whileElementsMounted: autoUpdate,
  })

  const hover = useHover(tooltipContext, { move: false })
  const dismissTooltip = useDismiss(tooltipContext)
  const tooltipRole = useRole(tooltipContext, { role: 'tooltip' })

  const {
    getReferenceProps: getTooltipReferenceProps,
    getFloatingProps: getTooltipFloatingProps,
  } = useInteractions([hover, dismissTooltip, tooltipRole])

  // Context menu floating UI
  const {
    refs: contextRefs,
    floatingStyles: contextStyles,
    context: contextContext,
  } = useFloating({
    open: contextMenuOpen,
    onOpenChange: setContextMenuOpen,
    middleware: [offset(5), flip(), shift()],
    whileElementsMounted: autoUpdate,
  })

  const click = useClick(contextContext)
  const dismissContext = useDismiss(contextContext)
  const contextRole = useRole(contextContext, { role: 'menu' })

  const {
    getReferenceProps: getContextReferenceProps,
    getFloatingProps: getContextFloatingProps,
  } = useInteractions([click, dismissContext, contextRole])

  useEffect(() => {
    try {
      const parsedTree = parseNewick(newickData)
      if (parsedTree) {
        if (isCircular) {
          calculateCircularLayout(parsedTree, width, height)
        } else {
          calculateLayout(parsedTree, width, height, verticalZoom, scrollOffset)
        }
        setTree(parsedTree)
        setError(null)
      } else {
        setError('Failed to parse Newick data')
      }
    } catch (err) {
      setError(`Error parsing tree: ${err}`)
      console.error('Tree parsing error:', err)
    }
  }, [newickData, width, height, isCircular, verticalZoom, scrollOffset])

  useEffect(() => {
    if (!tree || !canvasRef.current) return

    const canvas = canvasRef.current
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    if (animationFrameId.current) {
      cancelAnimationFrame(animationFrameId.current)
    }

    const allNodes = collectNodes(tree)
    const newClickableNodes: ClickableNode[] = []
    const radiusFactor = isCircular
      ? Math.min(width, height) / 2 / memoizedGetTotalLeaves(tree)
      : 0

    // Pre-calculate spacing once for all nodes
    const leafCount = allNodes.filter(
      n => !n.children || n.children.length === 0,
    ).length
    const baseSpacing = (height - 40) / leafCount
    const zoomedSpacing = 20 * verticalZoom
    const actualSpacing = Math.max(baseSpacing, zoomedSpacing)
    const shouldDrawText = actualSpacing >= 4

    let i = 0
    function drawTree() {
      if (i >= allNodes.length) {
        setClickableNodes(newClickableNodes)
        setProgress(100)
        return
      }

      const chunkSize = 1000
      for (let j = 0; j < chunkSize && i < allNodes.length; j++) {
        const node = allNodes[i]
        // branches
        if (node.children) {
          for (let k = 0; k < node.children.length; k++) {
            const child = node.children[k]
            ctx.beginPath()
            ctx.moveTo(node.x!, node.y!)
            if (isCircular) {
              const parentRadius = node.radius! * radiusFactor
              const childRadius = child.radius! * radiusFactor
              ctx.arc(
                width / 2,
                height / 2,
                parentRadius,
                node.angle!,
                child.angle!,
              )
            } else {
              ctx.lineTo(child.x!, node.y!)
              ctx.lineTo(child.x!, child.y!)
            }
            ctx.stroke()
          }
        }

        // node
        const nodeRadius = node.accession ? 4 : 2
        ctx.beginPath()
        ctx.arc(node.x!, node.y!, nodeRadius, 0, 2 * Math.PI)
        ctx.fillStyle = node.accession ? '#2563eb' : '#666'
        ctx.fill()

        // Always add node circle for tooltip detection
        const clickableNode: ClickableNode = {
          ...node,
          rect: { x: 0, y: 0, width: 0, height: 0 },
          nodeCircle: { x: node.x!, y: node.y!, radius: nodeRadius + 2 },
        }

        // Only draw text if there's enough vertical space (pre-calculated)
        const isLeafNode = !node.children || node.children.length === 0
        if (node.name && shouldDrawText && (isLeafNode || showNonLeafText)) {
          ctx.save()
          ctx.translate(node.x!, node.y!)
          ctx.rotate(node.angle!)
          const label = `${node.name}${node.accession ? ` [${node.accession}]` : ''}`
          ctx.font = '10px sans-serif'
          ctx.fillStyle = '#333'
          ctx.fillText(label, 8, 4)

          if (node.accession) {
            const textMetrics = ctx.measureText(label)
            clickableNode.rect = {
              x: node.x! + 8,
              y: node.y! - 6,
              width: textMetrics.width,
              height: 10,
            }
          }
          ctx.restore()
        }

        newClickableNodes.push(clickableNode)
        i++
      }
      setProgress(Math.round((i / allNodes.length) * 100))
      animationFrameId.current = requestAnimationFrame(drawTree)
    }

    ctx.clearRect(0, 0, width, height)
    drawTree()

    return () => {
      if (animationFrameId.current) {
        cancelAnimationFrame(animationFrameId.current)
      }
    }
  }, [tree, width, height, isCircular, verticalZoom, showNonLeafText])

  const handleCanvasClick = (event: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current
    if (!canvas) return

    const rect = canvas.getBoundingClientRect()
    const x = event.clientX - rect.left
    const y = event.clientY - rect.top

    let foundNode = null
    for (const node of clickableNodes) {
      // Check if clicking on node circle first (higher priority)
      if (node.nodeCircle) {
        const dx = x - node.nodeCircle.x
        const dy = y - node.nodeCircle.y
        const distance = Math.sqrt(dx * dx + dy * dy)
        if (distance <= node.nodeCircle.radius) {
          foundNode = node
          break
        }
      }

      // Then check text area for nodes with accession
      if (
        node.accession &&
        node.rect.width > 0 &&
        x >= node.rect.x &&
        x <= node.rect.x + node.rect.width &&
        y >= node.rect.y &&
        y <= node.rect.y + node.rect.height
      ) {
        foundNode = node
        break
      }
    }

    if (foundNode) {
      setContextMenuNode(foundNode)
      contextRefs.setPositionReference({
        getBoundingClientRect() {
          return {
            width: 0,
            height: 0,
            x: event.clientX,
            y: event.clientY,
            top: event.clientY,
            left: event.clientX,
            right: event.clientX,
            bottom: event.clientY,
          }
        },
      })
      setContextMenuOpen(true)
      // Hide tooltip when context menu opens
      setTooltipOpen(false)
    } else {
      setContextMenuOpen(false)
    }
  }

  const handleCanvasMouseMove = (
    event: React.MouseEvent<HTMLCanvasElement>,
  ) => {
    const canvas = canvasRef.current
    if (!canvas) return

    const rect = canvas.getBoundingClientRect()
    const x = event.clientX - rect.left
    const y = event.clientY - rect.top

    let foundNode = null
    for (const node of clickableNodes) {
      // Check if hovering over node circle first (higher priority)
      if (node.nodeCircle) {
        const dx = x - node.nodeCircle.x
        const dy = y - node.nodeCircle.y
        const distance = Math.sqrt(dx * dx + dy * dy)
        if (distance <= node.nodeCircle.radius) {
          foundNode = node
          break
        }
      }

      // Then check text area for nodes with accession
      if (
        node.accession &&
        node.rect.width > 0 &&
        x >= node.rect.x &&
        x <= node.rect.x + node.rect.width &&
        y >= node.rect.y &&
        y <= node.rect.y + node.rect.height
      ) {
        foundNode = node
        break
      }
    }

    if (foundNode) {
      if (hoveredNode !== foundNode) {
        setHoveredNode(foundNode)
        tooltipRefs.setPositionReference({
          getBoundingClientRect() {
            return {
              width: 0,
              height: 0,
              x: event.clientX,
              y: event.clientY,
              top: event.clientY,
              left: event.clientX,
              right: event.clientX,
              bottom: event.clientY,
            }
          },
        })
        setTooltipOpen(true)
      }
    } else {
      if (hoveredNode) {
        setHoveredNode(null)
        setTooltipOpen(false)
      }
    }
  }

  const handleCanvasMouseLeave = () => {
    setHoveredNode(null)
    setTooltipOpen(false)
  }

  const handleContextMenuAction = (action: string, node: TreeNode) => {
    switch (action) {
      case 'copy-name':
        if (node.name) {
          navigator.clipboard.writeText(node.name)
        }
        break
      case 'copy-accession':
        if (node.accession) {
          navigator.clipboard.writeText(node.accession)
        }
        break
      case 'view-details':
        console.log('Node details:', {
          name: node.name,
          accession: node.accession,
          branchLength: node.branchLength,
          position: { x: node.x, y: node.y },
        })
        break
      case 'highlight-path':
        // Future: implement path highlighting
        console.log('Highlighting path for:', node.name)
        break
    }
    setContextMenuOpen(false)
  }

  const handleZoomIn = () => {
    setVerticalZoom(prev => Math.min(prev * 1.5, 1.5))
  }

  const handleZoomOut = () => {
    setVerticalZoom(prev => Math.max(prev / 1.5, 0.1))
  }

  const handleResetZoom = () => {
    setVerticalZoom(1)
  }

  // Scrollbar handlers
  const handleScrollbarMouseDown = (event: React.MouseEvent<HTMLDivElement>) => {
    if (!tree || isCircular) return
    event.preventDefault()
    setIsDraggingScrollbar(true)

    const scrollbarElement = event.currentTarget
    const rect = scrollbarElement.getBoundingClientRect()
    const y = event.clientY - rect.top

    const maxScroll = getMaxScrollOffset()
    const scrollbarHeight = height - 20
    const thumbHeight = Math.max(30, (height / (height + maxScroll)) * scrollbarHeight)
    const maxThumbTop = scrollbarHeight - thumbHeight

    // Calculate where the click was relative to the thumb
    const thumbTop = (scrollOffset / maxScroll) * maxThumbTop
    const clickOffsetInThumb = y - thumbTop

    // Store this offset for dragging
    ;(scrollbarElement as any)._clickOffset = clickOffsetInThumb
  }

  const handleScrollbarMouseMove = (event: React.MouseEvent<HTMLDivElement>) => {
    if (!isDraggingScrollbar || !tree || isCircular) return
    event.preventDefault()

    const scrollbarElement = event.currentTarget
    const rect = scrollbarElement.getBoundingClientRect()
    const y = event.clientY - rect.top

    const maxScroll = getMaxScrollOffset()
    const scrollbarHeight = height - 20
    const thumbHeight = Math.max(30, (height / (height + maxScroll)) * scrollbarHeight)
    const maxThumbTop = scrollbarHeight - thumbHeight

    const clickOffset = (scrollbarElement as any)._clickOffset || thumbHeight / 2
    const thumbTop = y - clickOffset
    const clampedThumbTop = Math.max(0, Math.min(thumbTop, maxThumbTop))

    const newScrollOffset = (clampedThumbTop / maxThumbTop) * maxScroll
    setScrollOffset(Math.max(0, Math.min(newScrollOffset, maxScroll)))
  }

  const handleScrollbarMouseUp = () => {
    setIsDraggingScrollbar(false)
  }

  // Add global mouse up listener for scrollbar dragging
  useEffect(() => {
    if (isDraggingScrollbar) {
      const handleGlobalMouseUp = () => setIsDraggingScrollbar(false)
      window.addEventListener('mouseup', handleGlobalMouseUp)
      return () => window.removeEventListener('mouseup', handleGlobalMouseUp)
    }
  }, [isDraggingScrollbar])

  // Calculate max scroll offset based on tree height
  const getMaxScrollOffset = () => {
    if (!tree) return 0
    const allNodes = collectNodes(tree)
    const leafCount = allNodes.filter(n => !n.children || n.children.length === 0).length
    const totalHeight = leafCount * 20 * verticalZoom
    return Math.max(0, totalHeight - height + 40)
  }

  // Native wheel event handler for better preventDefault/stopPropagation control
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    const handleWheel = (event: WheelEvent) => {
      event.preventDefault()
      event.stopPropagation()

      const delta = event.deltaY

      if (isCircular) {
        // In circular mode, use wheel for zoom
        const zoomFactor = 1.1
        if (delta < 0) {
          setVerticalZoom(prev => Math.min(prev * zoomFactor, 1.5))
        } else {
          setVerticalZoom(prev => Math.max(prev / zoomFactor, 0.1))
        }
      } else {
        // In rectangular mode, use wheel for scrolling
        setScrollOffset(prev => {
          const maxScroll = getMaxScrollOffset()
          const newOffset = prev + delta
          return Math.max(0, Math.min(newOffset, maxScroll))
        })
      }
    }

    canvas.addEventListener('wheel', handleWheel, { passive: false })

    return () => {
      canvas.removeEventListener('wheel', handleWheel)
    }
  }, [tree, isCircular, verticalZoom, height])

  if (error) {
    return (
      <div className="p-4 border border-red-300 bg-red-50 rounded">
        <h3 className="text-red-800 font-semibold">
          Error loading phylogenetic tree
        </h3>
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
          onClick={() => setIsCircular(!isCircular)}
          style={{
            padding: '8px 16px',
            backgroundColor: '#f3f4f6',
            border: '1px solid #d1d5db',
            borderRadius: '4px',
            cursor: 'pointer',
            fontSize: '14px',
          }}
        >
          {isCircular ? 'Show Rectangular' : 'Show Circular'}
        </button>

        <button
          onClick={() => setShowNonLeafText(!showNonLeafText)}
          style={{
            padding: '8px 16px',
            backgroundColor: showNonLeafText ? '#dbeafe' : '#f3f4f6',
            border: '1px solid #d1d5db',
            borderRadius: '4px',
            cursor: 'pointer',
            fontSize: '14px',
          }}
        >
          {showNonLeafText ? 'Hide Internal' : 'Show Internal'}
        </button>

        <div style={{ display: 'flex', gap: '4px', alignItems: 'center' }}>
          <span style={{ fontSize: '14px', color: '#666' }}>
            Vertical Zoom:
          </span>
          <button
            onClick={handleZoomOut}
            style={{
              padding: '4px 8px',
              backgroundColor: '#f3f4f6',
              border: '1px solid #d1d5db',
              borderRadius: '4px',
              cursor: 'pointer',
              fontSize: '14px',
              minWidth: '32px',
            }}
          >
            -
          </button>
          <span
            style={{
              fontSize: '12px',
              minWidth: '40px',
              textAlign: 'center',
              color: '#374151',
            }}
          >
            {verticalZoom.toFixed(1)}x
          </span>
          <button
            onClick={handleZoomIn}
            style={{
              padding: '4px 8px',
              backgroundColor: '#f3f4f6',
              border: '1px solid #d1d5db',
              borderRadius: '4px',
              cursor: 'pointer',
              fontSize: '14px',
              minWidth: '32px',
            }}
          >
            +
          </button>
          <button
            onClick={handleResetZoom}
            style={{
              padding: '4px 8px',
              backgroundColor: '#f3f4f6',
              border: '1px solid #d1d5db',
              borderRadius: '4px',
              cursor: 'pointer',
              fontSize: '12px',
            }}
          >
            Reset
          </button>
        </div>
      </div>
      {progress < 100 && (
        <div style={{ width: '100%', backgroundColor: '#ddd' }}>
          <div
            style={{
              width: `${progress}%`,
              backgroundColor: '#4caf50',
              height: '20px',
              textAlign: 'center',
              lineHeight: '20px',
              color: 'white',
            }}
          >
            {progress}%
          </div>
        </div>
      )}
      <div style={{ display: 'flex', position: 'relative' }}>
        <canvas
          ref={canvasRef}
          width={width}
          height={height}
          onClick={handleCanvasClick}
          onMouseMove={handleCanvasMouseMove}
          onMouseLeave={handleCanvasMouseLeave}
          style={{
            cursor: clickableNodes.length > 0 ? 'pointer' : 'default',
            border: '1px solid #d1d5db',
          }}
        />
        {!isCircular && (() => {
          const maxScroll = getMaxScrollOffset()
          if (maxScroll <= 0) return null

          const scrollbarHeight = height - 20
          const thumbHeight = Math.max(30, (height / (height + maxScroll)) * scrollbarHeight)
          const maxThumbTop = scrollbarHeight - thumbHeight
          const thumbTop = maxScroll > 0 ? (scrollOffset / maxScroll) * maxThumbTop : 0

          return (
            <div
              onMouseDown={handleScrollbarMouseDown}
              onMouseMove={handleScrollbarMouseMove}
              onMouseUp={handleScrollbarMouseUp}
              style={{
                width: '16px',
                height: `${height}px`,
                backgroundColor: '#f3f4f6',
                border: '1px solid #d1d5db',
                borderLeft: 'none',
                position: 'relative',
                cursor: isDraggingScrollbar ? 'grabbing' : 'pointer',
                userSelect: 'none',
              }}
            >
              <div
                style={{
                  position: 'absolute',
                  top: `${10 + thumbTop}px`,
                  left: '2px',
                  width: '12px',
                  height: `${thumbHeight}px`,
                  backgroundColor: isDraggingScrollbar ? '#9ca3af' : '#d1d5db',
                  borderRadius: '6px',
                  cursor: isDraggingScrollbar ? 'grabbing' : 'grab',
                  transition: isDraggingScrollbar ? 'none' : 'background-color 0.2s',
                }}
                onMouseEnter={e => {
                  if (!isDraggingScrollbar) {
                    e.currentTarget.style.backgroundColor = '#9ca3af'
                  }
                }}
                onMouseLeave={e => {
                  if (!isDraggingScrollbar) {
                    e.currentTarget.style.backgroundColor = '#d1d5db'
                  }
                }}
              />
            </div>
          )
        })()}
      </div>

      <FloatingPortal>
        {tooltipOpen && hoveredNode && (
          <div
            ref={tooltipRefs.setFloating}
            {...getTooltipFloatingProps()}
            style={{
              ...tooltipStyles,
              backgroundColor: 'white',
              color: '#111',
              fontSize: '14px',
              borderRadius: '4px',
              padding: '4px 8px',
              boxShadow: '0 4px 6px rgba(0, 0, 0, 0.1)',
              zIndex: 50,
              maxWidth: '300px',
              border: '1px solid #e5e5e5',
            }}
          >
            <div style={{ fontWeight: '600' }}>{hoveredNode.name}</div>
            {hoveredNode.accession && (
              <div style={{ color: '#666', fontSize: '12px' }}>
                Accession: {hoveredNode.accession}
              </div>
            )}
            {hoveredNode.branchLength !== undefined && (
              <div style={{ color: '#666', fontSize: '12px' }}>
                Branch Length: {hoveredNode.branchLength.toFixed(4)}
              </div>
            )}
          </div>
        )}
      </FloatingPortal>

      <FloatingPortal>
        {contextMenuOpen && contextMenuNode && (
          <div
            ref={contextRefs.setFloating}
            {...getContextFloatingProps()}
            style={{
              ...contextStyles,
              backgroundColor: 'white',
              border: '1px solid #e5e5e5',
              borderRadius: '8px',
              boxShadow: '0 4px 6px rgba(0, 0, 0, 0.1)',
              zIndex: 50,
              padding: '4px 0',
              minWidth: '192px',
            }}
          >
            <div
              style={{ padding: '8px 12px', borderBottom: '1px solid #f5f5f5' }}
            >
              <div
                style={{ fontWeight: '500', fontSize: '14px', color: '#111' }}
              >
                {contextMenuNode.name || 'Unknown Node'}
              </div>
              {contextMenuNode.accession && (
                <div style={{ fontSize: '12px', color: '#666' }}>
                  {contextMenuNode.accession}
                </div>
              )}
            </div>

            <div style={{ padding: '4px 0' }}>
              {contextMenuNode.name && (
                <button
                  onClick={() =>
                    handleContextMenuAction('copy-name', contextMenuNode)
                  }
                  style={{
                    width: '100%',
                    padding: '8px 12px',
                    textAlign: 'left',
                    fontSize: '14px',
                    color: '#374151',
                    backgroundColor: 'transparent',
                    border: 'none',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                  }}
                  onMouseEnter={e =>
                    (e.currentTarget.style.backgroundColor = '#f9f9f9')
                  }
                  onMouseLeave={e =>
                    (e.currentTarget.style.backgroundColor = 'transparent')
                  }
                >
                  <span>📋</span>
                  Copy Name
                </button>
              )}

              {contextMenuNode.accession && (
                <button
                  onClick={() =>
                    handleContextMenuAction('copy-accession', contextMenuNode)
                  }
                  style={{
                    width: '100%',
                    padding: '8px 12px',
                    textAlign: 'left',
                    fontSize: '14px',
                    color: '#374151',
                    backgroundColor: 'transparent',
                    border: 'none',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                  }}
                  onMouseEnter={e =>
                    (e.currentTarget.style.backgroundColor = '#f9f9f9')
                  }
                  onMouseLeave={e =>
                    (e.currentTarget.style.backgroundColor = 'transparent')
                  }
                >
                  <span>🔗</span>
                  Copy Accession
                </button>
              )}

              <button
                onClick={() =>
                  handleContextMenuAction('view-details', contextMenuNode)
                }
                style={{
                  width: '100%',
                  padding: '8px 12px',
                  textAlign: 'left',
                  fontSize: '14px',
                  color: '#374151',
                  backgroundColor: 'transparent',
                  border: 'none',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                }}
                onMouseEnter={e =>
                  (e.currentTarget.style.backgroundColor = '#f9f9f9')
                }
                onMouseLeave={e =>
                  (e.currentTarget.style.backgroundColor = 'transparent')
                }
              >
                <span>ℹ️</span>
                View Details
              </button>

              <button
                onClick={() =>
                  handleContextMenuAction('highlight-path', contextMenuNode)
                }
                style={{
                  width: '100%',
                  padding: '8px 12px',
                  textAlign: 'left',
                  fontSize: '14px',
                  color: '#374151',
                  backgroundColor: 'transparent',
                  border: 'none',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                }}
                onMouseEnter={e =>
                  (e.currentTarget.style.backgroundColor = '#f9f9f9')
                }
                onMouseLeave={e =>
                  (e.currentTarget.style.backgroundColor = 'transparent')
                }
              >
                <span>✨</span>
                Highlight Path
              </button>
            </div>
          </div>
        )}
      </FloatingPortal>

      <div style={{ marginTop: '8px', fontSize: '14px', color: '#666' }}>
        <p>
          Hover over nodes for details • Click nodes for context menu •{' '}
          {isCircular ? 'Mouse wheel to zoom' : 'Mouse wheel to scroll • Use scrollbar to navigate'}
        </p>
        <p>
          Tree contains {allNodes.filter(n => n.accession).length} accessions
        </p>
      </div>
    </div>
  )
}
