# Desktop renderer package organization

调研日期：2026-08-09

## 结论

`apps/desktop/renderer/src/routes` 应只保存 TanStack Router 的路由入口。一个入口可以声明 `createFileRoute`、解析 params/search、配置 loader，并把路由数据和导航动作交给 feature page；页面 UI、状态机、查询、组件、测试和 StyleX 样式不应继续堆在 `routes` 中。

建议按产品能力组织 renderer，而不是按文件类型或文件名前缀组织：

- `app/`：renderer composition root、router、全局 provider、窗口 shell、应用级 configuration 和全局 command palette。
- `routes/`：只保存会进入 route tree 的文件。
- `features/`：`journals`、`learning`、`notes`、`reader`、`shelf` 等产品能力；Note library 是 `notes/library` 子能力。
- `shared/`：至少被两个 feature 使用、且不带某个 feature 领域语义的 UI 或 renderer 基础设施。
- `i18n/`、`styles/`、`test/`：真正的 package-wide 基础设施；全局 CSS 仍只放 reset、font 和第三方内容。

最终应删除所有非路由文件的 `-` 前缀。这个前缀是 TanStack 路由扫描器的 ignore 机制，不是 React 组件的私有性或模块边界。

## 官方约束

### TanStack Router

TanStack 将 file-based routing 定义为“文件系统结构表示 route hierarchy”，默认扫描目录是 `./src/routes`。目录名、`.`、`_`、尾随 `_`、`$`、`index` 和 `route` 都具有路由语义，因此不能通过随意改名来隐藏普通组件。[File-Based Routing](https://github.com/TanStack/router/blob/6f8f534bf3a8eb3f0cf3771a516076fce9da0805/docs/router/routing/file-based-routing.md)

尤其要保留真实路由名里的尾随 `_`：`reader_.$readingId.tsx`、`learning_.review.tsx`、`learning_.optimizer.$optimizerId.tsx` 和 `shelf_.book.tsx` 用它解除 URL 父级对应的 component nesting。`()` 是真实 routes 的无路径分组，前导 `_` 是 pathless layout，也都不能用来安置普通组件或 helper。[Pathless layout routes](https://github.com/TanStack/router/blob/6f8f534bf3a8eb3f0cf3771a516076fce9da0805/docs/router/routing/routing-concepts.md#L425-L446)；[Non-nested routes](https://github.com/TanStack/router/blob/6f8f534bf3a8eb3f0cf3771a516076fce9da0805/docs/router/routing/routing-concepts.md#L527-L549)；[Route groups](https://github.com/TanStack/router/blob/6f8f534bf3a8eb3f0cf3771a516076fce9da0805/docs/router/routing/routing-concepts.md#L627-L656)

`routeFileIgnorePrefix` 的默认值正是 `-`。官方 API 把它描述为在 route directory 内共置非路由文件的可选机制，并展示了 `posts/-components/Post.tsx`；这证明 `-` 是 generator escape hatch，也证明它并非必须采用的 package 结构。[File-Based Routing API: `routeFileIgnorePrefix`](https://github.com/TanStack/router/blob/6f8f534bf3a8eb3f0cf3771a516076fce9da0805/docs/router/api/file-based-routing.md#routefileignoreprefix)

官方 kitchen-sink 同时展示了两种边界：`expensive/index.tsx` 是只导入页面组件的薄路由入口，组件位于 ignored `-components`；跨路由组件、hooks 和 utilities 则位于 `src/components`、`src/hooks`、`src/utils`。Memorilo 可以采用更严格的版本：把所有实现移出 `routes`，按 feature 放置，不再使用 ignored files。[薄路由入口](https://github.com/TanStack/router/blob/6f8f534bf3a8eb3f0cf3771a516076fce9da0805/examples/react/kitchen-sink-file-based/src/routes/expensive/index.tsx)；[示例源码树](https://github.com/TanStack/router/tree/6f8f534bf3a8eb3f0cf3771a516076fce9da0805/examples/react/kitchen-sink-file-based/src)

删除两份 Vite 配置中的显式 `routeFileIgnorePrefix: '-'` 本身不会关闭该行为，因为 `-` 就是默认值。迁移完成后可以删除该显式配置以减少无效约定；如果要强制 `routes/` 纯度，需要 lint/结构测试检查该目录只含路由入口，而不能依赖删除配置。

### Electron

Electron 官方 process model 规定 renderer 应按普通 Web 应用的工具和范式编写；Node/Electron 特权能力由 preload 暴露。这给出的硬边界是 `main` / `preload` / `renderer`，并未要求 renderer 内部继续按 Electron API 或 IPC channel 分目录。因而 Memorilo 的 renderer 内部应按用户能力组织，同时继续只通过 preload contract 访问桌面能力。[Electron Process Model: renderer and preload](https://github.com/electron/electron/blob/a4f3adca945ee086e43affa95cbf0f2c6b4fcd2c/docs/tutorial/process-model.md#the-renderer-process)

## 成熟项目的可复用做法

Electron 官方维护的 Fiddle React 应用先按 `main`、`preload`、`renderer` 分进程；renderer 内再放 `components`、`transforms` 和 `utils`，没有把 renderer implementation 与进程入口混在同一目录。这是较小应用的基线，但其横向 `components/` 结构不足以直接承载 Memorilo 当前的领域规模。[Electron Fiddle source](https://github.com/electron/fiddle/tree/1e36e19076b33726441ae7bad29a0ebb9d7f03fa/src)；[renderer source](https://github.com/electron/fiddle/tree/1e36e19076b33726441ae7bad29a0ebb9d7f03fa/src/renderer)；[React dependency](https://github.com/electron/fiddle/blob/1e36e19076b33726441ae7bad29a0ebb9d7f03fa/package.json#L50-L69)

GitHub Desktop 是大型 Electron + React 应用。它在 renderer UI 内按能力形成 `changes/`、`diff/`、`history/`、`preferences/` 等目录，而业务与平台实现放在 `lib/`；feature 的 `index.ts` 只暴露少量入口。例如 changes 只导出 `ChangesSidebar` 和 `Changes`，没有为每个小函数建立全局 facade。[GitHub Desktop UI source](https://github.com/desktop/desktop/tree/bef8ef47e3c1f57c53fd0b84bbb79201da1c3388/app/src/ui)；[`changes/index.ts`](https://github.com/desktop/desktop/blob/bef8ef47e3c1f57c53fd0b84bbb79201da1c3388/app/src/ui/changes/index.ts)；[`lib/`](https://github.com/desktop/desktop/tree/bef8ef47e3c1f57c53fd0b84bbb79201da1c3388/app/src/lib)

Joplin Desktop 也是 Electron + React 应用。其 `NoteEditor/` 拥有自己的 `NoteBody/`、`commands/`、`styles/` 和 `utils/`；`useFormNote.test.ts`、`useFormNote.ts` 以及 feature 样式直接共置。这种组织让一个功能的实现、生命周期测试和样式可以一起移动，而不需要在 `routes/`、根目录、`components/` 和 `queries/` 之间来回查找。[Joplin `NoteEditor/`](https://github.com/laurent22/joplin/tree/4942bccd1e6ca0f5abd7d247099e2defac144594/packages/app-desktop/gui/NoteEditor)；[`useFormNote.ts`](https://github.com/laurent22/joplin/blob/4942bccd1e6ca0f5abd7d247099e2defac144594/packages/app-desktop/gui/NoteEditor/utils/useFormNote.ts)；[`useFormNote.test.ts`](https://github.com/laurent22/joplin/blob/4942bccd1e6ca0f5abd7d247099e2defac144594/packages/app-desktop/gui/NoteEditor/utils/useFormNote.test.ts)

这些项目不是要逐目录照抄。可复用的原则是：进程边界在顶层，用户能力在 renderer 内形成 ownership boundary，真正共享的模块才提升到 shared，测试和样式跟随其被测实现。

## 建议目标结构

```text
src/
  main.tsx
  app/
    bootstrap-renderer.ts
    router.tsx
    command-palette/
    configuration/
    shell/
  routes/
    __root.tsx
    index.tsx
    journals.tsx
    learning.tsx
    learning_.optimizer.$optimizerId.tsx
    learning_.review.tsx
    note.$noteId.$topicId.tsx
    pages.tsx
    reader.tsx
    reader_.$readingId.tsx
    shelf.tsx
    shelf_.book.tsx
  features/
    journals/
    learning/
      optimizer/
      review/
    notes/
      editor/
      library/
      persistence/
    reader/
      session/
    shelf/
      publication/
      source/
  shared/
    command-palette.ts
    configuration.ts
    lifecycle/
    page-titlebar.ts
  i18n/
  settings/
  styles/
  test/
```

目录只在存在一组共同变化的实现时创建。例如 `features/reader/session/` 可以同时拥有 session owner、context session、cleanup 和它们的测试；不应为了单个十几行 helper 再创建一层目录或 barrel。

## 迁移前来源与当前归属

| 迁移前来源 | 当前归属 | 理由 |
| --- | --- | --- |
| `routes/-journal-*`、`journal-model.ts`、`-journals.stylex.ts` | `features/journals/` | Calendar、feed projection、route coordination 和 UI 属于同一 Journal workflow。 |
| `routes/-learning-notes*` | `features/learning/` | Learning overview 的页面实现，不是 route metadata。 |
| `features/learning/optimizer/*`（迁移前：`routes/-learning-optimizer*`） | `features/learning/optimizer/` | Optimizer editor、workflow、测试和样式共同演化。 |
| `routes/-learning-review*` | `features/learning/review/` | Controller/session/workflow/search/source/titlebar 应形成一个可导航 feature。 |
| `routes/-note-*`、`editor-note-runtime.ts` | `features/notes/editor/` | Note session、external updates、entry tree、dialogs 和 inspector 都属于 Note 编辑会话。 |
| `note-persistence-*` | `features/notes/persistence/` | 它被多个页面使用，但仍是 Note 领域能力，不是 domain-neutral shared utility。 |
| `routes/-pages*` | `features/notes/library/` | 这是 Note library/table feature；它与 Note query keys 和 Note navigation 共同演化。 |
| `routes/-reader-*`、根目录 `reader-*` | `features/reader/` | Reader UI、context selection、session ownership 和 cleanup 应在同一 ownership boundary。 |
| `routes/-bound-shelf-reader.tsx` | `features/reader/` | 它负责把 Shelf reading context 绑定到 Reader/Note session，是 reader workflow 的 adapter，不需要为单个文件再建目录。 |
| `routes/-shelf-*`、`queries/shelf-query.ts` | `features/shelf/` 的 `publication/`、`source/` | 查询、缓存键、collection projection 和 UI 都由 Shelf feature 拥有。 |
| `components/command-palette*` | implementation 放在 `app/command-palette/`，command registration seam 放在 `shared/command-palette.ts` | 面板组合全局 router、history 和 shell state；feature 只依赖中性的命令注册 interface。 |
| `components/app-*`、`workspace-sidebar*` | `app/shell/` | 它们构成窗口级 shell。 |
| `page-titlebar.ts` | `shared/page-titlebar.ts` | 多个 feature 设置 titlebar，但不应反向依赖 shell implementation。 |
| `configuration-*` | provider/store 放在 `app/configuration/`，消费 context 放在 `shared/configuration.ts` | 多个 feature 消费 configuration；可消费契约不能反向依赖 composition root。 |
| closeable renderer resources | `shared/lifecycle/owned-resource.ts` | 在 React commit phase 获取并由 effect cleanup 关闭，避免 StrictMode 丢弃 render initializer 时泄漏资源；feature 只暴露组合后的单一 `close`。 |

`journals.tsx`、`learning.tsx`、`pages.tsx`、`reader.tsx`、`reader_.$readingId.tsx`、`shelf.tsx` 和 `shelf_.book.tsx` 即使本身是合法路由文件，也应把大段 UI/状态实现迁给对应 feature page；文件名保留只是为了 TanStack route identity。

Journal feed 现在由 `journal-feed.tsx` 独占虚拟列表、分页触发、日期滚动和 rollover viewport restoration；Shelf catalog 由 `shelf-catalog.ts` 独占 cached/refresh/pagination 查询投影，source mutations 与 dialog ownership 则位于 `source/shelf-source-management.tsx`。这些是 feature 内部 seam，不通过 route 或 package public entry point 暴露。

## 依赖与共置规则

1. 依赖方向保持 `app/routes -> features -> shared`。Feature 不应反向导入 route module；route adapter 应把 params、search 和 navigation 以窄 props 交给 feature page。
2. Query keys、Effect query builders、cache projection 跟随拥有数据语义的 feature。不要把只服务 Shelf 的 query 留在横向 `queries/`。
3. 只有出现真实跨 feature 消费时才建立 feature `index.ts`，并只导出页面入口、provider 或窄服务接口；内部组件继续用相对导入。
4. `component.tsx`、`component.stylex.ts`、`component.test.tsx` 共置；状态机的 `workflow.ts` 与 `workflow.node.test.ts` 共置。当前 Vitest 配置递归匹配 `src/**/*.node.test.ts`，移动到嵌套目录不需要改测试发现规则。
5. `styles/renderer-global.stylex.ts` 保持 package-global；feature 样式继续使用 `*.stylex.ts`，不集中到一个 giant styles directory。
6. `shared/` 不是暂存区。带有 Note、Reader、Shelf、Learning 等领域词汇的模块默认留在拥有它的 feature，即使有两个调用方。
7. 迁移后 `routes/` 内不应再出现测试、StyleX 文件、普通组件、workflow、controller、session 或 query。可以增加结构测试来守住这一约束。

## 推荐迁移顺序

1. 先建立 `features/` 和 `app/`，移动根目录的 `editor-note*`、`note-*`、`reader-*`，只修正 import，不改行为。
2. 按 Journal、Learning、Note、Reader、Shelf、Note Library 逐个迁出 `routes/-*`，同时把对应大路由文件缩成 adapter。
3. 移动每个模块的测试与 `*.stylex.ts`，保持一次 feature 迁移可独立验证。
4. 收敛 `components/`、`queries/` 和 renderer 根目录，只保留真正跨 feature 或 composition-root 文件。
5. 删除所有 `-` 非路由文件和显式 `routeFileIgnorePrefix` 配置；最后增加 route-directory 结构检查。
