# Memorilo Mobile Application Plan

## Status

This document defines the implementation plan for adding an Expo and React Native application under `apps/mobile` while preserving the existing Electron desktop application.

The following product decisions are fixed for the first mobile release:

- The mobile application is local-first and operates without a desktop application or remote server.
- Android and iOS are both first-release targets.
- Reading, spaced-repetition learning, and rich-text editing are first-release requirements.
- Mobile and desktop always use the same logical and physical SQLite schema.
- Existing desktop databases and schema generation `1` must remain readable without destructive conversion.
- Cross-device synchronization is not part of the first release. The existing synchronization data structures remain available for later work.

### Current implementation snapshot

Implemented in the working tree, with Android API 35 and iPhone 17 Pro development builds now compiling and launching:

- `apps/mobile` Expo Router shell, shared database composition, Notes, Journals, Learning review, Shelf, Reader, and DOM surface hosts.
- Canonical schema ownership in `packages/editor-storage` with the Expo/native database adapter in `packages/editor-storage-expo`; no mobile-only SQLite tables have been introduced.
- Direct reuse of `Editor`, `JournalEditor`, `CardSurface`, `Reader`, spreadsheet, whiteboard, image-occlusion authoring, and image-occlusion review components through package public entry points.
- Desktop-private spreadsheet, whiteboard, image-occlusion, Learning review source, and Reader annotation-binding behaviour extracted into shared packages, with desktop call sites consuming the shared exports.
- Shared Book Note construction and initialized Note persistence in `packages/application`, consumed by desktop and by the mobile Reader DOM surface.
- Local PDF, EPUB, TXT, CBZ, and CBR import into managed application storage with bounded random-access reads and streaming SHA-256 calculation.
- Standard `BookFileBinding` creation with byte length, original name, SHA-256, format, and local `readingId` retrieval hint.
- Mobile Reader position and annotation persistence through the canonical Book Topic Loro state and Note projection. The file manifest is only authoritative for managed-file metadata; pre-binding development manifests retain a legacy position/annotation fallback.
- Recovery of a successfully created Book Note whose file-manifest binding was interrupted by resolving the canonical `book_topics` projection through `readingId` on the next open.
- Android/iOS Expo export with the complete shared Editor, Learning, Reader, spreadsheet, whiteboard, image-occlusion, and CBR dependency graph. The emitted `apps/mobile/dist` contains the CBR decoder WASM and JavaScript-imported Excalidraw fonts.
- Shared editor font assets exposed through the public `@memorilo/editor/dom-assets` entry point. The mobile DOM adapter registers the 20 KaTeX and four Assistant WOFF2 files with `FontFace`, while the mobile Metro transformer removes only the unsupported duplicate CSS `@font-face` declarations.
- Android/iOS export verification found all 24 required font content hashes in `apps/mobile/dist/assets`, including KaTeX Main Regular `f8a7f19f45060f7a177314855b8c7aa3` and Assistant Regular `5346db7e66db8be27add4fe31999961c`, with no unresolved KaTeX or Assistant local-resource URLs in emitted CSS. The complete export remains approximately 245 MiB.
- Native shell visual language implemented with the official `expo-glass-effect` `GlassView` on iOS 26 targets and a deterministic warm-neutral React Native fallback on Android. The shell uses floating glass headers, controls, modal/empty-state surfaces, and a floating tab bar; it does not use a blue page background or full-screen blur.
- `SafeAreaProvider` and `react-native-safe-area-context` are used for edge-to-edge status-bar and modal correctness on Android and iOS.
- Android Emulator visual acceptance covers Notes, Journal, Learning, and Shelf navigation; the managed reading library avoids Hermes-incompatible `toSorted`/`with` collection helpers.

Still incomplete and release-blocking:

- OPDS source management, credentials, publication browsing, downloads, and cache lifecycle.
- Reader-linked annotation Topics, embedded annotation editors, reader-region capture, managed image assets, and reader-created image occlusion on mobile.
- Full extraction of the desktop `BoundShelfReader` presentation/session composition; only the shared Reader engine, Book Topic state, and annotation-binding rules are currently shared.
- Learning activity, daily progress, optimizer, maintenance, reset, and the remaining supporting/settings workflows.
- Native `sqlite-vec`, FTS5 trigram, Loro/Hermes interoperability, embedding runtime, and physical-device validation beyond the current emulator/simulator evidence.
- Schema dump comparison, desktop production build/E2E, full export inventory, and repository-wide verification.

## Goals

- Add a production Expo/React Native application at `apps/mobile`.
- Reuse the existing Note, learning, storage, reader, shelf, spreadsheet, whiteboard, and image-occlusion behaviour.
- Move portable application behaviour out of `apps/desktop` into shared deep modules.
- Keep platform-specific implementation behind explicit seams with desktop and mobile adapters.
- Make database schema ownership platform-independent and prevent schema drift.
- Preserve the complete Note Loro snapshot and update format across desktop and mobile.
- Provide full rich-text editing and reading through locally bundled web surfaces hosted by the React Native application.

## Non-goals

- Remote synchronization or a hosted Memorilo server.
- Making the Electron Hono transport reachable over the local network.
- Reusing desktop window chrome, menus, title bars, or Electron-specific interaction patterns on mobile.
- Running through Expo Go. Custom native development and production builds are required.
- Reimplementing ProseMirror, PDF, EPUB, comic, spreadsheet, or whiteboard engines as native React Native controls in the first release.
- Providing mobile equivalents for inherently desktop-specific integrations such as the MCP server, Electron window operations, and desktop AnkiConnect integration unless separately requested.

## Design Principles

### Native shell visual language

The previous mobile shell used a flat light canvas, green accent controls, white opaque rows, and full-width divider-style headers. That baseline made navigation chrome read like a traditional form rather than a platform surface.

The replacement follows the Apple Liquid Glass model with deliberate material hierarchy:

- Warm neutral canvas (`#F3F1EC`) and terracotta action color (`#A5523D`) keep the interface calm and avoid a blue-dominant palette.
- `GlassHeader`, `LiquidGlassInput`, `GlassSurface`, and the floating tab bar are the only large material layers. Rows and controls use lighter translucent fills, borders, and shallow shadows instead of turning the whole page into blur.
- iOS uses the system Liquid Glass implementation through `expo-glass-effect`; Android uses the same component API with a solid, high-contrast fallback because the native effect is iOS-only.
- Touch-down feedback is immediate: controls tint to the terracotta soft surface and scale down slightly. Translucent surfaces keep dark system-font text and a bright edge so content remains legible.
- Safe-area insets are handled at the shell boundary. Shared DOM editor, reader, card, spreadsheet, whiteboard, and image-occlusion surfaces remain reused rather than recreated as native UI.

### Component Reuse Matrix

The mobile shell must reuse the existing browser components through local WebView bundles. React Native owns navigation, lifecycle, persistence, files, and touch chrome; it does not recreate the following surfaces:

| Mobile surface | Existing implementation to reuse | Reuse method | Native responsibility |
| --- | --- | --- | --- |
| Note editor | `@memorilo/editor` `Editor`, `createEditorNote`, Topic projections, editor adapters, and the desktop composition currently used by `NoteEditorView` | Mount the package component directly; extract reusable `NoteEditorView` composition from the desktop renderer instead of copying it | Open-note bridge, Note/Topic navigation, update flush, safe-area and keyboard chrome |
| Journal editor | `@memorilo/editor` `JournalEditor`, `resolveJournalTopic`, and the existing Journal calendar/feed models and composition | Mount `JournalEditor` directly; extract portable Journal view models and DOM composition where both platforms need them | Local-date routing, native navigation, lifecycle, and mobile calendar chrome where required |
| Learning cards | `@memorilo/editor` `CardSurface` and `CardPreview`, image-occlusion review UI, review-card session, rating model, and review workflow | Mount the same card surface; move reusable desktop review composition into a shared package before mobile consumes it | Queue navigation, rating gestures/buttons, background lifecycle, and system feedback |
| Reader | `@memorilo/reader` `Reader`/`WindowReader`, reader annotations, selection UI, outline, and the existing bound shelf reader composition | Mount the package reader directly; extract `BoundShelfReader` and portable reader session composition from the desktop renderer | File import/cache, resource URLs, lifecycle, safe areas, and native sharing |
| Shelf | `@memorilo/shelf`, `@memorilo/reading-model`, publication projections, metadata, cover handling, and portable catalog/query logic | Reuse package models directly and extract shared presentation components when their DOM layout also suits mobile | File picker, managed storage, permissions, mobile list/grid navigation, and secure credentials |
| Spreadsheet | Existing spreadsheet Topic integration and `@memorilo/spreadsheet` | Keep it inside the shared editor surface; do not create a React Native spreadsheet implementation | File/asset bridge and lifecycle only |
| Whiteboard | Existing whiteboard Topic integration and `@memorilo/excalidraw` | Keep it inside the shared editor surface; do not create a React Native whiteboard implementation | File/asset bridge, gesture conflict boundaries, and lifecycle only |
| Image occlusion | Existing editor authoring, reader capture, and learning review implementations | Reuse the existing DOM authoring and review components in the appropriate surface | Camera/file acquisition, reader capture transport, and persistence bridge |
| Scheduling and persistence | `@memorilo/srs`, `@memorilo/editor-storage`, and shared application workflows | Import the same public APIs on both platforms | Platform database driver, clock/lifecycle wiring, and native error presentation |

Any new native component must be limited to interaction or platform capabilities that the existing DOM surface cannot provide. Surface bundles communicate through the versioned bridge and never open SQLite directly.

### Reuse-first implementation rule

Every feature starts with an inventory of existing package exports and desktop renderer composition. The implementation order is mandatory:

1. Directly consume an existing public package component, model, or workflow when it already exposes the required behaviour.
2. If the behaviour exists only inside `apps/desktop`, extract the portable component or composition into an appropriate package and make both desktop and mobile consume that extraction.
3. Add a thin platform adapter when only persistence, files, lifecycle, navigation, permissions, or native system integration differs.
4. Create a mobile-only implementation only when the existing DOM component cannot satisfy the mobile interaction or platform requirement. The reason and retained shared behaviour must be recorded in the relevant implementation change.

The following constraints apply throughout implementation:

- Do not copy source files from `apps/desktop` into `apps/mobile`.
- Do not import private source paths from another package or from `apps/desktop`; reusable code must be exposed through a package public entry point.
- Keep existing StyleX component styles with reused DOM components. React Native styling is limited to the native shell and native-only controls.
- Prefer reusing a complete surface over reconstructing it from lower-level primitives. For example, use `CardSurface` rather than separately rebuilding card rendering for each Card kind.
- Changes needed for mobile in a shared component must preserve its desktop contract and behaviour. Platform differences belong in explicit props or adapters rather than runtime platform checks spread through the component.
- Mobile screen work is not complete until its reuse choice is documented as direct reuse, shared extraction, thin adapter, or justified mobile-only UI.
- A new mobile-only component that duplicates an existing editor, reader, review, spreadsheet, whiteboard, image-occlusion, or Journal behaviour is a release blocker.

### Deep modules

Shared packages must provide small interfaces that hide substantial behaviour. Platform call sites should not reproduce workflow, validation, lifecycle, or persistence rules.

The deletion test applies to every proposed package: deleting a shared module should force meaningful complexity back into both desktop and mobile. A package that only renames or forwards calls should not be introduced.

### Real adapter seams

Only behaviour that genuinely varies by platform receives an adapter seam. The database driver is already a real seam because desktop uses Better SQLite while mobile will use Expo/native SQLite. File access, secure credentials, WebView surfaces, and Loro runtimes also vary and require adapters.

### Single ownership

- The React Native host owns the mobile database and application lifecycle.
- Electron main continues to own the desktop database and application lifecycle.
- Embedded WebViews never open SQLite and never own authoritative persistence.
- Shared application modules own domain workflows, not platform composition.
- Schema and migration definitions have exactly one owner.

### Fail fast

Missing SQLite extensions, unsupported schema generations, incompatible Loro updates, invalid bridge messages, and failed persistence must produce explicit failures. Mobile must not silently disable semantic search, omit schema objects, or substitute a different data model.

## Target Architecture

```text
                              +--------------------------+
                              | packages/application     |
                              | Notes, Journals, Review, |
                              | Reading and Shelf flows  |
                              +------------+-------------+
                                           |
                         +-----------------+-----------------+
                         |                                   |
                +--------v---------+               +---------v----------+
                | packages/        |               | packages/          |
                | note-model       |               | editor-storage     |
                | Loro aggregate,  |               | schema, queries,   |
                | projections      |               | learning, search   |
                +--------+---------+               +---------+----------+
                         |                                   |
              +----------+----------+             +----------+----------+
              |                     |             |                     |
     +--------v---------+  +--------v---------+  +v----------------+  +v----------------+
     | loro-crdt        |  | loro-react-      |  | Better SQLite   |  | Expo/native     |
     | desktop/web      |  | native mobile    |  | desktop adapter |  | SQLite adapter  |
     +------------------+  +------------------+  +-----------------+  +-----------------+

     +----------------------+                         +----------------------+
     | apps/desktop         |                         | apps/mobile          |
     | Electron composition |                         | React Native host    |
     | and web renderer     |                         | and Expo Router      |
     +----------+-----------+                         +----------+-----------+
                |                                                |
     +----------v-----------+                         +----------v-----------+
     | Desktop web UI       |                         | Local WebView        |
     | StyleX/DOM           |                         | editor/reader/card   |
     +----------------------+                         | surfaces             |
                                                      +----------------------+
```

## Proposed Module Ownership

| Module | Responsibility | Must not own |
| --- | --- | --- |
| `packages/note-model` | Loro Note aggregate, Topic hierarchy, Topic Block projections, card projections, snapshot/update compatibility | React, DOM, ProseMirror views, SQLite, Electron, React Native |
| `packages/application` | Note, Journal, learning review, reader context, annotation, shelf, and asset workflows | Electron APIs, React hooks, WebView messaging, concrete databases |
| `packages/editor-storage` | Canonical schema, migrations, storage facets, search, learning persistence, schema inspection | Better SQLite, Expo SQLite, platform file paths |
| `packages/editor-storage-expo` | Expo/native SQLite adapter and mobile `sqlite-vec` loading | Alternative schema or mobile-only tables |
| `packages/editor` | Browser editor, ProseMirror integration, card authoring UI, DOM rendering | Mobile database or React Native navigation |
| `packages/reader` | Browser reader engines and reader surface behaviour | Native file picker, mobile cache paths, database ownership |
| `apps/desktop/main` | Electron composition, Better SQLite adapter, IPC/protocol, desktop-only integrations | Portable Note and learning workflows |
| `apps/desktop/renderer` | Desktop navigation and web UI | Domain persistence rules |
| `apps/mobile` | Expo composition, native navigation, mobile adapters, WebView hosting | Forked schema, duplicated domain workflows |

## Database Invariants

The requirement that mobile and desktop always use the same database structure is stronger than sharing a few table definitions. The following invariants are mandatory:

1. One canonical schema and migration sequence is exported by `packages/editor-storage`.
2. Both platforms use the same `PRAGMA user_version` value.
3. Both platforms create the same tables, columns, indexes, triggers, virtual tables, and constraints.
4. Both platforms include FTS5 with the required tokenizer and the `vec0` virtual table implementation.
5. Both platforms use the same learning schema generation and synchronization tables.
6. Both platforms store Loro snapshots and updates in the same binary format.
7. Both platforms apply batch commands atomically and in the supplied order.
8. Platform adapters may change how SQL is executed, but never which SQL is executed.
9. A platform that cannot satisfy the schema must fail during startup. It must not create a reduced schema.
10. The schema generation remains `1` during extraction and adapter work because no DDL change is required.
11. A future schema generation change requires a shared, non-destructive migration before either platform adopts it.

### Existing destructive behaviour

`apps/desktop/main/src/storage/main-database.ts` currently deletes a non-current on-disk database and recreates it. This is incompatible with long-lived mobile and desktop databases.

The database lifecycle must move into `packages/editor-storage` and follow these rules:

- An empty generation `0` database may be initialized as the current generation.
- The current generation opens normally.
- A known older generation runs the shared migration sequence.
- An unknown or newer generation is rejected without changing files.
- Failed migrations preserve the original database and report the failure.
- Database deletion is an explicit user operation, never an automatic compatibility response.

### Schema parity enforcement

The shared storage module should expose schema inspection that normalizes relevant `sqlite_master` definitions. Desktop and mobile startup should verify:

- required SQLite compile features;
- required extension availability;
- schema generation;
- required schema objects;
- canonical SQL definitions where SQLite preserves them;
- embedding model metadata compatibility.

Virtual-table shadow tables may differ by SQLite implementation and must not be treated as application-owned schema. The canonical application definitions remain identical.

## Mobile SQLite Adapter

`packages/editor-storage-expo` will implement the existing `EditorStorageDatabase` interface.

Required adapter behaviour:

- Open and close the application database with explicit ownership.
- Execute `all`, `get`, `run`, `exec`, and atomic ordered `batch` operations.
- Preserve `Uint8Array` BLOB values without base64 conversion in storage.
- Reject integer values outside JavaScript's safe integer range when the native driver cannot preserve them.
- Enable foreign keys, WAL behaviour, busy timeouts, and other shared pragmas consistently.
- Translate native SQLite errors without hiding constraint or transaction failures.
- Load or statically register `sqlite-vec` before schema initialization.
- Verify FTS5 and trigram tokenizer support before opening `SqliteEditorStorage`.

### Native SQLite extensions

Mobile must use a custom Expo development client and production build. A config plugin or local Expo native module must:

- compile or bundle the pinned `sqlite-vec` version for Android ABIs;
- link the same extension into the iOS application;
- expose extension registration before the database schema is initialized;
- keep Android and iOS extension versions aligned with desktop;
- fail the build or startup if `vec0` is unavailable.

Expo Go cannot satisfy these requirements and is not a supported development path.

## Loro Compatibility

Desktop and browser code currently uses `loro-crdt`; Hermes requires `loro-react-native` or an equivalent native implementation.

Before the model extraction begins, a compatibility spike must demonstrate:

- desktop snapshot exported and imported on Android and iOS;
- mobile snapshot exported and imported on desktop;
- incremental updates moving in both directions;
- Topic tree moves retaining identity;
- rich-text marks and nested blocks retaining their projection;
- card, image-occlusion, spreadsheet, whiteboard, book binding, and reading state containers retaining their values;
- invalid or incompatible updates failing explicitly.

If the runtime interfaces differ, `packages/note-model` should own a narrow Loro runtime seam. Callers must not depend directly on runtime-specific container classes.

## Mobile Application Structure

The proposed `apps/mobile` structure is:

```text
apps/mobile/
|-- app/                         # Expo Router routes
|-- src/
|   |-- application/             # Mobile composition root
|   |-- database/                # Adapter wiring and database paths
|   |-- files/                   # Imported books and managed assets
|   |-- i18n/                    # Mobile i18next initialization
|   |-- navigation/              # Shared route definitions and linking
|   |-- screens/                 # React Native screens
|   |-- secure-storage/          # Credentials and sensitive settings
|   |-- surfaces/                # WebView hosts and bridge clients
|   `-- ui/                      # Mobile-only controls and styling
|-- web/
|   |-- editor/                  # DOM editor surface entry
|   |-- reader/                  # DOM reader surface entry
|   `-- card/                    # DOM learning card surface entry
|-- plugins/                     # Expo config plugins/native linkage
|-- app.json
|-- metro.config.cjs
|-- package.json
`-- tsconfig.json
```

Generated `android/` and `ios/` directories should come from Expo prebuild configuration. Manual native edits must be represented by a config plugin or local Expo module so regeneration remains deterministic. Whether generated native directories are committed should be decided once the extension integration is proven; this plan does not assume they are disposable.

## Web Surface Architecture

Rich editing and the current reader depend heavily on DOM, ProseMirror, StyleX, PDF.js, EPUB frames, canvas, and browser selection behaviour. Rewriting these engines as native controls would create a second implementation of the product's most complex behaviour.

The first release therefore uses a React Native native shell with locally bundled WebView surfaces.

### Surface responsibilities

- Editor surface: Topic tree, Document and Outline modes, rich text, math, tables, tasks, images, cards, image occlusion, spreadsheets, and whiteboards.
- Reader surface: PDF, EPUB, TXT, CBZ, CBR, outline, page modes, selection, annotations, and reading position.
- Card surface: full-fidelity question and answer rendering, cloze reveal, math, images, list/set cards, and image occlusion.
- React Native host: navigation, safe areas, native gestures, database, files, permissions, lifecycle, sharing, and system integration.

### Bridge principles

Each surface exposes a small, versioned interface. The interface should carry domain operations, not DOM events.

Indicative editor interface:

```ts
interface MobileEditorSurface {
  openNote(input: OpenEditorNoteInput): Promise<void>
  applyExternalUpdates(updates: readonly Uint8Array[]): Promise<void>
  flushUpdates(): Promise<readonly Uint8Array[]>
  setActiveTopic(topicId: string): Promise<void>
  close(): Promise<void>
}
```

Indicative reader interface:

```ts
interface MobileReaderSurface {
  open(input: OpenReaderInput): Promise<void>
  applyReadingState(state: BookReadingState): Promise<void>
  flushReadingState(): Promise<BookReadingState>
  close(): Promise<void>
}
```

Bridge messages must use runtime validation, protocol versions, request identifiers, timeouts, and explicit error responses. Unknown message types are protocol errors.

Large books, images, and archives must not be serialized through `postMessage` as base64. The native host should provide WebView-readable local files or a native resource adapter with bounded streaming/chunking.

### WebView security

- Load only application-bundled surfaces and managed local resources.
- Reject arbitrary navigation and popups.
- Do not expose database handles or raw filesystem paths to untrusted content.
- Validate every native-to-web and web-to-native message.
- Restrict bridge operations to the currently open Note or reading session.
- Apply message size limits and backpressure.
- Flush sessions on backgrounding, navigation, and shutdown.

## Feature Scope

### Notes and Journals

- Note library, recent Notes, favorites, pagination, sorting, and search.
- Note creation, rename, open history, and Journal calendar/feed.
- Folder and Topic hierarchy editing.
- Document and Outline editing modes.
- Rich text, math, tables, images, tasks, code blocks, and links.
- Card authoring and CardTopic reconciliation.
- Image-occlusion Topics, spreadsheets, and whiteboards.
- Managed local assets and network image import.

### Reading and Shelf

- Local PDF, EPUB, TXT, CBZ, and CBR import.
- OPDS shelf source browsing and cached publications.
- Reader outline, continuous/single-page modes, zoom, and position restore.
- Text and region annotations.
- Reader annotations connected to Note Topics.
- Reader-region capture and image-occlusion creation.
- Book cache and reading-file lifecycle using mobile file adapters.
- Credentials stored with mobile secure storage rather than Electron `safeStorage`.

### Learning

- Learning queue, new/review/mixed modes, daily limits, and sibling burying.
- Basic, cloze, list, set, highlight, and image-occlusion Cards.
- Full and partial list/set presentations.
- Rating, undo, reset, review-event history, and maintenance.
- Optimizer creation, assignment, editing, optimization, and archive.
- Activity summary and daily progress.
- Local learning sync outbox and device sequence data remain in the common schema, but no remote transport runs in the first release.

### Settings and maintenance

- Mobile language and locale-aware dates.
- Shared learning and editor configuration where semantics match.
- Mobile-specific appearance, permissions, and storage settings.
- Database export/import that preserves the same database generation and asset relationships.
- Asset inspection and reclamation using mobile file operations.

## Implementation Stages

### Stage 0: Record architecture decisions

Work:

- Record the local-first mobile composition, common schema ownership, native SQLite extension requirement, and WebView surface decision in ADRs.
- Define the first-release feature matrix and explicitly identify desktop-only integrations.
- Produce a component reuse inventory for every first-release screen, naming the existing public export or desktop composition and classifying it as direct reuse, shared extraction, thin adapter, or justified mobile-only UI.
- Pin compatible Expo, React Native, `loro-react-native`, Expo SQLite, and `sqlite-vec` versions.

Exit conditions:

- No unresolved ownership exists for schema, Loro data, files, application workflows, or WebView sessions.
- Every first-release screen has an approved reuse path; no feature begins from a blank mobile implementation when an equivalent component already exists.
- Version choices are compatible with Node 22, pnpm 10, Android API 35, and the installed Xcode toolchain.

### Stage 1: Prove native prerequisites

Work:

- Create a minimal temporary Expo development build.
- Prove Loro snapshot and update interoperability on Android and iOS.
- Prove Expo/native SQLite transactions, BLOBs, FTS5 trigram, and `vec0` support.
- Prove a locally bundled WebView can load editor dependencies without a network server.
- Measure bridge and file-loading behaviour with representative Note and book sizes.

Exit conditions:

- Both platforms can open the complete generation `1` schema.
- Both platforms can exchange Loro data with desktop.
- A local WebView surface starts without remote assets.
- Any failed prerequisite blocks later implementation rather than introducing a fallback architecture.

### Stage 2: Centralize database lifecycle

Work:

- Move database generation ownership and open/migration policy into `packages/editor-storage`.
- Remove automatic destructive recreation from the desktop composition root.
- Expose canonical schema initialization and inspection.
- Keep generation `1` and the existing DDL unchanged.
- Update desktop to use the shared database lifecycle.

Exit conditions:

- An existing desktop generation `1` database opens unchanged.
- Unknown generations are rejected without modifying files.
- Desktop creates the same schema as before extraction.

### Stage 3: Add the mobile database adapter

Work:

- Create `packages/editor-storage-expo`.
- Implement the database driver interface and lifecycle ownership.
- Integrate native `sqlite-vec` registration for Android and iOS.
- Open `SqliteEditorStorage` using the canonical schema.
- Establish mobile database, managed asset, book-library, and cache paths.

Exit conditions:

- Mobile opens the full schema with no mobile-only DDL.
- The normalized application-owned schema matches desktop.
- Reopening after application restart preserves Notes, assets, and learning state.

### Stage 4: Extract the portable Note model

Work:

- Create `packages/note-model`.
- Move the Loro aggregate, Note hierarchy, projections, and card model out of browser editor ownership.
- Introduce the narrow Loro runtime seam if required by native bindings.
- Make `packages/editor` consume the new module without changing desktop behaviour.
- Keep DOM and ProseMirror view code in `packages/editor`.

Exit conditions:

- Desktop editor behaviour remains unchanged.
- Mobile can create, open, mutate, export, and persist complete Notes.
- Snapshot and incremental-update formats remain byte-compatible across platforms.

### Stage 5: Extract portable application workflows

Work:

- Create `packages/application`.
- Move Note application, authoritative runtime, Journal, learning review, reader-context, and portable shelf workflows from desktop main.
- Extract reusable renderer compositions such as Note editor session/chrome, Journal models, review session/rating flow, and bound reader session into package-owned public entry points where direct package components are not already sufficient.
- Keep Electron adapters and desktop-only operations in `apps/desktop/main`.
- Compose desktop main and renderer against the shared application and presentation modules before mobile consumes them.

Exit conditions:

- Desktop main is a platform composition root rather than the owner of portable workflows.
- Mobile can compose the same Note and learning workflows against its database and file adapters.
- Desktop and mobile import reusable components and workflows through package public entry points; neither application imports the other's private source tree.
- No shared package imports Electron or Node-only filesystem modules through its public entry points.

### Stage 6: Scaffold `apps/mobile`

Work:

- Add the Expo Router application and workspace configuration.
- Configure Metro for pnpm workspace packages and singleton React dependencies.
- Add mobile i18n initialization using the real root locale bundles.
- Add the application composition root, resource lifecycle, and startup failure UI.
- Add root scripts, Turbo tasks, Nix usage, and Just recipes.

Exit conditions:

- Android and iOS development builds launch from repository commands.
- The application opens and closes its local runtime cleanly.
- Background/foreground transitions preserve or flush owned resources correctly.

### Stage 7: Implement rich-text editing

Work:

- Build the editor as a locally bundled WebView surface by mounting the existing `Editor` and `JournalEditor` components.
- Reuse the existing Topic editors for image occlusion, spreadsheet, and whiteboard rather than creating mobile variants.
- Extract and share the useful parts of desktop `NoteEditorView`, editor session, and Topic chrome composition; leave Electron-only dialogs and window behaviour in desktop.
- Implement the versioned editor bridge and persistence handshake.
- Integrate Topic navigation, metadata mutations, assets, and configuration.
- Support every existing regular editing mode and Topic type.
- Ensure pending updates flush before Note switches, backgrounding, and shutdown.

Exit conditions:

- Complete Notes created on mobile open correctly on desktop and vice versa.
- Rich editing, card authoring, image occlusion, spreadsheet, and whiteboard changes persist through the shared database.
- The mobile editor bundle resolves the reused components from package public entry points and contains no copied editor implementation.
- No editor surface writes directly to SQLite.

### Stage 8: Implement reading and shelf workflows

Work:

- Build the reader as a locally bundled WebView surface by mounting `Reader` or `WindowReader` from `@memorilo/reader`.
- Extract and reuse the existing bound reader, annotation, capture, session-owner, publication projection, and shelf metadata composition where it is currently desktop-private.
- Add native file import, cache, secure credentials, and file-resource adapters.
- Integrate shelf browsing and reading-file preparation.
- Connect annotations, reader positions, captures, and reader-linked Topics to the shared application module.
- Preserve existing file fingerprints and reading state formats.

Current progress:

- Local managed-file import, format detection, streaming SHA-256, random-access file reads, shared Reader mounting, standard Book Note creation, and Book Topic position/annotation persistence are implemented.
- The Book Note/file-manifest operation has a recovery path through the canonical `book_topics` reading-id projection if manifest binding is interrupted.
- OPDS, secure credentials, publication UI, cache cleanup, Reader-linked annotation Topics, region capture, image occlusion, and the complete shared bound-reader composition remain open. Stage 8 is not complete.

Exit conditions:

- Every supported format opens on Android and iOS.
- Reading positions and annotations survive application restarts.
- Reader-linked Notes open on desktop without conversion.
- Reader format engines, annotation UI, and publication behaviour have one shared implementation rather than desktop and mobile forks.

### Stage 9: Implement learning

Work:

- Add mobile learning navigation, queue views, activity, progress, and optimizer screens.
- Host the existing `CardSurface` inside a local WebView and reuse `CardPreview` wherever preview behaviour is needed.
- Extract and reuse the desktop review session, rating model, review source, and image-occlusion review composition instead of recreating Card-kind branches in mobile.
- Keep rating controls and gestures in React Native.
- Connect rating, undo, reset, maintenance, and optimizer workflows to the shared application module.

Exit conditions:

- Mobile and desktop compute compatible queues and learning states from the same database.
- All supported Card kinds render and rate correctly.
- Card rendering and review-state transitions are supplied by shared components and workflows; mobile owns only its native controls and lifecycle adapter.
- Review Events and sync outbox records use the unchanged shared schema.

### Stage 10: Complete supporting workflows

Work:

- Add Notes, Journals, Shelf, Learning, settings, search, asset maintenance, and database import/export screens.
- Reuse existing Journal calendar/feed models, Note library models, learning activity components, shelf publication components, and shared empty/error states wherever their behaviour and layout are portable; extract them before adding a second implementation.
- Add mobile error recovery, permission handling, empty states, and storage diagnostics.
- Complete accessibility, reduced-motion behaviour, keyboard handling, and tablet layouts.

Exit conditions:

- The agreed first-release feature matrix is complete on both platforms.
- The component reuse inventory is reconciled against the implementation, and every divergence has an explicit platform reason.
- Mobile-specific states do not leak into the shared database schema.

### Stage 11: Production verification

Work:

- Run targeted lint, type checking, existing tests, and builds after each affected package change.
- Run the complete workspace lint, type check, and existing test suite before completion.
- Build Android and iOS development and release variants.
- Exercise representative databases and files on both simulators and physical devices where available.
- Compare database generation and normalized schema output between desktop, Android, and iOS.
- Verify desktop production builds and Electron end-to-end workflows remain operational.

Exit conditions:

- The completion criteria below are satisfied.
- No required verification remains skipped without an explicit recorded reason.

## Development Commands

Expected root scripts:

```sh
pnpm dev:mobile
pnpm mobile:prebuild
pnpm mobile:android
pnpm mobile:ios
pnpm mobile:export
```

Expected Just recipes:

```sh
just dev-mobile
just dev-ios "iPhone 17 Pro"
just android-avd-create
just android-avds
just android-emulator
just dev-android
```

Mobile E2E or simulator automation must not show an unmanaged desktop Electron window. Existing Electron E2E launches continue to use `MEMORILO_E2E_HIDE_WINDOW=1`.

## Suggested Commit Sequence

Implementation should remain incremental and keep desktop usable after every commit. Suggested Conventional Commit subjects are:

1. `docs(architecture): record mobile application decisions`
2. `refactor(storage): centralize database schema lifecycle`
3. `feat(storage): add Expo SQLite database adapter`
4. `refactor(editor): extract portable Note model`
5. `refactor(application): extract portable Note workflows`
6. `refactor(application): extract portable learning workflows`
7. `refactor(application): extract portable reading workflows`
8. `feat(mobile): scaffold Expo application`
9. `feat(mobile): add local editor surface`
10. `feat(mobile): add local reader surface`
11. `feat(mobile): add learning workflows`
12. `feat(mobile): complete local application workflows`

This sequence is illustrative. A commit must not claim a stage is complete while leaving required call sites or verification broken.

## Risks and Notes

### Database compatibility

- Never duplicate schema SQL in `apps/mobile`.
- Never add platform-specific columns, tables, indexes, or triggers.
- Never bump `user_version` for a package move or adapter-only change.
- Never delete an incompatible database automatically.
- Review all future schema changes against an existing desktop database before implementation.
- Do not update dependency patches or patch `expo-sqlite`, `sqlite-vec`, Loro, or React Native without explicit approval.

### SQLite implementation differences

- Confirm transaction semantics rather than assuming Expo SQLite matches Better SQLite.
- Preserve statement order in batch operations.
- Check BLOB ownership and copying across the native bridge.
- Treat integer conversion and row-id precision explicitly.
- Pin SQLite extension versions and supported ABIs.
- Do not claim schema parity if required virtual tables are unavailable.

### Loro and editor compatibility

- Keep Note schema version and container names unchanged.
- Do not translate snapshots through JSON.
- Avoid platform-specific mutation ordering.
- Preserve update deduplication hashes and checkpoint semantics.
- Do not expose runtime-specific Loro container types through shared interfaces.
- Flush editor updates before releasing a WebView or database runtime.

### WebView lifecycle

- A WebView may be killed while the application remains alive; persistence cannot depend on graceful unmount alone.
- Background events require an explicit flush deadline and a reported failure path.
- Bridge operations must be idempotent where retries are possible.
- Large payloads require local resource access or bounded transfer rather than one unbounded message.
- Renderer crashes must not corrupt the authoritative database session.

### Reading files and assets

- Preserve content hashes, byte lengths, original names, and retrieval hints.
- Keep permanent library files separate from disposable cache files.
- Do not expose credentials to reader WebViews.
- File cleanup must respect active reading sessions and Note asset references.
- iOS security-scoped resources and Android content URIs require platform adapters.

### React Native monorepo integration

- Resolve React and other application singletons from `apps/mobile`.
- Do not let Metro import Node-only entry points from shared packages.
- Keep platform exports explicit where a package has browser, Node, and native implementations.
- Keep Metro's mobile adapter responsible for Vite-style `?url` assets and tracked `wasm`, `woff`, and `woff2` resources. CBR must continue to use the shared `node-unrar-js` decoder rather than a mobile fork.
- Keep Node-only font-subsetting builtins behind platform-resolved files so Expo DOM bundles never parse `fs` or `path`, while desktop and Node retain the existing WOFF2 subsetting implementation.
- Expo SDK 57 DOM exports currently require `EXPO_NO_BUNDLE_SPLITTING=1` because split DOM bundles can reference an omitted `__common-*.js` asset. Keep this workaround explicit in the mobile export command and remove it only after an Expo upgrade passes Android and iOS DOM export acceptance.
- Expo DOM does not collect KaTeX or Excalidraw Assistant fonts referenced only by local CSS URLs. Keep the reusable font inventory in the public `@memorilo/editor/dom-assets` entry point, register it through the mobile DOM adapter, and keep the mobile Metro transformer scoped to removing the duplicate unsupported `@font-face` declarations. Do not move this platform workaround into desktop or duplicate the font inventory in `apps/mobile`.
- Expo SDK 57 Android/iOS DOM export emits `apps/mobile/dist`; acceptance must inspect the emitted Reader, Excalidraw, Konva, CBR WASM, and font assets rather than relying on the successful exit code alone.
- The current complete Android/iOS export is approximately 245 MiB, including a 118 MiB ONNX model, a 17 MiB tokenizer, and three 28-32 MiB DOM JavaScript bundles. Record installed size, cold-start time, WebView recreation time, and peak memory on the device matrix before accepting the release; optimization must preserve the shared feature implementations.
- Desktop renderer type checking requires its generated `routeTree.gen` input. Generate it through the repository workflow before treating route-related type errors as product regressions.
- Avoid global dependency installation; use the flake devShell and workspace dependencies.
- Generated native changes must be reproducible through Expo configuration.

### Scope control

- Do not copy desktop React components into React Native and call them shared.
- Share domain models and workflows; implement platform-appropriate screens.
- Do not add shallow pass-through packages merely to reduce relative imports.
- Keep desktop-only operations out of portable interfaces.
- Treat full rich editing and reading as Web surface work, not as a late compatibility shim.

## Acceptance Plan

Acceptance is performed on the final Android and iOS development builds, a desktop development build, and representative existing generation `1` databases. The mobile app must be usable without network access or a running desktop application unless a case explicitly tests an external OPDS source.

### Acceptance environment

- macOS with the repository Nix development shell active.
- Xcode and an iOS Simulator runtime supported by the pinned Expo/RN versions.
- Android API 35 emulator using the repository's Android Nix shell and a supported ABI.
- A clean checkout with dependencies installed through the repository workflow.
- One empty database, one populated generation `1` desktop database, and one database containing representative assets and reading files.
- Test fixtures covering regular Notes, Journals, nested Topics, CardTopics, image occlusion, spreadsheet, whiteboard, and book-linked Topics.

Record the exact OS, Xcode, Android emulator image, Node, pnpm, Expo, React Native, Loro, SQLite, and `sqlite-vec` versions with the acceptance evidence.

### Gate 1: Build and launch

Run:

```sh
pnpm lint
pnpm typecheck
pnpm test
pnpm build
pnpm mobile:prebuild
pnpm mobile:android
pnpm mobile:ios
```

Pass conditions:

- Existing desktop lint, type checking, tests, build, and Electron workflows remain green.
- Android and iOS development builds compile without manual native edits after prebuild.
- Both apps launch offline and show an actionable error if native prerequisites are missing.
- The app does not require Expo Go, a running Electron process, or a network API for local workflows.
- The exported DOM asset inventory contains the Reader CBR WASM, required editor/whiteboard fonts, and every local HTML, JavaScript, and CSS entry without unresolved local-resource warnings.
- On iOS, headers, controls, empty states, and the tab bar render as distinct Liquid Glass functional layers over the warm neutral canvas. On Android, the fallback remains warm neutral, opaque enough for contrast, and never becomes a blue full-screen blur.
- Android and iOS screenshots show no status-bar overlap, no clipped header text, and no floating tab-bar occlusion of list content.

Evidence:

- Command output and build identifiers.
- Android and iOS launch screenshots.
- Generated native project/configuration diff showing reproducible native setup.
- Export manifest, asset inventory, installed size, cold-start timing, WebView recreation timing, and peak-memory measurements for each device class.

### Gate 2: Database schema parity

For a fresh database on desktop, Android, and iOS:

1. Open the database through the normal application startup path.
2. Record `PRAGMA user_version` and the learning schema generation.
3. Dump application-owned `sqlite_master` definitions, excluding SQLite virtual-table shadow tables.
4. Verify the required FTS5 tables, trigram tokenizer, `topic_block_embeddings`, and `vec0` are available.
5. Compare the normalized dumps byte-for-byte.

For an existing desktop generation `1` database:

1. Make a copy and open it in mobile on Android and iOS.
2. Verify the original file remains unchanged apart from expected SQLite runtime journals.
3. Open the same copy again on desktop and compare Notes, assets, reading state, and learning state.
4. Attempt to open a newer and an unknown generation copy.

Pass conditions:

- All three platforms report the same generation and canonical schema.
- No platform creates or omits an application-owned object.
- `vec0` and semantic-search tables are available on both mobile platforms.
- Existing generation `1` data opens without destructive recreation or conversion.
- Unknown/newer generations are rejected without changing the database.

Evidence:

- Normalized schema dumps for all platforms.
- `PRAGMA` and extension capability output.
- Before/after hashes and file listings for the existing database.

### Gate 3: Loro and persistence interoperability

Use one Note fixture and perform the following sequence:

1. Create and edit the Note on desktop, then open it on Android and iOS.
2. Edit nested Topics, move siblings, change rich-text marks, and mutate CardTopic metadata on mobile.
3. Close and reopen the Note on every platform.
4. Export a snapshot and incremental update from each platform and import it into the other two platforms.
5. Repeat with image-occlusion, spreadsheet, whiteboard, book binding, and reading-state containers.

Pass conditions:

- IDs, ordering, parentage, marks, attributes, and projections remain identical.
- Incremental updates are applied without JSON translation or lost operations.
- Reopening after process termination restores the latest acknowledged state.
- Invalid runtime data fails with a visible, actionable error and does not partially commit.

Evidence:

- Snapshot/update hashes and import results.
- Before/after projection exports for each Topic type.
- Recovery logs after close/reopen cycles.

### Gate 4: Rich-text editing

On both mobile platforms, verify:

- Document and Outline modes.
- Headings, paragraphs, nested lists, tasks, tables, code blocks, links, images, and math.
- Card authoring, cloze, list/set, highlight, and CardTopic linking/detaching.
- Image occlusion creation and editing.
- Spreadsheet and whiteboard creation, editing, and persistence.
- Topic creation, rename, reorder, reparent, and deletion rules.
- Switching Notes, backgrounding the app, killing the WebView, and reopening during pending edits.

Pass conditions:

- Every edit is visible immediately in the surface and persists through host restart.
- Changes made on mobile open with the same content and projections on desktop.
- The surface mounts `Editor`/`JournalEditor` and the existing Topic implementations from package public entry points; no copied or reduced mobile editor exists.
- No editor surface writes SQL directly.
- Pending updates are flushed before navigation or lifecycle release, or the UI reports a failed flush.

Evidence:

- A workflow recording or screenshots for each editor mode.
- Reopened desktop/mobile views of the same edited Note.
- Persisted update counts and hashes for the lifecycle cases.
- Bundle/import audit identifying the shared editor entry points used by mobile and confirming there are no imports from desktop-private source paths.

### Gate 5: Reading and annotations

For PDF, EPUB, TXT, CBZ, and CBR fixtures on Android and iOS:

- Import or open the file through the mobile file flow.
- Navigate pages/sections, outline, continuous/single-page modes, zoom, and position restore.
- Select text and create text annotations.
- Create region annotations and reader-linked Topics.
- Capture a reader region for image occlusion.
- Close during reading and reopen after a cold start.
- Exercise OPDS browsing and cached publication opening where network access is intentionally enabled.

Pass conditions:

- Every supported format opens without a desktop process.
- Reading positions, annotations, file fingerprints, and linked Topics survive restart.
- Mobile uses the same `Reader`/`WindowReader`, format engines, annotation components, and shared shelf projections as desktop.
- Local files remain in managed storage and are not exposed as unrestricted paths to the WebView.
- Cache cleanup does not remove active reading files or referenced assets.

Evidence:

- Per-format fixture results and screenshots.
- Reading-state records before and after restart.
- Asset/cache inventory before and after cleanup.
- Bundle/import audit showing the `@memorilo/reader`, `@memorilo/shelf`, and `@memorilo/reading-model` public entry points used by the mobile surface.

### Gate 6: Learning and scheduling

On the same populated database, verify:

- Mixed, new, and review queues.
- Daily limits, sibling burying, learn-ahead, and ordering configuration.
- Basic, cloze, list, set, highlight, and image-occlusion Cards.
- Full and partial List/Set presentations.
- Rating, undo, reset, maintenance, and optimizer workflows.
- Activity summary and daily progress.
- Review-event and outbox records after local review.

Pass conditions:

- Queue identity and scheduling state match desktop for the same database and clock.
- Every supported Card kind renders question/answer content and accepts valid ratings.
- Mobile uses the shared `CardSurface`/`CardPreview`, image-occlusion review, rating model, and review workflow rather than Card-kind-specific mobile renderers.
- Undo appends the expected event and does not silently delete history.
- Restart preserves queue state, review history, optimizer state, and outbox records.
- No network or server is required for local review.

Evidence:

- Queue and state exports before and after each rating flow.
- Review-event/outbox row summaries.
- Screenshots of every Card presentation and terminal state.
- Bundle/import audit identifying the shared card and review entry points used by mobile.

### Gate 7: Lifecycle, failure, and recovery

Exercise:

- Background and foreground transitions during editor save and review rating.
- WebView reload/crash during an active Note session.
- App termination during an SQLite batch.
- Missing `sqlite-vec` or FTS5 capability at startup.
- Invalid bridge message, unknown bridge version, and oversized bridge payload.
- Read-only database path and insufficient storage.
- Interrupted book import and asset reclamation with an active reader.

Pass conditions:

- Transactions are atomic and no partial row set is observable.
- Failed saves and bridge calls surface an error and preserve the last valid state.
- Missing capabilities fail startup clearly; no reduced schema or silent semantic-search fallback is accepted.
- Recovery does not delete user data automatically.
- Active sessions protect their files and assets from cleanup.

Evidence:

- Failure logs with operation names and causes.
- Database integrity and schema output after each recovery case.
- Confirmation that the last valid snapshot remains readable on desktop.

### Gate 8: Platform and desktop regression

Verify on Android phone/tablet layouts, iPhone, and iPad where available:

- Safe areas, keyboard editing, rotation policy, accessibility labels, dynamic text, and reduced motion.
- Back navigation, modal dismissal, deep links, and interrupted native file pickers.
- Cold start, warm start, background restore, and low-memory WebView recreation.

Then rerun the desktop production build and Electron end-to-end workflow against an existing generation `1` database.

Perform a reuse audit:

- Compare the completed mobile screen inventory with the Stage 0 component reuse inventory.
- Search for copied desktop feature files, private cross-package imports, and parallel implementations of editor, reader, card, spreadsheet, whiteboard, image-occlusion, and Journal behaviour.
- Confirm that every extracted shared component is consumed by desktop as well as mobile.

Pass conditions:

- No platform-specific interaction blocks required workflows.
- Desktop behaviour and persisted data remain unchanged.
- No unjustified duplicate implementation or import across application-private source trees remains.
- No untracked generated database, asset, or native build state is required to pass.

Evidence:

- Device matrix with OS/build identifiers.
- Desktop regression command output.
- Final component reuse inventory with direct imports/extractions and any justified mobile-only components listed.
- Final working-tree and generated-artifact audit.

### Acceptance decision rules

- All gates must pass; a build that launches with missing schema capabilities is a failure.
- Any data loss, schema fork, silent fallback, or incompatible Loro update is a release blocker.
- A skipped format or feature must be recorded as an explicit scope change, not treated as passed.
- Evidence is attached to the implementation milestone or release record before declaring completion.

## Completion Criteria

The mobile project is complete only when all of the following are true:

- `apps/mobile` builds and launches on Android and iOS from documented repository commands.
- The mobile application operates without desktop or server connectivity.
- Desktop, Android, and iOS report the same schema generation and canonical application schema.
- An existing desktop generation `1` database remains readable and unchanged by the refactor.
- Desktop and mobile exchange Loro snapshots and incremental updates without conversion.
- Notes created or edited on either platform retain every supported Topic type and projection.
- Rich-text editing, reading, annotation, shelf, and learning workflows meet the agreed first-release scope.
- Editor, Journal, Card, reader, shelf, spreadsheet, whiteboard, and image-occlusion behaviour is reused through shared public package entry points rather than forked under `apps/mobile`.
- All supported reading formats work on both mobile platforms.
- All supported Card kinds render and rate correctly.
- Application restart preserves Notes, assets, reading positions, configuration, and learning state.
- Desktop production behaviour remains intact.
- No mobile-only database fork, reduced schema, or silent capability fallback exists.

## Deferred Work

After the local first release, synchronization can build on the existing Note Loro updates, learning event outbox, device sequencing, server acknowledgement, and tombstone structures. Remote transport, authentication, conflict recovery, media synchronization, and full-sync recovery require a separate plan and do not change the local schema ownership established here.
