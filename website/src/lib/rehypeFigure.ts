interface HastNode {
  type: string
  tagName?: string
  value?: string
  properties?: Record<string, unknown>
  children?: HastNode[]
}

function isBlank(node: HastNode) {
  return node.type === 'text' && !node.value?.trim()
}

function soleImage(paragraph: HastNode) {
  const kids = (paragraph.children ?? []).filter(c => !isBlank(c))
  const [only] = kids
  return kids.length === 1 && only?.tagName === 'img' ? only : undefined
}

function visit(node: HastNode) {
  const children = node.children
  if (!children) {
    return
  }
  for (const [i, child] of children.entries()) {
    const img = child.tagName === 'p' ? soleImage(child) : undefined
    const alt = String(img?.properties?.alt ?? '')
    if (img && alt) {
      children[i] = {
        type: 'element',
        tagName: 'figure',
        properties: {},
        children: [
          img,
          {
            type: 'element',
            tagName: 'figcaption',
            properties: {},
            children: [{ type: 'text', value: alt }],
          },
        ],
      }
    } else {
      visit(child)
    }
  }
}

export function rehypeFigure() {
  return (tree: HastNode) => visit(tree)
}
