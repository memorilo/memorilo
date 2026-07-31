# RemNote 文档式与大纲式编辑交互调研

调研日期：2026-07-31

## 范围与结论边界

本文只调查 RemNote 中与以下问题直接相关的交互：空文档如何开始写作、文档式无圆点书写与大纲式有圆点书写如何切换、如何从正文建立层级，以及切换时内容、焦点、选区与历史是否有官方保证。卡片编辑语义已经记录在 `docs/research/remnote-card-editor-interactions.md`，本文不重复。

结论分为三类：

- **官方明确说明**：RemNote 官方帮助中心正文直接定义的行为。
- **官方截图观察**：只能从官方帮助中心的截图、GIF 或其替代文字确认的界面，不视为稳定数据契约。
- **Memorilo 产品决策**：结合官方行为与本项目最终确定的动态模式、局部圆点和层级规则提出的方案，不声称 RemNote 本身如此实现。

本次没有找到 RemNote 官方资料对 `Hide Bullets` 切换时的 DOM 焦点、文本选区、撤销栈或光标恢复作出契约。因此这些项目必须明确标为未知，不能从截图补写成事实。

## 结论摘要

1. 本次可检索的 RemNote 官方资料没有把这组能力定义为两个对称、互斥的 `Document mode` / `Outline mode`。它把所有笔记都建模为 Bullet/Rem，并在 Document 上提供名为 **Hide Bullets** 的文档级模式；官方偶尔用 “go into outline mode” 描述在无圆点文档内重新建立有圆点层级的行为。[Hiding Bullets](https://help.remnote.com/en/articles/10113772-hiding-bullets)（访问于 2026-07-31）；[Documents and Folders](https://help.remnote.com/en/articles/6030703-documents-and-folders)（访问于 2026-07-31）
2. **官方截图观察**：新建入口已经表达了两种作者意图，Folder 的 `Create Notes` 菜单提供 `Bullets Document` 与 `No Bullet Document`。这比在已有内容上做不可见结构转换更接近 Memorilo 当前要解决的“空文档先选写作方式”。[Documents and Folders](https://help.remnote.com/en/articles/6030703-documents-and-folders)（访问于 2026-07-31）
3. `Hide Bullets` 不只是隐藏圆点的 CSS。它隐藏 Document 直接 children 的圆点，并改变 `Tab`、`Shift+Tab`、标题折叠与可建立的真实 parent/child 关系；因此 Memorilo 的两个模式也不应只有视觉差异。[Hiding Bullets](https://help.remnote.com/en/articles/10113772-hiding-bullets)（访问于 2026-07-31）
4. RemNote 允许在无圆点正文里就地进入局部大纲：直接 child 的行首输入 `-` 或 `*`，或按 `Tab`，该行会重新出现圆点；按 `Shift+Tab` 会再次隐藏。RemNote 的公开说明要求 parent 也有圆点；Memorilo 当前产品决策有意不采用这一限制，详见 5.3。[Hiding Bullets](https://help.remnote.com/en/articles/10113772-hiding-bullets)（访问于 2026-07-31）
5. RemNote 官方允许对已有 Document 随时开关 `Hide Bullets`，并没有“只在空文档可切换”的限制。只在空文档提供全局模式选择是 Memorilo 的产品约束，不是要逐字复制的 RemNote 行为。[Documents and Folders](https://help.remnote.com/en/articles/6030703-documents-and-folders)（访问于 2026-07-31）；[Hiding Bullets](https://help.remnote.com/en/articles/10113772-hiding-bullets)（访问于 2026-07-31）
6. Memorilo 最终采用同一份 Topic 内容上的两层策略：标题栏可随时切换整个编辑器的 `Document` / `Outline` 展示与交互策略；在 Document 中，顶层无圆点块可用 `Tab` 变成有圆点块，有圆点叶子可用 `Shift+Tab` 恢复无圆点。模式切换复用同一编辑器实例，局部圆点变化则是正常的内容事务；这是基于调研作出的产品决策。

## 1. RemNote 实际拥有的模型

### 1.1 底层始终是 Bullet 层级

RemNote 官方称“everything is a bullet”。每个 Bullet 最多有一个 parent，并可有任意数量的 children；Document、Folder 等也只是通常以不同方式显示的 Bullet，而不是另一套正文数据结构。[Bullets](https://help.remnote.com/en/articles/8017859-bullets)（访问于 2026-07-31）

RemNote 同时称自己是 “fundamentally an outline-based note-taking tool”：Document 由可缩进形成层级的一系列 Bullet 构成。`Enter` 创建新 Bullet，`Tab` 缩进，`Shift+Tab` 反缩进；层级可无限嵌套。[5-Minute Editor Overview](https://help.remnote.com/en/articles/6030541-5-minute-editor-overview)（访问于 2026-07-31）；[Outlines and Terminology](https://help.remnote.com/en/articles/8196578-outlines-and-terminology)（访问于 2026-07-31）

Document 也是普通 Bullet 的显示与导航属性：任何 Bullet 可以在任意层级被标记或取消标记为 Document，并成为经常 zoom into 的页面。官方明确说用户不必在开始记笔记前就永久决定它是否为 Document。[Documents and Folders](https://help.remnote.com/en/articles/6030703-documents-and-folders)（访问于 2026-07-31）

### 1.2 官方名称是 Hide Bullets，不是对称模式对

当用户 zoom into 一个 Document 时，可在页面右上角的 `Document Style` 菜单中切换 `Hide Bullets`。该菜单还包括 `Add Icon`、`Mark as Document` 和 `Wide Layout`。[Documents and Folders](https://help.remnote.com/en/articles/6030703-documents-and-folders)（访问于 2026-07-31）

官方专门把它称作 **Hide Bullets mode on Documents**，并说明它不仅隐藏圆点，还改变编辑器行为以改善 long-form writing。本次可检索的帮助中心资料没有定义一个对应的、同等级命名的 `Show Bullets mode` 或 `Document mode`；`outline mode` 只在解释用户仍可用 `Tab` 建立更多圆点层级时出现。[Hiding Bullets](https://help.remnote.com/en/articles/10113772-hiding-bullets)（访问于 2026-07-31）；[Documents and Folders](https://help.remnote.com/en/articles/6030703-documents-and-folders)（访问于 2026-07-31）

因此，把 RemNote 描述为“在两份文档模型间切换”是不准确的。更准确的说法是：同一套层级化 Bullet 内容，附加一个 Document 级无圆点写作策略，并允许其中局部行恢复大纲行为。这是对上述官方事实的归纳。

## 2. 空文档与新建入口

### 2.1 官方明确说明

RemNote 的基础入门流程是：用户从侧栏 `Create` 新建 Document，进入后直接开始输入；默认教学把它描述成 outline notes，`Enter` 创建新 Bullet，`Tab` 缩进。[RemNote in 5 Minutes](https://help.remnote.com/en/articles/6044066-remnote-in-5-minutes)（访问于 2026-07-31）

无论是否为空，Document 已创建后仍可通过 `Document Style > Hide Bullets` 修改显示与编辑策略。官方没有要求文档为空，也没有描述因为已有内容而禁用该 toggle。[Documents and Folders](https://help.remnote.com/en/articles/6030703-documents-and-folders)（访问于 2026-07-31）；[Hiding Bullets](https://help.remnote.com/en/articles/10113772-hiding-bullets)（访问于 2026-07-31）

### 2.2 官方截图观察

Folder 内 `Create Notes` 菜单的官方截图替代文字列出 `Bullets Document`、`No Bullet Document` 和 `Handwritten Document`。这可以确认 2026-07-31 所见产品界面把有圆点和无圆点 Document 作为两个直接的新建选择，但截图不构成内部存储或兼容性契约。[Documents and Folders](https://help.remnote.com/en/articles/6030703-documents-and-folders)（访问于 2026-07-31）

`Document Style` 的官方截图替代文字显示，该菜单位于已打开 Document 的右上角，以 smiley-face icon 触发；`Mark as Document`、`Hide Bullets` 和 `Wide Layout` 以 toggle 形式出现。[Documents and Folders](https://help.remnote.com/en/articles/6030703-documents-and-folders)（访问于 2026-07-31）；[Hiding Bullets](https://help.remnote.com/en/articles/10113772-hiding-bullets)（访问于 2026-07-31）

### 2.3 官方没有说明的空状态细节

当前官方资料没有说明以下细节：

- 一个刚创建的顶层空 Document 是否在画布中央显示 `Bullets` / `No Bullets` 二选一控件；
- 未作选择时是否存在默认值，以及默认值是否继承 Folder、账户或上一次选择；
- 空 Document 的首个可编辑 Rem 是预先持久化的空 child，还是获得输入后才创建；
- 用 `Document Style` 切换时，焦点是否仍在空行、caret 的精确位置如何恢复；
- 切换是否进入 `Cmd/Ctrl+Z` 历史，或能否通过 Undo 恢复；
- 切换时已有文本选区、多 Bullet 选择、IME composition 如何处理。

这些行为不能依据帮助中心截图猜测。实现 Memorilo 时应将其作为本产品契约单独定义。

## 3. Hide Bullets 的详细编辑行为

### 3.1 圆点的作用范围

启用 `Hide Bullets` 后，Document 的**直接 children**不显示圆点。官方并没有说所有 descendants 都隐藏圆点，且后续说明允许在正文中恢复有圆点层级，因此不能把该开关实现成递归隐藏所有 marker。[Hiding Bullets](https://help.remnote.com/en/articles/10113772-hiding-bullets)（访问于 2026-07-31）；[Documents and Folders](https://help.remnote.com/en/articles/6030703-documents-and-folders)（访问于 2026-07-31）

对单个或多个 Bullet，RemNote 另有 `Bullet List` / `No Bullet List` 命令，可通过 slash menu 或 Omnibar 执行；`/bl` 与 `/nbl` 是短码。单个无圆点 note 上按 `Enter`，新行也继续无圆点，从而可以连续写若干正文行。[Hiding Bullets](https://help.remnote.com/en/articles/10113772-hiding-bullets)（访问于 2026-07-31）

文档级 `Hide Bullets` 与逐 Bullet 的 `No Bullet List` 是官方列出的两种不同入口。前者带有专门的 long-form 结构规则，后者只是更灵活地切换所选 note 的 marker；不应在没有更多证据时假设两者存储方式完全相同。[Hiding Bullets](https://help.remnote.com/en/articles/10113772-hiding-bullets)（访问于 2026-07-31）

### 3.2 从正文进入大纲

在 `Hide Bullets` Document 的直接 child 上，行首输入 `-` 或 `*`，或按 `Tab`，会让该 note 的圆点重新出现。按 `Shift+Tab` 会再次隐藏该圆点。[Hiding Bullets](https://help.remnote.com/en/articles/10113772-hiding-bullets)（访问于 2026-07-31）

这不是单纯的 marker toggle：无圆点 note 不能拥有真正缩进在它下面的 notes；只有有圆点的 note 可以缩进到另一个有圆点的 note 下。官方另行说明标准 outline 中 `Tab` 每次只能缩进一级，并且必须存在合法的前一层级 Bullet。[Hiding Bullets](https://help.remnote.com/en/articles/10113772-hiding-bullets)（访问于 2026-07-31）；[Outlines and Terminology](https://help.remnote.com/en/articles/8196578-outlines-and-terminology)（访问于 2026-07-31）

因此，RemNote 的 long-form 文档允许用户从无圆点正文自然长出一个局部 outline，但不把上一段普通正文变成该 outline 的 parent。这是调研得到的 RemNote 行为，不再作为 Memorilo 的层级约束。

### 3.3 Heading 是视觉 section，不是 parent

在 `Hide Bullets` 中，Heading 可以按 heading size 折叠同级后续内容：例如 H2 折叠到下一个 H2 或 H1 之前，但不会吞掉后续同级或更大的 Heading。官方把它解释为类似传统非 outliner 编辑器的 section。[Hiding Bullets](https://help.remnote.com/en/articles/10113772-hiding-bullets)（访问于 2026-07-31）

被 Heading 视觉折叠的内容仍与 Heading 处在同一真实层级，不是它的 children。因此 Heading 不会自动出现在后续 Flashcard 的 ancestor context 或 breadcrumb 中；即使用户按 `Tab` 让后续 note 显示圆点，也不改变这一事实。[Hiding Bullets](https://help.remnote.com/en/articles/10113772-hiding-bullets)（访问于 2026-07-31）

### 3.4 标准大纲中的层级和移动

标准大纲里，`Tab` 将当前 Bullet 变成上方 Bullet 的 subpart；`Shift+Tab` 将它提升一级。默认 outliner-style outdent 会必要时重新安排行顺序，以避免无意改变周围 Bullet 的 parent/child 关系；设置中可改成 Google-Docs Style。[Outlines and Terminology](https://help.remnote.com/en/articles/8196578-outlines-and-terminology)（访问于 2026-07-31）

Bullet 可通过拖拽移动，左右移动鼠标决定落点缩进；也可用 `Alt/Opt+Up/Down` 交换顺序，或用 Move 命令更换 parent。[5-Minute Editor Overview](https://help.remnote.com/en/articles/6030541-5-minute-editor-overview)（访问于 2026-07-31）；[Moving Notes & Organizing Hierarchies](https://help.remnote.com/en/articles/6030548-moving-notes-organizing-hierarchies)（访问于 2026-07-31）

这些标准大纲行为不能直接推广到 `Hide Bullets` 的普通无圆点行，因为后者明确禁止无圆点 note 成为真实 parent。[Hiding Bullets](https://help.remnote.com/en/articles/10113772-hiding-bullets)（访问于 2026-07-31）

## 4. 内容、焦点、Selection 与历史

| 问题 | RemNote 官方可确认 | 证据边界 |
| --- | --- | --- |
| 切换是否转换文字内容 | `Hide Bullets` 被定义为 Document Style/模式，直接 children 的 marker 与部分编辑行为改变；官方没有描述文本重写或创建另一份 Document。[Documents and Folders](https://help.remnote.com/en/articles/6030703-documents-and-folders)（访问于 2026-07-31） | 可以确认它不是纯 CSS，但不能从公开资料证明内部 transaction/schema。 |
| 已有内容能否开关 | 菜单对 Document 提供 toggle，官方未加空文档限制。[Hiding Bullets](https://help.remnote.com/en/articles/10113772-hiding-bullets)（访问于 2026-07-31） | 没有逐一说明复杂既有层级在开关后的所有边界。 |
| 空内容初始选择 | Folder 新建菜单有 `Bullets Document` / `No Bullet Document`。[Documents and Folders](https://help.remnote.com/en/articles/6030703-documents-and-folders)（访问于 2026-07-31） | 没有证据证明编辑画布内存在专门空状态 chooser。 |
| 切换后的 DOM/编辑器 focus | 未说明 | 不应声称 RemNote 保持或重置 focus。 |
| caret / 文本 selection | 未说明 | 不应从 GIF 中推断 selection mapping。 |
| 多 Bullet selection | RemNote 支持 `Shift+Up/Down` 选择多个 Bullets，并可通过 Omnibar 批量操作。[Moving Notes & Organizing Hierarchies](https://help.remnote.com/en/articles/6030548-moving-notes-organizing-hierarchies)（访问于 2026-07-31）；[Hiding Bullets](https://help.remnote.com/en/articles/10113772-hiding-bullets)（访问于 2026-07-31） | 没有说明切换文档级模式时该选择是否保留。 |
| Undo / Redo | 本次一手资料未说明 `Hide Bullets` 是否进入 undo history | 不应假设 `Cmd/Ctrl+Z` 能撤销该设置，也不应假设它与文字共用历史。 |
| 浏览/导航历史 | 未说明 | `Document Style` toggle 与 browser back 的关系未知。 |

## 5. Memorilo 的实现决策

以下全部是 **Memorilo 产品决策**，不是 RemNote 官方事实。

### 5.1 产品模型

将 `Document` / `Outline` 视为同一份 Topic 内容的两种编辑策略，不转换或复制编辑器内容。模式值由 Topic editor session 持有；切换时继续使用同一个 ProseMirror view、Loro 文档和同步插件。

模式切换不受内容是否为空限制，也不批量改写已有块的 `kind`。Document 中的局部圆点属于块自身结构：用户只对当前顶层块执行显式 `Tab` / `Shift+Tab` 时，才在 `outline` 与 `bullet` 间转换；拖拽永远不创建圆点。

### 5.2 模式控件

Topic 打开后，标题栏提供紧凑的 `Document` / `Outline` 分段控件。它对空和非空内容均可用，并通过 `aria-pressed` 暴露当前状态。

两个选项的文案应描述写作模型，而不是技术实现：

- `Document`：无默认 outline marker；已有 marker 的语义列表可按列表规则 reparent，无 marker 的普通正文拖拽只做同层排序。
- `Outline`：显示节点 marker，允许层级、折叠、focus 与结构拖动。

切换复用同一个 editor view/session，并保持 editor focus 与块内 selection。指针点击控件不把焦点移出编辑器；键盘用户仍可正常聚焦并激活控件。

### 5.3 Document 的键盘和拖动规则

- 顶层无圆点块按 `Tab`：只把当前块转换为 `bullet`，不改变层级。
- 顶层 `bullet` 叶子按 `Shift+Tab`：恢复为无圆点 `outline` 块。
- 拥有 child 的顶层 `bullet` 按 `Shift+Tab`：保持圆点，避免产生“无圆点 parent”。
- `bullet`、`ordered`、`task`、`toggle` 可通过 `Tab` 缩进到前一个普通无圆点块或语义列表块下；parent 的 marker 不随之改变。
- 已嵌套的语义列表块按 `Shift+Tab` 执行既有反缩进规则。
- Handler 拖动与 `Tab` / `Shift+Tab` 使用相同的层级条件：已有 marker 的语义列表块可缩进到普通无圆点块或语义列表块下，也可拖回更高层级。
- Handler 拖动的唯一差异是不能创建 marker：无 marker 的 `outline` source 只允许在当前 parent 内排序，不会因横向拖动变成 `bullet`。

这些规则保留 RemNote “无圆点直接 child 用 `Tab` 恢复圆点”的入口，但有意允许 Memorilo 的无圆点块成为已有 marker 列表块的 parent。[Hiding Bullets](https://help.remnote.com/en/articles/10113772-hiding-bullets)（访问于 2026-07-31）

Outline 模式仍使用原有键盘和层级拖动实现，不经过上述 Document policy。

### 5.4 Selection、Undo 与保存契约

建议明确以下 Memorilo 契约：

- 模式切换时编辑器保持 focus 和当前 selection。
- 模式切换不改写内容，因此不进入 ProseMirror/Loro 内容历史。
- `Tab` / `Shift+Tab` 引起的块 `kind` 变化是内容事务，可由 Loro editor history 撤销和重做。
- 模式切换不卸载编辑器，不替换同步插件，也不另建 Loro 文档。

### 5.5 建议验收状态表

| 初始状态 | 用户操作 | 结果 |
| --- | --- | --- |
| 任意内容 + Document | 点击 `Outline` | 同一 editor/session 切到 Outline；内容、focus、selection 保持 |
| 任意内容 + Outline | 点击 `Document` | 同一 editor/session 切到 Document；不产生内容事务 |
| 顶层无圆点块 + Document | `Tab` | 当前块显示圆点，仍处于根层级 |
| 顶层 bullet 叶子 + Document | `Shift+Tab` | 当前块隐藏圆点，仍处于根层级 |
| 顶层 bullet parent + Document | `Shift+Tab` | 保持圆点及 children |
| 语义列表块 + 前一个无圆点块 + Document | `Tab` | 列表块成为前一块的 child；parent 保持无圆点 |
| 有 marker 的语义列表块 + Document | Handler 层级拖动 | 与 `Tab` / `Shift+Tab` 相同，可建立或解除 parent/child；marker kind 保持不变 |
| 无 marker 的普通块 + Document | Handler 拖动 | 不创建 `bullet`，只允许在当前 parent 内排序 |
| 任意内容 + Outline | `Tab` / `Shift+Tab` / Handler | 保持原有 Outline 行为 |

## 6. 后续设计仍需产品确认

1. 新建 Note 的默认模式是 `Document`、`Outline`，还是继承上一次选择。RemNote 的基础教学偏向 Bullets，但也提供 `No Bullet Document` 创建入口；官方资料没有提供可照搬的默认继承规则。
2. 模式偏好最终属于整个 Note、当前 Topic，还是每个打开视图。当前实现跟随 Topic editor session；RemNote 的 `Hide Bullets` 是 Document 级设置，但 Memorilo 的 Note/Topic 边界不同，不能直接类推。
3. 是否补充 `-` / `*` input rule，让 Document 顶层无圆点块也能通过文本触发恢复圆点。当前范围只实现明确要求的 Tab/Shift-Tab 与 Handler 行为。

## 主要一手资料

- [Hiding Bullets](https://help.remnote.com/en/articles/10113772-hiding-bullets)（RemNote Help Center，访问于 2026-07-31）
- [Documents and Folders](https://help.remnote.com/en/articles/6030703-documents-and-folders)（RemNote Help Center，访问于 2026-07-31）
- [Bullets](https://help.remnote.com/en/articles/8017859-bullets)（RemNote Help Center，访问于 2026-07-31）
- [Outlines and Terminology](https://help.remnote.com/en/articles/8196578-outlines-and-terminology)（RemNote Help Center，访问于 2026-07-31）
- [5-Minute Editor Overview](https://help.remnote.com/en/articles/6030541-5-minute-editor-overview)（RemNote Help Center，访问于 2026-07-31）
- [Moving Notes & Organizing Hierarchies](https://help.remnote.com/en/articles/6030548-moving-notes-organizing-hierarchies)（RemNote Help Center，访问于 2026-07-31）
- [RemNote in 5 Minutes](https://help.remnote.com/en/articles/6044066-remnote-in-5-minutes)（RemNote Help Center，访问于 2026-07-31）
