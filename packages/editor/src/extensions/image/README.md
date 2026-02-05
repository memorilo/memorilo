# Image extension

This extension stores images as local **assets** when possible and renders them via `assetId`.

## Node attrs

- `assetId`: preferred source of truth. Resolved to a local URL via `get_asset_url`.
- `src`: optional fallback for non-downloaded remote images (when `downloadImage=false`) or legacy data.
- `uploadId`: temporary id used to patch the inserted node after an async job finishes.
- `uploadError`: set when an async job fails, used to render a failure placeholder.

## Insert / paste / drop flow

### 1) Remote URL (`http/https`)

- If `downloadImage=true`: insert a placeholder node (`src=null`, `assetId=null`, `uploadId=...`), then
  call the backend command `add_asset_from_url`. When it succeeds, patch the node with `assetId` and
  clear `uploadId`. **No `src` is kept as a fallback** by design.
- If `downloadImage=false`: store `src` directly on the node (no asset is created).

Why backend download?
- WebView fetch can fail due to CORS. Downloading in Rust avoids CORS and always produces local bytes.

### 2) Local files / clipboard images

- Insert placeholder nodes with `uploadId`.
- Read the file bytes in the browser and call `add_asset_from_bytes`, then patch the node with `assetId`.

### 3) `data:image/...;base64,...`

- Avoid persisting base64 in the document (size + sync cost). Convert to a placeholder node and call
  `add_asset_from_base64`, then patch the node with `assetId`.

## Rendering

- UI resolves `assetId` via `useAssetUrl(assetId)` (tanstack-query) and renders the local URL.
- If resolving fails and `src` exists, it renders `src`.
- While pending, it shows `Skeleton`. On failure, it shows a placeholder icon.

## Empty paragraph insertion

When the selection is inside an empty paragraph, ProseMirror tends to replace that paragraph with a
block node. For images we prefer keeping the paragraph so users can keep typing, so the extension
inserts images **after** the empty paragraph.

## Structure

- `index.ts`: TipTap extension entry (attrs + commands + plugins + node view).
- `commands.ts`: `setImage` behavior (insert + optional async asset jobs).
- `pm-plugin.ts`: paste/drop interception (files + slice images) and async job scheduling.
- `asset.ts`: async job runner + helpers for adding assets.
- `node-view.ts` / `node-view-content.tsx`: React node view and UI states.
- `file-ext.ts`: extension inference using `mime-types` (frontend).
- `utils.ts`: small helpers (upload id, url detection, data-url parsing).
