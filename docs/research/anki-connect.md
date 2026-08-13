# AnkiConnect 文档调研

调研日期：2026-08-12

本文只使用 AnkiConnect 官方仓库、官方 README 和官方实现源码等一手资料。源码引用固定到官方 SourceHut 提交 [`de6e6e1b8aaf4ae195eb1d1ff6db5409b99b2a3e`](https://git.sr.ht/~foosoft/anki-connect/tree/de6e6e1b8aaf4ae195eb1d1ff6db5409b99b2a3e)，以便后续复核。AnkiConnect 不是 AnkiWeb 的同步协议，而是 Anki Desktop 内 add-on 提供的本机 HTTP JSON 控制接口。

## 结论摘要

- AnkiConnect 随 Anki 启动，在 `127.0.0.1:8765` 提供 HTTP 服务；Anki 必须保持运行。
- 推荐使用 API `version: 6`。请求的 `action` 必填，`params` 和 `key` 按 action/配置决定；成功响应为 `{result, error: null}`，失败响应为 `{result: null, error: "..."}`。
- API key 默认关闭。浏览器来源还受 CORS/permission 机制约束；`requestPermission` 是唯一不要求 API key、也可用于请求来源授权的 action。
- `multi` 可以批量调用，但返回的是每个子请求的独立响应，不是事务；部分 action 失败不会自动回滚其他 action。
- `answerCards` 调用 Anki 自己的 scheduler，state、interval、due 和 review log 由 Anki 产生。外部应用不应同时维护另一套调度状态。
- API 可创建、查询、更新和删除 Notes/Cards，操作媒体、牌组、模型和 GUI，也可以调用 Anki 自己的 `sync`。它没有通用 change feed；增量发现通常依赖 `notesModTime`、`cardsModTime` 或 review 查询。
- 访问网络绑定地址或开放 CORS 会扩大攻击面。默认只绑定 loopback；只有在明确需要时才改为网络监听，并同时配置来源和 API key。

## 1. 运行方式与版本

### 安装与生命周期

官方 README 给出的安装方式是：在 Anki 的 `Tools -> Add-ons -> Get Add-ons...` 中输入插件码 `2055492159`，安装后重启 Anki。服务在 Anki 启动时监听端口，浏览器访问 `http://localhost:8765` 可看到 `Anki-Connect` 文本，用于确认服务存活。[官方 README：Installation](https://git.sr.ht/~foosoft/anki-connect/tree/de6e6e1b8aaf4ae195eb1d1ff6db5409b99b2a3e/item/README.md#L5)

官方 README 声明支持最新稳定的 Anki `2.1.x`；同一提交的插件源码实际声明最低 Anki 版本为 `23.10.0`。因此客户端应在运行时探测 AnkiConnect/API 版本，不要只根据插件码推断宿主版本。[README：兼容性](https://git.sr.ht/~foosoft/anki-connect/tree/de6e6e1b8aaf4ae195eb1d1ff6db5409b99b2a3e/item/README.md#L1)；[源码：最低版本检查](https://git.sr.ht/~foosoft/anki-connect/tree/de6e6e1b8aaf4ae195eb1d1ff6db5409b99b2a3e/item/plugin/__init__.py#L20)

macOS 的 App Nap 可能暂停不可见的 Anki，导致本机 API 看起来“失联”。官方 README 建议为 Anki 关闭 App Nap 后重启应用；集成产品也应把“Anki 未运行/被系统挂起”当作正常不可用状态处理。[README：macOS 注意事项](https://git.sr.ht/~foosoft/anki-connect/tree/de6e6e1b8aaf4ae195eb1d1ff6db5409b99b2a3e/item/README.md#L25)

### 默认配置

同一提交的默认配置为：

| 配置 | 默认值 | 含义 |
| --- | --- | --- |
| `apiKey` | `null` | 不要求 API key |
| `webBindAddress` | `127.0.0.1` | 仅本机访问 |
| `webBindPort` | `8765` | HTTP 端口 |
| `webCorsOriginList` | `["http://localhost"]` | 默认可信浏览器来源 |
| `ignoreOriginList` | `[]` | 被拒绝且不再询问的来源 |
| `apiVersion` | `6` | 服务暴露的最高 API 版本 |

[默认配置源码](https://git.sr.ht/~foosoft/anki-connect/tree/de6e6e1b8aaf4ae195eb1d1ff6db5409b99b2a3e/item/plugin/util.py#L70)

将 `webBindAddress` 改为 `0.0.0.0` 等值会使服务接受网络连接，并且需要重启 Anki。除非有明确的跨设备需求，不建议这样做；本机集成使用 loopback 即可。[README：网络绑定](https://git.sr.ht/~foosoft/anki-connect/tree/de6e6e1b8aaf4ae195eb1d1ff6db5409b99b2a3e/item/README.md#L36)

## 2. HTTP/JSON 契约

### 请求

使用 HTTP `POST` 到 `http://127.0.0.1:8765`，body 是 JSON object：

```json
{
  "action": "deckNames",
  "version": 6,
  "params": {},
  "key": "optional-api-key"
}
```

`action` 必填且必须是非空字符串；`version` 必须是整数；`params` 必须是 object。省略 `version` 时，服务为旧客户端兼容会按 v4 处理。[HTTP 请求 schema](https://git.sr.ht/~foosoft/anki-connect/tree/de6e6e1b8aaf4ae195eb1d1ff6db5409b99b2a3e/item/plugin/web.py#L293-L301)

### 响应与错误

v5/v6 响应固定包含两个字段：

```json
{"result": ["Default"], "error": null}
```

```json
{"result": null, "error": "unsupported action"}
```

网络连接失败、JSON 无法解析、HTTP/CORS 拒绝和 action 执行失败是不同层次的错误，客户端应分别处理。action 执行异常由服务捕获并放入 `error` 字符串；不要把 `result: null` 误判为成功，必须检查 `error === null`。[README：请求和响应](https://git.sr.ht/~foosoft/anki-connect/tree/de6e6e1b8aaf4ae195eb1d1ff6db5409b99b2a3e/item/README.md#L38)；[响应格式源码](https://git.sr.ht/~foosoft/anki-connect/tree/de6e6e1b8aaf4ae195eb1d1ff6db5409b99b2a3e/item/plugin/web.py#L220)

v4 及更低版本的成功响应只有 `result`，错误响应也没有现代 v5/v6 的一致字段。因此新客户端应始终显式发送 `version: 6`，并在首次连接时调用 `requestPermission` 或 `version` 探测能力。[README：旧版本兼容](https://git.sr.ht/~foosoft/anki-connect/tree/de6e6e1b8aaf4ae195eb1d1ff6db5409b99b2a3e/item/README.md#L48)

### 认证、来源与 CORS

当配置了 `apiKey` 后，请求必须在顶层 body 带上匹配的 `key`；`requestPermission` 仍可用于发起来源授权，但不能假设它能绕过已启用的 API key 校验。API key 不会放在 HTTP header 中。[README：Authentication](https://git.sr.ht/~foosoft/anki-connect/tree/de6e6e1b8aaf4ae195eb1d1ff6db5409b99b2a3e/item/README.md#L145)

浏览器请求由 `webCorsOriginList` 控制。来自可信来源的请求直接放行；不可信来源调用 `requestPermission` 时，Anki 会弹窗询问用户，允许后把来源持久化到配置。拒绝后可以加入 `ignoreOriginList`。非浏览器的本机 HTTP 客户端通常没有 `Origin` header，可直接使用 loopback 服务。[README：`requestPermission`](https://git.sr.ht/~foosoft/anki-connect/tree/de6e6e1b8aaf4ae195eb1d1ff6db5409b99b2a3e/item/README.md#L1994)；[CORS/permission 实现](https://git.sr.ht/~foosoft/anki-connect/tree/de6e6e1b8aaf4ae195eb1d1ff6db5409b99b2a3e/item/plugin/web.py#L142)

`requestPermission` 返回（README 使用 `requireApiKey`）：

```json
{
  "permission": "granted",
  "requireApiKey": false,
  "version": 6
}
```

被拒绝时只返回 `{ "permission": "denied" }`。它应当是浏览器集成的第一调用。[README：`requestPermission`](https://git.sr.ht/~foosoft/anki-connect/tree/de6e6e1b8aaf4ae195eb1d1ff6db5409b99b2a3e/item/README.md#L1994)

注意：固定提交的实现源码实际返回字段名 `requireApikey`（`Key` 的 `K` 为小写），与 README 的 `requireApiKey` 不一致。客户端应兼容读取两个拼写，并以实际响应为准；这是该提交的文档/实现偏差，不是两个独立配置项。[源码：`requestPermission`](https://git.sr.ht/~foosoft/anki-connect/tree/de6e6e1b8aaf4ae195eb1d1ff6db5409b99b2a3e/item/plugin/__init__.py#L408)

## 3. 推荐客户端流程

1. 连接 `127.0.0.1:8765`，设置合理的连接和读取超时；Anki 未启动时显示可恢复的“需要启动 Anki”状态。
2. 发送 `requestPermission`（浏览器来源）或 `version`（本机非浏览器客户端）。
3. 固定发送 `version: 6`，统一校验 `{result,error}`。
4. 用 `apiReflect({scopes:["actions"]})` 或 `version` 记录当前服务能力；对可选 action 做能力判断。
5. 发布内容时先 `canAddNote(s)`/`canAddNotesWithErrorDetail`，再 `addNote(s)`；持久化返回的 Anki note/card ids。
6. 读取状态时用 `findNotes`/`notesInfo`、`findCards`/`cardsInfo`；用 `notesModTime`/`cardsModTime` 做轻量变更检测。
7. 复习提交只调用 `answerCards`，不要在外部重复计算间隔；需要历史时读取 `getReviewsOfCards` 或 `cardReviews`。
8. 能合并的独立读取可用 `multi`，但把它当作批量请求而非事务。

## 4. Action 能力地图

官方 README 的完整 action 文档仍是实现合同；下表按常见集成工作流压缩整理。

### 卡片与复习

| Action | 用途与注意事项 |
| --- | --- |
| `findCards` | 使用 Anki 搜索语法返回 card ids；查询本身不打开 GUI。搜索语法见 [Anki 官方手册](https://docs.ankiweb.net/searching.html)。 |
| `cardsInfo` | 返回 question/answer、fields、note、deck、model、CSS、`type`/`queue`/`due`、interval、reps、lapses、mod 等。不存在的 card 返回空 object。 |
| `cardsToNotes` | card ids 去重映射到 note ids。 |
| `cardsModTime` | 返回 card 修改时间；官方说明它比 `cardsInfo` 快约 15 倍，适合轮询。 |
| `areDue` / `areSuspended` / `suspended` | 查询到期或暂停状态；`areDue` 对长学习间隔按 Anki review 语义判断。 |
| `getIntervals` | 读取最近或完整 interval；负值是秒，正值是天。 |
| `answerCards` | 输入 `{cardId,ease}`，`ease` 为 `1..4`；逐张调用 Anki scheduler，返回与输入顺序对应的成功布尔数组。 |
| `forgetCards` / `relearnCards` | 将卡片重置为新卡或重新学习；属于破坏调度状态的操作。 |
| `setDueDate` | 直接设置 due 日；绕过正常评分，使用前需明确产品语义。 |
| `suspend` / `unsuspend` | 批量暂停/恢复卡片。 |
| `getEaseFactors` / `setEaseFactors` / `setSpecificValueOfCard` | 读取或直接改动调度字段；`setSpecificValueOfCard` 官方特别警告可能破坏数据库，除非确有必要不要暴露给普通用户。 |

`answerCards` 的源码直接执行 `scheduler.answerCard(card, ease)`；review log、interval、due 和 state 都由 Anki 决定。[源码：`answerCards`](https://git.sr.ht/~foosoft/anki-connect/tree/de6e6e1b8aaf4ae195eb1d1ff6db5409b99b2a3e/item/plugin/__init__.py#L1620)

### Notes、牌组与模型

| Action | 用途与注意事项 |
| --- | --- |
| `addNote` / `addNotes` | 按 `deckName`、`modelName`、`fields`、`tags` 创建 Note；可附加音频、视频、图片。`addNotes` 收集错误后会删除本批已创建 Notes，再返回错误。 |
| `canAddNote` / `canAddNotes` / `canAddNotesWithErrorDetail` | 创建前检查空 Note/重复 Note；带 detail 的版本返回每项 `canAdd` 与错误原因。 |
| `findNotes` / `notesInfo` | 按 Anki query 查找并读取 fields、tags、model、mod、关联 cards。`notesInfo` 也支持 query 参数。 |
| `notesModTime` | 读取 Note 修改时间，适合增量轮询。 |
| `updateNoteFields` / `updateNote` / `updateNoteModel` | 更新字段、标签或模型；`updateNote` 的 fields 更新与 tags 更新不是事务，字段成功而标签失败时不会自动回滚。浏览器正在查看该 Note 时更新字段还可能不生效。 |
| `updateNoteTags` / `getNoteTags` / `addTags` / `removeTags` / `getTags` / `replaceTags*` | 标签管理。 |
| `deleteNotes` / `removeEmptyNotes` | 删除 Note 及其关联 Cards，或清理空 Note；属于破坏性操作。 |
| `deckNames` / `deckNamesAndIds` / `getDecks` | 读取牌组。 |
| `createDeck` / `changeDeck` / `deleteDecks` | 创建、移动、删除牌组；删除可递归影响子牌组和卡片。 |
| `getDeckConfig` / `saveDeckConfig` / `setDeckConfigId` / `cloneDeckConfigId` / `removeDeckConfigId` | 读取和修改牌组预设。 |
| `getDeckStats` | 读取牌组新卡、学习卡、复习卡统计。 |
| `modelNames` / `modelNamesAndIds` / `findModelsById` / `findModelsByName` | 查找 Note Type。 |
| `modelFieldNames` / `modelFieldDescriptions` / `modelFieldFonts` / `modelFieldsOnTemplates` | 读取模型字段和模板关系。 |
| `createModel` / `modelTemplates` / `modelStyling` / `updateModelTemplates` / `updateModelStyling` | 创建或修改 Note Type 的模板和 CSS。 |
| `modelTemplate*` / `modelField*` / `findAndReplaceInModels` | 重命名、重排、增删模板/字段以及设置字体、字号、描述。模型 schema 变更可能让外部映射失效。 |

### 媒体

`storeMediaFile` 可通过 base64 `data`、本地 `path` 或远程 `url` 写入媒体；`skipHash` 可避免重复下载，`deleteExisting` 控制覆盖。`retrieveMediaFile` 返回 base64，`getMediaFilesNames` 的 `pattern` 使用 glob 通配模式而不是正则表达式，`getMediaDirPath` 返回媒体目录，`deleteMediaFile` 删除文件。媒体文件名和字段引用应由调用方保持一致。[README：Media Actions](https://git.sr.ht/~foosoft/anki-connect/tree/de6e6e1b8aaf4ae195eb1d1ff6db5409b99b2a3e/item/README.md#media-actions)

### GUI 与统计

`guiBrowse`、`guiSelectCard`、`guiSelectedNotes`、`guiAddCards`、`guiEditNote`、`guiCurrentCard`、`guiShowQuestion`、`guiShowAnswer`、`guiAnswerCard`、`guiUndo`、`guiDeckOverview`、`guiDeckBrowser`、`guiDeckReview`、`guiImportFile`、`guiExitAnki`、`guiCheckDatabase`、`guiPlayAudio` 操作 Anki 的当前窗口和 reviewer。它们依赖 GUI 状态，不适合作为无头同步层；无 reviewer 或状态不匹配时会失败/返回 `false`。

统计 action 包括 `getNumCardsReviewedToday`、`getNumCardsReviewedByDay`、`getCollectionStatsHTML`、`cardReviews`、`getReviewsOfCards`、`getLatestReviewID` 和 `insertReviews`。`getReviewsOfCards` 返回 Anki revlog 的原始字段（`id`、`ease`、`ivl`、`lastIvl`、`factor`、`time`、`type`）；`insertReviews` 是直接写入 review history 的低层操作，不应作为普通评分接口。[README：Statistic Actions](https://git.sr.ht/~foosoft/anki-connect/tree/de6e6e1b8aaf4ae195eb1d1ff6db5409b99b2a3e/item/README.md#statistic-actions)

## 5. 批量、同步与增量边界

### `multi` 不是事务

`multi` 接收 `actions` 数组，按顺序调用每个子请求并返回对应响应。子请求可以各自带 `action`、`version`、`params` 和 `key`；错误只出现在该项响应中。实现没有跨 action 的事务边界，因此不要把“创建 Note、写媒体、改牌组”打包后当作原子操作。[README：`multi`](https://git.sr.ht/~foosoft/anki-connect/tree/de6e6e1b8aaf4ae195eb1d1ff6db5409b99b2a3e/item/README.md#multi)；[源码：`multi`](https://git.sr.ht/~foosoft/anki-connect/tree/de6e6e1b8aaf4ae195eb1d1ff6db5409b99b2a3e/item/plugin/__init__.py#L515)

### `sync` 是 Anki 自己的 AnkiWeb 同步

`sync` 使用当前 Anki profile 的 sync auth，调用 Anki collection sync，并在状态不是“无变化”或“正常同步”时返回错误；媒体是否同步还取决于该 profile 的 `media_syncing_enabled()` 设置。它同步的是 Anki collection/media，不会把外部应用自己的数据库或 ID 映射上传到 AnkiWeb。[源码：`sync`](https://git.sr.ht/~foosoft/anki-connect/tree/de6e6e1b8aaf4ae195eb1d1ff6db5409b99b2a3e/item/plugin/__init__.py#L502)

### 没有 change feed

官方 action 提供按 ID 的 `notesModTime`/`cardsModTime`、基于 query 的 `findNotes`/`findCards`，以及 review history 查询，但没有“从某个游标开始返回所有变更”的统一 feed。需要做双向集成时，应自行保存上次观察到的修改时间/ID，并显式处理删除、模板重建和外部编辑。

## 6. 对 Memorilo 集成的建议

现有仓库调研已经决定由 Memorilo 原生 FSRS 持有 scheduling owner；因此 AnkiConnect 若未来加入，建议限定为互操作层：

1. 先做“发布到 Anki”：Memorilo 是内容真源，Anki Note/Card ids 只作为外部映射。
2. 发布前调用 `canAddNotesWithErrorDetail`，再用 `addNotes`；把 note id、card id、model/template 标识持久化。
3. 读取时以 `notesInfo`/`cardsInfo` 为事实快照，以 `notesModTime`/`cardsModTime` 做轮询优化；不要宣称实时双向同步。
4. 如果在 Memorilo 复习，评分必须通过 `answerCards` 提交给 Anki；Anki 不可用时应排队或明确禁用该入口，不能悄悄推进第二套 due/state。
5. 第一版不要开放 `setSpecificValueOfCard`、`insertReviews`、模型结构修改和牌组删除等低层/破坏性 action。
6. 处理媒体、Note schema、删除和冲突前，不要把功能命名为“Anki 双向同步”；更准确的名称是“AnkiConnect 发布/复习互操作”。

## 7. 官方资料

- [AnkiConnect 官方仓库（固定提交）](https://git.sr.ht/~foosoft/anki-connect/tree/de6e6e1b8aaf4ae195eb1d1ff6db5409b99b2a3e)
- [AnkiConnect README / API 文档](https://git.sr.ht/~foosoft/anki-connect/tree/de6e6e1b8aaf4ae195eb1d1ff6db5409b99b2a3e/item/README.md)
- [AnkiConnect HTTP 服务源码](https://git.sr.ht/~foosoft/anki-connect/tree/de6e6e1b8aaf4ae195eb1d1ff6db5409b99b2a3e/item/plugin/web.py)
- [AnkiConnect action 实现](https://git.sr.ht/~foosoft/anki-connect/tree/de6e6e1b8aaf4ae195eb1d1ff6db5409b99b2a3e/item/plugin/__init__.py)
- [AnkiConnect 默认配置](https://git.sr.ht/~foosoft/anki-connect/tree/de6e6e1b8aaf4ae195eb1d1ff6db5409b99b2a3e/item/plugin/util.py)
- [Anki 官方搜索语法](https://docs.ankiweb.net/searching.html)
- [AnkiWeb 官方插件页](https://ankiweb.net/shared/info/2055492159)
