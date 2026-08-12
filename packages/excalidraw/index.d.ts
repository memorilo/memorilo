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
  renderEmbeddable?: (
    element: ExcalidrawEmbeddableElement,
    appState: AppState,
  ) => React.ReactElement | null;
  renderTopRightUI?: (
    isMobile: boolean,
    appState: AppState,
  ) => React.ReactElement | null;
  validateEmbeddable?: boolean | string[] | RegExp | RegExp[] | ((link: string) => boolean | undefined);
}

export interface ExcalidrawImperativeAPI {
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
}

export const Excalidraw: React.ComponentType<ExcalidrawProps>;

export const CaptureUpdateAction: {
  readonly EVENTUALLY: 'EVENTUALLY';
  readonly IMMEDIATELY: 'IMMEDIATELY';
  readonly NEVER: 'NEVER';
};
export type CaptureUpdateActionType = typeof CaptureUpdateAction[keyof typeof CaptureUpdateAction];

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
  link: string;
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
