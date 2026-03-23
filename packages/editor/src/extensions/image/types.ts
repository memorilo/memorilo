export interface BaseImageAttributes {
  alt: string | null
  title: string | null
  width: number | null
  height: number | null
}

export interface ExistingAssetImageSource extends BaseImageAttributes {
  kind: 'existing-asset'
  assetId: string
  src: string
}

export interface RemoteUrlImageSource extends BaseImageAttributes {
  kind: 'remote-url'
  url: string
}

export interface DataUrlImageSource extends BaseImageAttributes {
  kind: 'data-url'
  dataUrl: string
}

export interface BlobUrlImageSource extends BaseImageAttributes {
  kind: 'blob-url'
  url: string
}

export interface FilePathImageSource extends BaseImageAttributes {
  kind: 'file-path'
  path: string
  url: string
}

export interface ClipboardFileImageSource extends BaseImageAttributes {
  kind: 'clipboard-file'
  file: File
}

export type ClipboardImageSource
  = | ExistingAssetImageSource
    | RemoteUrlImageSource
    | DataUrlImageSource
    | BlobUrlImageSource
    | FilePathImageSource
    | ClipboardFileImageSource

export interface PersistedImageAttributes extends BaseImageAttributes {
  assetId: string
  src: string
}

export interface PasteInsertionRange {
  from: number
  to: number
}
