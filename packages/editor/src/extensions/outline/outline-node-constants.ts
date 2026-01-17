export const outlineItemContent = '(paragraph | heading | codeBlock | image | blockMath) block*'
// Allow mixed item types temporarily so indent/outdent can normalize nodes in one transaction.
export const outlineListContent = '(listItem|taskItem|orderedItem)+'
export const outlineOrderedListContent = '(orderedItem|listItem)+'

export function getOutlineFoldedAttributes() {
  return {
    folded: {
      default: false,
      keepOnSplit: false,
      parseHTML: () => false,
      renderHTML: () => ({}),
    },
  }
}
