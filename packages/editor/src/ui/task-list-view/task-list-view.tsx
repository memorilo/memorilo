import type { NodeViewConstructor } from 'prosekit/pm/view'
import * as stylex from '@stylexjs/stylex'
import i18next from 'i18next'
import { Check } from 'lucide'
import { DOMSerializer } from 'prosekit/pm/model'
import { createListNodeView } from 'prosemirror-flat-list'

import { taskStyles } from './task-list-view.stylex'
import { effectiveStatus, formatDuration, nextClickStatus, totalElapsed, transitionAttrs } from './task-status'

function applyStylex(element: HTMLElement, props: ReturnType<typeof stylex.props>, className?: string) {
  element.className = [className, props.className].filter(Boolean).join(' ')
  if (props.style)
    Object.assign(element.style, props.style)
}

function createIcon([tag, attrs, children]: typeof Check) {
  const element = document.createElementNS('http://www.w3.org/2000/svg', tag)
  for (const [name, value] of Object.entries(attrs))
    element.setAttribute(name, String(value))
  for (const [childTag, childAttrs] of children ?? [])
    element.append(createIcon([childTag, childAttrs, []]))
  return element
}

function taskStatusLabel(status: ReturnType<typeof effectiveStatus>) {
  const statusKey = status === 'todo'
    ? 'ui.taskStatusTodo'
    : status === 'doing' ? 'ui.taskStatusDoing' : 'ui.taskStatusDone'
  return i18next.t('ui.taskStatus', {
    ns: 'editor',
    status: i18next.t(statusKey, { ns: 'editor' }),
  })
}

function createTaskControl(status: ReturnType<typeof effectiveStatus>) {
  const button = document.createElement('button')
  button.type = 'button'
  button.setAttribute('aria-label', taskStatusLabel(status))
  button.setAttribute('aria-pressed', String(status === 'done'))
  button.dataset.status = status
  applyStylex(button, stylex.props(taskStyles.control))

  const glyph = document.createElement('span')
  glyph.setAttribute('aria-hidden', 'true')
  applyStylex(glyph, stylex.props(taskStyles.glyph))

  if (status === 'done') {
    const [tag, attrs, children] = Check
    const icon = createIcon([tag, { ...attrs, 'width': 12, 'height': 12, 'stroke-width': 3 }, children])
    glyph.append(icon)
  }

  if (status === 'doing') {
    const dot = document.createElement('span')
    applyStylex(dot, stylex.props(taskStyles.doingDot))
    glyph.append(dot)
  }

  button.append(glyph)
  return button
}

export const createTaskListView: NodeViewConstructor = (initialNode, view, getPos, decorations, innerDecorations) => {
  if (initialNode.attrs.kind !== 'task')
    return createListNodeView(initialNode, view, getPos, decorations, innerDecorations)

  const toDOM = initialNode.type.spec.toDOM
  if (!toDOM)
    throw new Error('The list node is missing its DOM serializer')

  const rendered = DOMSerializer.renderSpec(document, toDOM(initialNode))
  if (!(rendered.dom instanceof HTMLElement) || !(rendered.contentDOM instanceof HTMLElement))
    throw new Error('The task list DOM serializer must return element containers')

  const dom = rendered.dom
  const contentDOM = rendered.contentDOM
  const marker = dom.querySelector(':scope > .list-marker')
  if (!(marker instanceof HTMLElement))
    return createListNodeView(initialNode, view, getPos, decorations, innerDecorations)

  marker.classList.remove('list-marker-click-target')
  const status = effectiveStatus(initialNode.attrs)
  const button = createTaskControl(status)
  marker.replaceChildren(button)

  const time = document.createElement('span')
  time.contentEditable = 'false'
  time.dataset.status = status
  time.hidden = status === 'todo'
  applyStylex(
    time,
    stylex.props(taskStyles.time, status === 'doing' && taskStyles.timeDoing),
    'task-time',
  )
  contentDOM.before(time)

  let node = initialNode
  const renderTime = () => {
    time.textContent = formatDuration(totalElapsed(node.attrs), status === 'doing')
  }
  renderTime()

  const timer = status === 'doing' ? window.setInterval(renderTime, 1000) : null
  const missingStartTimer = status === 'doing' && typeof initialNode.attrs.startedAt !== 'number'
    ? window.setTimeout(() => {
        const pos = getPos()
        if (typeof pos !== 'number')
          return
        const currentNode = view.state.doc.nodeAt(pos)
        if (!currentNode || effectiveStatus(currentNode.attrs) !== 'doing' || typeof currentNode.attrs.startedAt === 'number')
          return
        const attrs = transitionAttrs(currentNode.attrs, 'doing')
        view.dispatch(view.state.tr.setNodeMarkup(pos, undefined, { ...currentNode.attrs, ...attrs }))
      }, 0)
    : null
  const onMouseDown = (event: MouseEvent) => event.preventDefault()
  const onClick = (event: MouseEvent) => {
    event.preventDefault()
    const pos = getPos()
    if (typeof pos !== 'number')
      return

    const attrs = transitionAttrs(node.attrs, nextClickStatus(effectiveStatus(node.attrs)))
    view.dispatch(view.state.tr.setNodeMarkup(pos, undefined, { ...node.attrs, ...attrs }))
  }

  const renderTranslation = () => {
    button.setAttribute('aria-label', taskStatusLabel(effectiveStatus(node.attrs)))
  }
  i18next.on('languageChanged', renderTranslation)
  button.addEventListener('mousedown', onMouseDown)
  button.addEventListener('click', onClick)

  const nested = initialNode.firstChild?.type === initialNode.type
  const singleChild = initialNode.childCount === 1

  return {
    dom,
    contentDOM,
    update: (nextNode) => {
      if (!nextNode.sameMarkup(node))
        return false
      if ((nextNode.firstChild?.type === nextNode.type) !== nested)
        return false
      if ((nextNode.childCount === 1) !== singleChild)
        return false

      node = nextNode
      renderTranslation()
      return true
    },
    destroy: () => {
      i18next.off('languageChanged', renderTranslation)
      if (timer !== null)
        window.clearInterval(timer)
      if (missingStartTimer !== null)
        window.clearTimeout(missingStartTimer)
      button.removeEventListener('mousedown', onMouseDown)
      button.removeEventListener('click', onClick)
    },
  }
}
