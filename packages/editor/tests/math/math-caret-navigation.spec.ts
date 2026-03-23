import type { Page } from '@playwright/test'
import { expect, test } from '@playwright/test'
import { complexOutlineMathDocument } from './math-fixtures'
import {
  clickInlineMath,
  flushSelectionSync,
  focusParagraph,
  getTopLevelBlocks,
  gotoMathFixture,
  readMathDomSelection,
  readMathDoc,
  readMathSelection,
  selectTextInParagraph,
  setMathFixtureContent,
} from './math-test-utils'

function installErrorTrackers(page: Page) {
  const pageErrors: string[] = []
  const consoleErrors: string[] = []

  page.on('pageerror', (error) => {
    pageErrors.push(error.message)
  })
  page.on('console', (message) => {
    if (message.type() === 'error') {
      consoleErrors.push(message.text())
    }
  })

  return { pageErrors, consoleErrors }
}

async function readFirstMathParagraphState(page: Page) {
  const doc = await readMathDoc(page)
  const firstBlocks = getTopLevelBlocks(doc, 0)
  const firstParagraph = firstBlocks[0]

  return {
    firstBlockTypes: firstBlocks.map(node => node.type),
    firstParagraphContentTypes: firstParagraph?.content?.map(node => node.type) ?? [],
    leadingText: firstParagraph?.content?.[0]?.text ?? '',
    formulaText: firstParagraph?.content?.[1]?.content?.[0]?.text ?? '',
    trailingText: firstParagraph?.content?.[2]?.text ?? '',
  }
}

async function insertInlineFormulaIntoMiddleOfLine(page: Page) {
  await gotoMathFixture(page)
  await focusParagraph(page, 0, 'start')
  await page.keyboard.type('Alpha Beta')
  await selectTextInParagraph(page, 0, 6, 6)
  await page.keyboard.type('$$ ')
  await page.keyboard.type('xy')

  await expect.poll(async () => {
    return await readFirstMathParagraphState(page)
  }).toEqual({
    firstBlockTypes: ['paragraph'],
    firstParagraphContentTypes: ['text', 'inlineMath', 'text'],
    leadingText: 'Alpha ',
    formulaText: 'xy',
    trailingText: 'Beta',
  })

  const selection = await readMathSelection(page)
  expect(selection.parentType).toBe('inlineMath')
  expect(selection.parentOffset).toBe(2)
}

async function placeCaretInsideNestedInlineMath(page: Page) {
  await gotoMathFixture(page)
  await selectTextInParagraph(page, 1, 0, 5)
  await page.keyboard.type('aaa')

  await focusParagraph(page, 1, 'start')
  await page.keyboard.press('Backspace')

  await expect.poll(async () => {
    const doc = await readMathDoc(page)

    return {
      topLevelCount: doc.content?.length ?? 0,
      firstText: doc.content?.[0]?.content?.[0]?.content?.[0]?.content?.[0]?.text ?? '',
      secondText: doc.content?.[1]?.content?.[0]?.content?.[0]?.content?.[0]?.text ?? '',
    }
  }).toEqual({
    topLevelCount: 2,
    firstText: 'aaa',
    secondText: 'Beta',
  })

  await focusParagraph(page, 0)
  await page.keyboard.press('Enter')
  await page.keyboard.type('ccc')

  await expect.poll(async () => {
    const doc = await readMathDoc(page)

    return {
      topLevelCount: doc.content?.length ?? 0,
      firstText: doc.content?.[0]?.content?.[0]?.content?.[0]?.content?.[0]?.text ?? '',
      secondText: doc.content?.[1]?.content?.[0]?.content?.[0]?.content?.[0]?.text ?? '',
      thirdText: doc.content?.[2]?.content?.[0]?.content?.[0]?.content?.[0]?.text ?? '',
    }
  }).toEqual({
    topLevelCount: 3,
    firstText: 'aaa',
    secondText: 'ccc',
    thirdText: 'Beta',
  })

  await focusParagraph(page, 0)
  await page.keyboard.press('Enter')
  await page.keyboard.press('Tab')
  await page.keyboard.type('$$ ')
  await page.keyboard.type('bbb')
  await page.keyboard.press('ArrowLeft')
  await flushSelectionSync(page)

  await expect.poll(async () => {
    const doc = await readMathDoc(page)

    return {
      topLevelCount: doc.content?.length ?? 0,
      firstText: doc.content?.[0]?.content?.[0]?.content?.[0]?.content?.[0]?.text ?? '',
      nestedListType: doc.content?.[0]?.content?.[1]?.type ?? null,
      nestedFormulaText: doc.content?.[0]?.content?.[1]?.content?.[0]?.content?.[0]?.content?.[0]?.content?.[0]?.text ?? '',
      nextTopLevelText: doc.content?.[1]?.content?.[0]?.content?.[0]?.content?.[0]?.text ?? '',
    }
  }).toEqual({
    topLevelCount: 3,
    firstText: 'aaa',
    nestedListType: 'outlineUList',
    nestedFormulaText: 'bbb',
    nextTopLevelText: 'ccc',
  })

  await expect.poll(async () => {
    const selection = await readMathSelection(page)
    return {
      parentType: selection.parentType,
      parentOffset: selection.parentOffset,
      blockType: selection.blockType,
      blockText: selection.blockText,
    }
  }).toEqual({
    parentType: 'inlineMath',
    parentOffset: 2,
    blockType: 'paragraph',
    blockText: 'bbb',
  })
}

test.describe('math caret navigation', () => {
  test('moves the caret to before an inline formula and inserts text outside the formula', async ({ page }) => {
    // Arrange: create an inline formula inside the first outline item.
    await gotoMathFixture(page)
    await focusParagraph(page, 0, 'start')
    await page.keyboard.type('$$ ')
    await page.keyboard.type('xy')

    const inlineEndSelection = await readMathSelection(page)
    expect(inlineEndSelection.parentType).toBe('inlineMath')
    expect(inlineEndSelection.parentOffset).toBe(2)

    // Act: move to the formula start, then once more to exit before the formula, and type plain text.
    await page.keyboard.press('ArrowLeft')
    await page.keyboard.press('ArrowLeft')
    await flushSelectionSync(page)

    await expect.poll(async () => {
      const selection = await readMathSelection(page)
      return {
        parentType: selection.parentType,
        parentOffset: selection.parentOffset,
      }
    }).toEqual({
      parentType: 'inlineMath',
      parentOffset: 0,
    })

    await page.keyboard.press('ArrowLeft')
    await flushSelectionSync(page)

    await expect.poll(async () => {
      const selection = await readMathSelection(page)
      return selection.parentType
    }).toBe('paragraph')

    await expect.poll(async () => {
      const selection = await readMathDomSelection(page)

      return {
        hasSelection: selection.hasSelection,
        rangeCount: selection.rangeCount,
        isCollapsed: selection.isCollapsed,
        activeElementInsideEditor: selection.activeElementInsideEditor,
        anchorInsideEditor: selection.anchorInsideEditor,
        focusInsideEditor: selection.focusInsideEditor,
        // In the outline fixture the caret can still live under an ancestor node view container
        // after leaving inline math, so the meaningful invariant is simply that it left the formula.
        anchorInsideInlineMath: selection.anchorInsideInlineMath,
        focusInsideInlineMath: selection.focusInsideInlineMath,
      }
    }).toEqual({
      hasSelection: true,
      rangeCount: 1,
      isCollapsed: true,
      activeElementInsideEditor: true,
      anchorInsideEditor: true,
      focusInsideEditor: true,
      anchorInsideInlineMath: false,
      focusInsideInlineMath: false,
    })

    await page.keyboard.type('L')

    // Assert: the inserted text stays outside the formula node.
    await expect.poll(async () => {
      const doc = await readMathDoc(page)
      const firstBlocks = getTopLevelBlocks(doc, 0)
      const firstParagraph = firstBlocks[0]

      return {
        firstBlockTypes: firstBlocks.map(node => node.type),
        firstParagraphContentTypes: firstParagraph?.content?.map(node => node.type) ?? [],
        leadingText: firstParagraph?.content?.[0]?.text ?? '',
        formulaText: firstParagraph?.content?.[1]?.content?.[0]?.text ?? '',
      }
    }).toEqual({
      firstBlockTypes: ['paragraph'],
      firstParagraphContentTypes: ['text', 'inlineMath'],
      leadingText: 'L',
      formulaText: 'xy',
    })
  })

  test('moves the caret to after an inline formula and inserts text outside the formula', async ({ page }) => {
    // Arrange: create an inline formula inside the first outline item.
    await gotoMathFixture(page)
    await focusParagraph(page, 0, 'start')
    await page.keyboard.type('$$ ')
    await page.keyboard.type('xy')

    const inlineEndSelection = await readMathSelection(page)
    expect(inlineEndSelection.parentType).toBe('inlineMath')
    expect(inlineEndSelection.parentOffset).toBe(2)

    // Act: move once to the right to exit after the formula, then type plain text.
    await page.keyboard.press('ArrowRight')
    await flushSelectionSync(page)

    await expect.poll(async () => {
      const selection = await readMathSelection(page)
      return selection.parentType
    }).toBe('paragraph')

    await page.keyboard.type('R')

    // Assert: the inserted text stays outside the formula node.
    await expect.poll(async () => {
      const doc = await readMathDoc(page)
      const firstBlocks = getTopLevelBlocks(doc, 0)
      const firstParagraph = firstBlocks[0]

      return {
        firstBlockTypes: firstBlocks.map(node => node.type),
        firstParagraphContentTypes: firstParagraph?.content?.map(node => node.type) ?? [],
        formulaText: firstParagraph?.content?.[0]?.content?.[0]?.text ?? '',
        trailingText: firstParagraph?.content?.[1]?.text ?? '',
      }
    }).toEqual({
      firstBlockTypes: ['paragraph'],
      firstParagraphContentTypes: ['inlineMath', 'text'],
      formulaText: 'xy',
      trailingText: 'R',
    })
  })

  test('moves the caret horizontally inside a rendered inline formula in a nested outline document', async ({ page }) => {
    // Arrange: load a nested outline document and enter the first rendered inline formula.
    await gotoMathFixture(page)
    await setMathFixtureContent(page, complexOutlineMathDocument)
    const { pageErrors, consoleErrors } = installErrorTrackers(page)

    await clickInlineMath(page, 0)
    await expect.poll(async () => {
      const selection = await readMathSelection(page)
      return selection.parentType
    }).toBe('inlineMath')

    const startSelection = await readMathSelection(page)

    // Act: move left within the formula, then move right back to the end.
    await page.keyboard.press('ArrowLeft')
    await flushSelectionSync(page)
    await expect.poll(async () => {
      const selection = await readMathSelection(page)
      return selection.parentType
    }).toBe('inlineMath')
    await expect.poll(async () => {
      const selection = await readMathSelection(page)
      return selection.from
    }).toBeLessThan(startSelection.from)
    const afterLeft = await readMathSelection(page)

    await page.keyboard.press('ArrowRight')
    await flushSelectionSync(page)
    await expect.poll(async () => {
      const selection = await readMathSelection(page)
      return selection.parentType
    }).toBe('inlineMath')
    await expect.poll(async () => {
      const selection = await readMathSelection(page)
      return selection.from
    }).toBe(startSelection.from)
    const afterRight = await readMathSelection(page)

    // Assert: left/right can move the caret inside the inline formula without runtime errors.
    expect(afterLeft.from).toBeLessThan(startSelection.from)
    expect(afterRight.from).toBe(startSelection.from)
    expect(pageErrors).toEqual([])
    expect(consoleErrors).toEqual([])
  })

  test('types at the start of an inline formula after moving the caret there with arrow keys', async ({ page }) => {
    // Arrange: insert inline math between existing prefix and suffix text on the same line.
    await insertInlineFormulaIntoMiddleOfLine(page)

    // Act: move to the formula start with arrow keys, then type inside the formula.
    await page.keyboard.press('ArrowLeft')
    await page.keyboard.press('ArrowLeft')
    await flushSelectionSync(page)
    await expect.poll(async () => {
      const selection = await readMathSelection(page)
      return {
        parentType: selection.parentType,
        parentOffset: selection.parentOffset,
      }
    }).toEqual({
      parentType: 'inlineMath',
      parentOffset: 0,
    })

    await page.keyboard.type('L')

    // Assert: the inserted text becomes the formula prefix and stays inside the formula.
    await expect.poll(async () => {
      return await readFirstMathParagraphState(page)
    }).toEqual({
      firstBlockTypes: ['paragraph'],
      firstParagraphContentTypes: ['text', 'inlineMath', 'text'],
      leadingText: 'Alpha ',
      formulaText: 'Lxy',
      trailingText: 'Beta',
    })
  })

  test('types at the end of an inline formula after moving the caret there with arrow keys', async ({ page }) => {
    // Arrange: insert inline math between existing prefix and suffix text on the same line.
    await insertInlineFormulaIntoMiddleOfLine(page)

    // Act: move away from the end and back to it with arrow keys, then type inside the formula.
    await page.keyboard.press('ArrowLeft')
    await flushSelectionSync(page)
    await expect.poll(async () => {
      const selection = await readMathSelection(page)
      return {
        parentType: selection.parentType,
        parentOffset: selection.parentOffset,
      }
    }).toEqual({
      parentType: 'inlineMath',
      parentOffset: 1,
    })

    await page.keyboard.press('ArrowRight')
    await flushSelectionSync(page)
    await expect.poll(async () => {
      const selection = await readMathSelection(page)
      return {
        parentType: selection.parentType,
        parentOffset: selection.parentOffset,
      }
    }).toEqual({
      parentType: 'inlineMath',
      parentOffset: 2,
    })

    await page.keyboard.type('R')

    // Assert: the inserted text becomes the formula suffix and stays inside the formula.
    await expect.poll(async () => {
      return await readFirstMathParagraphState(page)
    }).toEqual({
      firstBlockTypes: ['paragraph'],
      firstParagraphContentTypes: ['text', 'inlineMath', 'text'],
      leadingText: 'Alpha ',
      formulaText: 'xyR',
      trailingText: 'Beta',
    })
  })

  test('moves into, within, and out of an inline formula inserted in the middle of existing text', async ({ page }) => {
    // Arrange: insert inline math between existing prefix and suffix text on the same line.
    await insertInlineFormulaIntoMiddleOfLine(page)
    const { pageErrors, consoleErrors } = installErrorTrackers(page)

    // Act + Assert: exit to the right, re-enter from the right, move left within the formula, exit to the left,
    // then re-enter from the left and move back out to the right.
    await page.keyboard.press('ArrowRight')
    await flushSelectionSync(page)
    await expect.poll(async () => {
      const selection = await readMathSelection(page)
      return selection.parentType
    }).toBe('paragraph')

    await page.keyboard.press('ArrowLeft')
    await flushSelectionSync(page)
    await expect.poll(async () => {
      const selection = await readMathSelection(page)
      return {
        parentType: selection.parentType,
        parentOffset: selection.parentOffset,
      }
    }).toEqual({
      parentType: 'inlineMath',
      parentOffset: 2,
    })

    await page.keyboard.press('ArrowLeft')
    await flushSelectionSync(page)
    await expect.poll(async () => {
      const selection = await readMathSelection(page)
      return selection.parentOffset
    }).toBe(1)

    await page.keyboard.press('ArrowLeft')
    await flushSelectionSync(page)
    await expect.poll(async () => {
      const selection = await readMathSelection(page)
      return {
        parentType: selection.parentType,
        parentOffset: selection.parentOffset,
      }
    }).toEqual({
      parentType: 'inlineMath',
      parentOffset: 0,
    })

    await page.keyboard.press('ArrowLeft')
    await flushSelectionSync(page)
    await expect.poll(async () => {
      const selection = await readMathSelection(page)
      return selection.parentType
    }).toBe('paragraph')

    await page.keyboard.press('ArrowRight')
    await flushSelectionSync(page)
    await expect.poll(async () => {
      const selection = await readMathSelection(page)
      return {
        parentType: selection.parentType,
        parentOffset: selection.parentOffset,
      }
    }).toEqual({
      parentType: 'inlineMath',
      parentOffset: 0,
    })

    await page.keyboard.press('ArrowRight')
    await flushSelectionSync(page)
    await expect.poll(async () => {
      const selection = await readMathSelection(page)
      return selection.parentOffset
    }).toBe(1)

    await page.keyboard.press('ArrowRight')
    await flushSelectionSync(page)
    await expect.poll(async () => {
      const selection = await readMathSelection(page)
      return selection.parentOffset
    }).toBe(2)

    await page.keyboard.press('ArrowRight')
    await flushSelectionSync(page)
    await expect.poll(async () => {
      const selection = await readMathSelection(page)
      return selection.parentType
    }).toBe('paragraph')

    expect(pageErrors).toEqual([])
    expect(consoleErrors).toEqual([])
  })

  test('exits to the left of an inline formula inserted in the middle of existing text and types outside the formula', async ({ page }) => {
    // Arrange: insert inline math between existing prefix and suffix text on the same line.
    await insertInlineFormulaIntoMiddleOfLine(page)

    // Act: move to the formula start, exit to the left, and type plain text before the formula.
    await page.keyboard.press('ArrowLeft')
    await page.keyboard.press('ArrowLeft')
    await flushSelectionSync(page)
    await expect.poll(async () => {
      const selection = await readMathSelection(page)
      return {
        parentType: selection.parentType,
        parentOffset: selection.parentOffset,
      }
    }).toEqual({
      parentType: 'inlineMath',
      parentOffset: 0,
    })

    await page.keyboard.press('ArrowLeft')
    await flushSelectionSync(page)
    await expect.poll(async () => {
      const selection = await readMathSelection(page)
      return selection.parentType
    }).toBe('paragraph')

    await page.keyboard.type('L')

    // Assert: the inserted text stays outside the formula node on the left side.
    await expect.poll(async () => {
      return await readFirstMathParagraphState(page)
    }).toEqual({
      firstBlockTypes: ['paragraph'],
      firstParagraphContentTypes: ['text', 'inlineMath', 'text'],
      leadingText: 'Alpha L',
      formulaText: 'xy',
      trailingText: 'Beta',
    })
  })

  test('exits to the right of an inline formula inserted in the middle of existing text and types outside the formula', async ({ page }) => {
    // Arrange: insert inline math between existing prefix and suffix text on the same line.
    await insertInlineFormulaIntoMiddleOfLine(page)

    // Act: exit to the right and type plain text after the formula.
    await page.keyboard.press('ArrowRight')
    await flushSelectionSync(page)
    await expect.poll(async () => {
      const selection = await readMathSelection(page)
      return selection.parentType
    }).toBe('paragraph')

    await page.keyboard.type('R')

    // Assert: the inserted text stays outside the formula node on the right side.
    await expect.poll(async () => {
      return await readFirstMathParagraphState(page)
    }).toEqual({
      firstBlockTypes: ['paragraph'],
      firstParagraphContentTypes: ['text', 'inlineMath', 'text'],
      leadingText: 'Alpha ',
      formulaText: 'xy',
      trailingText: 'RBeta',
    })
  })

  test('moves the caret vertically through a nested outline document with inline and block formulas', async ({ page }) => {
    // Arrange: load the same nested outline document and enter the first rendered inline formula.
    await gotoMathFixture(page)
    await setMathFixtureContent(page, complexOutlineMathDocument)
    const { pageErrors, consoleErrors } = installErrorTrackers(page)

    await clickInlineMath(page, 0)
    await expect.poll(async () => {
      const selection = await readMathSelection(page)
      return selection.parentType
    }).toBe('inlineMath')

    const startSelection = await readMathSelection(page)

    // Act: move down through later blocks, then move back up toward the beginning of the document.
    const downSelections = []
    for (let index = 0; index < 8; index += 1) {
      await page.keyboard.press('ArrowDown')
      await flushSelectionSync(page)
      downSelections.push(await readMathSelection(page))
    }

    const upSelections = []
    for (let index = 0; index < 8; index += 1) {
      await page.keyboard.press('ArrowUp')
      await flushSelectionSync(page)
      upSelections.push(await readMathSelection(page))
    }

    // Assert: the caret is not trapped; it moves through multiple blocks, including formulas, and no runtime errors occur.
    expect(new Set(downSelections.map(selection => `${selection.from}:${selection.parentType}:${selection.blockType}:${selection.blockText}`)).size).toBeGreaterThanOrEqual(4)
    expect(downSelections.some(selection => selection.blockType === 'blockMath')).toBe(true)
    expect(downSelections.some(selection => selection.blockText.includes('Child'))).toBe(true)
    expect(downSelections.some(selection => selection.blockText.includes('Nested ordered') || selection.blockText.includes('Tail'))).toBe(true)
    expect(downSelections[downSelections.length - 1].from).toBeGreaterThan(startSelection.from)

    expect(new Set(upSelections.map(selection => `${selection.from}:${selection.parentType}:${selection.blockType}:${selection.blockText}`)).size).toBeGreaterThanOrEqual(3)
    expect(upSelections.some(selection => selection.blockText.includes('Root'))).toBe(true)
    expect(upSelections[upSelections.length - 1].from).toBeLessThanOrEqual(downSelections[downSelections.length - 1].from)

    expect(pageErrors).toEqual([])
    expect(consoleErrors).toEqual([])
  })

  test('moves the caret down from inline math in a nested outline item to the next top-level line', async ({ page }) => {
    await placeCaretInsideNestedInlineMath(page)
    const { pageErrors, consoleErrors } = installErrorTrackers(page)

    await page.keyboard.press('ArrowDown')
    await flushSelectionSync(page)

    await expect.poll(async () => {
      const selection = await readMathSelection(page)
      return {
        parentType: selection.parentType,
        blockType: selection.blockType,
        blockText: selection.blockText,
      }
    }).toEqual({
      parentType: 'paragraph',
      blockType: 'paragraph',
      blockText: 'ccc',
    })

    expect(pageErrors).toEqual([])
    expect(consoleErrors).toEqual([])
  })

  test('moves the caret up from inline math in a nested outline item to the previous top-level line', async ({ page }) => {
    await placeCaretInsideNestedInlineMath(page)
    const { pageErrors, consoleErrors } = installErrorTrackers(page)

    await page.keyboard.press('ArrowUp')
    await flushSelectionSync(page)

    await expect.poll(async () => {
      const selection = await readMathSelection(page)
      return {
        parentType: selection.parentType,
        blockType: selection.blockType,
        blockText: selection.blockText,
      }
    }).toEqual({
      parentType: 'paragraph',
      blockType: 'paragraph',
      blockText: 'aaa',
    })

    expect(pageErrors).toEqual([])
    expect(consoleErrors).toEqual([])
  })
})
