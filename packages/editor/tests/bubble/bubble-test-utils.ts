import type { Page } from '@playwright/test'
import process from 'node:process'
import { expect } from '@playwright/test'
import {
  focusParagraph,
  selectTextInParagraph,
} from '../editor-test-utils'

const modifier = process.platform === 'darwin' ? 'Meta' : 'Control'

export async function gotoBubbleFixture(page: Page) {
  await page.goto('bubble/')
  await expect(page.getByTestId('bubble-editor')).toBeVisible()
}

export async function focusBubbleParagraph(
  page: Page,
  index: number,
  edge: 'start' | 'end' = 'end',
) {
  await focusParagraph(page, 'bubble-editor', index, edge)
}

export async function selectBubbleParagraphText(
  page: Page,
  index: number,
  start: number,
  end: number,
) {
  await selectTextInParagraph(page, 'bubble-editor', index, start, end)
}

export async function dragSelectBubbleParagraphText(
  page: Page,
  index: number,
  start: number,
  end: number,
) {
  const selectionPoints = await page.evaluate(({ paragraphIndex, range }) => {
    const paragraphs = document.querySelectorAll('[data-testid="bubble-editor"] .ProseMirror p')
    const paragraph = paragraphs.item(paragraphIndex)
    if (!(paragraph instanceof HTMLParagraphElement)) {
      throw new TypeError(`Paragraph ${paragraphIndex} not found`)
    }

    const textNode = Array.from(paragraph.childNodes).find(child => child.nodeType === Node.TEXT_NODE)
    if (!(textNode instanceof Text)) {
      throw new TypeError(`Paragraph ${paragraphIndex} text node not found`)
    }

    const textLength = textNode.textContent?.length ?? 0
    if (range.start < 0 || range.end > textLength || range.start >= range.end) {
      throw new RangeError(`Invalid drag range ${range.start}-${range.end} for text length ${textLength}`)
    }

    const measurePoint = (offset: number, edge: 'start' | 'end') => {
      const rectRange = document.createRange()
      const sliceStart = edge === 'start' ? offset : offset - 1
      const sliceEnd = edge === 'start' ? offset + 1 : offset

      rectRange.setStart(textNode, sliceStart)
      rectRange.setEnd(textNode, sliceEnd)

      const rect = rectRange.getBoundingClientRect()
      if (rect.width === 0 && rect.height === 0) {
        throw new TypeError(`Unable to measure text rect for offset ${offset}`)
      }

      return {
        x: edge === 'start' ? rect.left + 1 : rect.right - 1,
        y: rect.top + rect.height / 2,
      }
    }

    return {
      start: measurePoint(range.start, 'start'),
      end: measurePoint(range.end, 'end'),
    }
  }, {
    paragraphIndex: index,
    range: { start, end },
  })

  await page.mouse.move(selectionPoints.start.x, selectionPoints.start.y)
  await page.mouse.down()
  await page.mouse.move(selectionPoints.end.x, selectionPoints.end.y, { steps: 8 })
  await page.mouse.up()
}

export async function setBubbleParagraphTextAlign(
  page: Page,
  index: number,
  textAlign: 'left' | 'right',
) {
  await page.evaluate(({ paragraphIndex, align }) => {
    const paragraphs = document.querySelectorAll('[data-testid="bubble-editor"] .ProseMirror p')
    const paragraph = paragraphs.item(paragraphIndex)
    if (!(paragraph instanceof HTMLParagraphElement)) {
      throw new TypeError(`Paragraph ${paragraphIndex} not found`)
    }

    paragraph.style.textAlign = align
  }, { paragraphIndex: index, align: textAlign })
}

export async function setBubbleParagraphText(
  page: Page,
  index: number,
  text: string,
) {
  await page.evaluate(({ paragraphIndex, nextText }) => {
    const paragraphs = document.querySelectorAll('[data-testid="bubble-editor"] .ProseMirror p')
    const paragraph = paragraphs.item(paragraphIndex)
    if (!(paragraph instanceof HTMLParagraphElement)) {
      throw new TypeError(`Paragraph ${paragraphIndex} not found`)
    }

    paragraph.textContent = nextText
  }, { paragraphIndex: index, nextText: text })
}

export async function constrainBubbleEditorPanel(
  page: Page,
  editorPanelWidth: number,
) {
  await page.evaluate(({ width }) => {
    const shell = document.querySelector('.fixture-shell')
    const grid = document.querySelector('.fixture-grid')
    const panel = document.querySelector('.fixture-panel')
    const sidebar = document.querySelector('.fixture-sidebar')
    const editor = document.querySelector('.fixture-editor')

    if (!(shell instanceof HTMLElement)) {
      throw new TypeError('Fixture shell not found')
    }
    if (!(grid instanceof HTMLElement)) {
      throw new TypeError('Fixture grid not found')
    }
    if (!(panel instanceof HTMLElement)) {
      throw new TypeError('Fixture panel not found')
    }
    if (!(sidebar instanceof HTMLElement)) {
      throw new TypeError('Fixture sidebar not found')
    }
    if (!(editor instanceof HTMLElement)) {
      throw new TypeError('Fixture editor not found')
    }

    shell.style.padding = '0'
    grid.style.gap = '0'
    grid.style.minHeight = '100vh'
    grid.style.gridTemplateColumns = `${width}px minmax(0, 1fr)`
    panel.style.borderRadius = '0'
    sidebar.style.borderRadius = '0'
    editor.style.padding = '12px 16px'
  }, { width: editorPanelWidth })
}

export async function mountBubbleOcclusionPanel(
  page: Page,
  width: number,
) {
  await page.evaluate(({ panelWidth }) => {
    const existing = document.querySelector('[data-testid="bubble-occlusion-panel"]')
    existing?.remove()

    const panel = document.createElement('div')
    panel.dataset.testid = 'bubble-occlusion-panel'
    panel.dataset.slot = 'sidebar-container'
    panel.style.position = 'fixed'
    panel.style.left = '0'
    panel.style.top = '0'
    panel.style.bottom = '0'
    panel.style.width = `${panelWidth}px`
    panel.style.background = 'white'
    panel.style.zIndex = '10'
    document.body.append(panel)
  }, { panelWidth: width })
}

export async function pressInsertTableShortcut(page: Page) {
  await page.keyboard.press(`${modifier}+Alt+t`)
}

export async function selectTableCellText(
  page: Page,
  rowIndex: number,
  colIndex: number,
  start: number,
  end: number,
) {
  await page.waitForFunction(({ row, col, minLength }) => {
    const rows = document.querySelectorAll('[data-testid="bubble-editor"] .ProseMirror table tr')
    const currentRow = rows.item(row)
    if (!(currentRow instanceof HTMLTableRowElement)) {
      return false
    }

    const currentCell = currentRow.querySelectorAll('th, td').item(col)
    if (!(currentCell instanceof HTMLTableCellElement)) {
      return false
    }

    const paragraph = currentCell.querySelector('p')
    return paragraph instanceof HTMLParagraphElement
      && (paragraph.textContent?.length ?? 0) >= minLength
      && paragraph.getClientRects().length > 0
  }, { row: rowIndex, col: colIndex, minLength: end })

  await page.evaluate(({ row, col, range }) => {
    const rows = document.querySelectorAll('[data-testid="bubble-editor"] .ProseMirror table tr')
    const currentRow = rows.item(row)
    if (!(currentRow instanceof HTMLTableRowElement)) {
      throw new TypeError(`Table row ${row} not found`)
    }

    const currentCell = currentRow.querySelectorAll('th, td').item(col)
    if (!(currentCell instanceof HTMLTableCellElement)) {
      throw new TypeError(`Table cell ${row}:${col} not found`)
    }

    const paragraph = currentCell.querySelector('p')
    if (!(paragraph instanceof HTMLParagraphElement)) {
      throw new TypeError(`Paragraph for table cell ${row}:${col} not found`)
    }

    const editor = paragraph.closest('.ProseMirror')
    if (!(editor instanceof HTMLElement)) {
      throw new TypeError('Editor root not found')
    }

    const textNode = Array.from(paragraph.childNodes).find(node => node.nodeType === Node.TEXT_NODE)
    if (!(textNode instanceof Text)) {
      throw new TypeError(`Text node for table cell ${row}:${col} not found`)
    }

    editor.focus()

    const selection = window.getSelection()
    if (!selection) {
      throw new TypeError('Window selection is unavailable')
    }

    const domRange = document.createRange()
    domRange.setStart(textNode, range.start)
    domRange.setEnd(textNode, range.end)
    selection.removeAllRanges()
    selection.addRange(domRange)
    document.dispatchEvent(new Event('selectionchange'))
  }, {
    row: rowIndex,
    col: colIndex,
    range: { start, end },
  })
}

export function getBubbleMenu(page: Page) {
  return page.getByTestId('bubble-menu')
}

export function getBubbleButton(page: Page, name: string) {
  return page.getByTestId(`bubble-button-${name}`)
}

export function getBubbleTableButton(page: Page, name: string) {
  return page.getByTestId(`bubble-table-${name}`)
}

export async function readBubbleParagraphHtml(page: Page, index: number) {
  return await page.evaluate(({ paragraphIndex }) => {
    const paragraphs = document.querySelectorAll('[data-testid="bubble-editor"] .ProseMirror p')
    const paragraph = paragraphs.item(paragraphIndex)
    if (!(paragraph instanceof HTMLParagraphElement)) {
      throw new TypeError(`Paragraph ${paragraphIndex} not found`)
    }

    return paragraph.innerHTML
  }, { paragraphIndex: index })
}

export async function countBubbleTableRows(page: Page) {
  return await page.locator('[data-testid="bubble-editor"] .ProseMirror table tr').count()
}

export async function readBubbleMenuGapToParagraph(
  page: Page,
  paragraphIndex: number,
) {
  return await page.evaluate(({ index }) => {
    const menu = document.querySelector('[data-testid="bubble-menu"]')
    if (!(menu instanceof HTMLElement)) {
      throw new TypeError('Bubble menu not found')
    }

    const paragraphs = document.querySelectorAll('[data-testid="bubble-editor"] .ProseMirror p')
    const paragraph = paragraphs.item(index)
    if (!(paragraph instanceof HTMLParagraphElement)) {
      throw new TypeError(`Paragraph ${index} not found`)
    }

    const menuRect = menu.getBoundingClientRect()
    const paragraphRect = paragraph.getBoundingClientRect()

    return {
      menuTop: menuRect.top,
      menuBottom: menuRect.bottom,
      paragraphTop: paragraphRect.top,
      paragraphBottom: paragraphRect.bottom,
      gap: paragraphRect.top - menuRect.bottom,
    }
  }, { index: paragraphIndex })
}

export async function readBubbleMenuViewportMetrics(page: Page) {
  return await page.evaluate(() => {
    const menu = document.querySelector('[data-testid="bubble-menu"]')
    if (!(menu instanceof HTMLElement)) {
      throw new TypeError('Bubble menu not found')
    }

    const root = menu.parentElement
    if (!(root instanceof HTMLElement)) {
      throw new TypeError('Bubble floating root not found')
    }

    const editor = document.querySelector('[data-testid="bubble-editor"]')
    if (!(editor instanceof HTMLElement)) {
      throw new TypeError('Bubble editor root not found')
    }

    const rootRect = root.getBoundingClientRect()
    const editorRect = editor.getBoundingClientRect()

    return {
      rootLeft: rootRect.left,
      rootRight: rootRect.right,
      viewportWidth: window.innerWidth,
      documentScrollWidth: document.documentElement.scrollWidth,
      editorLeft: editorRect.left,
      editorRight: editorRect.right,
    }
  })
}

export async function readBubbleInlineControlsLayout(page: Page) {
  return await page.evaluate(() => {
    const menu = document.querySelector('[data-testid="bubble-menu"]')
    if (!(menu instanceof HTMLElement)) {
      throw new TypeError('Bubble menu not found')
    }

    const root = menu.parentElement
    if (!(root instanceof HTMLElement)) {
      throw new TypeError('Bubble floating root not found')
    }

    const headingTrigger = document.querySelector('[data-testid="bubble-heading-trigger"]')
    if (!(headingTrigger instanceof HTMLElement)) {
      throw new TypeError('Bubble heading trigger not found')
    }

    const highlightOptions = document.querySelector('[data-testid="bubble-highlight-options"]')
    if (!(highlightOptions instanceof HTMLElement)) {
      throw new TypeError('Bubble highlight options button not found')
    }

    const headingRect = headingTrigger.getBoundingClientRect()
    const highlightRect = highlightOptions.getBoundingClientRect()
    const rootRect = root.getBoundingClientRect()

    return {
      menuClientWidth: menu.clientWidth,
      menuScrollWidth: menu.scrollWidth,
      rowTopDelta: Math.abs(headingRect.top - highlightRect.top),
      controlsOverflowLeft: Math.max(0, rootRect.left - headingRect.left),
      controlsOverflowRight: Math.max(0, highlightRect.right - rootRect.right),
    }
  })
}

export async function readBubbleHeadingTriggerLayout(page: Page) {
  return await page.evaluate(() => {
    const trigger = document.querySelector('[data-testid="bubble-heading-trigger"]')
    if (!(trigger instanceof HTMLElement)) {
      throw new TypeError('Bubble heading trigger not found')
    }

    const label = document.querySelector('[data-testid="bubble-heading-trigger-label"]')
    if (!(label instanceof HTMLElement)) {
      throw new TypeError('Bubble heading trigger label not found')
    }

    const triggerRect = trigger.getBoundingClientRect()
    const labelRect = label.getBoundingClientRect()

    return {
      triggerWidth: triggerRect.width,
      labelWidth: labelRect.width,
      labelLeftInset: labelRect.left - triggerRect.left,
      labelRightInset: triggerRect.right - labelRect.right,
    }
  })
}

export async function readBubbleSelectionAlignment(page: Page) {
  return await page.evaluate(() => {
    const menu = document.querySelector('[data-testid="bubble-menu"]')
    if (!(menu instanceof HTMLElement)) {
      throw new TypeError('Bubble menu not found')
    }

    const root = menu.parentElement
    if (!(root instanceof HTMLElement)) {
      throw new TypeError('Bubble floating root not found')
    }

    const selection = window.getSelection()
    if (!selection || selection.rangeCount === 0) {
      throw new TypeError('Browser selection not found')
    }

    const selectionRect = selection.getRangeAt(0).getBoundingClientRect()
    const rootRect = root.getBoundingClientRect()

    return {
      selectionCenter: selectionRect.left + selectionRect.width / 2,
      rootLeft: rootRect.left,
      rootRight: rootRect.right,
    }
  })
}

export async function readBubblePanelOverlapMetrics(page: Page) {
  return await page.evaluate(() => {
    const menu = document.querySelector('[data-testid="bubble-menu"]')
    if (!(menu instanceof HTMLElement)) {
      throw new TypeError('Bubble menu not found')
    }

    const root = menu.parentElement
    if (!(root instanceof HTMLElement)) {
      throw new TypeError('Bubble floating root not found')
    }

    const panel = document.querySelector('[data-testid="bubble-occlusion-panel"]')
    if (!(panel instanceof HTMLElement)) {
      throw new TypeError('Bubble occlusion panel not found')
    }

    const rootRect = root.getBoundingClientRect()
    const panelRect = panel.getBoundingClientRect()
    const overlapWidth = Math.max(0, Math.min(rootRect.right, panelRect.right) - Math.max(rootRect.left, panelRect.left))

    return {
      rootLeft: rootRect.left,
      panelRight: panelRect.right,
      overlapWidth,
    }
  })
}
