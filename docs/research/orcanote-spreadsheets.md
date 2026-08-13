# Orca Note Spreadsheet 实现调研

调研日期：2026-08-13

## 范围与证据等级

本报告回答四个问题：Orca Note 的 Spreadsheet 是什么产品形态、使用了什么技术、怎样保存和同步、它与 Orca 的 Block/Query 系统是什么关系。最后结合 Memorilo 当前的 Loro Note aggregate、SQLite checkpoint/update log 与 Block projection 给出架构建议。

需要先说明源码可见性：Orca 的 [GitHub 仓库](https://github.com/sethyuan/orca-note)是公开的，但当前只公开 README 和二进制 Releases，没有应用源码，也没有开源许可证。因此，本文不能把 Orca 称为开源应用；实现细节来自对**官方发布包**的静态检查，而不是对公开源码的阅读。

本文按以下等级标记证据：

- **官方明示**：Orca 官网、README 或 Release notes 直接说明。
- **发行包验证**：从 Orca 官方 v1.89.1 macOS arm64 发布包的 production bundle 中可重复定位，但不是官方文档承诺。
- **上游源码**：Univer v0.25.1 的公开源码，用于解释 Orca 所嵌入引擎的数据结构与插件职责。
- **未证实**：官方资料和被检查的发布包都不足以支持的能力，不作肯定结论。

固定资料版本：

- Orca Spreadsheet 首发版本：[v1.85.0](https://github.com/sethyuan/orca-note/releases/tag/v1.85.0)（2026-07-17）。
- 检查的 Orca 版本：[v1.89.1](https://github.com/sethyuan/orca-note/releases/tag/v1.89.1)。
- 检查的官方资产：[orcanote-mac-arm64-1.89.1.zip](https://github.com/sethyuan/orca-note/releases/download/v1.89.1/orcanote-mac-arm64-1.89.1.zip)，SHA-256 为 `09fb20bb53a2866e3f483b32dd6f2b5640d1827dc3329ba1be25e1794d5ba184`。
- 发布包内嵌的 Univer 版本：[`v0.25.1`](https://github.com/dream-num/univer/tree/v0.25.1)。

## 结论摘要

Orca 的 Spreadsheet 不是数据库表视图，也不是把每行或每个单元格实现成 Orca Block。它是一个独立的 `spreadsheet` Block，在 Block 内嵌入一份 Univer Workbook：

```text
Orca spreadsheet Block
├── _repr: { type: "spreadsheet", cap?: string }
├── content[0].v: JSON.stringify(Univer Workbook snapshot)
├── optional ordinary child Blocks
└── React renderer
    ├── reading: 45cqh read-only Univer instance
    └── editing: maximized Univer instance with full editing UI
```

最关键的实现判断是：

1. Orca 以 Block 负责嵌入、caption、折叠、删除和保存入口，以 Univer 负责网格、选择、公式、格式、剪贴板、排序和筛选等 spreadsheet 语义。
2. 一个 Spreadsheet 的全部 sheet、cell、公式、样式和插件资源被序列化成一个 Workbook JSON 字符串，整体写回同一个 Orca Block。
3. 编辑在独立的 Univer 内存模型中进行，按 `Save` 或 `Save and close` 时才把完整 snapshot 写回；不是 cell-level 增量持久化。
4. 当前发布包没有接入 Univer 的 collaboration 配置，也没有把 cell 投影成 Orca Block、Super Tag property 或 Query row。
5. Markdown/HTML 导出不展开工作簿，只输出 Spreadsheet 占位；Spreadsheet 对 Orca 的通用文本查询和导出基本是 opaque payload。

这是一种“嵌入式文档对象”架构。它能以很少的宿主集成快速获得成熟 spreadsheet 能力，但代价是粗粒度保存、较弱的宿主查询/导出集成，以及大依赖和多实例生命周期成本。

## 1. 产品形态与交互

### 1.1 它是独立 Block

Orca v1.85.0 的发布说明写明：新增 Spreadsheet Block type，可通过 slash command 创建。v1.89.1 发布包中也能定位到完整注册链：

```text
/ Spreadsheet
  -> core.editor.insertSpreadsheet
  -> _repr.type = "spreadsheet"
  -> SpreadsheetBlock renderer
```

renderer 被注册为 `foldInQuery: true`，因此整个 Spreadsheet Block 出现在 Query 结果时可以按 Block 折叠显示。`SpreadsheetBlock` 同时继续渲染普通 `BlockChildren`，说明 Spreadsheet 自身仍处于 Orca Block tree 中，并不取代周围的 Block 结构。

来源：

- [Orca v1.85.0 Release](https://github.com/sethyuan/orca-note/releases/tag/v1.85.0)（官方明示）。
- [Orca 官网 Spreadsheet 功能介绍](https://orca-studio.com/orcanote/zh/#features)与[官方截图](https://orca-studio.com/orcanote/_astro/feature-12.CmAo9Jml.avif)（官方明示）。
- v1.89.1 production bundle 中的 `core.editor.insertSpreadsheet`、`orca.spreadsheet`、`registerBlock("spreadsheet")` 和 `SpreadsheetBlock`（发行包验证）。

官网把它描述为集成式电子表格，支持公式与计算。官方截图也显示它直接嵌在 Journal/Block editor 正文中，具有 caption、行列网格、结构化表和计算结果，而不是导航到单独的数据库页面。

### 1.2 阅读态与编辑态使用两套配置

正文中的 Spreadsheet 是约 `45cqh` 高的预览。预览实例：

- 调用 `setEditable(false)`；
- 隐藏 toolbar、menu、formula bar、footer、header 和 context menu；
- 覆盖透明 mask，点击后进入编辑；
- 保留 caption，以及 Edit、Delete 等 Block 级操作。

进入编辑后，Orca 先销毁预览实例，再通过 React portal 把新的 Univer 实例挂到 editor 根容器并最大化。编辑态恢复完整 Univer UI，并提供 `Save` 和 `Save and close`。退出时编辑实例被销毁，随后阅读态重新创建。这里是“两个配置和生命周期”，不是同时维护两份 Workbook 实例。

Orca 还专门隔离了快捷键和 DOM 事件：全局 copy/paste、keydown、Markdown 和 inline-reference handler 遇到 `.orca-spreadsheet` 会让 Univer 接管；最大化编辑态显式放行 `Cmd/Ctrl+Z/Y/A/F/B/I/U/K`，并补注册 redo shortcut。这说明 Spreadsheet 被当作一个拥有自身 selection、clipboard 和 history 的嵌入式编辑器。

上述细节均为 v1.89.1 发行包验证。

## 2. 技术实现

### 2.1 核心引擎是 Univer 0.25.1

v1.89.1 renderer bundle 内直接包含 `@univerjs/*` 包名和版本 `0.25.1`，并使用 `Univer`、`FUniver`、`createWorkbook` 等 API。Univer 是 Apache-2.0 的开源 office suite framework，Spreadsheet 的模型、渲染、公式和 UI 都由它提供。

来源：

- [Univer 官方仓库](https://github.com/dream-num/univer)与[Apache-2.0 License](https://github.com/dream-num/univer/blob/v0.25.1/LICENSE)（上游源码）。
- [Univer v0.25.1 Release](https://github.com/dream-num/univer/releases/tag/v0.25.1)（上游发布记录）。
- v1.89.1 production bundle 中的 `@univerjs/core`、`@univerjs/engine-formula` 等 `name/version` 常量（发行包验证）。

Orca 没有公开 glue code 源码，因此无法确认它是否维护了私有 Univer fork，或对上游做过多少修改。能确认的是，生产 bundle 中的 Univer 包均自报为 `0.25.1`。

### 2.2 当前启用的能力模块

发行包中的 preset 与 plugin 注册显示，阅读态和编辑态都装载以下基础能力：

- core、render engine、UI、docs 和 docs UI；
- sheets 和 sheets UI；
- formula engine、sheets formula 和 formula UI；
- number format 和 number-format UI；
- data validation；
- conditional formatting；
- hyperlink；
- sort；
- structured sheet table。

编辑态另外装载 find/replace 与 filter。上游 v0.25.1 对应插件的职责可从源码确认：

- [公式插件](https://github.com/dream-num/univer/blob/v0.25.1/packages/sheets-formula/src/plugin.ts)
- [数字格式插件](https://github.com/dream-num/univer/blob/v0.25.1/packages/sheets-numfmt/src/plugin.ts)
- [数据验证插件](https://github.com/dream-num/univer/blob/v0.25.1/packages/sheets-data-validation/src/plugin.ts)
- [条件格式插件](https://github.com/dream-num/univer/blob/v0.25.1/packages/sheets-conditional-formatting/src/plugin.ts)
- [超链接插件](https://github.com/dream-num/univer/blob/v0.25.1/packages/sheets-hyper-link/src/plugin.ts)
- [排序插件](https://github.com/dream-num/univer/blob/v0.25.1/packages/sheets-sort/src/plugin.ts)
- [筛选插件](https://github.com/dream-num/univer/blob/v0.25.1/packages/sheets-filter/src/plugin.ts)
- [结构化表插件](https://github.com/dream-num/univer/blob/v0.25.1/packages/sheets-table/src/plugin.ts)
- [查找替换插件](https://github.com/dream-num/univer/blob/v0.25.1/packages/sheets-find-replace/src/plugin.ts)

“插件已注册”能证明能力代码被 Orca 当前实例开放，但不能自动证明所有上游功能都经过 Orca 的产品测试，也不能把 Univer 的付费/Pro 能力一并算入 Orca。

### 2.3 Univer Pro / 企业能力边界

Univer 官方把 Apache-2.0 的 `@univerjs/*` 与采用 Univer Commercial License 的 `@univerjs-pro/*` 分开。当前官方仓库列出的 Spreadsheet Pro 能力包括：

- 实时协作、协作客户端/服务端和编辑历史；
- Excel 等文件格式的导入导出，以及打印；
- 图表、透视表、迷你图、outline/group、shape 和 cell image；
- data connector、range preprocessing，以及增强型公式引擎和服务端计算；
- SSR、computing delegation、changeset replay 等企业运行时能力。

Docs 的 Pro 能力包括导入导出、打印、协作、增强表格和列表、分栏、callout、code block、quote、shape 与远程评论资源；Slides Pro 包含增强的 slide model/UI、导入导出、图表和表格；Bases Pro 则提供数据库模型、commands、formula integration、workbench UI、字段编辑器和 render-engine views。

其中协作、编辑历史、文件交换、打印和部分服务端计算依赖 Univer Server，而不是只安装浏览器端插件即可获得。官方支持用 Docker Compose 或 Kubernetes 私有部署；生产环境可接 MySQL/PostgreSQL、Redis、消息队列和 S3-compatible object storage。宿主应用通过 USIP 对接身份、角色和协作者等业务数据。因此它不是默认包含的托管 SaaS，部署和运维边界需要单独评估。

未注入有效 license 时，Pro 可以受限模式运行，但会有 watermark、导入大小、协作文档/连接数、打印页数、图表/透视表数量等限制；有效 license 按 entitlement 解锁能力。具体套餐、部署权利、用户/实例计费和源代码可见性不能从 package 名称推断，需以 Univer Commercial License 和商务合同为准。npm metadata 只能证明相应 package 曾被发行，不能证明当前可购买或授权范围。

还有一个当前状态限制：截至 2026-08-13，[Univer Pro 官网公告](https://pro.univer.ai/)称新购买暂时暂停，30-day evaluation license 也暂不可用；现有客户或旧订单问题需联系 `sales@univer.ai`。文档里仍存在通常的试用与购买流程，但当前公告在时效上优先。

v1.89.1 Orca renderer bundle 中没有发现 `@univerjs-pro/*` 包名，也没有 license、collaboration、exchange、print、pivot 或 chart 等 Pro glue。因而没有证据表明 Orca 当前 Spreadsheet 使用了上述 Pro 能力；它注册的公式、数字格式、排序、筛选、数据验证、条件格式、超链接、结构化表与查找替换来自开源 `@univerjs/*` packages。

来源：

- [Univer 官方 README：Open Source and Pro 对照](https://github.com/dream-num/univer/blob/dev/README.md#open-source-and-pro)
- [Univer Apache-2.0 License](https://github.com/dream-num/univer/blob/dev/LICENSE)
- [Univer Pro overview](https://docs.univer.ai/guides/pro)
- [Univer Pro license](https://docs.univer.ai/guides/pro/license)
- [Univer Server](https://docs.univer.ai/guides/pro/server)与[生产部署](https://docs.univer.ai/guides/pro/deploy)
- [USIP integration](https://docs.univer.ai/guides/pro/usip)
- [Univer Pro 当前购买状态](https://pro.univer.ai/)
- npm 上发布的 [`@univerjs-pro/*` packages](https://www.npmjs.com/search?q=%40univerjs-pro)

### 2.4 宿主与引擎的职责边界

Orca 和 Univer 的分工相当清晰：

| 职责 | Orca | Univer |
| --- | --- | --- |
| Block 创建、删除、caption、children | 是 | 否 |
| Query 中展示/折叠整个 Block | 是 | 否 |
| Grid、sheet、row/column、range selection | 否 | 是 |
| Cell 编辑、公式、格式、merge | 否 | 是 |
| Spreadsheet 内 undo/redo | 路由快捷键 | 是 |
| Spreadsheet 内 copy/paste | 让出事件 | 是 |
| 持久化入口 | 写回 Block | 生成 Workbook snapshot |

这种边界的优点是宿主不必重新实现 spreadsheet domain。缺点是宿主只看到一个大 snapshot，很难自然参与 cell-level 查询、协作、历史和导出。

## 3. 数据模型与持久化

### 3.1 Orca Block 保存的是完整 Workbook JSON

从 v1.89.1 bundle 可还原出以下读写流程：

```text
load
  block.content[0].v
  -> JSON.parse(...)
  -> univerAPI.createWorkbook(snapshot)

edit
  Univer in-memory Workbook

save
  getActiveWorkbook().save()
  -> JSON.stringify(snapshot)
  -> core.editor.setBlocksContent([
       { id: blockId, content: [{ t: "t", v: json }] }
     ])
```

新建且尚无内容时，Orca 只给 Univer 一个最小初值：

```json
{
  "id": "spreadsheet-<blockId>",
  "name": "Sheet1"
}
```

caption 不在 Workbook 内，而在 Block 的 `_repr.cap` 中。保存调用被包在 `topGroup: true, undoable: false` 的 Orca editor group 中；Spreadsheet 内部的 undo/redo 由 Univer 自己维护，整份 snapshot 写回不进入 Orca Block 级 undo stack。

保存是显式动作。当前实现没有把每次 cell mutation 持续写成 Orca command，也没有在已检查的 glue code 中看到 autosave 或增量 mutation persistence。

### 3.2 Workbook snapshot 包含什么

Univer v0.25.1 的 [`IWorkbookData`](https://github.com/dream-num/univer/blob/v0.25.1/packages/core/src/sheets/typedef.ts#L29-L75) 包含：

- workbook `id`、`name`、`appVersion`、`locale` 和 revision；
- style dictionary；
- sheet order 与各 worksheet snapshot；
- plugin resources 与 custom data。

Worksheet snapshot 又包含 row/column 数量与尺寸、merge ranges、cell matrix、freeze、gridline、sheet visibility 等数据。Cell 的 [`ICellData`](https://github.com/dream-num/univer/blob/v0.25.1/packages/core/src/sheets/typedef.ts#L239-L282) 以紧凑字段保存原始值 `v`、value type `t`、公式 `f`、style `s`、rich-text document `p` 等。

Univer [`Workbook.save()`](https://github.com/dream-num/univer/blob/v0.25.1/packages/core/src/sheets/workbook.ts#L126-L135) 返回当前 snapshot 的 deep clone。插件可把筛选、条件格式、数据验证、表等附加状态放入 Workbook resources。因此 Orca 写回的不是单纯 cell matrix，而是可重建整个 Workbook 的 document snapshot。

### 3.3 保存粒度的后果

全量 JSON snapshot 简化了宿主集成，但有四个直接后果：

1. **写放大**：改一个 cell 也会替换整个 Block content 字符串。
2. **冲突粒度粗**：两个窗口从同一旧 snapshot 编辑不同 cell，宿主若没有 revision check，后保存者会覆盖先保存者。
3. **Block history 与 sheet history 分离**：编辑期 undo 在 Univer 内，保存后 Orca 只得到一次不可撤销的 content replacement。
4. **查询不透明**：宿主必须主动解析 Workbook 才能索引 cell，否则只能索引 Block caption/type。

这些是该持久化形态的结构性推论，不代表已经观察到 Orca 用户数据损坏。官方也没有公布多窗口冲突策略或 snapshot migration 策略。

还有一个需要单独注意的失败路径：读取 snapshot 时，`JSON.parse` 失败只会写入 console，随后创建一份空 Workbook。原始 Block content 当下不会被自动修改，但如果用户在这个空 Workbook 中继续编辑并保存，新的完整 snapshot 会覆盖原先无法解析的字符串。当前实现没有在 UI 中阻止保存、展示恢复入口或保留损坏 payload 的副本。这个结论来自 v1.89.1 发行包的读取与保存控制流，不代表 Orca 已经出现过实际数据丢失事故。

## 4. 协作与同步

Univer 的创建 helper 支持 `collaboration` 和 `workerURL` 等配置，但 Orca 创建 Spreadsheet 实例时没有传入 collaboration，也没有注册 sheet thread-comment/collaboration/server glue。编辑中的 cell mutation 只存在于当前 renderer 的 Univer 实例，按保存按钮后才整体回写 Block。

因此，对 v1.89.1 最准确的结论是：**未发现或未声明 Spreadsheet 的 cell-level 实时多人协作；当前实现呈现为本地编辑、单 Block 全量 snapshot 保存。**

这和 Orca repository/S3 sync 是两个层次。仓库同步可以把保存后的 Block JSON 同步到另一设备，但不等于两位用户能同时合并 A1 和 B2 的编辑。Orca 官网也将本地数据作为产品特性，称 notes are stored only on the user's device；Release 中出现的同步能力不应被解释成 Spreadsheet collaboration。

来源：

- [Orca 官网 Local-first 描述](https://orca-studio.com/orcanote/#features)（官方明示）。
- v1.89.1 Spreadsheet factory 参数与保存流程（发行包验证）。

## 5. 与 Block、Query、搜索和导出的关系

### 5.1 不是 Database/Query view

Orca 的 Query 有自身的 list/cards/table/calendar 等 view。Spreadsheet 则由 `_repr.type = "spreadsheet"` 的 Block renderer 创建，不读取 Query result rows，也没有把 Workbook row 映射为 Orca Block 或 Super Tag entity。

在被检查的发布包中：

- cells 不是 Orca Blocks；
- cell values 不会自动成为 tag properties；
- Spreadsheet 不是 Query table 的另一种 renderer；
- `foldInQuery: true` 只表示 Query 结果能折叠展示**整个 Spreadsheet Block**；
- Spreadsheet 可以有普通 child Blocks，但这些 children 与 Workbook cells 是两套数据。

v1.85.0 同时发布的 computed type tag property 属于 Orca property/query 系统，不能与 Spreadsheet formula 混为一谈。后续 [v1.86.0](https://github.com/sethyuan/orca-note/releases/tag/v1.86.0) 和 [v1.87.0](https://github.com/sethyuan/orca-note/releases/tag/v1.87.0) 对 computed properties 的增强也不构成 Spreadsheet 与 database 的联动证据。

### 5.2 导出只保留占位

v1.89.1 的 converters 对 Spreadsheet 作特殊处理：

- Markdown/HTML 输出本地化的 `(Spreadsheet)` 占位；
- plain text 在完整导出时输出 `spreadsheet:`，可附 caption；简化展示时仍是 `(Spreadsheet)`；
- converter 不遍历 sheet、row 或 cell，也不输出公式和计算结果。

这意味着通用 Markdown/HTML export、plain-text search materialization 和剪贴板中的 Block-level conversion 都不会保留表内数据。Spreadsheet 内部 copy/paste 由 Univer 处理，是另一条路径。

## 6. 能力边界

| 能力 | 结论 | 证据 |
| --- | --- | --- |
| 嵌入 Block editor | 支持 | 官网截图、v1.85.0 Release、renderer 注册 |
| 多 worksheet、row/column、range、merge、格式 | 当前引擎提供 | Univer sheets/core/UI 在 Orca 实例中注册 |
| 公式与计算 | 支持 | 官网明示；formula engine/plugin 在实例中注册 |
| 数字格式 | 当前实例开放 | number-format core/UI 插件注册 |
| 数据验证 | 当前实例开放 | data-validation core/UI 插件注册 |
| 条件格式 | 当前实例开放 | conditional-formatting core/UI 插件注册 |
| 超链接 | 当前实例开放 | hyperlink core/UI 插件注册 |
| 排序 | 当前实例开放 | sort core/UI 插件注册 |
| 筛选 | 编辑实例开放 | filter core/UI 插件注册 |
| 结构化表 | 当前实例开放 | sheets-table core/UI 插件注册；官网截图可见表头菜单 |
| 查找替换 | 编辑实例开放 | find-replace 插件注册 |
| Spreadsheet 内 undo/redo、copy/paste | 由 Univer 处理 | Orca 事件路由和 Univer 插件代码 |
| Query 中折叠整个 Spreadsheet | 支持 | `foldInQuery: true` |
| cell 与 Block/Super Tag 双向绑定 | 未发现 | snapshot 为 opaque JSON，无 projection glue |
| cell-level 实时协作 | 未发现/未声明 | 无 collaboration 配置，显式全量保存 |
| XLSX/CSV 导入导出 | 未证实 | 官网、Release 和 glue code未给出入口 |
| Excel 函数/剪贴板完全兼容 | 未证实 | 官方没有兼容清单 |
| 图表、透视表、最大数据量 | 未证实 | 不应从 Univer 全部能力外推 |

## 7. 包体与运行时成本

被检查的 v1.89.1 renderer 主 bundle 为 `15,547,218` bytes，Univer 0.25.1 代码直接位于该 bundle 中，而不是独立的 Spreadsheet lazy chunk。不能把这 15.5 MB 全部归因于 Univer，但能确认 Spreadsheet 依赖进入了主 renderer 资产。

运行时上，每个正常渲染的 Spreadsheet Block 都会创建自己的只读 Univer 实例；进入编辑时销毁它并创建完整编辑实例，退出后再重建预览。长文档中若同时可见多个 Spreadsheet，这种模型会叠加 canvas/render engine、formula service、plugin 和 event-listener 成本。

Orca 已正确地在 effect cleanup 和模式切换时调用 `univer.dispose()`，但没有在被检查实现中看到 viewport virtualization 或共享只读 renderer。这里的风险是依赖体积和多实例成本，不是已被官方确认的性能缺陷。

## 8. 对 Memorilo 的建议

### 8.1 先确定产品语义

应先在产品层明确二选一：

- **独立 Spreadsheet Block**：像 Orca，一份 Block 拥有独立 workbook，适合自由计算和局部嵌入。
- **Database view**：rows/entities 属于 Memorilo domain，grid 只是其中一个 projection，适合查询、属性复用和跨视图联动。

两者可以长期共存，但不应在第一版用同一个数据模型假装兼顾。若目标是复刻 Orca，第一版应明确为独立 Spreadsheet Block。

### 8.2 把 Univer 包在 Memorilo 自己的 deep module 后面

可复用 Univer，但 editor 和 storage 不应直接传播 `IWorkbookData`。建议定义稳定的公开边界，例如：

```ts
interface SpreadsheetDocument {
  create(initial?: SpreadsheetSnapshot): SpreadsheetSession
  decode(bytes: Uint8Array): SpreadsheetSnapshot
  encode(snapshot: SpreadsheetSnapshot): Uint8Array
  summarize(snapshot: SpreadsheetSnapshot): SpreadsheetSummary
}

interface SpreadsheetSnapshot {
  engine: 'univer'
  engineVersion: string
  schemaVersion: number
  payload: Uint8Array
}
```

这一层负责 Univer API、snapshot 编码、版本检查、资源保存、实例 dispose 和未来迁移。ProseMirror NodeView 只依赖该边界，不直接读取 Univer 的紧凑字段。

### 8.3 不要把 Workbook JSON 塞进现有 Block attributes projection

Memorilo 当前的 Note aggregate 以 Loro 保存权威文档，以 SQLite 保存 checkpoint/update log，并把 Block 投影到 `topic_blocks`，其中 `attributes_json` 和 `text` 参与普通 Block 读取与全文索引。

建议在 Loro Note aggregate 内建立按 `spreadsheetId` 或 `blockId` 索引的独立 map/container：

```text
Topic Block node
  attrs: { kind: "spreadsheet", spreadsheetId, caption }

Note aggregate spreadsheet store
  spreadsheetId -> { schemaVersion, engineVersion, revision, snapshotBytes }
```

`topic_blocks` projection 只保存 type、caption、受控摘要和 snapshot hash，不把完整 Workbook JSON 写入 `attributes_json`，也不把 JSON 投入 FTS。若读取性能需要，可新增专用 SQLite blob projection/cache；权威数据与 cache 的归属必须明确，避免出现两份可独立修改的 snapshot。

这一建议需要新增 Memorilo 自己的 spreadsheet aggregate/storage 边界，不能直接从现有 schema 得到。当前 `LoroTopicNodeType` 和 ProseMirror schema 都没有 Spreadsheet node；现有 `topic_blocks` 只对 `text` 建 FTS，`attributes_json` 则保存 Block attributes。若选择把 payload 直接放在 node attrs，Loro 仍会把它当作一个粗粒度值，而不会理解 Workbook 内部的 cell。

### 8.4 保存必须带 revision 和原子边界

即使 v1 采用显式全量保存，也应比 Orca 多一层冲突保护：

```text
open -> capture baseRevision
save(snapshot, baseRevision)
  -> reject if currentRevision != baseRevision
  -> atomically update snapshot + hash + revision + block summary
```

这能避免两个窗口静默 last-write-wins。冲突后的产品行为是覆盖、另存、锁定还是合并，属于兼容与协作策略，需要单独决策，本文不替产品选择。

### 8.5 协作需要独立设计

把完整 snapshot 存成一个 Loro value，只能获得粗粒度 replacement conflict；它不会自动变成 cell-level CRDT。未来若要求实时协作，需要在以下路线中做明确选择：

- 把 Univer mutation/operation 转成稳定的 cell/range CRDT operations；
- 采用单写者、租约或文档锁；
- 保持显式 snapshot save，并提供冲突检测与版本分支。

第一条能力最好，但需要处理公式依赖、row/column structural edits、sort/filter、merge、style 和 plugin resources，不能只对 cell value 做 map merge。

### 8.6 延迟加载并控制实例数量

建议把 Univer 放入独立 dynamic-import chunk，只在 Spreadsheet Block 进入 viewport 或编辑态时加载。阅读态可以优先考虑：

- 静态 canvas/image/HTML preview + 点击后创建 Univer；或
- 对只读实例做 viewport mount/unmount；或
- 至少限制同时活跃的 read-only workbook 数量。

无论采用哪种方案，都要把 `dispose()`、theme/locale 更新、window resize、selection restore 和 event routing 收进 adapter，而不是散落在 NodeView 和 React component 中。

### 8.7 导出、搜索和公式摘要要显式设计

不要沿用 Orca 的纯占位导出作为最终行为。建议至少定义：

- CSV：活动 sheet 或逐 sheet 导出策略；
- XLSX：是否支持、由哪个 adapter 负责、兼容级别；
- Markdown/HTML：caption + 可配置的可见范围表格 fallback；
- 搜索：默认只索引 caption，还是抽取有限数量的 display values；
- 公式：持久化 raw formula 与 cached result，projection 只保留受控摘要，不在 SQLite 查询层重新计算。

Snapshot 的旧版本迁移、未来 Univer 升级和向前兼容策略都会影响持久化格式。它们需要产品和存储层共同决定，不应由 editor integration 隐式选择。

## 9. 复现信息与来源

### Orca 一手来源

- [Orca Note 官网（中文）](https://orca-studio.com/orcanote/zh/)
- [Orca Note 官网（英文）](https://orca-studio.com/orcanote/)
- [Orca Note 官方 GitHub 仓库](https://github.com/sethyuan/orca-note)
- [Git tree API：可核对公开仓库文件范围](https://api.github.com/repos/sethyuan/orca-note/git/trees/main?recursive=1)
- [v1.85.0：首次加入 Spreadsheet Block](https://github.com/sethyuan/orca-note/releases/tag/v1.85.0)
- [v1.89.1：本报告检查的发布版本](https://github.com/sethyuan/orca-note/releases/tag/v1.89.1)

### Univer 一手来源

- [Univer v0.25.1 source tree](https://github.com/dream-num/univer/tree/v0.25.1)
- [Univer 官方 Open Source / Pro 能力对照](https://github.com/dream-num/univer/blob/dev/README.md#open-source-and-pro)
- [Univer Pro overview、license 与 Server 文档](https://docs.univer.ai/guides/pro)
- [Univer Pro 当前购买暂停公告](https://pro.univer.ai/)
- [npm `@univerjs-pro/*` package 清单](https://www.npmjs.com/search?q=%40univerjs-pro)
- [`IWorkbookData` / `IWorksheetData` / `ICellData`](https://github.com/dream-num/univer/blob/v0.25.1/packages/core/src/sheets/typedef.ts)
- [`Workbook.save()`](https://github.com/dream-num/univer/blob/v0.25.1/packages/core/src/sheets/workbook.ts)
- [Univer facade 的 Workbook save API](https://github.com/dream-num/univer/blob/v0.25.1/packages/sheets/src/facade/f-workbook.ts)

### 发布包静态检查方法

1. 从 v1.89.1 Release 下载官方 macOS arm64 zip，并核对 SHA-256。
2. 解压 `.app/Contents/Resources/app.asar`。
3. 检查 `out/renderer/assets` 的 production JS bundle；对 minified bundle beautify 仅用于定位，不改变语义。
4. 定位 `SpreadsheetBlock`、`UniverSheet`、`insertSpreadsheet`、slash command、renderer registration、converter registration、shortcut routing 与 `setBlocksContent` 保存调用。
5. 将 bundle 中自报的 `@univerjs/* 0.25.1` 类型和 plugin 行为与 Univer v0.25.1 tag 的上游源码交叉核对。

由于 Orca 应用源码未公开，本报告不提供伪造的 GitHub source line 链接。所有标为“发行包验证”的结论都应理解为对 v1.89.1 官方二进制的可重复静态分析，不代表 Orca 对未来版本的稳定 API 承诺。
