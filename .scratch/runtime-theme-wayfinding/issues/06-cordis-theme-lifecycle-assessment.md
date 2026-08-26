# Cordis Theme Lifecycle Assessment

Type: research
Status: resolved
Blocked by: 03

## Question

Does [Cordis](https://github.com/cordiverse/cordis) provide a materially useful mechanism for runtime theme lifecycle, plugin registration, or event propagation in this Electron renderer?

Inspect the official repository and compare its plugin/context/event model with the existing Memorilo architecture. Report:

- concrete capabilities relevant to theme registration, activation, cleanup, and future extensibility;
- integration and bundle/runtime costs;
- whether it solves a problem that StyleX, React context, the existing configuration flow, or a small local module does not;
- a clear adopt / borrow a narrow pattern / do not use recommendation.

This ticket resolves a decision, not a Cordis integration.

## Answer

### 官方源码事实

调查基于 Cordis 官方仓库在 `8cc9e33fab69e2d0476d126baaf2acb24e6a6ab4` 的源码（仓库当前 `packages/core` 版本为 `4.0.0-rc.8`）。官方 README 明确说明项目仍在 active development，API 尚未稳定；核心包还依赖 `@standard-schema/spec` 和 `cosmokit`，`plugin-loader`、`plugin-include` 等属于额外包/可选 peer dependency。

- [`Context` 和 `RegistryService`](https://github.com/cordiverse/cordis/blob/8cc9e33fab69e2d0476d126baaf2acb24e6a6ab4/packages/core/src/context.ts#L21-L78) 提供根上下文，以及 [`plugin()` / `inject()` / `provide()`](https://github.com/cordiverse/cordis/blob/8cc9e33fab69e2d0476d126baaf2acb24e6a6ab4/packages/core/src/registry.ts#L41-L61)。插件可以是函数、类或带 `apply` 的对象；插件运行时在 registry 中按回调函数登记，支持配置和依赖注入。
- Registry 删除插件时会遍历该插件的所有 Fiber 并调用 `fiber.dispose()`；这给“主题插件卸载”提供了完整的 dispose 入口，但同时也引入了 Cordis 自己的运行时模型（[`registry.ts`](https://github.com/cordiverse/cordis/blob/8cc9e33fab69e2d0476d126baaf2acb24e6a6ab4/packages/core/src/registry.ts#L150-L176)）。
- Fiber 是核心生命周期机制。`ctx.effect()` 可以收集同步、异步或迭代器形式的 disposer，并在 Fiber unload 时逆序清理；依赖注入服务发生变化时，Fiber 会进入 loading/unloading，再 reload（[`fiber.ts`](https://github.com/cordiverse/cordis/blob/8cc9e33fab69e2d0476d126baaf2acb24e6a6ab4/packages/core/src/fiber.ts#L270-L335)、[`fiber.ts`](https://github.com/cordiverse/cordis/blob/8cc9e33fab69e2d0476d126baaf2acb24e6a6ab4/packages/core/src/fiber.ts#L386-L474)）。这不是单纯的事件订阅，而是一个依赖驱动的动态装载/卸载状态机。
- `EventsService` 支持 `emit`、`parallel`、`serial`、`bail`、`waterfall` 五种派发语义；`ctx.on()` 返回 disposer，并通过当前 Fiber 的 effect 作用域自动注销（[`events.ts`](https://github.com/cordiverse/cordis/blob/8cc9e33fab69e2d0476d126baaf2acb24e6a6ab4/packages/core/src/events.ts#L8-L37)、[`events.ts`](https://github.com/cordiverse/cordis/blob/8cc9e33fab69e2d0476d126baaf2acb24e6a6ab4/packages/core/src/events.ts#L125-L167)）。
- `@cordisjs/plugin-loader` / `plugin-include` / `plugin-hmr` 才提供配置驱动的模块加载、插件树更新和 HMR；这些能力面向动态模块生态，而不是静态打包的 React UI 主题。核心 README 也将 Cordis 定义为 “Meta-Framework of Spatiotemporal Composability”，并提示 API 不稳定（[`packages/core/README.md`](https://github.com/cordiverse/cordis/blob/8cc9e33fab69e2d0476d126baaf2acb24e6a6ab4/packages/core/README.md)）。

### 与当前 Memorilo 架构的对照

当前 renderer 已经具备主题切换所需的状态和通知路径：

- `createConfigurationStore()` 通过 adapter 读写配置、订阅主进程 IPC 变化，并用 `useSyncExternalStore` 暴露一致快照（[`configuration-store.ts`](/Users/mslxl/.paseo/worktrees/26y94omx/thankful-badger/apps/desktop/renderer/src/app/configuration/configuration-store.ts:19)）。
- `DesktopConfigurationEnvironment` 在 renderer 根部消费该快照，并将语言、`data-reduce-motion` 与 `MotionConfig` 投影到整个 React 树（[`configuration-environment.tsx`](/Users/mslxl/.paseo/worktrees/26y94omx/thankful-badger/apps/desktop/renderer/src/app/configuration/configuration-environment.tsx:9)）。这个边界可以直接承载 `data-ui-theme`/StyleX theme class，不需要重新挂载编辑器或路由组件。
- `packages/ui` 已有集中式 semantic token 和 `stylex.createTheme` 预设（[`theme.stylex.ts`](/Users/mslxl/.paseo/worktrees/26y94omx/thankful-badger/packages/ui/src/theme.stylex.ts:3)），`AppShell` 当前只是在根节点固定应用 `uiThemes.light`（[`app-shell.tsx`](/Users/mslxl/.paseo/worktrees/26y94omx/thankful-badger/apps/desktop/renderer/src/app/shell/app-shell.tsx:31)）。切换方案的缺口是把静态查表改为基于配置的根主题选择，而不是缺少插件生命周期。
- 资源生命周期已有 `@memorilo/effect-lifecycle`。`createResourceScope` 负责资源所有权、逆序/依赖关闭、启动回滚和失败重试（[`resource-scope.ts`](/Users/mslxl/.paseo/worktrees/26y94omx/thankful-badger/packages/effect-lifecycle/src/resource-scope.ts:72)）。配置 store、editor session、IPC 和 renderer 资源都在使用它；为主题专门引入 Cordis 会造成两个生命周期抽象并存。
- 配置 schema 是显式的 `effect/Schema` 结构；增加一个三值主题字段即可完成持久化、校验和跨窗口同步（[`apps/desktop/config/src/index.ts`](/Users/mslxl/.paseo/worktrees/26y94omx/thankful-badger/apps/desktop/config/src/index.ts:45)）。Cordis 不会替代 schema、IPC contract 或 React 渲染订阅。

### 对三个具体问题的判断

**运行时主题生命周期：增量价值低。** Cordis 可以把每个主题写成 plugin，并用 Fiber dispose 清掉事件监听、DOM 观察器或第三方适配器；但当前三个主题是编译进 bundle 的 token/preset，切换本质是“更新配置快照 + 在 renderer 根节点应用一个主题类/属性”。没有动态依赖、异步加载或主题级外部资源时，Cordis 的 Fiber 状态机比一个小型 `ThemeRuntime`（注册定义、`setActive(id)`、返回 disposer）更重，也不会替 StyleX 处理 token 注入、portal 继承或 React 更新。

**插件注册：只有未来动态生态才有实质用途。** 如果以后允许第三方主题在运行时安装，Cordis 的 `registry`、`inject/provide` 和 loader/HMR 可以表达“主题适配器依赖某服务、服务下线时自动卸载”的关系。但这不是本次三种内置主题的需求；Electron renderer 也不应默认从任意路径动态执行插件，必须先解决签名、权限、context isolation、CSP 和升级回滚。当前应使用静态 `ThemeDefinition` 元数据表，保留未来第四主题的注册接口即可。

**事件传播：不应替换现有配置流。** Cordis 的多种事件派发模式比当前需求丰富，但主题变更已经由主进程配置 channel -> renderer adapter -> `ConfigurationStore.subscribe` -> `useSyncExternalStore` 传播。再增加全局 `ctx.emit('theme/changed')` 会复制状态通道、制造两个真相源，并不能让 React 组件自动更新；如果将来确实需要非 React 资源响应主题变化，优先让一个 `ThemeRuntime` 在配置 store 的单一订阅点调用已注册的 typed callbacks，而不是引入全局事件总线。

### 集成与运行时成本

- 至少新增 `cordis` 核心包及其 `cosmokit`/schema 依赖；若要动态插件还要引入 loader/include/HMR 包。官方 core 源码在该提交约 1,848 行（不含可选插件），并包含 Proxy、Fiber、依赖可见性和异步 disposer 等新的调试模型。`sideEffects: false` 有利于 tree-shaking，但不能把注册表、事件服务和 Fiber 的概念成本消除；本票据没有将源码行数当作最终 gzip 体积。
- Cordis 使用自己的 `Context` Proxy 和动态服务解析。把 React provider、StyleX 主题类、Electron IPC 和 Cordis Context 互相桥接，会增加启动顺序、错误处理和卸载顺序的组合状态；主题切换本身并不需要这些动态能力。
- Cordis 官方当前明确标记 API unstable。把它放进 renderer 的共享基础层会让主题 API 受第三方版本变化影响，而现有 `@memorilo/effect-lifecycle` 已承担资源关闭、并发操作和失败聚合等同类基础设施。

### 决策

**结论：本次主题系统不采用 Cordis，也不把它作为主题事件总线。**

**可借鉴的窄模式：** 只借鉴“定义 + 注册返回 disposer + owner 关闭时统一清理”的形状。在 `packages/ui` 或 renderer 主题边界中定义静态 `ThemeDefinition`（稳定 id、展示元数据、StyleX/theme class、可选第三方 adapter），由单一 `ThemeRuntime` 管理 active preset；其清理可直接使用现有 `createResourceScope`/React effect。这样保留了未来第四个预设或按 feature 注册 adapter 的扩展点，但不引入 Cordis 的 Context/Registry/Fiber 全套模型。

**重新评估条件：** 只有当产品明确需要运行时安装/卸载第三方主题、主题插件之间有服务依赖、或需要配置驱动的插件 HMR 时，才单独评估 Cordis（最好隔离在受控插件宿主，不进入所有 UI 组件的公共 API）。在该条件出现前，StyleX + 配置 store + React context/`useSyncExternalStore` 是更小且与现有代码一致的方案。

### 来源

- Cordis 官方仓库及固定源码提交：<https://github.com/cordiverse/cordis/tree/8cc9e33fab69e2d0476d126baaf2acb24e6a6ab4>
- Cordis core package metadata：<https://github.com/cordiverse/cordis/blob/8cc9e33fab69e2d0476d126baaf2acb24e6a6ab4/packages/core/package.json>
- Cordis core README（API 稳定性声明）：<https://github.com/cordiverse/cordis/blob/8cc9e33fab69e2d0476d126baaf2acb24e6a6ab4/packages/core/README.md>
