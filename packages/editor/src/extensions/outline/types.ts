export interface OutlineItemAttributes {
  folded: boolean
}

export interface OutlineItemOptions {
  HTMLAttributes: Record<string, any>
}

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    outlineItem: {
      /**
       * Toggle the fold state
       */
      toggleFold: () => ReturnType
      /**
       * Fold the current node
       */
      fold: () => ReturnType
      /**
       * Unfold the current node
       */
      unfold: () => ReturnType
      /**
       * Move focus to the previous node
       */
      focusPreviousItem: () => ReturnType
      /**
       * Move focus to the next node
       */
      focusNextItem: () => ReturnType
    }
  }
}
