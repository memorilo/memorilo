# Logseq Journals 与 TanStack Virtual 调研

调研日期：2026-08-04

## 范围与资料版本

本报告只使用一手资料：

- Logseq 主仓库固定在提交 [`9a11243d50b23afeb10bda5a2ca6cc77357eea38`](https://github.com/logseq/logseq/tree/9a11243d50b23afeb10bda5a2ca6cc77357eea38)（2026-08-03）。这是当前 DB 版实现，产品行为以此为准。
- Logseq 官方文档仓库固定在提交 [`08f855f24d66e4509b7ea808554c13b4649e6ee1`](https://github.com/logseq/docs/tree/08f855f24d66e4509b7ea808554c13b4649e6ee1)。该仓库部分 Journal 页面描述的是旧 file graph，本文会单独标注，避免与当前 DB 版混用。
- TanStack Virtual 官方仓库固定在提交 [`d2cf98beea1696c7187c06b57c9e724d1957963c`](https://github.com/TanStack/virtual/tree/d2cf98beea1696c7187c06b57c9e724d1957963c)（2026-07-31），其 `virtual-core` 版本为 `3.17.7`。
- Memorilo 当前 lockfile 使用 `@tanstack/react-virtual@3.14.9`，实际解析 `@tanstack/virtual-core@3.17.7`；本文只建议这组已安装 API 中存在的能力。

文中“Logseq 事实”与“TanStack 官方建议”均附固定版本来源。“对 Memorilo 的设计建议”是从这些事实和 Memorilo 当前 Note-as-Loro-aggregate ADR 推导出的方案，不代表 Logseq 或 TanStack 的官方产品结论。

## 结论摘要

1. Logseq 的 Journal 不是另一种 Block：它是一个带 `Journal` 类型、`journal-day` 日期键的 Page。Page 本身是逻辑 Block，正文仍由普通 Block tree 承载。
2. 日期而不是显示标题才是 Journal 的身份。当前 Logseq 用 `YYYYMMDD` 整数作为 `journal-day`，并从日期生成确定性 UUID；标题按用户配置格式投影，但现有 Journal 的 `title` 和规范化 `name` 都禁止修改。
3. Logseq 会主动确保今天的 Journal Page 存在；查询只取不晚于今天的 Journal，并按日期倒序，因此今天自然位于第一项。
4. 当前 Logseq 已虚拟化 Journal 首页，而且处理动态高度与异步内容造成的尺寸抖动；但它一次取回全部 Journal IDs，再用 React Virtuoso 虚拟化 DOM，并没有对历史数据做分页。这一点不适合直接照搬到 Memorilo。
5. 当前 DB 版只可确认“应用运行时为当天创建空 Page entity”，不能据此声称物理创建 Markdown 文件，也不会为应用关闭期间错过的日期补建空 Journal。在检查的创建、查询和删除路径中，没有“过去的空 Journal 自动删除/隐藏”语义：查询不按正文内容过滤；删除今天只清空内容而不删除 Page，删除过去页面则进入回收站。旧 file graph 文档关于空文件创建还有版本互相矛盾，不能用来推断当前行为。
6. Memorilo 应把 Journal 建模为 Note 的一个受约束 subtype/projection：以本地日历日期为唯一键，复用 Note aggregate、Topic/Block、持久化与编辑器，但禁止通用重命名入口。
7. 列表顺序应是 `[今天, 更早的非空日期...]`。加载更旧日期是向数组末尾 append，不是 chat 的“向数组头部 prepend”，所以 TanStack Virtual 保持默认 `anchorTo: 'start'`，在末尾放 loader/sentinel 即可。
8. Journal 内容高度未知且会随编辑变化；必须使用稳定 Note/date key、偏大的 `estimateSize`、每项 `measureElement` 和适度 overscan。返回 Journal 时可用 `takeSnapshot()`、`scrollOffset`、`initialMeasurementsCache` 和 `initialOffset` 恢复位置。

## 1. Logseq 的 Journal 数据模型

### 1.1 Journal 是一种 Page

Logseq 通过是否带有 `:logseq.class/Journal` tag 判断一个 entity 是否为 Journal；`page?` 同时接受普通 Page、Journal、Tag 和 Property。这说明 Journal 是 Page 类型系统中的一个成员，而不是并行于 Page 的内容实体。

来源：

- [Journal 与 Page 判定](https://github.com/logseq/logseq/blob/9a11243d50b23afeb10bda5a2ca6cc77357eea38/deps/db/src/logseq/db/frontend/entity_util.cljs#L24-L50)
- [创建 Page 时，`journal?` / `today-journal?` 映射为 Journal 类型](https://github.com/logseq/logseq/blob/9a11243d50b23afeb10bda5a2ca6cc77357eea38/deps/outliner/src/logseq/outliner/page.cljs#L302-L326)

### 1.2 日期是独立身份字段

Journal Page 具有独立的 `:block/journal-day` 整数字段。Logseq 的日期工具把本地日历日期编码为 `YYYYMMDD` 整数；schema 注释也明确 `journal-day` 只设置在 Journal Page 上。

来源：

- [`date->int` 将年月日编码为 Journal day](https://github.com/logseq/logseq/blob/9a11243d50b23afeb10bda5a2ca6cc77357eea38/deps/common/src/logseq/common/util/date_time.cljs#L81-L101)
- [`journal-day` 的数据库索引](https://github.com/logseq/logseq/blob/9a11243d50b23afeb10bda5a2ca6cc77357eea38/deps/db/src/logseq/db/frontend/schema.cljs#L88-L99)
- [Page schema 中的 `journal-day`](https://github.com/logseq/logseq/blob/9a11243d50b23afeb10bda5a2ca6cc77357eea38/deps/db/src/logseq/db/frontend/malli_schema.cljs#L296-L318)

当前 DB 版还从 `journal-day` 生成确定性 UUID，例如 `20240620` 对应带日期编码的 Journal UUID。这让“同一天只有一个 Journal”不依赖可修改的标题字符串。

来源：

- [Journal UUID 编码](https://github.com/logseq/logseq/blob/9a11243d50b23afeb10bda5a2ca6cc77357eea38/deps/common/src/logseq/common/uuid.cljs#L5-L15)
- [创建时以 `journal-day` 覆盖普通 Page UUID](https://github.com/logseq/logseq/blob/9a11243d50b23afeb10bda5a2ca6cc77357eea38/deps/outliner/src/logseq/outliner/page.cljs#L381-L416)
- [创建测试：格式化标题与确定性 UUID](https://github.com/logseq/logseq/blob/9a11243d50b23afeb10bda5a2ca6cc77357eea38/deps/outliner/test/logseq/outliner/page_test.cljs#L191-L205)

### 1.3 标题是日期的投影，且不可编辑

Logseq 允许设置 Journal 标题的日期格式。当前 DB 版创建 Journal 时读取 Journal class 上的 `title-format`，解析日期后生成显示标题；测试证明自定义格式会改变 `block/title`，但不会改变日期身份。

来源：

- [官方文档：Journal 标题格式配置](https://github.com/logseq/docs/blob/08f855f24d66e4509b7ea808554c13b4649e6ee1/pages/setting___preferred%20journal%20format.md#L1-L23)
- [创建逻辑读取 `title-format`](https://github.com/logseq/logseq/blob/9a11243d50b23afeb10bda5a2ca6cc77357eea38/deps/outliner/src/logseq/outliner/page.cljs#L311-L331)
- [测试：显示标题服从配置，而内部 name 保持默认格式](https://github.com/logseq/logseq/blob/9a11243d50b23afeb10bda5a2ca6cc77357eea38/deps/outliner/test/logseq/outliner/page_test.cljs#L178-L189)

不可编辑不仅是 UI 约定。Journal 标题点击不会进入普通标题编辑器；事务管线还会拒绝修改已有 Journal 的 `:block/title` 或 `:block/name`。对应测试覆盖 map transaction 和底层 `:db/add` 两条路径。

来源：

- [Journal 标题点击只做导航/侧栏打开](https://github.com/logseq/logseq/blob/9a11243d50b23afeb10bda5a2ca6cc77357eea38/src/main/frontend/components/block.cljs#L3365-L3389)
- [事务管线保护 Journal 的 title/name](https://github.com/logseq/logseq/blob/9a11243d50b23afeb10bda5a2ca6cc77357eea38/src/main/frontend/worker/pipeline.cljs#L540-L571)
- [保护规则测试](https://github.com/logseq/logseq/blob/9a11243d50b23afeb10bda5a2ca6cc77357eea38/src/test/frontend/worker/pipeline_test.cljs#L325-L377)

对 Memorilo 的直接含义：不能仅在 Journal 页面隐藏标题输入框。应用服务也必须拒绝 `renameNote` 作用于 Journal；展示标题应从 `journalDate` 和 locale/格式计算，持久化标题只能是受控 projection。

## 2. 今天优先与向过去滚动

### 2.1 今天的 Journal 被主动确保存在

Logseq 在 graph restore 完成后立即调用 `create-today-journal!`，并每 3 秒检查一次日期变化。创建函数按本地日期得到今天标题，只在今日 Page 不存在时创建，并把操作标记为 today Journal creation。回到 Home 也会再次确保今天存在。

来源：

- [日期 watcher：立即执行并每 3 秒检查](https://github.com/logseq/logseq/blob/9a11243d50b23afeb10bda5a2ca6cc77357eea38/src/main/frontend/handler.cljs#L53-L58)
- [graph restore 后启动日期 watcher](https://github.com/logseq/logseq/blob/9a11243d50b23afeb10bda5a2ca6cc77357eea38/src/main/frontend/handler.cljs#L78-L92)
- [创建今天 Journal](https://github.com/logseq/logseq/blob/9a11243d50b23afeb10bda5a2ca6cc77357eea38/src/main/frontend/handler/page.cljs#L280-L297)
- [回到 Home 时确保今天 Journal](https://github.com/logseq/logseq/blob/9a11243d50b23afeb10bda5a2ca6cc77357eea38/src/main/frontend/handler/events/ui.cljs#L110-L113)

这保证了应用运行当天的 Journal 首页第一项可以真实对应一个可编辑 Page，而不只是空占位符。源码没有遍历“上次打开到今天”的日期区间，因此不能推断它会为应用关闭期间错过的每一天回填空 Journal。

### 2.2 排序是今天到过去

`get-latest-journals` 从 `journal-day` 索引反向遍历，过滤未来日期、回收站项和无效 Journal，因此结果为不晚于今天的倒序 Journal。Journal 首页直接保持这个顺序。

来源：

- [倒序、`<= today` 与回收站过滤](https://github.com/logseq/logseq/blob/9a11243d50b23afeb10bda5a2ca6cc77357eea38/deps/db/src/logseq/db/common/initial_data.cljs#L272-L285)
- [Journal view 取出全部倒序 IDs](https://github.com/logseq/logseq/blob/9a11243d50b23afeb10bda5a2ca6cc77357eea38/deps/db/src/logseq/db/common/view.cljs#L520-L529)
- [Journal 首页按返回顺序渲染](https://github.com/logseq/logseq/blob/9a11243d50b23afeb10bda5a2ca6cc77357eea38/src/main/frontend/components/journal.cljs#L100-L128)

### 2.3 当前实现是 DOM 虚拟化，不是数据分页

当前 Journal 查询一次返回所有 Journal IDs；UI 把总数交给 React Virtuoso，并只渲染可见项。每项使用 `journal-<db-id>` 稳定 key，并在上下各扩展 100px viewport。旧 changelog 曾记录 “Load more journal entries” 和 Journal lazy-loading，但当前 DB 版已不是那个分页实现。

来源：

- [一次返回全部 Journal IDs](https://github.com/logseq/logseq/blob/9a11243d50b23afeb10bda5a2ca6cc77357eea38/deps/db/src/logseq/db/common/view.cljs#L520-L529)
- [Virtuoso 配置、key 与 viewport 扩展](https://github.com/logseq/logseq/blob/9a11243d50b23afeb10bda5a2ca6cc77357eea38/src/main/frontend/components/journal.cljs#L111-L128)
- [Logseq 的 `virtualized-list` 封装实际使用 React Virtuoso](https://github.com/logseq/logseq/blob/9a11243d50b23afeb10bda5a2ca6cc77357eea38/src/main/frontend/ui.cljs#L86-L95)
- [旧版 changelog：Load more journal entries](https://github.com/logseq/docs/blob/08f855f24d66e4509b7ea808554c13b4649e6ee1/pages/Changelog.md#L2325-L2337)
- [旧版 changelog：Journal/query lazy-loading](https://github.com/logseq/docs/blob/08f855f24d66e4509b7ea808554c13b4649e6ee1/pages/Changelog.md#L2101-L2112)

Memorilo 已有分页 Note API，不应为了模仿 Logseq 退回“加载所有 ID”。Journal 应做数据分页和 DOM 虚拟化两层控制。

### 2.4 Logseq 处理动态高度的方式

Logseq 每个 Journal item 都渲染完整 Page，因此高度差异很大。当前实现按 `[repo, page-id]` 缓存测量高度；重新挂载时先设置该高度为 `min-height`，最多保留 5 秒。`ResizeObserver` 持续测量；异步内容追上缓存高度，或用户 focus/input 后，才清掉占位高度。这是在虚拟项卸载、重新加载 Page 内容时抑制滚动跳动的补偿策略。

来源：

- [高度 cache key 与 5 秒保留期](https://github.com/logseq/logseq/blob/9a11243d50b23afeb10bda5a2ca6cc77357eea38/src/main/frontend/components/journal.cljs#L15-L25)
- [测量内容/容器高度](https://github.com/logseq/logseq/blob/9a11243d50b23afeb10bda5a2ca6cc77357eea38/src/main/frontend/components/journal.cljs#L27-L46)
- [`ResizeObserver`、`min-height` 与清理条件](https://github.com/logseq/logseq/blob/9a11243d50b23afeb10bda5a2ca6cc77357eea38/src/main/frontend/components/journal.cljs#L48-L88)

这个“保持滚动位置稳定”的目标值得借鉴，但 Memorilo 使用 TanStack Virtual 后应优先使用其测量 cache、稳定 key 和 scroll adjustment，不应先复制 Logseq 的 5 秒 `min-height` workaround。

## 3. 空白 Journal 的语义

### 3.0 可确认边界

| 问题 | 当前一手资料可确认的结论 |
| --- | --- |
| 是否每天物理创建空 Journal 文件？ | **当前 DB 版未确认，且没有 Markdown 文件这一同等实现边界。** 可确认的是：应用运行并完成 graph restore 后创建当天的空 Page entity；持续运行跨午夜时 watcher 会创建新的当天 entity；没有证据表明会补建应用关闭期间的每个日期。旧 file graph 文档对此互相矛盾。 |
| 空白的过去 Journal 是否自动删除？ | **在检查的当前创建、查询和删除路径中未发现。** 查询不检查正文是否为空；用户删除过去 Page 时进入 Recycle。 |
| 空白的过去 Journal 是否在列表隐藏？ | **不会由当前 Journal 查询隐藏。** `get-latest-journals` 只检查日期、Journal 类型和 recycle 状态，不检查 children/content。 |
| 日期标题是否可编辑？ | **不可编辑。** UI 点击不进入标题编辑，事务层拒绝修改已有 Journal 的 title/name。 |
| 历史如何加载？ | **一次读取全部 Journal IDs，再虚拟化 DOM。** 当前 DB 版没有历史数据分页；虚拟化库是 React Virtuoso。 |

### 3.1 当前 Logseq DB 版会保留空的今天

`create-today-journal!` 创建的是 Journal Page 本身，不要求先有正文 Block；Journal 查询也不检查 children/content 是否为空。因此今天可以作为空 Page 出现在第一项。

来源：

- [今天不存在就创建 Page](https://github.com/logseq/logseq/blob/9a11243d50b23afeb10bda5a2ca6cc77357eea38/src/main/frontend/handler/page.cljs#L288-L297)
- [Journal 查询只按类型、日期和回收状态筛选](https://github.com/logseq/logseq/blob/9a11243d50b23afeb10bda5a2ca6cc77357eea38/deps/db/src/logseq/db/common/initial_data.cljs#L272-L285)
- [空 Page 显示 add button](https://github.com/logseq/logseq/blob/9a11243d50b23afeb10bda5a2ca6cc77357eea38/src/main/frontend/components/page.cljs#L149-L208)

### 3.2 删除今天是 truncate，删除过去是 recycle

Logseq 的删除规则明确区分今天与其他 Page：今天只删除内容、保留 Page；Tag/Property hard retract；其他 Page 进入 Recycle。因此它没有把“今天为空”和“Journal 不存在”视为同一状态。

来源：

- [Page 删除规则说明与 today 判定](https://github.com/logseq/logseq/blob/9a11243d50b23afeb10bda5a2ca6cc77357eea38/deps/outliner/src/logseq/outliner/page.cljs#L103-L137)
- [过去普通 Page 进入 Recycle](https://github.com/logseq/logseq/blob/9a11243d50b23afeb10bda5a2ca6cc77357eea38/deps/outliner/src/logseq/outliner/page.cljs#L139-L155)

### 3.3 官方旧文档不能作为当前空白语义依据

旧官方设置页写着“每天默认创建空 Journal 文件”，但 2021 changelog 又记录“输入前不创建 Journal 文件”。两者都描述旧 file graph；当前 DB 版则创建 Page entity、没有 Markdown file 的同一语义边界。

来源：

- [旧设置文档：每天创建空文件](https://github.com/logseq/docs/blob/08f855f24d66e4509b7ea808554c13b4649e6ee1/pages/setting___enable%20journals.md#L1-L2)
- [旧 changelog：输入前不创建文件](https://github.com/logseq/docs/blob/08f855f24d66e4509b7ea808554c13b4649e6ee1/pages/changelog_06.md#L487-L513)

在本次检查的当前 DB 版创建、查询、删除路径中，没有发现“日期过去后自动删除空 Journal”的逻辑；同时，因为列表查询不按内容过滤，空白过去页也不会在该查询层被隐藏。Memorilo 的这一要求应作为自己的领域规则设计，而不是声称继承自 Logseq。

## 4. Page、Block 与 Note 的关系

Logseq 源码直接写明 “A page is just a logical block”。Page renderer 从 Page 的 `:block/_parent` 读取顶层 children，按 order 排序，再交给同一套递归 Block renderer；正文 Block 还通过 `:block/page` 指向所属 Page。

来源：

- [Page 是 logical block，Page renderer 复用 Block tree](https://github.com/logseq/logseq/blob/9a11243d50b23afeb10bda5a2ca6cc77357eea38/src/main/frontend/components/page.cljs#L412-L447)
- [Page 标题与 Page blocks 的组合](https://github.com/logseq/logseq/blob/9a11243d50b23afeb10bda5a2ca6cc77357eea38/src/main/frontend/components/page.cljs#L466-L507)
- [Page 顶层 children 与递归 renderer 输入](https://github.com/logseq/logseq/blob/9a11243d50b23afeb10bda5a2ca6cc77357eea38/src/main/frontend/components/page.cljs#L149-L208)
- [`block/parent` 与 `block/page` schema](https://github.com/logseq/logseq/blob/9a11243d50b23afeb10bda5a2ca6cc77357eea38/deps/db/src/logseq/db/frontend/schema.cljs#L61-L79)

这也是 Logseq Journal 首页能直接调用普通 `page-cp` 的原因；Journal item 仅增加 `journals?` context，并没有另一套正文数据或编辑器。

来源：

- [Journal item 复用 `page/page-cp`](https://github.com/logseq/logseq/blob/9a11243d50b23afeb10bda5a2ca6cc77357eea38/src/main/frontend/components/journal.cljs#L80-L88)

对 Memorilo 而言，最接近的映射是：

```text
JournalEntry (projection / subtype)
└── Note aggregate (一份 LoroDoc)
    ├── NoteEntry tree
    └── Topic
        └── Block tree
```

Journal 不应引入第二套 CRDT 文档模型。它应复用“每个 Note 是一个 LoroDoc”的现有 ADR，只增加 Journal 身份、日期约束、查询和多 Note projection。

来源：

- [Memorilo ADR：每个 Note 是一个 LoroDoc](../adr/0001-note-as-loro-aggregate.md)

## 5. TanStack Virtual 官方建议

### 5.1 动态高度：估值偏大，再测量真实 DOM

官方建议动态测量时把 `estimateSize` 设为舒适范围内尽可能大的估值，以改善初始位置计算。每个虚拟 item 应同时提供 `data-index` 和 `ref={virtualizer.measureElement}`；默认测量使用 `getBoundingClientRect()`。

来源：

- [`estimateSize` 建议](https://github.com/TanStack/virtual/blob/d2cf98beea1696c7187c06b57c9e724d1957963c/docs/api/virtualizer.md#L31-L39)
- [`measureElement` 的 React markup 要求](https://github.com/TanStack/virtual/blob/d2cf98beea1696c7187c06b57c9e724d1957963c/docs/api/virtualizer.md#L528-L545)
- [官方 React dynamic example](https://github.com/TanStack/virtual/blob/d2cf98beea1696c7187c06b57c9e724d1957963c/examples/react/dynamic/src/main.tsx#L180-L234)

Journal item 不能按固定行高建模，因为完整编辑器、Topic/Block 数量、图片和异步内容都会改变高度。第一版应使用一个保守的 Page 高度估值；实测数据足够后再按内容摘要分桶估算，而不是在设计阶段猜精确公式。

### 5.2 key 必须是持久业务身份

`getItemKey` 默认返回 index，但官方建议尽可能覆盖为全局唯一 identity，并 memoize。Journal 应使用 Note ID 或规范化日期键，不能用数组 index；这样删除空历史项、分页追加和日期切换都不会把已有测量错误地关联到另一项。

来源：

- [`getItemKey` API 与 memoize 建议](https://github.com/TanStack/virtual/blob/d2cf98beea1696c7187c06b57c9e724d1957963c/docs/api/virtualizer.md#L133-L141)

### 5.3 overscan 是体验与成本的旋钮

`overscan` 是可视区上下额外渲染的 item 数，默认 `1`。增加它可减少快速滚动时看到空白的概率，但会增加渲染时间。官方 infinite-scroll 示例使用 `5`，chat 示例使用 `6`；这些是起点而不是规范值。

来源：

- [`overscan` 定义与默认值](https://github.com/TanStack/virtual/blob/d2cf98beea1696c7187c06b57c9e724d1957963c/docs/api/virtualizer.md#L77-L83)
- [官方 infinite-scroll 示例使用 `5`](https://github.com/TanStack/virtual/blob/d2cf98beea1696c7187c06b57c9e724d1957963c/examples/react/infinite-scroll/src/main.tsx#L45-L58)
- [官方 chat 示例使用 `6`](https://github.com/TanStack/virtual/blob/d2cf98beea1696c7187c06b57c9e724d1957963c/docs/chat.md#L5-L20)

Journal 的单项远重于普通 table row，建议先从 `overscan: 2` 开始，以实际滚动空白、内存和同时挂载的编辑器数量调优。官方示例中的 `5` 和 `6` 证明可调范围，不是重型 ProseMirror item 的默认规范。

### 5.4 这个 Journal 是 start-anchored append，不是反向 chat

TanStack 的 `anchorTo: 'end'` 服务于正常数组顺序为“旧到新”、历史加载向数组头部 prepend、最新消息位于滚动底部的 chat/log。它依赖稳定 key 找回 prepend 前的可见 item，并保持视觉位置；官方同时建议使用正常 DOM 顺序，不使用 `column-reverse`、反向 transform 或手写 `scrollTop += delta`。

来源：

- [`anchorTo` 的默认值与 end anchor 语义](https://github.com/TanStack/virtual/blob/d2cf98beea1696c7187c06b57c9e724d1957963c/docs/api/virtualizer.md#L248-L260)
- [Chat：prepend 历史时保持位置](https://github.com/TanStack/virtual/blob/d2cf98beea1696c7187c06b57c9e724d1957963c/docs/chat.md#L38-L52)
- [Chat：保持正常 DOM 顺序](https://github.com/TanStack/virtual/blob/d2cf98beea1696c7187c06b57c9e724d1957963c/docs/chat.md#L97-L125)

Memorilo 的要求恰好相反：今天在数组索引 `0`，越旧 index 越大，加载更旧页时 append 到末尾。因此应保持默认 `anchorTo: 'start'`，使用末尾 loader row 检测最后一个 virtual item 后 `fetchNextPage()`。仓库现有 Pages route 已经采用同一种 TanStack infinite append 模式，可复用其 query/loader 结构。

来源：

- [TanStack 官方 infinite-scroll 示例](https://github.com/TanStack/virtual/blob/d2cf98beea1696c7187c06b57c9e724d1957963c/examples/react/infinite-scroll/src/main.tsx#L35-L77)
- [Memorilo 当前 Note Library 页面的末尾 loader 模式](../../apps/desktop/renderer/src/features/notes/library/note-library-page.tsx)

### 5.5 测量变化与滚动位置修正

当视口上方 item 的真实高度与估值不同时，Virtualizer 会校正 scroll position。默认只在用户没有向后滚动时应用该修正，避免向上滚动时 item 跳动。只有实测默认行为不满足 Journal 编辑场景时，才应设置实例属性 `shouldAdjustScrollPositionOnItemSizeChange`；它不是普通 options 字段。

来源：

- [`shouldAdjustScrollPositionOnItemSizeChange`](https://github.com/TanStack/virtual/blob/d2cf98beea1696c7187c06b57c9e724d1957963c/docs/api/virtualizer.md#L567-L589)

默认 `measureElement` 已通过 ResizeObserver 处理动态尺寸。官方明确说通常不应启用 `useAnimationFrameWithResizeObserver`：回调已在 layout 后、paint 前执行，额外 RAF 会增加约 16ms 延迟。只有测量证明某个具体问题因此改善时再打开。

来源：

- [`useAnimationFrameWithResizeObserver` 的适用范围与代价](https://github.com/TanStack/virtual/blob/d2cf98beea1696c7187c06b57c9e724d1957963c/docs/api/virtualizer.md#L326-L347)

### 5.6 返回 Journal 时恢复位置

`initialOffset` 可指定初次渲染位置。当前版本还能用 `takeSnapshot()` 保存已测量 items，连同 `scrollOffset` 存入 route/session state；重新挂载时传给 `initialMeasurementsCache` 和 `initialOffset`，可避免从头重测后产生大幅位置漂移。未测量 item 仍回退到 `estimateSize`。

来源：

- [`initialOffset`](https://github.com/TanStack/virtual/blob/d2cf98beea1696c7187c06b57c9e724d1957963c/docs/api/virtualizer.md#L125-L131)
- [`initialMeasurementsCache`](https://github.com/TanStack/virtual/blob/d2cf98beea1696c7187c06b57c9e724d1957963c/docs/api/virtualizer.md#L314-L324)
- [`takeSnapshot` 与完整恢复示例](https://github.com/TanStack/virtual/blob/d2cf98beea1696c7187c06b57c9e724d1957963c/docs/api/virtualizer.md#L496-L525)

若 Journal 列表前面还有共享 app header，`scrollMargin` 表示 scroll element 起点到虚拟列表起点的距离；绝对定位时必须使用 `virtualItem.start - scrollMargin`。动态 header 可通过 `getBoundingClientRect()` 或 ResizeObserver 测量。

来源：

- [`scrollMargin`](https://github.com/TanStack/virtual/blob/d2cf98beea1696c7187c06b57c9e724d1957963c/docs/api/virtualizer.md#L205-L217)

## 6. 对 Memorilo 的建议模型

### 6.1 领域字段

建议让 Journal 的 identity 与 Note 的普通标题分离：

| 字段 | 建议 | 理由 |
| --- | --- | --- |
| `noteId` | 继续使用稳定 Note ID | 保持 Loro aggregate、引用和路由 identity |
| `kind` | `note` / `journal` | 查询、权限和重命名规则不能靠标题猜测 |
| `journalDate` | 本地日历日期，数据库唯一 | 一天一个 Journal；排序和 lookup 不依赖 locale 文本 |
| `title` | Journal 由 `journalDate` 受控生成 | UI 标题不可编辑；普通 Note 保持现有行为 |
| `createdAt` / `updatedAt` | 保留审计含义 | 不能代替 Journal date；编辑旧 Journal 不应改变它在时间轴的位置 |

数据库应保证 `journalDate` 唯一，应用服务提供 idempotent 的 `getOrCreateJournal(date)`。不要只依靠 `title = yyyy-MM-dd` 的普通 Note 唯一标题约束：未来 locale/格式变更、时区规则或普通 Note 恰好同名都会使该边界不可靠。

### 6.2 查询契约

建议提供 Journal 专用读取契约，而不是复用 `listNotes({ sortBy })`：

```ts
interface ListJournalEntriesInput {
  beforeDate?: string
  limit?: number
}

interface JournalEntrySummary {
  journalDate: string
  noteId: string
}
```

语义：

1. Journal route 首先确保今天存在并固定为 index `0`。
2. 历史查询只返回 `journalDate < today` 且非空的 Journal，按日期降序。
3. 下一页用最后一项的 `journalDate` 做 keyset cursor：`WHERE journal_date < ? ORDER BY journal_date DESC LIMIT ?`。
4. 不建议继续使用普通 Note 列表的 OFFSET pagination。历史空项可能被自动删除，OFFSET 在页间删除发生时会产生跳项；日期 cursor 对这一变化稳定。
5. 普通 Pages/搜索是否显示 Journal 必须作为显式产品决策；不要让 subtype 无意间重复出现在两个入口。

### 6.3 空白与清理状态机

“空”必须定义为领域谓词，不能用 Loro snapshot byte length、是否存在默认 Topic、标题是否为空来判断。建议语义是“没有任何用户可见正文内容，也没有会让删除丢失用户意图的 metadata”。至少要共同决定 favorite、recent history、附件引用、反向引用和未来 Note-level properties 是否阻止清理。

```text
today + empty
  -> 保留并显示，可编辑

today 跨过本地午夜
  -> flush/save 已完成
  -> 若旧 today 满足 isJournalEmpty：原子删除
  -> 否则成为历史项
  -> ensure 新 today，并置于 index 0

historical + 编辑后变空
  -> 在保存成功且不再编辑后重新检查 revision
  -> 满足 isJournalEmpty：原子删除并从 query cache 移除
  -> 不满足：保留原日期位置
```

自动删除必须在 main/storage ownership 内完成，而不是由虚拟行 `unmount` 直接删除。虚拟化会频繁卸载非空编辑器；renderer cleanup effect 既不是内容真源，也无法可靠地区分滚动卸载、route 离开、窗口关闭和日期 rollover。

当前 `EditorStorage` 没有 Note delete API，因此这是新领域能力，不只是 Journal UI 逻辑。删除还需要定义：Loro updates/checkpoint、Topic/Block projections、embedding index、favorite/recent、asset references 的同一事务清理，以及正在编辑/同步 revision 的并发保护。

### 6.4 虚拟列表结构

建议的 renderer 数据流：

```text
ensureTodayJournal()
        |
        v
useInfiniteQuery(listHistoricalJournals)
        |
        v
[today, ...historicalPages.flatMap(items), loader?]
        |
        v
TanStack useVirtualizer (start anchor)
        |
        +-- stable getItemKey(noteId/date)
        +-- estimateSize(偏大)
        +-- measureElement(每个 Journal section)
        +-- overscan 2 起步，按 profiling 调整
        `-- 最后一个 virtual item 触发 fetchNextPage
```

每个 item 应是语义独立的 Journal section：只读日期 heading 加可编辑 Note body。日期 heading 不挂重命名 handler；打开完整 Note、复制链接等命令使用 `noteId`。虚拟行卸载前必须走现有持久化协调器的 flush/ownership 机制，不能假设 React unmount 等于保存完成。

### 6.5 日期与午夜规则

Logseq 使用本地日期，并通过短间隔 polling 检查 rollover。Memorilo 至少要明确：

- `journalDate` 是设备本地 calendar day，还是创建时固定 timezone 的 day；
- 应用跨午夜保持打开、sleep 后唤醒、系统 timezone 改变时如何切换 today；
- 多设备在不同时区编辑时，同一个 instant 是否可能属于两个 Journal；
- locale 只改变显示格式，还是允许用户选择持久标题格式。

建议避免 3 秒 polling：计算下一次本地午夜 timer，并在 window focus / visibility resume 时补一次日期检查。这里是产品规则，不应在未确认 timezone 语义前写入数据迁移。

## 7. 值得借鉴与不应照搬

值得借鉴：

1. 日期是独立 identity，标题只是日期 projection。
2. Journal 复用普通 Page/Block renderer；Memorilo 对应复用 Note aggregate 和现有 editor。
3. UI 和 transaction/service 两层都禁止 Journal rename。
4. 今天主动确保存在，历史按日期倒序。
5. 稳定业务 key、动态高度测量、滚动位置恢复。
6. 今天的空 Journal 与“没有今天入口”分离，确保第一项总可写。

不应照搬：

1. 不要一次查询全部 Journal IDs；Memorilo 已明确面对大量数据，应使用 cursor pagination。
2. 不要照搬 React Virtuoso 或 Logseq 的 5 秒 `min-height` workaround；项目已使用 TanStack Virtual，应先用其原生 measurement cache 和 scroll correction。
3. 不要从标题解析日期或用 `createdAt` 推断日期。
4. 不要把自动删除放进 React 虚拟行生命周期。
5. 不要复制 Logseq “过去 Page 进入 Recycle”的行为；用户要求的是过去空 Note 自动删除，是否可恢复需要单独确认。
6. 不要复制 Logseq 每 3 秒日期 polling；Electron 可用午夜 timer 加 resume/focus 校验。
7. 不要把 Journal 做成一个无限大的 LoroDoc。根据现有 ADR，每天仍应是独立 Note aggregate，否则会破坏同步、恢复和编辑器 ownership 边界。

## 8. 实现前必须确认的产品决策

1. `journalDate` 的 timezone 语义：当前设备本地日历日，还是固定/可配置 timezone？
2. 日期标题格式：跟随当前 locale、固定 ISO，还是用户可选？无论哪种都应由日期生成而不可编辑。
3. “空”的完整定义：仅无文本，还是图片、附件、空 Topic、properties、favorite、反向引用也参与？
4. 过去空 Journal 的删除是永久删除、回收站，还是只从 Journal projection 隐藏？这是破坏性/向前兼容边界，不能默认决定。
5. 何时清理：午夜 rollover、离开 Journal、保存后、应用启动维护，或组合；并发编辑时以哪一 revision 为准？
6. 普通 Pages、搜索、最近打开、收藏是否包含 Journal？
7. Journal 列表内是否允许同时存在多个可编辑 Note editor；若允许，selection、undo、快捷键和 persistence manager 如何按 `noteId` 隔离？
8. 从 Journal 跳到普通单 Note route 后返回，是否必须恢复原 scroll position？若必须，应把 TanStack snapshot 与 offset 纳入 route/session state。
9. 深链到某个过去日期时，是单独打开该 Note，还是 Journal timeline 滚到并聚焦该日期？
10. 首版分页大小和最大同时 mounted Journal 数，需要通过真实长文、图片和嵌入内容 profiling 决定，不能只按短文本 demo 调参。
