import type { DecorationObserver } from '@readium/navigator'
import type { BasicTextSelection } from '@readium/navigator-html-injectables'
import type { Link } from '@readium/shared'
import type { ReaderAnnotation, ReaderPageMode, ReaderPresentationMode } from '../../types'
import type { ReaderAdapterCallbacks, ReaderAdapterState } from '../reader-adapter'
import type { ReaderOutlineProjection } from '../reader-outline'
import type { RegionSelectionResult } from '../region-selection'
import type { ParsedEpub } from './epub-parser'
import { createResourceScope } from '@memorilo/effect-lifecycle'
import { EpubNavigator, EpubPreferences } from '@readium/navigator'
import { Locator } from '@readium/shared'
import { interruptPromise } from '../interrupt-promise'
import { clampReaderScale, toReaderError } from '../reader-adapter'
import {
  epubOutline,
  projectEpubTextSelection,
  readiumDecorations,
} from './epub-content-projection'
import { EpubFrameKeyboardOwner } from './epub-frame-keyboard'
import { projectEpubReaderState } from './epub-reader-state'
import { EpubReaderSurface } from './epub-reader-surface'
import { projectEpubRegionMarkers, projectEpubRegionSelection } from './epub-region-projection'

const annotationGroup = 'memorilo-annotations'

function preferences(mode: ReaderPresentationMode, pageMode: ReaderPageMode, scale: number): EpubPreferences {
  if (mode === 'reader') {
    return new EpubPreferences({
      fontSize: scale,
      fontSizeNormalize: true,
      lineHeight: 1.5,
      optimalLineLength: 65,
      paragraphSpacing: 1,
      scroll: pageMode === 'continuous',
      textNormalization: true,
    })
  }
  return new EpubPreferences({
    fontSize: scale === 1 ? null : scale,
    fontSizeNormalize: null,
    lineHeight: null,
    optimalLineLength: null,
    paragraphSpacing: null,
    textNormalization: null,
    scroll: pageMode === 'continuous',
  })
}

interface EpubReaderMountOptions {
  annotations: readonly ReaderAnnotation[]
  callbacks: ReaderAdapterCallbacks
  container: HTMLElement
  initialLocator: Locator
  parsed: ParsedEpub
  pageMode: ReaderPageMode
  presentationMode: ReaderPresentationMode
  signal: AbortSignal
  sourceName: string
}

/** Owns every browser and Readium resource for one mounted EPUB reader. */
export class EpubReaderMount {
  #activated = false
  #annotations: readonly ReaderAnnotation[]
  #currentLocator: Locator
  #lastStateKey: string | undefined
  #navigator: EpubNavigator | null = null
  readonly #outline: ReaderOutlineProjection<Link>
  readonly #scope = createResourceScope('EPUB reader mount', { closeMode: 'dependent' })
  #scale = 1
  #surface: EpubReaderSurface | null = null
  readonly ready: Promise<void>

  constructor(private readonly options: EpubReaderMountOptions) {
    this.#annotations = options.annotations
    this.#currentLocator = options.initialLocator
    this.#outline = epubOutline(options.parsed.publication.toc?.items ?? [])
    this.ready = this.open()
  }

  activate(): void {
    const navigator = this.requireNavigator()
    const surface = this.requireSurface()
    this.#activated = true
    this.commitLocator(navigator.currentLocator, false)
    this.applyAnnotations()
    surface.observeResize()
    this.emitState()
  }

  clearSelection(): void {
    if (this.#scope.isClosed())
      return
    const surface = this.requireSurface()
    surface.setRegionSelectionEnabled(false)
    surface.clearFrameSelections()
    this.options.callbacks.onSelectionChange(null)
  }

  close(): Promise<void> {
    this.#activated = false
    return this.#scope.close()
  }

  async goBackward(signal: AbortSignal): Promise<void> {
    const navigator = this.requireNavigator()
    if (!navigator.canGoBackward)
      return
    await interruptPromise(
      new Promise<void>(resolve => navigator.goBackward(false, () => resolve())),
      signal,
    )
    this.commitLocator(navigator.currentLocator)
  }

  async goForward(signal: AbortSignal): Promise<void> {
    const navigator = this.requireNavigator()
    if (!navigator.canGoForward)
      return
    await interruptPromise(
      new Promise<void>(resolve => navigator.goForward(false, () => resolve())),
      signal,
    )
    this.commitLocator(navigator.currentLocator)
  }

  async goToAnnotation(annotationId: string, signal: AbortSignal): Promise<void> {
    const annotation = this.#annotations.find(item => item.id === annotationId)
    const anchor = annotation?.anchors[0]
    if (!annotation || !anchor || anchor.format !== 'epub')
      throw new Error(`EPUB annotation ${annotationId} does not exist`)
    const locator = Locator.deserialize(anchor.locator)
    if (!locator)
      throw new Error(`EPUB annotation ${annotationId} contains an invalid locator`)
    const navigator = this.requireNavigator()
    await interruptPromise(
      new Promise<void>((resolve, reject) => {
        navigator.go(locator, false, (ok) => {
          if (ok)
            resolve()
          else
            reject(new Error(`Unable to navigate to EPUB annotation ${annotationId}`))
        })
      }),
      signal,
    )
    this.commitLocator(navigator.currentLocator)
  }

  async goToOutlineItem(outlineItemId: string, signal: AbortSignal): Promise<void> {
    const link = this.#outline.requireTarget(outlineItemId)
    const navigator = this.requireNavigator()
    await interruptPromise(
      new Promise<void>((resolve, reject) => {
        navigator.goLink(link, false, (ok) => {
          if (ok)
            resolve()
          else
            reject(new Error(`Unable to navigate to EPUB outline item ${outlineItemId}`))
        })
      }),
      signal,
    )
    this.commitLocator(navigator.currentLocator)
  }

  setAnnotations(annotations: readonly ReaderAnnotation[]): void {
    if (this.#scope.isClosed())
      return
    this.#annotations = annotations
    if (this.#activated)
      this.applyAnnotations()
  }

  setRegionSelectionEnabled(enabled: boolean): void {
    if (!this.#scope.isClosed())
      this.requireSurface().setRegionSelectionEnabled(enabled)
  }

  async setScale(scale: number, signal: AbortSignal): Promise<void> {
    const nextScale = clampReaderScale(scale)
    if (nextScale === this.#scale)
      return
    this.clearSelection()
    const navigator = this.requireNavigator()
    await interruptPromise(
      navigator.submitPreferences(preferences(this.options.presentationMode, this.options.pageMode, nextScale)),
      signal,
    )
    if (this.#scope.isClosed() || this.#navigator !== navigator)
      return
    this.#scale = nextScale
    this.renderRegionAnnotations()
    this.emitState()
  }

  private applyAnnotations(): void {
    const navigator = this.requireNavigator()
    const decorations = this.#annotations.flatMap(readiumDecorations)
    navigator.applyDecorations(decorations, annotationGroup)
    this.renderRegionAnnotations()
  }

  private annotationIdForDecoration(decorationId: string): string {
    const annotation = this.#annotations.find(candidate => (
      decorationId === candidate.id || decorationId.startsWith(`${candidate.id}:`)
    ))
    if (!annotation)
      throw new Error(`EPUB decoration ${decorationId} does not belong to a reader annotation`)
    return annotation.id
  }

  private commitLocator(locator: Locator, publish = true): void {
    if (this.#scope.isClosed() || !this.#activated)
      return
    this.#currentLocator = locator
    this.renderRegionAnnotations()
    if (publish)
      this.publishState(this.projectState(locator))
  }

  private emitState(): void {
    if (!this.#scope.isClosed() && this.#activated)
      this.publishState(this.projectState(this.#currentLocator))
  }

  private handleTextSelection(selection: BasicTextSelection): void {
    this.options.callbacks.onSelectionChange(
      projectEpubTextSelection(this.requireSurface().element, selection),
    )
  }

  private locatorForFrame(href: string): Locator {
    const navigator = this.requireNavigator()
    const base = this.#currentLocator.href === href
      ? this.#currentLocator
      : this.options.parsed.positions.find(locator => locator.href === href)
    if (!base)
      throw new Error(`EPUB frame ${href} does not have a locator`)
    const progression = navigator.viewport.progressions.get(href)?.start
    return progression === undefined ? base : base.copyWithLocations({ progression })
  }

  private observe(operation: () => void): void {
    if (!this.#activated || this.#scope.isClosed())
      return
    try {
      operation()
    }
    catch (error) {
      this.options.callbacks.onError(toReaderError(error))
    }
  }

  private async open(): Promise<void> {
    const { callbacks, container, parsed, signal } = this.options
    try {
      const surface = (await this.#scope.acquire({
        acquire: () => new EpubReaderSurface({
          container,
          onAnnotationActivate: annotationId => this.observe(
            () => callbacks.onAnnotationActivate({ annotationId }),
          ),
          onRegionSelection: selection => this.observe(
            () => this.publishRegionSelection(selection),
          ),
          onRegionSelectionModeChange: enabled => this.observe(
            () => callbacks.onRegionSelectionModeChange(enabled),
          ),
          onResize: () => this.observe(() => this.renderRegionAnnotations()),
          title: parsed.title,
        }),
        close: (owned) => {
          owned.close()
          if (this.#surface === owned)
            this.#surface = null
        },
        name: 'reader surface',
      })).resource
      this.#surface = surface

      const frameKeyboard = (await this.#scope.acquire({
        acquire: () => new EpubFrameKeyboardOwner(callbacks.onKeyDown),
        close: owner => owner.close(),
        name: 'frame keyboard listeners',
      })).resource

      const navigator = (await this.#scope.acquire({
        acquire: () => new EpubNavigator(
          surface.element,
          parsed.publication,
          {
            click: () => true,
            contentProtection: () => undefined,
            contextMenu: () => undefined,
            customEvent: () => undefined,
            frameLoaded: (frameWindow) => {
              surface.styleNavigatorFrame(frameWindow.frameElement)
              frameKeyboard.observe(frameWindow)
            },
            handleLocator: () => true,
            miscPointer: () => undefined,
            peripheral: () => undefined,
            positionChanged: locator => this.observe(() => this.commitLocator(locator)),
            scroll: () => undefined,
            tap: () => true,
            textSelected: selection => this.observe(() => this.handleTextSelection(selection)),
            timelineItemChanged: () => undefined,
            zoom: () => undefined,
          },
          parsed.positions,
          this.#currentLocator,
          {
            defaults: {},
            injectables: { allowedDomains: [], rules: [] },
            preferences: preferences(this.options.presentationMode, this.options.pageMode, this.#scale),
          },
        ),
        close: async (owned) => {
          await owned.destroy()
          if (this.#navigator === owned)
            this.#navigator = null
        },
        name: 'navigator',
      })).resource
      this.#navigator = navigator

      await this.#scope.acquire({
        acquire: () => {
          const observer: DecorationObserver = {
            onDecorationActivated: ({ decoration }) => {
              const annotationId = this.annotationIdForDecoration(decoration.id)
              this.observe(() => callbacks.onAnnotationActivate({ annotationId }))
              return true
            },
          }
          navigator.registerDecorationObserver(annotationGroup, observer)
          return observer
        },
        close: observer => navigator.unregisterDecorationObserver(observer),
        name: 'decoration observer',
      })

      await interruptPromise(navigator.load(), signal)
      signal.throwIfAborted()
      this.#scope.commit()
    }
    catch (error) {
      return this.#scope.rollback(error)
    }
  }

  private projectState(locator: Locator): ReaderAdapterState {
    return projectEpubReaderState({
      locator,
      navigator: this.requireNavigator(),
      outline: this.#outline,
      pageMode: this.options.pageMode,
      parsed: this.options.parsed,
      presentationMode: this.options.presentationMode,
      scale: this.#scale,
      sourceName: this.options.sourceName,
    })
  }

  private publishRegionSelection(result: RegionSelectionResult | null): void {
    if (!result) {
      this.options.callbacks.onSelectionChange(null)
      return
    }
    const projected = projectEpubRegionSelection(
      this.requireSurface().element,
      this.requireNavigator(),
      result,
      href => this.locatorForFrame(href),
    )
    this.options.callbacks.onSelectionChange({
      clientRect: projected.clientRect,
      selection: { anchors: [projected.anchor], type: 'region' },
    })
  }

  private publishState(state: ReaderAdapterState): void {
    const stateKey = JSON.stringify(state)
    if (stateKey === this.#lastStateKey)
      return
    this.options.callbacks.onStateChange(state)
    this.#lastStateKey = stateKey
  }

  private renderRegionAnnotations(): void {
    const surface = this.requireSurface()
    surface.renderRegionMarkers(
      projectEpubRegionMarkers(this.#annotations, surface.element, this.requireNavigator()),
      () => this.options.callbacks.regionAnnotationLabel(),
    )
  }

  private requireNavigator(): EpubNavigator {
    if (this.#scope.isClosed() || !this.#navigator)
      throw new Error('EPUB reader is not available')
    return this.#navigator
  }

  private requireSurface(): EpubReaderSurface {
    if (this.#scope.isClosed() || !this.#surface)
      throw new Error('EPUB reader is not available')
    return this.#surface
  }
}
