import type { DesktopAnkiDeck } from '@memorilo/desktop-preload'

export interface AnkiDeckTreeNode {
  readonly children: readonly AnkiDeckTreeNode[]
  readonly deck: DesktopAnkiDeck | null
  readonly label: string
  readonly path: string
}

interface MutableAnkiDeckTreeNode {
  children: Map<string, MutableAnkiDeckTreeNode>
  deck: DesktopAnkiDeck | null
  label: string
  path: string
}

function freezeTree(
  children: ReadonlyMap<string, MutableAnkiDeckTreeNode>,
  compare: (left: string, right: string) => number,
): readonly AnkiDeckTreeNode[] {
  return [...children.values()]
    .sort((left, right) => compare(left.label, right.label))
    .map(node => ({
      children: freezeTree(node.children, compare),
      deck: node.deck,
      label: node.label,
      path: node.path,
    }))
}

export function buildAnkiDeckTree(
  decks: readonly DesktopAnkiDeck[],
  compare: (left: string, right: string) => number,
): readonly AnkiDeckTreeNode[] {
  const root = new Map<string, MutableAnkiDeckTreeNode>()
  for (const deck of decks) {
    const segments = deck.name.split('::')
    if (segments.some(segment => segment.length === 0))
      throw new Error(`Anki deck ${deck.name} contains an empty hierarchy segment`)

    let children = root
    let path = ''
    for (const [index, segment] of segments.entries()) {
      path = path.length === 0 ? segment : `${path}::${segment}`
      let node = children.get(segment)
      if (!node) {
        node = { children: new Map(), deck: null, label: segment, path }
        children.set(segment, node)
      }
      if (index === segments.length - 1) {
        if (node.deck)
          throw new Error(`Anki returned duplicate deck name ${deck.name}`)
        node.deck = deck
      }
      children = node.children
    }
  }
  return freezeTree(root, compare)
}
