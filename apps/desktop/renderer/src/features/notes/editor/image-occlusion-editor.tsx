import type {
  EditorImageOcclusionTopicDocument,
  ImageOcclusionState,
  OcclusionBoundsShape,
  OcclusionShape,
} from '@memorilo/editor'
import type Konva from 'konva'
import type { KonvaEventObject } from 'konva/lib/Node'
import type { RefObject } from 'react'
import { imageOcclusionStateSignature } from '@memorilo/editor'
import * as stylex from '@stylexjs/stylex'
import {
  Circle,
  Combine,
  Copy,
  LoaderCircle,
  MousePointer2,
  PenTool,
  Redo2,
  Square,
  Trash2,
  Undo2,
  Unlink,
} from 'lucide-react'
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from 'react'
import { useTranslation } from 'react-i18next'
import {
  Ellipse,
  Image as KonvaImage,
  Layer,
  Line,
  Rect,
  Stage,
  Transformer,
} from 'react-konva'
import { imageOcclusionEditorStyles as styles } from './image-occlusion-editor.stylex'

type Tool = 'brush' | 'ellipse' | 'rectangle' | 'select'

interface Viewport {
  height: number
  imageHeight: number
  imageWidth: number
  imageX: number
  imageY: number
  width: number
}

const minimumShapeSize = 0.005
const occlusionColor = '#2563eb'

function clamp(value: number, minimum = 0, maximum = 1): number {
  return Math.min(maximum, Math.max(minimum, value))
}

function normalizedPoint(
  viewport: Viewport,
  pointer: { x: number, y: number },
  requireInside = false,
) {
  const x = (pointer.x - viewport.imageX) / viewport.imageWidth
  const y = (pointer.y - viewport.imageY) / viewport.imageHeight
  if (requireInside && (x < 0 || x > 1 || y < 0 || y > 1))
    return null
  return {
    x: clamp(x),
    y: clamp(y),
  }
}

function containedBounds(shape: OcclusionBoundsShape): OcclusionBoundsShape {
  const x = clamp(shape.x, 0, 1 - minimumShapeSize)
  const y = clamp(shape.y, 0, 1 - minimumShapeSize)
  return {
    ...shape,
    height: clamp(shape.height, minimumShapeSize, 1 - y),
    width: clamp(shape.width, minimumShapeSize, 1 - x),
    x,
    y,
  }
}

function shapeWithOffset(shape: OcclusionShape, offset: number): OcclusionShape {
  if (shape.kind === 'brush') {
    return {
      ...shape,
      points: shape.points.map(value => clamp(value + offset)),
    }
  }
  return containedBounds({ ...shape, x: shape.x + offset, y: shape.y + offset })
}

function useElementSize(ref: RefObject<HTMLElement | null>) {
  const [size, setSize] = useState({ height: 1, width: 1 })
  useEffect(() => {
    const element = ref.current
    if (!element)
      return
    const update = () => {
      const bounds = element.getBoundingClientRect()
      setSize({ height: Math.max(1, bounds.height), width: Math.max(1, bounds.width) })
    }
    update()
    const observer = new ResizeObserver(update)
    observer.observe(element)
    return () => observer.disconnect()
  }, [ref])
  return size
}

function useImageOcclusionState(topic: EditorImageOcclusionTopicDocument): ImageOcclusionState {
  const cached = useRef<{ signature: string, state: ImageOcclusionState } | null>(null)
  const getSnapshot = useCallback(() => {
    const state = topic.getState()
    const signature = imageOcclusionStateSignature(state)
    if (cached.current?.signature === signature)
      return cached.current.state
    cached.current = { signature, state }
    return state
  }, [topic])
  return useSyncExternalStore(topic.subscribe, getSnapshot, getSnapshot)
}

function useImage(source: string) {
  const [image, setImage] = useState<HTMLImageElement | null>(null)
  const [error, setError] = useState(false)
  useEffect(() => {
    const next = new window.Image()
    let active = true
    next.onload = () => {
      if (active)
        setImage(next)
    }
    next.onerror = () => {
      if (active)
        setError(true)
    }
    setImage(null)
    setError(false)
    next.src = source
    return () => {
      active = false
      next.onload = null
      next.onerror = null
    }
  }, [source])
  return { error, image }
}

function viewportFor(width: number, height: number, imageWidth: number, imageHeight: number): Viewport {
  const inset = 28
  const availableWidth = Math.max(1, width - inset * 2)
  const availableHeight = Math.max(1, height - inset * 2)
  const scale = Math.min(availableWidth / imageWidth, availableHeight / imageHeight)
  const fittedWidth = imageWidth * scale
  const fittedHeight = imageHeight * scale
  return {
    height,
    imageHeight: fittedHeight,
    imageWidth: fittedWidth,
    imageX: (width - fittedWidth) / 2,
    imageY: (height - fittedHeight) / 2,
    width,
  }
}

function useOcclusionHistory(topic: EditorImageOcclusionTopicDocument, state: ImageOcclusionState) {
  const past = useRef<ImageOcclusionState[]>([])
  const future = useRef<ImageOcclusionState[]>([])
  const expectedSignature = useRef<string | null>(null)
  const previousSignature = useRef(imageOcclusionStateSignature(state))
  const [, renderHistory] = useState(0)

  useEffect(() => {
    const signature = imageOcclusionStateSignature(state)
    if (signature === previousSignature.current)
      return
    if (signature === expectedSignature.current) {
      expectedSignature.current = null
    }
    else {
      past.current = []
      future.current = []
      renderHistory(value => value + 1)
    }
    previousSignature.current = signature
  }, [state])

  const write = useCallback((next: ImageOcclusionState) => {
    if (imageOcclusionStateSignature(next) === imageOcclusionStateSignature(state))
      return
    past.current.push(structuredClone(state))
    future.current = []
    expectedSignature.current = imageOcclusionStateSignature(next)
    topic.setState(next)
    renderHistory(value => value + 1)
  }, [state, topic])

  const undo = useCallback(() => {
    const previous = past.current.pop()
    if (!previous)
      return
    future.current.push(structuredClone(state))
    expectedSignature.current = imageOcclusionStateSignature(previous)
    topic.setState(previous)
    renderHistory(value => value + 1)
  }, [state, topic])

  const redo = useCallback(() => {
    const next = future.current.pop()
    if (!next)
      return
    past.current.push(structuredClone(state))
    expectedSignature.current = imageOcclusionStateSignature(next)
    topic.setState(next)
    renderHistory(value => value + 1)
  }, [state, topic])

  return {
    canRedo: future.current.length > 0,
    canUndo: past.current.length > 0,
    redo,
    undo,
    write,
  }
}

function shapeNodes(
  shape: OcclusionShape,
  viewport: Viewport,
  selected: boolean,
  draggable: boolean,
  register: (node: Konva.Node | null) => void,
  onSelect: (event: KonvaEventObject<MouseEvent | TouchEvent>) => void,
  onDragEnd: (event: KonvaEventObject<DragEvent>) => void,
  onTransformEnd: (event: KonvaEventObject<Event>) => void,
) {
  const common = {
    draggable,
    fill: shape.kind === 'brush' ? undefined : occlusionColor,
    name: shape.id,
    onClick: onSelect,
    onDragEnd,
    onTap: onSelect,
    onTransformEnd,
    opacity: 1,
    perfectDrawEnabled: false,
    ref: register,
    stroke: selected ? '#ffffff' : occlusionColor,
    strokeWidth: selected ? 2 : 1,
  } as const
  if (shape.kind === 'rectangle') {
    return (
      <Rect
        key={shape.id}
        {...common}
        height={shape.height * viewport.imageHeight}
        width={shape.width * viewport.imageWidth}
        x={viewport.imageX + shape.x * viewport.imageWidth}
        y={viewport.imageY + shape.y * viewport.imageHeight}
      />
    )
  }
  if (shape.kind === 'ellipse') {
    return (
      <Ellipse
        key={shape.id}
        {...common}
        radiusX={shape.width * viewport.imageWidth / 2}
        radiusY={shape.height * viewport.imageHeight / 2}
        x={viewport.imageX + (shape.x + shape.width / 2) * viewport.imageWidth}
        y={viewport.imageY + (shape.y + shape.height / 2) * viewport.imageHeight}
      />
    )
  }
  if (shape.kind !== 'brush')
    throw new TypeError(`Unsupported OcclusionShape kind: ${String(shape.kind)}`)
  const points = shape.points.map((value, index) => (
    value * (index % 2 === 0 ? viewport.imageWidth : viewport.imageHeight)
    + (index % 2 === 0 ? viewport.imageX : viewport.imageY)
  ))
  return (
    <Line
      key={shape.id}
      {...common}
      fill={undefined}
      lineCap="round"
      lineJoin="round"
      points={points}
      stroke={occlusionColor}
      strokeWidth={Math.max(4, shape.strokeWidth * Math.min(viewport.imageWidth, viewport.imageHeight))}
      tension={0.25}
    />
  )
}

export function ImageOcclusionEditor({
  onRename,
  title,
  topic,
}: {
  onRename: (title: string) => void
  title: string
  topic: EditorImageOcclusionTopicDocument
}) {
  const { t } = useTranslation('editor')
  const state = useImageOcclusionState(topic)
  const history = useOcclusionHistory(topic, state)
  const [tool, setTool] = useState<Tool>('select')
  const [selectedIds, setSelectedIds] = useState<readonly string[]>([])
  const [draft, setDraft] = useState<OcclusionShape | null>(null)
  const [titleDraft, setTitleDraft] = useState(title)
  const shellRef = useRef<HTMLDivElement>(null)
  const transformerRef = useRef<Konva.Transformer>(null)
  const shapeRefs = useRef(new Map<string, Konva.Node>())
  const drawingStart = useRef<{ x: number, y: number } | null>(null)
  const size = useElementSize(shellRef)
  const loaded = useImage(state.image.src)
  const viewport = useMemo(
    () => viewportFor(size.width, size.height, state.image.width, state.image.height),
    [size.height, size.width, state.image.height, state.image.width],
  )

  useEffect(() => setTitleDraft(title), [title])
  useEffect(() => {
    const shapeIds = new Set(state.shapes.map(shape => shape.id))
    setSelectedIds(current => current.filter(id => shapeIds.has(id)))
  }, [state.shapes])
  useEffect(() => {
    const transformer = transformerRef.current
    if (!transformer)
      return
    const transformableIds = selectedIds.length === 1 ? selectedIds : []
    transformer.nodes(transformableIds.flatMap((id) => {
      const node = shapeRefs.current.get(id)
      return node ? [node] : []
    }))
    transformer.getLayer()?.batchDraw()
  }, [selectedIds, state.shapes, viewport])

  const replaceShape = useCallback((shapeId: string, next: OcclusionShape) => {
    history.write({
      ...state,
      shapes: state.shapes.map(shape => shape.id === shapeId ? next : shape),
    })
  }, [history, state])

  const handleSelect = useCallback((shapeId: string, event: KonvaEventObject<MouseEvent | TouchEvent>) => {
    event.cancelBubble = true
    if (tool !== 'select')
      return
    const additive = 'evt' in event && 'shiftKey' in event.evt && event.evt.shiftKey === true
    setSelectedIds(current => additive
      ? current.includes(shapeId) ? current.filter(id => id !== shapeId) : [...current, shapeId]
      : [shapeId])
  }, [tool])

  const handleDragEnd = useCallback((shape: OcclusionShape, event: KonvaEventObject<DragEvent>) => {
    const node = event.target
    if (shape.kind === 'brush') {
      const dx = node.x() / viewport.imageWidth
      const dy = node.y() / viewport.imageHeight
      node.position({ x: 0, y: 0 })
      replaceShape(shape.id, {
        ...shape,
        points: shape.points.map((value, index) => clamp(value + (index % 2 === 0 ? dx : dy))),
      })
      return
    }
    const width = shape.width
    const height = shape.height
    const x = shape.kind === 'ellipse'
      ? (node.x() - viewport.imageX) / viewport.imageWidth - width / 2
      : (node.x() - viewport.imageX) / viewport.imageWidth
    const y = shape.kind === 'ellipse'
      ? (node.y() - viewport.imageY) / viewport.imageHeight - height / 2
      : (node.y() - viewport.imageY) / viewport.imageHeight
    replaceShape(shape.id, containedBounds({ ...shape, x, y }))
  }, [replaceShape, viewport])

  const handleTransformEnd = useCallback((shape: OcclusionShape, event: KonvaEventObject<Event>) => {
    const node = event.target
    const scaleX = node.scaleX()
    const scaleY = node.scaleY()
    node.scale({ x: 1, y: 1 })
    if (shape.kind === 'brush') {
      const dx = node.x() / viewport.imageWidth
      const dy = node.y() / viewport.imageHeight
      node.position({ x: 0, y: 0 })
      replaceShape(shape.id, {
        ...shape,
        points: shape.points.map((value, index) => clamp(
          value * (index % 2 === 0 ? scaleX : scaleY) + (index % 2 === 0 ? dx : dy),
        )),
      })
      return
    }
    const width = clamp(shape.width * Math.abs(scaleX), minimumShapeSize)
    const height = clamp(shape.height * Math.abs(scaleY), minimumShapeSize)
    const x = shape.kind === 'ellipse'
      ? (node.x() - viewport.imageX) / viewport.imageWidth - width / 2
      : (node.x() - viewport.imageX) / viewport.imageWidth
    const y = shape.kind === 'ellipse'
      ? (node.y() - viewport.imageY) / viewport.imageHeight - height / 2
      : (node.y() - viewport.imageY) / viewport.imageHeight
    replaceShape(shape.id, containedBounds({ ...shape, height, width, x, y }))
  }, [replaceShape, viewport])

  const pointer = useCallback((stage: Konva.Stage, requireInside = false) => {
    const value = stage.getPointerPosition()
    return value ? normalizedPoint(viewport, value, requireInside) : null
  }, [viewport])

  const handlePointerDown = useCallback((event: KonvaEventObject<MouseEvent | TouchEvent>) => {
    if (tool === 'select') {
      if (event.target === event.target.getStage())
        setSelectedIds([])
      return
    }
    const stage = event.target.getStage()
    if (!stage)
      return
    const point = pointer(stage, true)
    if (!point)
      return
    drawingStart.current = point
    const id = crypto.randomUUID()
    if (tool === 'brush') {
      setDraft({
        groupId: id,
        id,
        kind: 'brush',
        points: [point.x, point.y, point.x, point.y],
        strokeWidth: 0.025,
      })
      return
    }
    setDraft({
      groupId: id,
      height: minimumShapeSize,
      id,
      kind: tool,
      width: minimumShapeSize,
      x: point.x,
      y: point.y,
    })
  }, [pointer, tool])

  const handlePointerMove = useCallback((event: KonvaEventObject<MouseEvent | TouchEvent>) => {
    if (!draft || !drawingStart.current)
      return
    const stage = event.target.getStage()
    if (!stage)
      return
    const point = pointer(stage)
    if (!point)
      return
    if (draft.kind === 'brush') {
      setDraft({ ...draft, points: [...draft.points, point.x, point.y] })
      return
    }
    const start = drawingStart.current
    setDraft({
      ...draft,
      height: Math.max(minimumShapeSize, Math.abs(point.y - start.y)),
      width: Math.max(minimumShapeSize, Math.abs(point.x - start.x)),
      x: Math.min(start.x, point.x),
      y: Math.min(start.y, point.y),
    })
  }, [draft, pointer])

  const handlePointerUp = useCallback(() => {
    drawingStart.current = null
    if (!draft)
      return
    const next = draft.kind === 'brush'
      ? draft.points.length >= 4 ? draft : null
      : containedBounds(draft)
    setDraft(null)
    if (!next)
      return
    history.write({ ...state, shapes: [...state.shapes, next] })
    setSelectedIds([next.id])
  }, [draft, history, state])

  const deleteSelection = useCallback(() => {
    const selected = new Set(selectedIds)
    history.write({ ...state, shapes: state.shapes.filter(shape => !selected.has(shape.id)) })
    setSelectedIds([])
  }, [history, selectedIds, state])

  const copySelection = useCallback(() => {
    const selected = new Set(selectedIds)
    const groupIds = new Map<string, string>()
    const copies = state.shapes.flatMap((shape) => {
      if (!selected.has(shape.id))
        return []
      const groupId = groupIds.get(shape.groupId) ?? crypto.randomUUID()
      groupIds.set(shape.groupId, groupId)
      return [{ ...shapeWithOffset(shape, 0.02), groupId, id: crypto.randomUUID() }]
    })
    if (copies.length === 0)
      return
    history.write({ ...state, shapes: [...state.shapes, ...copies] })
    setSelectedIds(copies.map(shape => shape.id))
  }, [history, selectedIds, state])

  const groupSelection = useCallback(() => {
    if (selectedIds.length < 2)
      return
    const selected = new Set(selectedIds)
    const groupId = crypto.randomUUID()
    history.write({
      ...state,
      shapes: state.shapes.map(shape => selected.has(shape.id) ? { ...shape, groupId } : shape),
    })
  }, [history, selectedIds, state])

  const ungroupSelection = useCallback(() => {
    const selected = new Set(selectedIds)
    history.write({
      ...state,
      shapes: state.shapes.map(shape => selected.has(shape.id)
        ? { ...shape, groupId: crypto.randomUUID() }
        : shape),
    })
  }, [history, selectedIds, state])

  const selectedGroupIds = new Set(state.shapes.filter(shape => selectedIds.includes(shape.id)).map(shape => shape.groupId))
  const canUngroup = selectedIds.length > 0 && [...selectedGroupIds].some(groupId => (
    state.shapes.filter(shape => shape.groupId === groupId).length > 1
  ))
  const displayedShapes = draft ? [...state.shapes, draft] : state.shapes

  return (
    <div {...stylex.props(styles.root)} data-topic-type="image-occlusion">
      <header {...stylex.props(styles.toolbar)}>
        <input
          {...stylex.props(styles.titleInput)}
          aria-label={t('imageOcclusion.title')}
          value={titleDraft}
          onBlur={() => {
            if (titleDraft !== title)
              onRename(titleDraft)
          }}
          onChange={event => setTitleDraft(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter')
              event.currentTarget.blur()
          }}
        />
        <span {...stylex.props(styles.separator)} />
        <div {...stylex.props(styles.controlGroup)} role="toolbar" aria-label={t('imageOcclusion.tools')}>
          {([
            ['select', MousePointer2],
            ['rectangle', Square],
            ['ellipse', Circle],
            ['brush', PenTool],
          ] as const).map(([id, Icon]) => (
            <button
              key={id}
              {...stylex.props(styles.iconButton, tool === id && styles.iconButtonActive)}
              aria-label={t(`imageOcclusion.tool.${id}`)}
              aria-pressed={tool === id}
              title={t(`imageOcclusion.tool.${id}`)}
              type="button"
              onClick={() => setTool(id)}
            >
              <Icon aria-hidden="true" size={16} strokeWidth={1.8} />
            </button>
          ))}
        </div>
        <div {...stylex.props(styles.controlGroup)} role="group" aria-label={t('imageOcclusion.cardMode')}>
          {(['hide-all', 'hide-one'] as const).map(mode => (
            <button
              key={mode}
              {...stylex.props(styles.modeButton, state.mode === mode && styles.modeButtonActive)}
              aria-pressed={state.mode === mode}
              type="button"
              onClick={() => history.write({ ...state, mode })}
            >
              {t(`imageOcclusion.mode.${mode}`)}
            </button>
          ))}
        </div>
        <span {...stylex.props(styles.separator)} />
        <div {...stylex.props(styles.controlGroup)} role="toolbar" aria-label={t('imageOcclusion.editSelection')}>
          <button {...stylex.props(styles.iconButton)} aria-label={t('imageOcclusion.copy')} disabled={selectedIds.length === 0} title={t('imageOcclusion.copy')} type="button" onClick={copySelection}>
            <Copy aria-hidden="true" size={15} strokeWidth={1.8} />
          </button>
          <button {...stylex.props(styles.iconButton)} aria-label={t('imageOcclusion.group')} disabled={selectedIds.length < 2} title={t('imageOcclusion.group')} type="button" onClick={groupSelection}>
            <Combine aria-hidden="true" size={15} strokeWidth={1.8} />
          </button>
          <button {...stylex.props(styles.iconButton)} aria-label={t('imageOcclusion.ungroup')} disabled={!canUngroup} title={t('imageOcclusion.ungroup')} type="button" onClick={ungroupSelection}>
            <Unlink aria-hidden="true" size={15} strokeWidth={1.8} />
          </button>
          <button {...stylex.props(styles.iconButton)} aria-label={t('imageOcclusion.delete')} disabled={selectedIds.length === 0} title={t('imageOcclusion.delete')} type="button" onClick={deleteSelection}>
            <Trash2 aria-hidden="true" size={15} strokeWidth={1.8} />
          </button>
        </div>
        <div {...stylex.props(styles.controlGroup)} role="toolbar" aria-label={t('imageOcclusion.history')}>
          <button {...stylex.props(styles.iconButton)} aria-label={t('imageOcclusion.undo')} disabled={!history.canUndo} title={t('imageOcclusion.undo')} type="button" onClick={history.undo}>
            <Undo2 aria-hidden="true" size={15} strokeWidth={1.8} />
          </button>
          <button {...stylex.props(styles.iconButton)} aria-label={t('imageOcclusion.redo')} disabled={!history.canRedo} title={t('imageOcclusion.redo')} type="button" onClick={history.redo}>
            <Redo2 aria-hidden="true" size={15} strokeWidth={1.8} />
          </button>
        </div>
      </header>
      <div ref={shellRef} {...stylex.props(styles.canvasShell, tool !== 'select' && styles.canvasDraw)}>
        {loaded.image
          ? (
              <Stage
                height={viewport.height}
                width={viewport.width}
                onMouseDown={handlePointerDown}
                onMouseMove={handlePointerMove}
                onMouseUp={handlePointerUp}
                onTouchEnd={handlePointerUp}
                onTouchMove={handlePointerMove}
                onTouchStart={handlePointerDown}
              >
                <Layer>
                  <Rect fill="#d9dce2" height={viewport.height} listening={false} width={viewport.width} />
                  <KonvaImage
                    height={viewport.imageHeight}
                    image={loaded.image}
                    listening={false}
                    width={viewport.imageWidth}
                    x={viewport.imageX}
                    y={viewport.imageY}
                  />
                  {displayedShapes.map(shape => shapeNodes(
                    shape,
                    viewport,
                    selectedIds.includes(shape.id),
                    tool === 'select' && draft === null,
                    node => node ? shapeRefs.current.set(shape.id, node) : shapeRefs.current.delete(shape.id),
                    event => handleSelect(shape.id, event),
                    event => handleDragEnd(shape, event),
                    event => handleTransformEnd(shape, event),
                  ))}
                  <Transformer
                    ref={transformerRef}
                    anchorCornerRadius={2}
                    anchorFill="#ffffff"
                    anchorSize={8}
                    anchorStroke="#2563eb"
                    borderStroke="#2563eb"
                    enabledAnchors={['top-left', 'top-right', 'bottom-left', 'bottom-right']}
                    flipEnabled={false}
                    ignoreStroke
                    rotateEnabled={false}
                  />
                </Layer>
              </Stage>
            )
          : (
              <div {...stylex.props(styles.status)} role={loaded.error ? 'alert' : 'status'}>
                {loaded.error
                  ? t('imageOcclusion.imageLoadFailed')
                  : <LoaderCircle {...stylex.props(styles.spinner)} aria-hidden="true" size={18} />}
              </div>
            )}
      </div>
    </div>
  )
}
