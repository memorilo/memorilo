# Editor Cards

本文说明 `@memorilo/editor` 当前 Card authoring、Card Topic projection、只读 Preview 和公开接口。这里描述的是已经存在于 `packages/editor` 中的实现契约；Desktop 的 FSRS、队列和评分约束见 [`docs/fsrs-learning-system.md`](../../docs/fsrs-learning-system.md)。RemNote、Anki 与 SuperMemo 的产品调研见：

- [`docs/research/remnote-card-editor-interactions.md`](../../docs/research/remnote-card-editor-interactions.md)
- [`docs/research/spaced-repetition-anki-remnote-supermemo.md`](../../docs/research/spaced-repetition-anki-remnote-supermemo.md)

## 范围与状态

Card authoring 与 Card Topic projection 属于 editor；Desktop、IPC、SQLite 和 FSRS 负责把 Card Topic 的投影接入正式学习闭环。`projectEditorCards()` 仍是 editor 内部的底层 authoring projection，不代表 regular Topic 本身就是可学习对象。

| 能力 | 当前状态 |
| --- | --- |
| Basic / Forward | 已实现定义、稳定 CardID、投影与 Preview |
| Reverse / Backward | 已实现定义、稳定 CardID、投影与 Preview |
| Basic and Reverse / Bidirectional | 投影为两个方向独立的 Card |
| RichContentCloze | 已实现，可隐藏富内容选区或完整 inline 元素 |
| MathSourceCloze | 已实现，可隐藏单个 inline 或 block 公式 LaTeX source 的局部内容 |
| 混合 Cloze anchors | 同一 CardID/ClozeGroup 的两类 anchor 一起隐藏和揭示 |
| ListCard | 已实现显式 Card members 的逐项揭示 Preview |
| SetCard | 已实现显式 Card members 的一次揭示 Preview |
| Inline Highlight | 已实现；每个连续高亮区生成一个 Highlight Card Topic |
| Whole-block Highlight | 已实现；每个高亮 Block 生成一个 Highlight Card Topic |
| Card Topic lifecycle | 已实现 synced/detached、标题同步、Undo toast、resync 与嵌套 |
| Card repository | 已定义公开接口，并提供内存实现；Desktop 学习使用 Card Topic 投影 |
| 普通用户制卡 UI | 已实现快捷输入、slash menu、选择气泡菜单和方向元素菜单 |
| Review history、评分、FSRS、持久化 | 已由 Desktop 与 editor-storage 接入；本文件只描述 editor 边界 |

## 设计边界

Card 系统把协作内容、出题定义、Card Topic、可复习 Card 和个人学习状态分开：

```text
Regular Topic / Source Block
  -> Card Definition / Highlight source
     -> Card Topic child (synced or detached)
        -> projectCardTopicCards()
           -> CardPreview / CardSurface / Review Target
              -> Learning State and FSRS
```

- Source Block 与 Card Definition 是 regular Topic 文档的一部分，随 Loro 内容协作和编辑。
- 每个 Basic/List/Set Definition、ClozeGroup、连续 inline Highlight 和 block Highlight 都创建一个直接 child Card Topic。Bidirectional Definition 仍只创建一个 Basic Card Topic，但该 Topic 可投影出两个方向的 Card。
- Card Topic 只保留来源选中的片段：Basic/List/Set 保留对应定义内容，Cloze 只保留该 group，Highlight 只保留连续高亮区或整个高亮 Block。Card/Cloze/Highlight authoring 样式在 child editor 中隐藏，其他富文本样式保留。
- regular Topic 自身不进入 learning queue，也不提供 Preview；其子 Card Topic 是唯一的 Preview、queue、review 和 rating 来源。
- Card 是从 Card Topic 文档投影得到的独立复习单位，使用显式、稳定的 CardID。Review history、due、stability 和 difficulty 不属于 editor 文档。
- Card Topic 仍是 `RegularTopic`：`cardSource` 记录 `kind`、来源 `sourceId`、来源 Topic 和 `syncStatus`。Card Topic 可以继续包含嵌套 authoring source，并在当前 child 下创建 grandchild Card Topic。

### 身份不变量

以下身份不能互相替代：

| 身份 | 含义 |
| --- | --- |
| `sourceBlockId` | Card 来源 Block 的稳定身份；相同值组成 Sibling Group，包括嵌套 Card Topic 投影 |
| `definitionId` | 一条制卡定义的身份；双向卡的两个方向共用它 |
| `CardID` | 一个可独立复习、独立调度的 Card 身份 |
| `ClozeGroup` | 当前 Cloze Card 一起隐藏和揭示的 anchors |
| List item `blockId` | List/Set 直接子项的来源身份 |
| `CardTopic.id` | Note 树中承载 Card 投影的 child Topic 身份 |
| `CardTopicSource.sourceId` | 来源定义、ClozeGroup 或 Highlight 区域的稳定身份 |

普通内容编辑不应重新生成 CardID。以后接入复习历史时，历史必须关联 CardID，而不是 Block 顺序、分隔符位置或临时的 Cloze 序号。

## Card Topic ownership 与同步

`projectEditorCards(document)` 先把一个 Topic 文档解析为 authoring Card projection；`projectCardTopicDefinitions(document)` 再按以下粒度规划 child Topic：

| 来源 | Card Topic 数量 |
| --- | --- |
| 每个 Basic/List/Set Definition | 1 |
| 每个 ClozeGroup | 1 |
| 每个连续 inline Highlight | 1 |
| 每个 block Highlight | 1 |

新建的 Card Topic 默认是 `synced`，直接位于来源 Topic 下，标题取来源片段文本的前 20 个 Unicode 字符。来源 Topic 的内容变化会更新 synced child 的选中内容和标题；这一步不会修改 CardID 或学习历史。

编辑 synced Card Topic 会立即把它标为 `detached`，保留用户编辑，并通过 toast 告知用户。toast 的 Undo 按钮执行 `resyncCardTopic()`：用当前来源片段覆盖 child 内容、更新标题并恢复 `synced`。来源定义被删除或不再能投影时，child 不删除，而是自动变为 `detached`；detached child 不再响应来源变化，但仍可 Preview、进入队列和评分。来源不存在时不能 resync。

Card Topic 的 synced 与 detached 状态使用不同的特殊 inspector icon。Card Topic 的 child editor 隐藏 delimiter、Cloze/Highlight 外观和 Card hover controls；regular Topic 的原 authoring 样式保持不变，但 regular Topic 的 Card Preview 入口关闭。Cloze 与 Highlight 可以互相嵌套，其他 Card authoring source 也沿用同一规则在当前 Card Topic 下继续创建孙 Topic。

## Basic、Reverse 与 Bidirectional

### 文档表示

Basic Definition 是 Source Block 富内容中的 `cardDelimiter` inline 节点：

```text
[delimiter 之前的富内容] [cardDelimiter] [delimiter 之后的富内容]
```

节点属性为：

```ts
interface CardDelimiterAttrs {
  backwardCardId: string | null
  definitionId: string
  direction: 'forward' | 'backward' | 'both' | 'disabled'
  forwardCardId: string | null
}
```

分隔符两侧保存的是完整 `NodeJSON[]`，不是仅用于显示的纯文本，因此可以保留文本 marks、Highlight、公式、图片和其他 Preview 支持的富内容。

### 投影规则

假设编辑器内容是：

```text
H₂O ↔ Water
```

各方向的投影如下：

| Definition 方向 | CardID | Front | Back |
| --- | --- | --- | --- |
| `forward` | `forwardCardId` | 分隔符之前 | 分隔符之后 |
| `backward` | `backwardCardId` | 分隔符之后 | 分隔符之前 |
| `both` | 两个 CardID | 分别按以上两个方向生成 | 分别按以上两个方向生成 |
| `disabled` | 无 | 不投影 | 不投影 |

Bidirectional 是一个 Definition 产生两个 Card，不是一张 Card 在复习时随机交换方向。两个 Card 共享 `definitionId`，但必须拥有不同的稳定 CardID。

Basic Card 的投影类型为：

```ts
interface BasicEditorCardProjection {
  back: readonly NodeJSON[]
  blockHighlight: HighlightColor | null
  definitionId: string
  direction: 'forward' | 'backward'
  front: readonly NodeJSON[]
  id: string
  kind: 'basic'
  sourceBlockId: string
}
```

### 创建命令

安装 `defineCardExtension()` 的 ProseKit editor 可以调用：

```ts
editor.commands.insertBasicCard({ direction: 'forward' })
editor.commands.insertBasicCard({ direction: 'backward' })
editor.commands.insertBasicCard({ direction: 'both' })
```

命令会在当前 selection 插入 `cardDelimiter`，创建新的 `definitionId`，并为启用的方向创建 CardID。默认 ID 生成器是 `crypto.randomUUID()`。

需要确定性 ID 的独立 editor 或开发环境可以注入生成器：

```ts
const extension = defineCardExtension({
  createId: () => nextStableId(),
})
```

普通用户也可以输入以下精确触发符：

```text
:->␠   Basic
:-<␠   Reverse
:<>␠   Bidirectional
```

输入规则把完整触发符替换为可选择的方向元素。转换后的第一次 Backspace 使用 ProseMirror `undoInputRule` 恢复原始输入，包括末尾空格；发生其他编辑后，Backspace 按普通原子节点删除行为处理。

Slash menu 同样提供 Basic、Reverse 和 Bidirectional Card。常态下方向元素是 Card 的持续标记，不给整个 Card 添加永久外框。选择方向元素后，插件按 `DefinitionID` 给 source 和显式 member blocks 添加低对比度背景与内描边，并显示贴近来源位置的 Card menu；失焦后范围强调消失。方向按钮复用已有 CardID，仅在第一次启用新方向时创建对应 CardID；Set/List 按钮用于转换或更新 Multi-line answer。

```ts
editor.commands.setCardDirection({ direction: 'forward' })
editor.commands.setCardDirection({ direction: 'backward' })
editor.commands.setCardDirection({ direction: 'both' })
editor.commands.setCardDirection({ direction: 'disabled' })
```

## Cloze

Cloze 只有两条 authoring 路径。

### RichContentCloze

`rich-content` anchor 属于 Block 的富内容选区。它可以覆盖普通文字和其他 inline 内容；把一个完整公式作为富内容元素选中时，也走这条路径。

```ts
editor.commands.addCloze({
  anchorKind: 'rich-content',
})
```

该命令要求非空 selection，selection 的两个端点必须属于同一个 Source Block；跨 Source Block 的富内容选区会返回 `false`。它也拒绝 selection 端点位于 `mathInline` 或 `mathBlock` source 内部的情况。

### MathSourceCloze

`math-source` anchor 只处理一个 `mathInline` 或 `mathBlock` 节点内部的 LaTeX source 局部选区：

```ts
editor.commands.addCloze({
  anchorKind: 'math-source',
})
```

selection 的起点和终点必须位于同一个公式 source 中；跨公式、跨 inline/block 公式或从公式内部选到公式外部会返回 `false`。

普通用户进入公式源码编辑状态后，选中一段非空 LaTeX source，会出现专用的 `Formula selection` 工具条。行内公式的工具条显示在公式旁边，并根据视口剩余空间自动切换到左侧；块公式的工具条显示在公式右上角。该状态不会同时显示普通文字的 Heading、Bold、Link 等气泡菜单。

工具条中的 `Cloze` 会创建 `math-source` anchor；如果当前选区已经属于 MathSourceCloze，同一位置显示 `Remove Cloze`。按钮按下时会保留并恢复公式内的精确 source selection，避免焦点转移到工具条后错误地对公式外内容执行命令。

Preview 隐藏 MathSourceCloze 时只替换选中的 LaTeX source 片段，公式其余内容仍通过 KaTeX 排版。authoring 发生在 regular Topic；正式 Preview 入口由对应 Cloze Card Topic 提供，不再由 regular Topic 内的眼睛按钮提供。

### Mark 与分组

两条路径都写入相同的 `cloze` mark 属性：

```ts
interface ClozeMarkAttrs {
  anchorKind: 'rich-content' | 'math-source'
  cardId: string
  definitionId: string
  groupId: string
}
```

普通富内容选区通过通用气泡菜单中的 `Cloze` 创建 RichContentCloze；公式源码局部选区通过上述公式专用工具条创建 MathSourceCloze。两条路径都没有额外的 “New Cloze Card” 步骤，再次选择已应用的 Cloze 可移除它。

创建后，Cloze 所在 Source Block 与 Basic Card 使用同一套 hover Card scope 和玻璃材质。一个 Source Block 中的多个独立 Cloze 按各自 ClozeGroup 创建不同的 child Card Topic，不因共享 Source Block 而合并。Cloze Card Topic 只复制该 group 的 anchors，并隐藏 Cloze authoring 外观；其 Preview 仍将同组 anchors 一起隐藏、一起揭示。

不传 `identity` 时，每次命令创建新的 Definition、ClozeGroup 和 CardID。要把多个选区合并为同一张 Cloze Card，应对每次命令传入同一个 identity：

```ts
const identity = {
  cardId: 'card-euler',
  definitionId: 'definition-euler',
  groupId: 'group-euler',
}

editor.commands.addCloze({
  anchorKind: 'rich-content',
  identity,
})

editor.commands.addCloze({
  anchorKind: 'math-source',
  identity,
})
```

这样普通富内容与公式 source 片段会投影为同一张 Card，并在 Preview 中一起隐藏、一起揭示。

共享一个 CardID 的 anchors 必须具有一致的 `definitionId` 和 `groupId`，并位于同一个 Source Block。反向约束同样成立：一个 DefinitionID 只能映射到一个 CardID 和一个 ClozeGroup。违反任一方向的身份一致性或产生重复 CardID 时，投影或 repository 会明确报错。

## ListCard 与 SetCard

Single-Line 和 Multi-Line 复用同一个 `cardDelimiter`、DefinitionID 和方向 CardID。Multi-Line 不在父 Block 上保存第二份方向或 `cardMode`：

```text
Source Block: prompt + cardDelimiter
├── ordinary child
├── child with cardItemDefinitionId = delimiter.definitionId
├── child with cardItemDefinitionId = delimiter.definitionId
└── ordinary child
```

成员 Block 的 Card 属性为：

```ts
interface CardBlockAttrs {
  blockHighlight: HighlightColor | null
  cardItemDefinitionId: string | null
}
```

以下三个状态互相独立：

```text
是父 Block 的 direct child
≠ 是该 Definition 的 Card answer member
≠ 使用 ordered-list presentation
```

投影只选择 `cardItemDefinitionId === delimiter.definitionId` 的 direct children。普通缩进 children 即使是 numbered list，也不会自动进入 Card Back。成员继续使用普通 Editor Block 和原有内容节点；其 `blockId` 是稳定的 item identity。

所有显式成员都是 `ordered` 时投影为 ListCard；所有成员都是非 `ordered` 时投影为 SetCard。混合状态属于损坏的文档不变量，投影会明确报错，而不是猜测父 Block 的模式。

```ts
editor.commands.setCardPresentation({ presentation: 'set' })
editor.commands.setCardPresentation({ presentation: 'list' })
editor.commands.addBlockToCardBack()
editor.commands.removeBlockFromCardBack()
```

第一次把 Inline Card 转为 Set/List 时，delimiter 后的 inline answer 会被无损移动到第一个 member child，方向 Definition 和 CardID 不变。后续 Set/List 切换只更新显式成员的普通 list presentation。

Document 模式仍禁止普通 `outline` Block 随意缩进，但 Card 提供语义路径：

- 在方向元素后按 Enter，创建第一个 member child 并进入编辑。方向元素与光标之间可以有任意数量的纯空白；这些分隔空白会被移除，光标后的富内容会无损进入答案 member。
- 新建 Set member 继承 Source Block 的非 ordered `kind`；后续 Enter 继承当前 member 的 `kind`。通过 Tab / `Add to Card Back` 加入已有非 ordered Block，或再次选择 Set presentation，都保留其 outline、bullet、task 或 toggle 类型，不再统一改成 bullet。
- 唯一的非 ordered member 在其 textblock 开头按 Backspace，会折叠回 delimiter 后的单行答案；DefinitionID、方向 CardID 和光标位置保持稳定。
- 折叠时，Answer 的 whole-block Highlight 会迁移到剩余的 Source Block；task member 的状态与计时会按普通任务解除列表的规则保存为 `taskHistory`。若 Source 与 Answer 的 Highlight、task history 或 textblock 语义冲突，Backspace 不修改文档，避免静默丢失数据。
- Card source 后紧邻的 Document Block 按 Tab，等价于 `Add to Card Back`：建立 parent/child 关系并写入 membership。
- direct member 中按 Enter，正常产生同级列表项并继承 membership。
- member 缩进为另一个 member 的 child，或 Shift-Tab 离开 Card source 后，membership reconciliation 会清除已经失效的直接成员关系。
- 删除方向元素后，失去对应 Definition 的 membership 也会被清除；内容 Block 本身仍保留。

因此 Card 是普通 Editor 内容之上的元数据，不是 Card-only 内容容器。代码块、公式、图片、表格、嵌套列表、marks 和其他已支持元素在成员中继续使用原有编辑行为。

### Preview 行为

- Forward ListCard：先显示父 prompt，interactive 模式每次点击只揭示下一个 item。
- Forward SetCard：先显示父 prompt，点击一次揭示所有 items。
- Backward List/Set：先显示所有 items，点击后揭示父 prompt。
- `back` 模式直接显示完整答案；逐项 reveal index 只属于当前 React Preview session。

正式 Learning 已持久化 main/item Review Events 和 Learning State。Forward List 按顺序收集每个 item 的四级评分；Forward Set 记录遗忘项并批量评分；困难 item 可形成 Partial Review，但 Partial 不是新的 Card Definition、Card Topic 或 CardID。完整 Multi-line rating 与 Undo 都以原子事务提交。

## Highlight

支持颜色：

```ts
type HighlightColor
  = | 'yellow'
    | 'green'
    | 'blue'
    | 'pink'
    | 'orange'
    | 'purple'
```

Inline Highlight 是富文本 mark：

```ts
editor.commands.setInlineHighlight({ color: 'yellow' })
editor.commands.removeInlineHighlight()
```

Whole-block Highlight 是最近 Block 的 `blockHighlight` attribute：

```ts
editor.commands.setBlockHighlight({ color: 'blue' })
editor.commands.removeBlockHighlight()
```

两种 Highlight 都保留原 authoring 样式，并各自生成 Highlight Card Topic：每个连续 inline Highlight 区域一个，每个 whole-block Highlight 一个。child 只包含该高亮片段或 Block，且隐藏 Highlight authoring 外观，其他 marks 与富内容样式保留。

Highlight Card 没有背面或 reveal 步骤；Preview 直接显示片段，正式 Review 打开时立即允许使用 Again、Hard、Good、Easy 评分。其 CardID 分别来自 inline Highlight ID 或 block Highlight ID。

## 投影 Card Topics 与 Cards

`projectEditorCards()` 是从规范化文档解析 Card authoring 语义的底层函数：

```ts
import { projectEditorCards } from '@memorilo/editor'

const cards = projectEditorCards(document)
```

输入必须是：

- 根节点类型为 `doc`；
- 根节点 children 和嵌套 Block 的类型为规范化 `list`；
- 每个参与投影的 Block 都具有非空 `blockId`；
- 启用的 Card Definition 具有对应方向的 CardID。

返回值是以下 union：

```ts
type EditorCardProjection
  = | BasicEditorCardProjection
    | ClozeEditorCardProjection
    | HighlightEditorCardProjection
    | MultiLineEditorCardProjection
```

投影函数不会吞掉损坏的身份或文档结构。缺少 CardID、重复 CardID、不一致的 Cloze identity、非法颜色和没有 items 的 Multi-line Card 都应由调用边界显式处理。

Note 层使用另外两个公开函数建立 ownership：

```ts
import {
  projectCardTopicCards,
  projectCardTopicDefinitions,
} from '@memorilo/editor/note'

const definitions = projectCardTopicDefinitions(sourceDocument)
const ownedCards = projectCardTopicCards(cardTopicDocument, cardTopicSource)
```

- `projectCardTopicDefinitions()` 按 Definition/ClozeGroup/Highlight identity 去重并生成 child Topic 所需的 fragment、kind 和 sourceId。
- `projectCardTopicCards()` 只返回当前 Card Topic 的 `cardSource` 所拥有的 Card。Basic/List/Set 按 DefinitionID 过滤，Cloze 按 ClozeGroup 过滤，Highlight 按 Highlight ID 过滤。
- main process 只能把 `ownedCards` 交给 learning reconciliation；不得把无 `cardSource` 的 regular Topic 的 `projectEditorCards()` 结果直接加入队列。

## 显示 Preview

```tsx
import { CardPreview } from '@memorilo/editor'

<>
  <CardPreview card={card} mode="front" />
  <CardPreview card={card} mode="back" />
  <CardPreview card={card} mode="interactive" />
  <CardPreview appearance="embedded" card={card} mode="interactive" />
</>
```

| mode | 行为 |
| --- | --- |
| `front` | 只显示题面或隐藏当前 Cloze |
| `back` | 显示完整答案 |
| `interactive` | 在组件 session 内通过按钮揭示答案 |

Basic 的 Back 保留 Front，并在分隔线后显示答案。Cloze Front 把当前 CardID 对应的全部 anchors 隐藏为缺口；Back 恢复内容。Preview 当前支持常用文本 marks、链接、inline Highlight、段落、标题、引用、代码、图片、表格、嵌套列表、tag 和 KaTeX 公式。

`appearance="embedded"` 移除 Preview 自身的外框、阴影和大尺寸 padding，供 Card menu 的锚定 Popup 复用真实投影而不产生嵌套 Card 容器。默认 `standalone` 外观保持独立 Preview 表面。

Desktop 的 regular Topic 关闭 Card menu/Cloze 眼睛中的 Preview 控件。打开 Card Topic 后，Topic 顶部提供 Preview 入口；Basic/Reverse 按实际方向显示，Bidirectional 可切换 Forward/Backward，ListCard 逐项揭示，SetCard 一次揭示，Highlight 直接显示且没有背面。Popup 处理视口边缘碰撞，点击外部、关闭按钮或按 Escape 均可关闭。

`CardPreview` 只负责显示和临时 reveal 状态，不提交 rating，也不计算下一次复习时间。Card menu 因此也不显示评分或 FSRS 操作。

## Repository 与 Card Topic reconciliation

Repository 公开契约为：

```ts
interface EditorCardRepository {
  getCard: (input: { cardId: string }) => Promise<EditorCardRecord | undefined>
  replaceTopicCards: (input: ReplaceTopicCardsInput) => Promise<void>
  searchCards: (input: EditorCardSearchInput) => Promise<readonly EditorCardRecord[]>
}
```

Record 在 Card projection 外层保留来源：

```ts
interface EditorCardRecord {
  card: EditorCardProjection
  noteId: string
  topicId: string
}
```

开发环境可使用内存实现：

```tsx
import {
  createMemoryEditorCardRepository,
  Editor,
} from '@memorilo/editor'

const repository = createMemoryEditorCardRepository()

const editor = (
  <Editor
    adapters={adapters}
    topic={topic}
    cards={{
      repository,
      onSyncError: ({ error, noteId, phase, topicId }) => {
        console.error('Card sync failed', {
          error,
          noteId,
          phase,
          topicId,
        })
      },
    }}
  />
)
```

传入 `cards` 后，独立 `Editor` 会在初始化和每次文档变化时：

1. 调用 `projectEditorCards(document)`；
2. 以 `noteId` 和 `topicId` 调用 `replaceTopicCards()`；
3. 通过 `onSyncError` 区分 `projection` 和 `repository` 错误。

同一个 repository 中，CardID 不能同时属于不同 Topic。内存 repository 还支持全文查询：

```ts
const record = await repository.getCard({ cardId })

const results = await repository.searchCards({
  query: 'Euler',
  noteId,
  topicId,
  limit: 20,
})
```

若不使用 React `Editor` 自动同步，也可以直接使用公开的 `createEditorCardSync()`：

```ts
const sync = createEditorCardSync({
  noteId,
  topicId,
  repository,
  onSyncError,
})

sync.schedule(document)
await sync.flush()
```

`schedule()` 会在调用时完成投影，并串行执行 repository writes；`flush()` 用于等待已安排的 writes 完成。

该 repository integration 仍是公开的 editor-only 能力，但 Desktop 生产路径不再把 regular Topic 直接同步为学习 Card。Desktop 在 Note mutation 中调用 `reconcileCardTopics()` 创建或更新 child Topics，再只 reconciliation 各 Card Topic 的 owned Card identity；Note projection 与 learning reconciliation 在同一 SQLite batch 中提交。

## 当前 authoring UI 边界

`createEditorExtension()` 默认安装 `defineCardExtension()`，公开 React `Editor` 已接入普通用户制卡入口：

- 输入 `:-> `、`:-< `、`:<> ` 创建 Basic、Reverse、Bidirectional；
- Slash menu 可创建三种方向的 Card、切换 Set/List、加入或移出 Card Back，以及设置 whole-block Highlight；
- selection bubble menu 可应用或移除 Cloze 和 inline Highlight；
- 选择方向元素后按 Definition 精确强调 source/member，并出现锚定 Card toolbar，可切换方向和 Set/List presentation；regular Topic 不再从这里打开 Preview；
- Document 模式下 Enter/Tab 只在 Card 语义成立时建立 answer membership，普通 Block 仍保持原有扁平规则。

当前尚未提供 ClozeGroup 的可视化合并/拆分控件。正式 review queue、四级 rating、FSRS、持久化 review history、Card Topic Preview、detach toast/Undo 和 synced/detached inspector icon 已接入 Desktop。方向元素可通过普通原子节点删除行为移除；`disabled` 方向目前仅作为底层 command 能力暴露。

## 持续验证

- `src/note/editor-note-card-topics.node.test.ts` 覆盖 Basic、List、Set、Cloze、inline Highlight、block Highlight 的 child 创建、选中 fragment、20 字标题、来源同步、编辑 detach、resync、来源删除保留，以及 Cloze/Highlight 双向嵌套。
- `apps/desktop/main/src/notes/child-topic-learning.integration.test.ts` 贯穿 Note 持久化、regular source Topic 队列排除、所有 child kind 的 new/learning/review/rate、Highlight 无背面、detached child 继续学习、nested grandchild 和来源删除后的评分。
- `apps/desktop/main/src/storage/main-database.test.ts` 固定验证 main database generation `1` 与当前数据库保留行为。

## 代码位置

| 文件 | 职责 |
| --- | --- |
| `src/card/card-extension.ts` | Card 节点、marks、Block attrs 与 commands |
| `src/card/card-model.ts` | 文档校验和 Card projection |
| `src/card/card-preview.tsx` | Front、Back 与 interactive Preview |
| `src/card/card-preview.stylex.ts` | Preview 样式 |
| `src/card/card-repository.ts` | Repository 契约和内存实现 |
| `src/card/card-sync.ts` | Topic 文档到 repository 的同步边界 |
| `src/note/card-topic-projection.ts` | 来源 fragment、Card Topic 标题与 owned Card projection |
| `src/note/editor-note-card-topics.ts` | synced/detached reconciliation、删除来源 detach 与 resync |

## 后续阶段

后续工作需要保持当前模块边界：

1. 实现 ClozeGroup 的可视化合并/拆分；
2. 完成从 Review 返回 Card Topic 与其来源 Topic/Block 的导航和编辑入口；
3. 补齐 suspend、manual bury/reset 等 Review 操作；
4. 实现远端个人学习同步与版本化导入导出。

当前 main schema generation 为 `1`；Card Topic 模型不改变该 generation。持久化细节记录在 [FSRS Learning System Design](../../docs/fsrs-learning-system.md)。
