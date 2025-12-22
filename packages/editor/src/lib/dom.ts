export function getEditorMaxWidthPx(fromEl: HTMLElement | null) {
  const editorEl = fromEl?.closest('[data-slate-editor="true"]') as HTMLElement | null
  if (!editorEl)
    return null

  const rect = editorEl.getBoundingClientRect()
  if (!rect.width)
    return null

  const styles = window.getComputedStyle(editorEl)
  const paddingLeft = Number.parseFloat(styles.paddingLeft || '0') || 0
  const paddingRight = Number.parseFloat(styles.paddingRight || '0') || 0
  const maxWidth = rect.width - paddingLeft - paddingRight

  if (!Number.isFinite(maxWidth) || maxWidth <= 0)
    return null

  return maxWidth
}

