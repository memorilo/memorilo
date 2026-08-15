import type {
  EditorImageOcclusionTopicDocument,
  ImageOcclusionState,
  OcclusionShape,
} from '@memorilo/editor'
import type Konva from 'konva'
import type { KonvaEventObject } from 'konva/lib/Node'
import type { RefObject } from 'react'
import {
  containOcclusionBoundsShape,
  imageOcclusionBoundsStrokeWidth,
  imageOcclusionBrushStrokeWidth,
  imageOcclusionColor,
  imageOcclusionStateSignature,
  minimumOcclusionShapeSize,
  scaleOcclusionBrushPoints,
  shouldRegroupImageOcclusionShapes,
  transformOcclusionBrushShape,
  translateOcclusionBrushShape,
} from '@memorilo/editor'
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

function shapeWithOffset(shape: OcclusionShape, offset: number): OcclusionShape {
  if (shape.kind === 'brush')
    return translateOcclusionBrushShape(shape, offset, offset)
  return containOcclusionBoundsShape({ ...shape, x: shape.x + offset, y: shape.y + offset })
}

function useElementSize(ref: RefObject<HTMLElement | null>) {
  const snapshot = useRef({ height: 1, width: 1 })
  const getSnapshot = useCallback(() => {
    const element = ref.current
    if (!element)
      return snapshot.current
    const bounds = element.getBoundingClientRect()
    const next = { height: Math.max(1, bounds.height), width: Math.max(1, bounds.width) }
    if (next.height !== snapshot.current.height || next.width !== snapshot.current.width) {
      snapshot.current = next
    }
    return snapshot.current
  }, [ref])
  const subscribe = useCallback((listener: () => void) => {
    const element = ref.current
    if (!element)
      return () => undefined
    const observer = new ResizeObserver(listener)
    observer.observe(element)
    listener()
    return () => observer.disconnect()
  }, [ref])
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot)
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
  const [loaded, setLoaded] = useState<{
    error: boolean
    image: HTMLImageElement | null
    source: string
  } | null>(null)
  useEffect(() => {
    const next = new window.Image()
    let active = true
    next.onload = () => {
      if (active)
        setLoaded({ error: false, image: next, source })
    }
    next.onerror = () => {
      if (active)
        setLoaded({ error: true, image: null, source })
    }
    next.src = source
    return () => {
      active = false
      next.onload = null
      next.onerror = null
    }
  }, [source])
  const current = loaded?.source === source ? loaded : null
  return current === null
    ? { error: false, image: null }
    : { error: current.error, image: current.image }
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
  const signature = imageOcclusionStateSignature(state)
  if (signature !== previousSignature.current) {
    if (signature === expectedSignature.current) {
      expectedSignature.current = null
    }
    else {
      past.current = []
      future.current = []
      expectedSignature.current = null
    }
    previousSignature.current = signature
  }

  const write = useCallback((next: ImageOcclusionState) => {
    if (imageOcclusionStateSignature(next) === imageOcclusionStateSignature(state))
      return
    past.current.push(structuredClone(state))
    future.current = []
    expectedSignature.current = imageOcclusionStateSignature(next)
    topic.setState(next)
  }, [state, topic])

  const undo = useCallback(() => {
    const previous = past.current.pop()
    if (!previous)
      return
    future.current.push(structuredClone(state))
    expectedSignature.current = imageOcclusionStateSignature(previous)
    topic.setState(previous)
  }, [state, topic])

  const redo = useCallback(() => {
    const next = future.current.pop()
    if (!next)
      return
    past.current.push(structuredClone(state))
    expectedSignature.current = imageOcclusionStateSignature(next)
    topic.setState(next)
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
    fill: shape.kind === 'brush' ? undefined : imageOcclusionColor,
    name: shape.id,
    onClick: onSelect,
    onDragEnd,
    onTap: onSelect,
    onTransformEnd,
    opacity: 1,
    perfectDrawEnabled: false,
    ref: register,
    stroke: selected ? '#ffffff' : imageOcclusionColor,
    strokeWidth: selected ? 2 : imageOcclusionBoundsStrokeWidth(viewport.imageWidth, viewport.imageHeight),
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
  const points = scaleOcclusionBrushPoints(
    shape,
    viewport.imageWidth,
    viewport.imageHeight,
    viewport.imageX,
    viewport.imageY,
  )
  return (
    <Line
      key={shape.id}
      {...common}
      fill={undefined}
      lineCap="round"
      lineJoin="round"
      points={points}
      stroke={imageOcclusionColor}
      strokeWidth={imageOcclusionBrushStrokeWidth(shape, viewport.imageWidth, viewport.imageHeight)}
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
  const [titleDraftState, setTitleDraftState] = useState(() => ({ source: title, value: title }))
  const titleDraft = titleDraftState.source === title ? titleDraftState.value : title
  const setTitleDraft = useCallback((value: string) => {
    setTitleDraftState({ source: title, value })
  }, [title])
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
  const shapeIds = useMemo(() => new Set(state.shapes.map(shape => shape.id)), [state.shapes])
  const selectedShapeIds = useMemo(
    () => selectedIds.filter(id => shapeIds.has(id)),
    [selectedIds, shapeIds],
  )
  useEffect(() => {
    const transformer = transformerRef.current
    if (!transformer)
      return
    const transformableIds = selectedShapeIds.length === 1 ? selectedShapeIds : []
    transformer.nodes(transformableIds.flatMap((id) => {
      const node = shapeRefs.current.get(id)
      return node ? [node] : []
    }))
    transformer.getLayer()?.batchDraw()
  }, [selectedShapeIds, state.shapes, viewport])

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
    setSelectedIds((current) => {
      const validCurrent = current.filter(id => shapeIds.has(id))
      return additive
        ? validCurrent.includes(shapeId) ? validCurrent.filter(id => id !== shapeId) : [...validCurrent, shapeId]
        : [shapeId]
    })
  }, [shapeIds, tool])

  const handleDragEnd = useCallback((shape: OcclusionShape, event: KonvaEventObject<DragEvent>) => {
    const node = event.target
    if (shape.kind === 'brush') {
      const dx = node.x() / viewport.imageWidth
      const dy = node.y() / viewport.imageHeight
      node.position({ x: 0, y: 0 })
      replaceShape(shape.id, translateOcclusionBrushShape(shape, dx, dy))
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
    replaceShape(shape.id, containOcclusionBoundsShape({ ...shape, x, y }))
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
      replaceShape(shape.id, transformOcclusionBrushShape(shape, scaleX, scaleY, dx, dy))
      return
    }
    const width = clamp(shape.width * Math.abs(scaleX), minimumOcclusionShapeSize)
    const height = clamp(shape.height * Math.abs(scaleY), minimumOcclusionShapeSize)
    const x = shape.kind === 'ellipse'
      ? (node.x() - viewport.imageX) / viewport.imageWidth - width / 2
      : (node.x() - viewport.imageX) / viewport.imageWidth
    const y = shape.kind === 'ellipse'
      ? (node.y() - viewport.imageY) / viewport.imageHeight - height / 2
      : (node.y() - viewport.imageY) / viewport.imageHeight
    replaceShape(shape.id, containOcclusionBoundsShape({ ...shape, height, width, x, y }))
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
      height: minimumOcclusionShapeSize,
      id,
      kind: tool,
      width: minimumOcclusionShapeSize,
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
      height: Math.max(minimumOcclusionShapeSize, Math.abs(point.y - start.y)),
      width: Math.max(minimumOcclusionShapeSize, Math.abs(point.x - start.x)),
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
      : containOcclusionBoundsShape(draft)
    setDraft(null)
    if (!next)
      return
    history.write({ ...state, shapes: [...state.shapes, next] })
    setSelectedIds([next.id])
  }, [draft, history, state])

  const deleteSelection = useCallback(() => {
    const selected = new Set(selectedShapeIds)
    history.write({ ...state, shapes: state.shapes.filter(shape => !selected.has(shape.id)) })
    setSelectedIds([])
  }, [history, selectedShapeIds, state])

  const copySelection = useCallback(() => {
    const selected = new Set(selectedShapeIds)
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
  }, [history, selectedShapeIds, state])

  const groupSelection = useCallback(() => {
    if (!shouldRegroupImageOcclusionShapes(state.shapes, selectedShapeIds))
      return
    const selected = new Set(selectedShapeIds)
    const groupId = crypto.randomUUID()
    history.write({
      ...state,
      shapes: state.shapes.map(shape => selected.has(shape.id) ? { ...shape, groupId } : shape),
    })
  }, [history, selectedShapeIds, state])

  const ungroupSelection = useCallback(() => {
    const selected = new Set(selectedShapeIds)
    history.write({
      ...state,
      shapes: state.shapes.map(shape => selected.has(shape.id)
        ? { ...shape, groupId: crypto.randomUUID() }
        : shape),
    })
  }, [history, selectedShapeIds, state])

  const selectedGroupIds = new Set(state.shapes.filter(shape => selectedShapeIds.includes(shape.id)).map(shape => shape.groupId))
  const canGroup = shouldRegroupImageOcclusionShapes(state.shapes, selectedShapeIds)
  const canUngroup = selectedShapeIds.length > 0 && [...selectedGroupIds].some(groupId => (
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
          <button {...stylex.props(styles.iconButton)} aria-label={t('imageOcclusion.copy')} disabled={selectedShapeIds.length === 0} title={t('imageOcclusion.copy')} type="button" onClick={copySelection}>
            <Copy aria-hidden="true" size={15} strokeWidth={1.8} />
          </button>
          <button {...stylex.props(styles.iconButton)} aria-label={t('imageOcclusion.group')} disabled={!canGroup} title={t('imageOcclusion.group')} type="button" onClick={groupSelection}>
            <Combine aria-hidden="true" size={15} strokeWidth={1.8} />
          </button>
          <button {...stylex.props(styles.iconButton)} aria-label={t('imageOcclusion.ungroup')} disabled={!canUngroup} title={t('imageOcclusion.ungroup')} type="button" onClick={ungroupSelection}>
            <Unlink aria-hidden="true" size={15} strokeWidth={1.8} />
          </button>
          <button {...stylex.props(styles.iconButton)} aria-label={t('imageOcclusion.delete')} disabled={selectedShapeIds.length === 0} title={t('imageOcclusion.delete')} type="button" onClick={deleteSelection}>
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
                    selectedShapeIds.includes(shape.id),
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
