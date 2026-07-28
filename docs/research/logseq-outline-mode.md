# Logseq Outline 模式调研

调研日期：2026-07-28

## 范围与资料版本

本报告只使用 Logseq 的一手资料：

- Logseq 主仓库固定在提交 [`4975d5c21398d6173a2ef4444cb0f7c44817000e`](https://github.com/logseq/logseq/tree/4975d5c21398d6173a2ef4444cb0f7c44817000e)（2026-07-24）。
- Logseq 官方文档仓库固定在提交 [`08f855f24d66e4509b7ea808554c13b4649e6ee1`](https://github.com/logseq/docs/tree/08f855f24d66e4509b7ea808554c13b4649e6ee1)。

官方文档中的部分截图来自较早版本，因此本报告以当前源码确定交互细节，以文档说明产品概念。主题颜色、箭头位置、引用下划线等可配置外观不视为 Outline 的必要语义。

## 结论摘要

Logseq 的 Outline 不是在一篇富文本上叠加列表样式，而是一个真正的、递归渲染的 Block Tree：

```text
Block row
├── Control：折叠箭头 + bullet / icon / 序号
├── Content：只读渲染或当前 Block 的文本编辑器
├── Properties / references / query results
└── Children container
    ├── 左侧竖向 guideline
    └── nested Block rows
```

其核心交互原则是：

1. Block 是最小结构与编辑单位；页面只是 Block 的容器或逻辑根。
2. 同一时刻只有一个 Block 进入文本编辑态，其余 Block 保持只读渲染态。
3. 文本选择与整块选择是两种不同状态；结构命令作用于整块选择。
4. 键盘导航沿“当前可见树的深度优先顺序”运行，折叠的后代不会参与导航。
5. Enter、Backspace、Tab 等操作同时具有文字语义和树结构语义。
6. Focus/Zoom、references、embeds 都是同一 Block Tree 的不同 projection，不是另一套编辑器。
7. Logseq 自身的 Document mode 与 Outline 也不是两套编辑器：它们复用同一 Block 数据、编辑器、递归 renderer 和结构命令，仅改变可见 controls、缩进样式和 Enter 行为。

对 Memorilo 最有价值的不是照搬 Logseq 的大文件或 DOM 细节，而是采用“一份节点模型、一套文本编辑核心、一组 headless tree commands、多个 projection”的边界。

## 1. Outline 的视觉与结构模型

### 1.1 每个 bullet 都是一个 Block

Logseq 官方将自身定义为 outliner：每个 bullet 是一个 Block，类似一个段落；通过把相关 Block 分组为 branch 来表达结构。Block 级缩进建立真实的 parent-child 关系，而不只是改变左边距。

来源：

- [官方文档：每个 bullet 是 Block](https://github.com/logseq/docs/blob/08f855f24d66e4509b7ea808554c13b4649e6ee1/pages/Start%20here.md#L6-L10)
- [官方文档：缩进建立 parent-child 和 branch](https://github.com/logseq/docs/blob/08f855f24d66e4509b7ea808554c13b4649e6ee1/pages/What%20is%20indentation%20and%20why%20does%20it%20matter%253F.md#L3-L16)
- [官方 parent-child 示意图](https://github.com/logseq/docs/blob/08f855f24d66e4509b7ea808554c13b4649e6ee1/assets/parent-child-example-letters_1641572097841_0.png)

### 1.2 当前源码中的视觉骨架

普通 Block 行至少约 24px 高。左侧的 control 区包含：

- 独立的折叠箭头；
- bullet、节点 icon 或有序列表编号；
- bullet 作为 focus/zoom 入口和桌面端拖拽 handle。

子级容器整体向右缩进 29px，使用 1px 竖线连接层级；竖线实际提供 4px 宽的可点击热区。bullet 外层是 `1em × 1em`，内部圆点约 `0.4em`；collapsed Block 的 bullet 会增加外圈背景。hover 时圆点放大，折叠 control 从隐藏/弱化状态出现。

来源：

- [Block control、箭头、bullet 与拖拽 handle](https://github.com/logseq/logseq/blob/4975d5c21398d6173a2ef4444cb0f7c44817000e/src/main/frontend/components/block.cljs#L2256-L2383)
- [递归 children container](https://github.com/logseq/logseq/blob/4975d5c21398d6173a2ef4444cb0f7c44817000e/src/main/frontend/components/block.cljs#L2010-L2090)
- [Block row 与 children 的组合](https://github.com/logseq/logseq/blob/4975d5c21398d6173a2ef4444cb0f7c44817000e/src/main/frontend/components/block.cljs#L4428-L4645)
- [缩进与 guideline 尺寸](https://github.com/logseq/logseq/blob/4975d5c21398d6173a2ef4444cb0f7c44817000e/src/main/frontend/components/block.css#L620-L655)
- [Block 行尺寸与 selected 外观入口](https://github.com/logseq/logseq/blob/4975d5c21398d6173a2ef4444cb0f7c44817000e/src/main/frontend/components/block.css#L961-L1034)
- [bullet 尺寸、closed 与 hover 状态](https://github.com/logseq/logseq/blob/4975d5c21398d6173a2ef4444cb0f7c44817000e/src/main/frontend/components/block.css#L1254-L1327)

### 1.3 阅读态与编辑态共存

Block 默认显示解析后的内容；只有当前正在编辑的 Block 将内容区域替换为 textarea/editor。它不是整页进入“编辑模式”，而是单 Block 局部切换。

这使页面能够同时显示：

- 当前 Block 的原始 Markdown/引用语法；
- 其他 Block 的链接、任务、属性、引用等渲染结果；
- 当前 Block 的完整祖先、兄弟和可见后代上下文。

来源：

- [点击正文进入 Block 编辑态](https://github.com/logseq/logseq/blob/4975d5c21398d6173a2ef4444cb0f7c44817000e/src/main/frontend/components/block.cljs#L2615-L2703)
- [只读内容与 editor 的切换](https://github.com/logseq/logseq/blob/4975d5c21398d6173a2ef4444cb0f7c44817000e/src/main/frontend/components/block.cljs#L3430-L3556)
- [官方文档：editing mode](https://github.com/logseq/docs/blob/08f855f24d66e4509b7ea808554c13b4649e6ee1/pages/term___editing%20mode.md#L1-L9)

## 2. 用户状态模型

Logseq 至少明确区分以下三个用户状态：

### 2.1 阅读/渲染状态

没有活动文本编辑器，也没有整块选择。Block 内容以渲染后的形式显示。点击正文进入编辑；点击 bullet 进入该 Block 的 focused view。

### 2.2 单 Block 文本编辑状态

状态中保存：

- 当前 Block；
- 当前 renderer container id；
- 当前编辑内容；
- cursor range/位置；
- popup/autocomplete 等 editor action。

同一 Block 可能在页面、引用、embed、sidebar 等多个容器出现，因此编辑身份不是仅用 `blockId`，而是以 `containerId + blockId` 区分视图实例。

来源：

- [editing 状态判定](https://github.com/logseq/logseq/blob/4975d5c21398d6173a2ef4444cb0f7c44817000e/src/main/frontend/state.cljs#L1008-L1028)
- [set-editing 保存 Block、container、content 与 cursor](https://github.com/logseq/logseq/blob/4975d5c21398d6173a2ef4444cb0f7c44817000e/src/main/frontend/state.cljs#L1914-L1959)

### 2.3 整块选择状态

Block selection 与 textarea 内的文本 selection 分离。选中的 `.ls-block` 整行高亮，并禁用普通文字选择；selection state 保存：

- 选择的 Block DOM/ids；
- anchor/start Block；
- 向上或向下的选择方向；
- 是否已经执行 select-all。

结构操作如移动、删除、缩进、折叠、复制引用等作用于整块选择。选择方向被保留，是为了让键盘反向操作表现为逐块收缩而不是重新建立选择。

来源：

- [selection state、方向与 selected class](https://github.com/logseq/logseq/blob/4975d5c21398d6173a2ef4444cb0f7c44817000e/src/main/frontend/state.cljs#L1134-L1268)
- [退出编辑并进入 Block selection](https://github.com/logseq/logseq/blob/4975d5c21398d6173a2ef4444cb0f7c44817000e/src/main/frontend/state.cljs#L1907-L1912)
- [selected 高亮背景](https://github.com/logseq/logseq/blob/4975d5c21398d6173a2ef4444cb0f7c44817000e/src/main/frontend/common.css#L337-L343)
- [selected 状态禁止文本选择](https://github.com/logseq/logseq/blob/4975d5c21398d6173a2ef4444cb0f7c44817000e/src/main/frontend/components/container.css#L791-L794)

## 3. Enter 与新建 Block

当前默认 Outline 行为：

| 上下文 | Enter | Shift+Enter |
| --- | --- | --- |
| Block 编辑态 | 拆分/新建 Block | 当前 Block 内换行 |
| Block 选择态 | 进入所选 Block 编辑 | 在 sidebar 打开所选 Block |
| Document mode | 默认交换“新 Block”和“内部换行” | 默认交换 |

`Enter` 不是简单地在当前位置插入 sibling：

- 在光标或文字选区处拆分当前 Block，左半留在原 Block，右半进入新 Block。
- 光标位于非空文本开头时，会在当前 Block 上方插入空 Block。
- 当前 Block 展开并已有 children 时，新 Block 通常作为第一个 child。
- 当前 Block collapsed 或没有可进入的 children 时，新 Block通常成为 sibling。
- 空的 branch 末尾 Block 按 Enter 可能先 outdent，避免持续制造更深的空节点。
- 空的独立编号项会先取消编号状态。

Document mode 可将 Enter 配置为内部换行。这说明“模式差异”应是 command mapping/policy，而不应复制编辑器实现。

来源：

- [Enter / Shift+Enter 快捷键绑定](https://github.com/logseq/logseq/blob/4975d5c21398d6173a2ef4444cb0f7c44817000e/src/main/frontend/modules/shortcut/config.cljs#L101-L111)
- [Enter 与换行的上下文分派](https://github.com/logseq/logseq/blob/4975d5c21398d6173a2ef4444cb0f7c44817000e/src/main/frontend/handler/editor.cljs#L2235-L2308)
- [拆分内容与决定 sibling/child](https://github.com/logseq/logseq/blob/4975d5c21398d6173a2ef4444cb0f7c44817000e/src/main/frontend/handler/editor.cljs#L343-L389)
- [完整插入流程与继续编辑新 Block](https://github.com/logseq/logseq/blob/4975d5c21398d6173a2ef4444cb0f7c44817000e/src/main/frontend/handler/editor.cljs#L523-L578)
- [官方文档：Enter 与 Shift+Enter 可交换](https://github.com/logseq/docs/blob/08f855f24d66e4509b7ea808554c13b4649e6ee1/pages/term___internal%20line%20break.md#L1-L6)

## 4. Backspace、Delete 与结构合并

### 4.1 Backspace

- 文字选中时，删除选中文字。
- 普通位置删除前一个字符，并处理自动配对符号。
- 光标位于 Block 开头时，进入结构删除/合并逻辑：通常删除当前 Block，并把内容并入前一个可见 Block。
- 合并过程中需要迁移 children，保持树合法。
- focused root、single-block、query/transclusion 等边界会阻止越界删除或合并。

### 4.2 Delete

- 文字选中时，删除选中文字。
- 普通位置删除后一个字符。
- 光标位于 Block 末尾时，与下一个可见 Block 合并。
- 查找下一个目标时优先使用当前 Block 的第一个 child，否则使用下一个 sibling。
- 当前 Block collapsed 时，不会穿过隐藏子树执行末尾合并。

### 4.3 多选删除

selection 状态下 `Backspace/Delete` 删除所选 Block。父子同时被选中时，先过滤到 top-level selected blocks，避免同一子树被重复处理。

来源：

- [结构合并、删除与 children 迁移](https://github.com/logseq/logseq/blob/4975d5c21398d6173a2ef4444cb0f7c44817000e/src/main/frontend/handler/editor.cljs#L715-L865)
- [Delete-at-end 与 Backspace-at-start](https://github.com/logseq/logseq/blob/4975d5c21398d6173a2ef4444cb0f7c44817000e/src/main/frontend/handler/editor.cljs#L2755-L2910)
- [selection 删除命令](https://github.com/logseq/logseq/blob/4975d5c21398d6173a2ef4444cb0f7c44817000e/src/main/frontend/handler/editor.cljs#L3251-L3271)

Backspace 是最容易产生数据损坏和意外结构变化的操作之一。Memorilo 在确定 Outline 交互时，应单独定义一份结构合并 truth table，不宜只约定“行首 Backspace 合并上一行”。

## 5. Indent、Outdent 与上下移动

### 5.1 Tab / Shift+Tab

- `Tab`：把当前 Block 或选择集缩进到前一个 sibling 下。
- `Shift+Tab`：把当前 Block 或选择集移到 parent 后面。
- 缩进到 collapsed 的前一个 sibling 时，会自动展开该 sibling。
- 选择集中若同时包含 parent 和 descendant，只操作 top-level selected blocks。
- 非连续多选不能作为一组执行 indent/outdent。
- focused Block 页面中的 root 不能 indent/outdent，防止根节点离开当前 projection。

来源：

- [编辑态与 selection 态的 Tab 分派](https://github.com/logseq/logseq/blob/4975d5c21398d6173a2ef4444cb0f7c44817000e/src/main/frontend/handler/editor.cljs#L2912-L2945)
- [selection 的 indent/outdent](https://github.com/logseq/logseq/blob/4975d5c21398d6173a2ef4444cb0f7c44817000e/src/main/frontend/handler/editor.cljs#L1822-L1830)
- [过滤 top-level selection 并提交原子 operation](https://github.com/logseq/logseq/blob/4975d5c21398d6173a2ef4444cb0f7c44817000e/src/main/frontend/handler/block.cljs#L207-L240)
- [底层 indent/outdent 语义与自动展开目标](https://github.com/logseq/logseq/blob/4975d5c21398d6173a2ef4444cb0f7c44817000e/deps/outliner/src/logseq/outliner/core.cljs#L1118-L1182)

### 5.2 两种 Outdent 语义

Logseq 支持 Traditional/direct 与 Logical/Roam-style 两种语义。设置项 `:editor/logical-outdenting?` 没有值或为 `false` 时走 Traditional/direct；官方配置模板也将其标为默认行为。打开 Settings 中的 logical outdenting 开关后才走 Logical/Roam-style。官方文档将前者类比 Google Docs、Microsoft Word，将后者描述为 Roam 常用行为。

两种语义都会先做同一件事：把连续选择中归一化后的 top-level Blocks 连同各自完整 subtree 移到 parent 后面，成为 grandparent 的 children。差异只发生在“最后一个被选 Block 之后、原本仍属于 parent 的右侧 siblings”上：

- Traditional/direct（默认）：把这些右侧 siblings 改挂到**最后一个被 outdent 的 Block**下；若该 Block 已有 children，则追加在最后一个 direct child 后。
- Logical/Roam-style：不触碰这些右侧 siblings，它们继续留在原 parent 下。

单个 Block 且存在右侧 siblings：

Before：

```text
G
  P
    A
    B  ← outdent
    C
    D
```

Direct（默认）：

```text
G
  P
    A
  B
    C
    D
```

Logical：

```text
G
  P
    A
    C
    D
  B
```

目标 Block 已有 children 时，Direct 会把右侧 siblings 追加到原 children 之后，而不是覆盖或插到它们之前：

Before：

```text
G
  P
    A
    B  ← outdent
      X
      Y
    C
```

Direct（默认）：

```text
G
  P
    A
  B
    X
    Y
    C
```

Logical：

```text
G
  P
    A
    C
  B
    X
    Y
```

连续多选时，所有选中 Blocks 都提升一级；Direct 模式由**最后一个 selected Block**接收未选中的右侧 siblings：

Before：

```text
G
  P
    A
    B  ← selected
    C  ← selected
    D
    E
```

Direct（默认）：

```text
G
  P
    A
  B
  C
    D
    E
```

Logical：

```text
G
  P
    A
    D
    E
  B
  C
```

如果目标后面没有右侧 siblings，或 selection 一直覆盖到 parent 的最后一个 child，两种模式结果相同：只把选中 Blocks 及其 subtrees 提升一级。

实现和测试还揭示了几个边界：

- 多选必须是连续的；非连续 top-level selection 不执行 indent/outdent。
- selection 中同时包含 ancestor 与 descendant 时，先过滤为 top-level Blocks，descendant 随 ancestor 的 subtree 一起移动。
- property value Blocks 不允许 outdent。
- protected comment Blocks 不会被 Direct 模式收进 outdented Block；普通的更右侧 sibling 仍可被收进去。
- focused Block 视图中的 root，以及 root 的 direct children，都不能越过当前 projection 边界继续 outdent。
- comment area 和其中的 comment Blocks 不能执行 indent/outdent。
- Direct outdent 对目标和被改挂的右侧 siblings 记录可逆 move history；undo 会把两者恢复到原 parent。

来源：

- [官方设置说明与两种语义的定位](https://github.com/logseq/docs/blob/08f855f24d66e4509b7ea808554c13b4649e6ee1/pages/setting___enable%20logical%20outdenting.md#L1-L5)
- [默认配置为 false](https://github.com/logseq/logseq/blob/4975d5c21398d6173a2ef4444cb0f7c44817000e/deps/common/resources/templates/config.edn#L205-L207)
- [读取 logical outdenting 配置](https://github.com/logseq/logseq/blob/4975d5c21398d6173a2ef4444cb0f7c44817000e/src/main/frontend/state.cljs#L769-L771)
- [设置页切换入口](https://github.com/logseq/logseq/blob/4975d5c21398d6173a2ef4444cb0f7c44817000e/src/main/frontend/components/settings.cljs#L454-L460)
- [底层 outdent 算法、selection 限制与两种分支](https://github.com/logseq/logseq/blob/4975d5c21398d6173a2ef4444cb0f7c44817000e/deps/outliner/src/logseq/outliner/core.cljs#L1118-L1182)
- [连续多选的 core tests](https://github.com/logseq/logseq/blob/4975d5c21398d6173a2ef4444cb0f7c44817000e/src/test/frontend/modules/outliner/core_test.cljs#L265-L318)
- [protected comment right sibling 的 core test](https://github.com/logseq/logseq/blob/4975d5c21398d6173a2ef4444cb0f7c44817000e/src/test/frontend/modules/outliner/core_test.cljs#L320-L337)
- [focused root、projection 边界与 comment 限制](https://github.com/logseq/logseq/blob/4975d5c21398d6173a2ef4444cb0f7c44817000e/src/test/frontend/handler/editor_test.cljs#L810-L828)
- [Direct outdent 的 history 与 undo tests](https://github.com/logseq/logseq/blob/4975d5c21398d6173a2ef4444cb0f7c44817000e/src/test/frontend/worker/db_sync_test.cljs#L2728-L2804)

因此这不是一个实现细节，而是会改变文档树结构的产品选择。Memorilo 必须先决定默认语义，并让 command 层显式接收该策略，避免 renderer 或键盘事件处理器各自推断。

### 5.3 上下移动

- macOS 默认 `Cmd+Shift+↑/↓` 移动当前或所选 Block。
- 移动的是整个 subtree，children 随父 Block 一起移动。
- 多选时仍先归一化为 top-level selection。
- focused root 不能移动。
- 底层 operation 负责阻止把节点移动到自身或后代、移动受保护节点等非法结构。

来源：

- [快捷键定义](https://github.com/logseq/logseq/blob/4975d5c21398d6173a2ef4444cb0f7c44817000e/src/main/frontend/modules/shortcut/config.cljs#L182-L188)
- [编辑态与 selection 态共用移动 command](https://github.com/logseq/logseq/blob/4975d5c21398d6173a2ef4444cb0f7c44817000e/src/main/frontend/handler/editor.cljs#L1770-L1812)
- [底层 move operation](https://github.com/logseq/logseq/blob/4975d5c21398d6173a2ef4444cb0f7c44817000e/deps/outliner/src/logseq/outliner/core.cljs#L1037-L1117)

## 6. 键盘导航

Logseq 的上下导航沿当前可见树运行，而不是只寻找同级 sibling：

- textarea 内部优先做普通的行间移动。
- 到第一行按 `↑` 或最后一行按 `↓` 时，进入上一个/下一个可见 Block。
- 尽可能保留光标在行内的水平位置。
- `←/→` 在当前 Block 文本开头/末尾越界时，也能进入相邻可见 Block。
- collapsed subtree 不参与导航。
- property、query、comments、add button 等非普通行由一个 navigable sibling 适配层决定跳过或进入。

selection 状态下：

- `↑/↓` 将单 Block 选择移动到上一/下一可见 Block。
- `Shift+↑/↓` 在 textarea 边界越界时，把当前 Block 转为整块选择并继续扩展。
- 同方向继续扩展；反方向逐块收缩。
- `Enter` 打开最后/第一所选 Block进入编辑。

来源：

- [跨 Block 上下导航](https://github.com/logseq/logseq/blob/4975d5c21398d6173a2ef4444cb0f7c44817000e/src/main/frontend/handler/editor.cljs#L2527-L2674)
- [左右越界导航](https://github.com/logseq/logseq/blob/4975d5c21398d6173a2ef4444cb0f7c44817000e/src/main/frontend/handler/editor.cljs#L2676-L2753)
- [编辑态/selection 态上下键分派](https://github.com/logseq/logseq/blob/4975d5c21398d6173a2ef4444cb0f7c44817000e/src/main/frontend/handler/editor.cljs#L3371-L3390)
- [Shift+上下键跨文字与整块选择](https://github.com/logseq/logseq/blob/4975d5c21398d6173a2ef4444cb0f7c44817000e/src/main/frontend/handler/editor.cljs#L3392-L3410)
- [进入所选 Block 编辑](https://github.com/logseq/logseq/blob/4975d5c21398d6173a2ef4444cb0f7c44817000e/src/main/frontend/handler/editor.cljs#L3421-L3451)

## 7. Block 多选

### 7.1 鼠标选择

当前桌面交互：

- `Cmd+click`：切换单个 Block 的选中状态，支持不连续选择。
- `Shift+click`：从 anchor 到目标 Block 连续选择范围。
- `Cmd+Shift+click`：向现有 selection 追加一个范围。
- 从 Block 内容区按下并垂直拖动：连续选中经过的 Block。
- 拖到滚动区域边缘时继续扩展选择。

选择范围有两条计算路径：

- Block DOM 都 mounted 时，通过 DOM 顺序计算。
- 虚拟列表卸载部分 Block 时，通过完整的可见 `blockId` 顺序计算。

来源：

- [Meta、Shift、Meta+Shift pointer 语义](https://github.com/logseq/logseq/blob/4975d5c21398d6173a2ef4444cb0f7c44817000e/src/main/frontend/components/block.cljs#L2615-L2703)
- [hover/drag 扩展选择](https://github.com/logseq/logseq/blob/4975d5c21398d6173a2ef4444cb0f7c44817000e/src/main/frontend/components/block.cljs#L3933-L4019)
- [mounted DOM 与 virtualized id range](https://github.com/logseq/logseq/blob/4975d5c21398d6173a2ef4444cb0f7c44817000e/src/main/frontend/handler/editor.cljs#L1210-L1284)
- [纯 range/direction 计算](https://github.com/logseq/logseq/blob/4975d5c21398d6173a2ef4444cb0f7c44817000e/src/main/frontend/components/block/selection.cljs#L19-L57)

### 7.2 键盘选择

- `Alt+↑/↓`：进入/扩展 Block selection。
- `Shift+↑/↓`：先扩展 textarea 文字选择，跨 Block 边界后转为整块选择。
- `Cmd+A`：在当前文字已全选时，提升到当前 Block，再继续提升到 parent/整页。
- `Cmd+Shift+A`：直接选择当前范围中的全部可见 Block。
- selection 状态下的复制、剪切、删除、缩进、移动和折叠都批量执行。

来源：

- [selection 快捷键](https://github.com/logseq/logseq/blob/4975d5c21398d6173a2ef4444cb0f7c44817000e/src/main/frontend/modules/shortcut/config.cljs#L190-L224)
- [select all 与 select parent](https://github.com/logseq/logseq/blob/4975d5c21398d6173a2ef4444cb0f7c44817000e/src/main/frontend/handler/editor.cljs#L3844-L3900)

## 8. Drag & Drop

bullet 是桌面端 Block 拖拽 handle：

- 如果拖动的 Block 不在当前 selection 中，拖拽开始时先清空旧 selection，并将该 Block 设为当前目标。
- 如果已多选，拖动整个 selection；提交 move 前仍过滤为 top-level blocks。
- 落点分成三种结构意图：
  - 目标行顶部约 16px：插到目标之前；
  - 指针相对目标向右超过约 50px：成为目标 child；
  - 其他位置：成为目标 sibling。
- UI 使用分隔线展示 top/nested/sibling 落点。
- `Option/Alt + drag` 单个 Block 不移动源节点，而是在落点创建 Block Reference。

来源：

- [拖拽开始](https://github.com/logseq/logseq/blob/4975d5c21398d6173a2ef4444cb0f7c44817000e/src/main/frontend/components/block.cljs#L1902-L1920)
- [top / nested / sibling 热区与 drop](https://github.com/logseq/logseq/blob/4975d5c21398d6173a2ef4444cb0f7c44817000e/src/main/frontend/components/block.cljs#L3869-L3931)
- [Alt 创建 reference 与共用 move transaction](https://github.com/logseq/logseq/blob/4975d5c21398d6173a2ef4444cb0f7c44817000e/src/main/frontend/handler/dnd.cljs#L38-L64)
- [官方文档：Option/Alt 拖拽创建引用](https://github.com/logseq/docs/blob/08f855f24d66e4509b7ea808554c13b4649e6ee1/pages/The%20basics%20of%20block%20references.md#L25-L28)

## 9. Collapse / Expand

Logseq 提供三个粒度：

### 9.1 当前 Block

- 点击折叠箭头切换当前 Block 的 children。
- `Cmd+↑` 折叠，`Cmd+↓` 展开，`Cmd+;` 切换。
- selection 状态下对所有所选 Block 执行。

### 9.2 当前 subtree

点击 children 左侧 guideline，会检查该 Block 后代是否有展开项，并在“全部展开/全部折叠”之间切换整个 subtree。

### 9.3 页面/视图级逐层展开

页面级 command 可一次展开/折叠一层，也可处理全部后代。它不是只改一个全局 boolean，而是针对可见 Block 集合逐层计算。

### 9.4 持久状态与视图实例状态

普通页面上的 collapsed 状态写回 Block 数据，并作为 undo transaction 保存。但同一 Block 在 ref/query/embed 中可能同时出现多次；这些 projection 使用 `containerId + blockId` 的临时 collapsed 状态，使一个引用实例的展开不影响其他实例。

collapsed 时 children 不加载或不渲染；expand 时再异步请求 children。

来源：

- [箭头点击与 container-local 状态](https://github.com/logseq/logseq/blob/4975d5c21398d6173a2ef4444cb0f7c44817000e/src/main/frontend/components/block.cljs#L2256-L2318)
- [guideline 切换 subtree](https://github.com/logseq/logseq/blob/4975d5c21398d6173a2ef4444cb0f7c44817000e/src/main/frontend/components/block.cljs#L2074-L2085)
- [持久 collapsed transaction 与临时 view state](https://github.com/logseq/logseq/blob/4975d5c21398d6173a2ef4444cb0f7c44817000e/src/main/frontend/handler/editor.cljs#L3618-L3665)
- [当前、selection、逐层与全部展开/折叠](https://github.com/logseq/logseq/blob/4975d5c21398d6173a2ef4444cb0f7c44817000e/src/main/frontend/handler/editor.cljs#L3666-L3842)
- [按 collapsed 状态决定是否加载 children](https://github.com/logseq/logseq/blob/4975d5c21398d6173a2ef4444cb0f7c44817000e/src/main/frontend/components/block.cljs#L4753-L4776)

## 10. Focus / Zoom

点击 bullet 不是选中 Block，而是把它作为新的视图根：

- 普通点击 bullet：路由到该 Block 的 focused page。
- `Shift+click` bullet：在右侧 sidebar 打开该 Block。
- macOS `Cmd+.`：zoom in 当前编辑 Block。
- macOS `Cmd+,`：zoom out 到 parent；parent 是 page 时回到 page。
- focused Block 页面显示 ancestors breadcrumb。
- focused root 不允许 indent/outdent 或上下移动。

这是 Outline 与普通列表组件的重要差别：任意 subtree 都能成为独立工作空间，但并未生成新文档。

来源：

- [bullet click 与 Shift+click](https://github.com/logseq/logseq/blob/4975d5c21398d6173a2ef4444cb0f7c44817000e/src/main/frontend/components/block.cljs#L1922-L1936)
- [zoom in / zoom out](https://github.com/logseq/logseq/blob/4975d5c21398d6173a2ef4444cb0f7c44817000e/src/main/frontend/handler/editor.cljs#L1162-L1196)
- [focused Block 页面显示 breadcrumb](https://github.com/logseq/logseq/blob/4975d5c21398d6173a2ef4444cb0f7c44817000e/src/main/frontend/components/page.cljs#L466-L507)
- [focused root 的结构操作边界](https://github.com/logseq/logseq/blob/4975d5c21398d6173a2ef4444cb0f7c44817000e/src/main/frontend/handler/editor.cljs#L1747-L1774)

## 11. References、Embeds 与 Linked References

### 11.1 Page / Block Reference

- `[[...]]` 创建 Page Reference。
- `((...))` 创建 Block Reference。
- Block Reference 显示源 Block 的单个内容，不复制源文本。
- 源 Block 右侧显示引用计数；点击可展开反向引用。
- 链接可跳转、在 sidebar 打开或悬停预览。

来源：

- [官方文档：Page 与 Block Reference](https://github.com/logseq/docs/blob/08f855f24d66e4509b7ea808554c13b4649e6ee1/pages/Page%20and%20block%20references.md#L4-L16)
- [官方文档：Block Reference 的显示和引用计数](https://github.com/logseq/docs/blob/08f855f24d66e4509b7ea808554c13b4649e6ee1/pages/The%20basics%20of%20block%20references.md#L1-L10)
- [当前源码中的 page/block reference renderer](https://github.com/logseq/logseq/blob/4975d5c21398d6173a2ef4444cb0f7c44817000e/src/main/frontend/components/block.cljs#L1205-L1315)

### 11.2 Embed

Block Embed 与 Block Reference 的关键差异：

- Reference 是“窗口”，主要显示一个 Block 的内容。
- Embed 是可直接编辑的 projection，显示源 Block 及完整后代树。
- 编辑 Embed 修改的是源 Block，不是副本。
- Page Embed 额外显示页面名，并投影整个页面。

当前 DB 版 Logseq 的 embed 实现尤其值得借鉴：选择 embed 后创建一个带 `:block/link` 的 linked block，而不是复制内容。渲染时：

1. `build-block` 发现 linked block；
2. 将 link 目标作为实际展示的 Block；
3. 将 linked block 自身保存在 `original-block` context；
4. 继续使用同一个 `block-container`、editor 和 children renderer；
5. 用 render context/DOM 标记限制某些结构操作。

也就是说，Embed 应被建模为“同一 Node 的另一个 projection”，而不是一份克隆或独立编辑器。

来源：

- [官方文档：Reference 与 Embed 的差异](https://github.com/logseq/docs/blob/08f855f24d66e4509b7ea808554c13b4649e6ee1/pages/The%20difference%20between%20block%20embeds%20and%20block%20references.md#L1-L5)
- [官方文档：Block Embed 与 Page Embed](https://github.com/logseq/docs/blob/08f855f24d66e4509b7ea808554c13b4649e6ee1/pages/The%20difference%20between%20block%20embeds%20and%20page%20embeds.md#L1-L17)
- [Page embed 创建 linked block](https://github.com/logseq/logseq/blob/4975d5c21398d6173a2ef4444cb0f7c44817000e/src/main/frontend/components/editor.cljs#L154-L173)
- [Block embed 创建 linked block](https://github.com/logseq/logseq/blob/4975d5c21398d6173a2ef4444cb0f7c44817000e/src/main/frontend/components/editor.cljs#L282-L307)
- [linked block 解析为源 Block](https://github.com/logseq/logseq/blob/4975d5c21398d6173a2ef4444cb0f7c44817000e/src/main/frontend/components/block.cljs#L4092-L4114)
- [linked Block 复用 block-container](https://github.com/logseq/logseq/blob/4975d5c21398d6173a2ef4444cb0f7c44817000e/src/main/frontend/components/block.cljs#L5162-L5188)

### 11.3 Linked References

Linked references 也复用 Block Tree renderer：查询结果按 page/parent 分组，补充 breadcrumb 后交给同一个 `blocks-container` 渲染。因此 linked references 不是扁平搜索结果卡片，而是保留来源上下文的局部 Outline。

来源：

- [linked references 分组并复用 Block renderer](https://github.com/logseq/logseq/blob/4975d5c21398d6173a2ef4444cb0f7c44817000e/src/main/frontend/components/block.cljs#L5357-L5405)

## 12. 当前默认快捷键摘要

以下为 macOS 当前默认值；Logseq 允许用户自定义快捷键，因此它们更适合作为初始 mapping，而不是不可改变的领域规则。

| 操作 | 默认快捷键 |
| --- | --- |
| 新 Block | `Enter` |
| Block 内换行 | `Shift+Enter` |
| 缩进 / 反缩进 | `Tab` / `Shift+Tab` |
| 上下导航 | `↑` / `↓` |
| 左右/跨 Block 边界 | `←` / `→` |
| 上下移动 Block | `Cmd+Shift+↑` / `Cmd+Shift+↓` |
| 扩展整块选择 | `Alt+↑` / `Alt+↓` |
| 扩展文字/跨 Block 选择 | `Shift+↑` / `Shift+↓` |
| 选择 parent | `Cmd+A` |
| 选择全部 Block | `Cmd+Shift+A` |
| 展开 / 折叠 children | `Cmd+↓` / `Cmd+↑` |
| 切换 children | `Cmd+;` |
| Zoom in / out | `Cmd+.` / `Cmd+,` |
| 在 sidebar 打开选择 | `Shift+Enter` |
| 删除 selection | `Backspace` / `Delete` |

来源：

- [完整快捷键定义](https://github.com/logseq/logseq/blob/4975d5c21398d6173a2ef4444cb0f7c44817000e/src/main/frontend/modules/shortcut/config.cljs#L97-L255)
- [官方文档：快捷键可配置，`mod` 在 macOS 是 Cmd](https://github.com/logseq/docs/blob/08f855f24d66e4509b7ea808554c13b4649e6ee1/pages/Keyboard%20shortcuts.md#L13-L30)

## 13. Logseq 的实现分层

### 13.1 Text editor / autocomplete

`src/main/frontend/components/editor.cljs` 负责：

- textarea/editor；
- slash commands；
- page/block autocomplete；
- ref/embed 的插入入口。

它不应拥有树结构规则。

### 13.2 Outline renderer

`src/main/frontend/components/block.cljs` 负责：

- Block row；
- controls、bullet、children guideline；
- 递归 children rendering；
- read/edit renderer 切换；
- reference/embed projection；
- selection pointer handling；
- drag/drop 热区。

这是 Outline-specific rendering 最集中的位置。

### 13.3 Interaction command layer

`src/main/frontend/handler/editor.cljs` 负责：

- Enter、Backspace、Delete、Tab；
- 跨 Block navigation；
- selection；
- collapse/expand；
- zoom；
- 命令与 state/router/database 的协调。

交互非常成熟，但该文件严重依赖 DOM class、全局 state、router 和数据库，不能视为可直接复用的 headless editor。

### 13.4 Headless outliner operations

`deps/outliner` 负责：

- insert/delete/move；
- indent/outdent；
- 顺序与 parent-child 合法性；
- transaction metadata；
- 与 React rendering 分离的树操作。

前端通过一个薄的 operation builder 构造语义 operation，再由 UI transaction 将多个 operation 聚成一次原子提交。这是 Logseq 最值得 Memorilo借鉴的边界。

来源：

- [outliner library 的职责说明](https://github.com/logseq/logseq/blob/4975d5c21398d6173a2ef4444cb0f7c44817000e/deps/outliner/README.md#L1-L10)
- [前端只构造语义 operations](https://github.com/logseq/logseq/blob/4975d5c21398d6173a2ef4444cb0f7c44817000e/src/main/frontend/modules/outliner/op.cljs#L1-L98)
- [UI transaction 聚合 operations](https://github.com/logseq/logseq/blob/4975d5c21398d6173a2ef4444cb0f7c44817000e/src/main/frontend/modules/outliner/ui.cljc#L1-L31)
- [底层核心树 operations](https://github.com/logseq/logseq/blob/4975d5c21398d6173a2ef4444cb0f7c44817000e/deps/outliner/src/logseq/outliner/core.cljs#L1037-L1241)

## 14. Document mode 与 Outline 的复用方式

Logseq 的现有模式切换给 Memorilo 一个直接参考：Document mode 仍然使用同一棵 Block Tree，只调整策略和视觉。

Document mode 的变化包括：

- 隐藏普通内部 bullet；
- 隐藏 children guideline；
- 缩小 children 左边距；
- 默认交换 Enter 与 Shift+Enter；
- renderer 仍接收同一批 blocks 和同一个 editor component。

来源：

- [Document mode 的 Enter policy](https://github.com/logseq/logseq/blob/4975d5c21398d6173a2ef4444cb0f7c44817000e/src/main/frontend/state.cljs#L769-L789)
- [Document mode CSS 只改变 projection](https://github.com/logseq/logseq/blob/4975d5c21398d6173a2ef4444cb0f7c44817000e/src/main/frontend/components/block.css#L1330-L1348)
- [Page renderer 将 mode 传给同一个 Block Tree](https://github.com/logseq/logseq/blob/4975d5c21398d6173a2ef4444cb0f7c44817000e/src/main/frontend/components/page.cljs#L149-L200)

## 15. 对 Memorilo 高复用实现的启示

以下是从 Logseq 实现抽象出的建议，不是要求照抄其代码：

### 15.1 一份文档模型，不做两份编辑器数据

当前模式与 Outline 模式应共享：

- 同一文档/节点 identity；
- 同一文本内容与 marks；
- 同一 undo/redo transaction；
- 同一 persistence 与引用模型。

模式只是 projection 和 command policy。

### 15.2 把结构操作做成 headless commands

建议至少定义以下与 React/DOM 无关的 commands：

```text
splitNode
mergeBackward
mergeForward
indentNodes
outdentNodes
moveNodesUp
moveNodesDown
moveNodes(target, position)
deleteNodes
setCollapsed
```

输入应是 node ids、selection 和 tree adapter，输出是 transaction/steps；React 组件不直接改 parent/order。

### 15.3 明确三类 state

| 类型 | 示例 |
| --- | --- |
| Document state | parent、order、content、持久 collapsed（如果产品需要跨会话保留） |
| Projection/session state | focused root、selection anchor/direction、container-local collapsed |
| Ephemeral editor state | cursor、composition、autocomplete、drag target |

不要把 selection DOM 节点或 focused root 写进文档数据。

### 15.4 一个 NodeRenderer，多种 RenderContext

Page、focused subtree、reference、embed、search result 应尽量复用同一个 `NodeRenderer`，通过 context 控制：

- 是否显示 bullet/control；
- 是否允许编辑、移动、删除；
- children 加载策略；
- collapsed 是持久还是 projection-local；
- 是否显示 breadcrumb/reference count。

### 15.5 模式差异用 command policy 表达

例如：

```text
mode = document:
  Enter -> insertParagraph/newline
  Shift+Enter -> splitNode

mode = outline:
  Enter -> splitNode
  Shift+Enter -> insertNewline
```

这比为两个模式注册两套 keyboard handler 更容易保证行为一致。

### 15.6 不建议照搬的部分

- 不要让 command 依赖 `.ls-block` 等 DOM class 去寻找树关系。
- 不要用 DOM 顺序作为结构真相；虚拟化时尤其危险。
- 不要让 router、database、selection、editor popup 全部聚集在一个超大 handler 文件。
- 不要把 embed 做成复制内容；应保存 source identity 并投影同一节点。

## 16. 下一步需要共同确定的产品决策

在进入 Memorilo 代码设计前，建议先逐项确认：

1. 当前模式是否继续是一篇连续文档，Outline 是同一内容的树 projection，还是文档本身也需要改成 block tree？
2. Outline 的每个 Block 是否允许多段内容，还是 `Shift+Enter` 只插入软换行？
3. `Enter` 在展开且有 children 的 Block 上，应创建第一个 child 还是 sibling？
4. 行首 `Backspace` 的完整合并规则，以及 root/embed 边界。
5. Outdent 采用 traditional/direct 还是 logical/Roam-style。
6. collapsed 是否写入文档并跨会话同步，还是完全属于本地 view state。
7. 是否首期支持整块多选；若支持，是否需要不连续选择。
8. 是否首期支持 bullet drag/drop，以及 `Option+drag` 创建 reference。
9. 是否支持点击 bullet focus/zoom；若支持，focused root 的 breadcrumb 和返回方式。
10. Reference 与 Embed 是否进入首期范围；它们会显著影响 node identity 和 renderer context 设计。
11. 当前编辑器的 undo、selection、IME 与 composition 能否承载“单 Block 局部 editor”，还是需要一个连续 editor view 上的 block node views。

这些问题确定后，才能判断最合适的是“共享一个 ProseMirror/Tiptap document schema 的两种 view”，还是“共享 node model、分别使用 document projection 与递归 Outline projection”。
