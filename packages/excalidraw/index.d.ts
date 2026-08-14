import type React from "react";

export interface ExcalidrawElement {
  customData?: Record<string, unknown>;
  height: number;
  id: string;
  isDeleted: boolean;
  link: string | null;
  type: string;
  width: number;
  x: number;
  y: number;
  [key: string]: unknown;
}
export interface ExcalidrawEmbeddableElement extends ExcalidrawElement {
  type: 'embeddable';
}
export type BinaryFiles = Record<string, unknown>;
export type AppState = {
  gridSize?: number;
  gridStep?: number;
  height: number;
  offsetLeft: number;
  offsetTop: number;
  scrollX: number;
  scrollY: number;
  selectedElementIds: Readonly<Record<string, true>>;
  viewBackgroundColor?: string;
  width: number;
  zoom: { value: number };
  [key: string]: unknown;
};
export type ExcalidrawInitialDataState = {
  elements?: readonly ExcalidrawElement[];
  appState?: Partial<AppState>;
  files?: BinaryFiles;
};

export interface LibraryItem {
  created: number;
  elements: readonly ExcalidrawElement[];
  error?: string;
  id: string;
  name?: string;
  status: 'published' | 'unpublished';
}
export type LibraryItems = readonly LibraryItem[];
export interface LibraryPersistedData {
  libraryItems: LibraryItems;
}
export interface LibraryPersistenceAdapter {
  load: (metadata: { source: 'load' | 'save' }) => LibraryPersistedData | null | Promise<LibraryPersistedData | null>;
  save: (data: LibraryPersistedData) => void | Promise<void>;
}

export interface ExcalidrawProps {
  initialData?: ExcalidrawInitialDataState;
  excalidrawAPI?: (api: ExcalidrawImperativeAPI) => void;
  onChange?: (
    elements: readonly ExcalidrawElement[],
    appState: AppState,
    files: BinaryFiles,
  ) => void;
  onDuplicate?: (
    nextElements: readonly ExcalidrawElement[],
    prevElements: readonly ExcalidrawElement[],
  ) => ExcalidrawElement[] | void;
  onPointerDown?: () => void;
  onPointerUp?: () => void;
  renderEmbeddable?: (
    element: ExcalidrawEmbeddableElement,
    appState: AppState,
  ) => React.ReactElement | null;
  isEmbeddableLinkEnabled?: (
    element: ExcalidrawEmbeddableElement,
  ) => boolean;
  renderTopRightUI?: (
    isMobile: boolean,
    appState: AppState,
  ) => React.ReactElement | null;
  renderToolbarUI?: (
    isMobile: boolean,
    appState: AppState,
  ) => React.ReactElement | null;
  validateEmbeddable?: boolean | string[] | RegExp | RegExp[] | ((link: string) => boolean | undefined);
}

export interface ExcalidrawImperativeAPI {
  id: string;
  updateScene: (scene: {
    appState?: Partial<AppState>;
    captureUpdate?: CaptureUpdateActionType;
    elements?: readonly ExcalidrawElement[];
  }) => void;
  getAppState: () => AppState;
  getSceneElements: () => readonly ExcalidrawElement[];
  getSceneElementsIncludingDeleted: () => readonly ExcalidrawElement[];
  scrollToContent: (
    target?: string | ExcalidrawElement | readonly ExcalidrawElement[],
    options?: {
      animate?: boolean;
      duration?: number;
      fitToContent?: boolean;
      fitToViewport?: boolean;
      maxZoom?: number;
      minZoom?: number;
      viewportZoomFactor?: number;
    },
  ) => void;
  updateLibrary: (options: {
    defaultStatus?: 'published' | 'unpublished';
    libraryItems: LibraryItems | Blob | Promise<LibraryItems | Blob>;
    merge?: boolean;
    openLibraryMenu?: boolean;
    prompt?: boolean;
  }) => Promise<LibraryItems>;
}

export const Excalidraw: React.ComponentType<ExcalidrawProps>;

export function useHandleLibrary(options: {
  adapter: LibraryPersistenceAdapter;
  excalidrawAPI: ExcalidrawImperativeAPI | null;
  validateLibraryUrl?: (libraryUrl: string) => boolean;
}): void;

export const CaptureUpdateAction: {
  readonly EVENTUALLY: 'EVENTUALLY';
  readonly IMMEDIATELY: 'IMMEDIATELY';
  readonly NEVER: 'NEVER';
};
export type CaptureUpdateActionType = typeof CaptureUpdateAction[keyof typeof CaptureUpdateAction];

export const FONT_FAMILY: {
  readonly Virgil: 1;
  readonly Helvetica: 2;
  readonly Cascadia: 3;
  readonly Excalifont: 5;
  readonly Nunito: 6;
  readonly 'Lilita One': 7;
  readonly 'Comic Shanns': 8;
  readonly 'Liberation Sans': 9;
};

export const ROUNDNESS: {
  readonly ADAPTIVE_RADIUS: 3;
  readonly LEGACY: 1;
  readonly PROPORTIONAL_RADIUS: 2;
};

export function newEmbeddableElement(options: {
  backgroundColor?: string;
  customData?: Record<string, unknown>;
  fillStyle?: string;
  height: number;
  link?: string | null;
  locked?: boolean;
  opacity?: number;
  roughness?: number;
  roundness?: { type: number, value?: number } | null;
  strokeColor?: string;
  strokeStyle?: string;
  strokeWidth?: number;
  type: 'embeddable';
  width: number;
  x: number;
  y: number;
}): ExcalidrawEmbeddableElement;
