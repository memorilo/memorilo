import type { Transaction } from '@tiptap/pm/state'
import type { EditorView } from '@tiptap/pm/view'
import { findChildren } from '@tiptap/core'
import { Plugin, PluginKey } from '@tiptap/pm/state'
import { Console, Effect } from 'effect'
import { guessLanguage } from './libs/language-guess'
import { CODE_BLOCK_AUTO_LANGUAGE, getCodeBlockSelectedLanguage } from './libs/resolved-language'

const GUESS_DEBOUNCE_MS = 1000

interface TrackedCodeBlock {
  id: number
  pos: number
  text: string
  language: string
  guess: string | null
  contentVersion: number
}

function shouldGuess({ language, text }: { language: string, text: string }) {
  return language === CODE_BLOCK_AUTO_LANGUAGE && text.trim() !== ''
}

function shouldQueueGuess(currentBlock: TrackedCodeBlock, previousBlock?: TrackedCodeBlock) {
  if (!shouldGuess(currentBlock)) {
    return false
  }

  if (!previousBlock) {
    return currentBlock.guess === null
  }

  return previousBlock.text !== currentBlock.text
    || (previousBlock.language !== CODE_BLOCK_AUTO_LANGUAGE
      && currentBlock.language === CODE_BLOCK_AUTO_LANGUAGE)
    || (previousBlock.guess !== currentBlock.guess && currentBlock.guess === null)
}

export function CodeBlockLanguageGuessPlugin({ name }: { name: string }) {
  const key = new PluginKey<TrackedCodeBlock[]>('codeblockLanguageGuess')
  let nextBlockId = 1

  const findTrackedBlock = (view: EditorView, blockId: number, contentVersion: number) => {
    const block = key.getState(view.state)?.find(candidate => candidate.id === blockId)
    if (!block || block.contentVersion !== contentVersion || !shouldGuess(block)) {
      return null
    }
    return block
  }

  const collectCodeBlocks = (doc: Transaction['doc']) =>
    findChildren(doc, node => node.type.name === name).map(({ pos, node }) => ({
      pos,
      text: node.textContent,
      language: getCodeBlockSelectedLanguage(node.attrs),
      guess: (typeof node.attrs.guess === 'string' && node.attrs.guess) || null,
    }))

  const toTrackedCodeBlock = (
    block: Omit<TrackedCodeBlock, 'id' | 'contentVersion'>,
    previousBlock?: TrackedCodeBlock,
  ): TrackedCodeBlock => {
    const textChanged = !previousBlock || previousBlock.text !== block.text

    return {
      ...block,
      id: previousBlock?.id ?? nextBlockId++,
      contentVersion: previousBlock
        ? previousBlock.contentVersion + (textChanged ? 1 : 0)
        : 0,
    }
  }

  const mapPreviousBlocksByPos = (transaction: Transaction, blocks: TrackedCodeBlock[]) => {
    const previousBlocksByPos = new Map<number, TrackedCodeBlock>()

    for (const block of blocks) {
      const result = transaction.mapping.mapResult(block.pos, 1)
      if (result.deleted) {
        continue
      }

      previousBlocksByPos.set(result.pos, {
        ...block,
        pos: result.pos,
      })
    }

    return previousBlocksByPos
  }

  async function runGuess(blockId: number, contentVersion: number, view: EditorView) {
    if (view.isDestroyed) {
      return
    }

    const block = findTrackedBlock(view, blockId, contentVersion)
    if (!block) {
      return
    }

    try {
      const nextGuess = (await Effect.runPromise(guessLanguage(block.text)))[0]?.languageId
      if (!nextGuess || view.isDestroyed) {
        return
      }

      const latestBlock = findTrackedBlock(view, blockId, contentVersion)
      if (!latestBlock) {
        return
      }

      Effect.runPromise(Console.log('guessed language', {
        blockId,
        contentVersion,
        previousGuess: latestBlock.guess,
        nextGuess,
      }))

      if (latestBlock.guess === nextGuess) {
        return
      }

      const node = view.state.doc.nodeAt(latestBlock.pos)!
      view.dispatch(view.state.tr.setNodeMarkup(latestBlock.pos, undefined, {
        ...node.attrs,
        guess: nextGuess,
      }))
    }
    catch (error) {
      Effect.runPromise(Console.error('language guess failed', error))
    }
  }

  return new Plugin<TrackedCodeBlock[]>({
    key,

    state: {
      init: (_, { doc }) => {
        return collectCodeBlocks(doc).map(block => toTrackedCodeBlock(block))
      },
      apply: (transaction, blocks) => {
        const previousBlocksByPos = mapPreviousBlocksByPos(transaction, blocks)

        return collectCodeBlocks(transaction.doc).map(block =>
          toTrackedCodeBlock(
            block,
            previousBlocksByPos.get(block.pos),
          ))
      },
    },

    view(view) {
      let timeoutId: ReturnType<typeof setTimeout> | null = null
      let queuedBlocks = new Map<number, number>()
      let previousBlocks = key.getState(view.state) ?? []

      const enqueueBlocks = (blocks: TrackedCodeBlock[]) => {
        if (blocks.length === 0) {
          return
        }

        for (const block of blocks) {
          queuedBlocks.set(block.id, block.contentVersion)
        }

        if (timeoutId !== null) {
          clearTimeout(timeoutId)
        }

        timeoutId = setTimeout(() => {
          const blocks = [...queuedBlocks.entries()]
          queuedBlocks = new Map()
          timeoutId = null

          for (const [blockId, contentVersion] of blocks) {
            void runGuess(blockId, contentVersion, view)
          }
        }, GUESS_DEBOUNCE_MS)
      }

      const getBlocksToGuess = (currentBlocks: TrackedCodeBlock[], previousBlocks: TrackedCodeBlock[]) => {
        const previousBlocksById = new Map(previousBlocks.map(block => [block.id, block]))
        const previousBlocksByPos = new Map(previousBlocks.map(block => [block.pos, block]))

        return currentBlocks.filter((block, index) => {
          const previousBlock
            = previousBlocksById.get(block.id)
              ?? previousBlocksByPos.get(block.pos)
              ?? previousBlocks[index]

          return shouldQueueGuess(block, previousBlock)
        })
      }

      enqueueBlocks(getBlocksToGuess(previousBlocks, []))

      return {
        update(currentView) {
          const currentBlocks = key.getState(currentView.state) ?? []
          enqueueBlocks(getBlocksToGuess(currentBlocks, previousBlocks))
          previousBlocks = currentBlocks
        },
        destroy() {
          if (timeoutId !== null) {
            clearTimeout(timeoutId)
          }
        },
      }
    },
  })
}
