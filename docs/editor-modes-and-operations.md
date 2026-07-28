# Editor modes and operations

Memorilo 的 Document 与 Outline 是同一份文档、同一个编辑器状态和同一条撤销历史的两种投影。切换模式不会转换或替换文档，因此非空文档也可以自由切换。

- Document 隐藏普通块的默认 Outline 圆点，保留标题、引用、代码块以及语义无序/有序列表的文档外观。
- Outline 为普通块显示圆点，并增加 Focus、折叠、多选和 Outdent；语义无序/有序列表仍保留自己的 `kind`，不会被伪装成普通 Outline 圆点。
- Focus、折叠、块选择、选择锚点和 Outdent 策略属于本地视图状态，不写入传入文档。切换到 Document 再返回 Outline 时，这些状态仍然存在。

## Keyboard operations

| 操作 | Document | Outline |
| --- | --- | --- |
| 普通非空块 `Enter` | 在光标处分割为下一个可编辑块 | 创建同级 Outline 项；新项获得唯一稳定 ID |
| 空父分支 `Enter` | 使用基础 flat-list 行为 | 保留父分支及其子树，创建一个同级空项；整个结构变化可一次撤销 |
| `Tab` | 使用基础列表缩进，将当前项放到前一项之下 | 将当前 Outline 项缩进到前一项之下 |
| `Shift-Tab` | 使用基础列表反缩进 | 对当前项或块选择执行当前 Outdent 策略 |
| 空叶项 `Backspace` | 使用基础列表合并/删除行为 | 删除空叶项，并保留前一项 |
| `Cmd/Ctrl-Z` | 撤销同一文档历史 | 撤销同一文档历史，包括 Outline 结构事务 |
| `Cmd/Ctrl-Shift-Z` | 重做同一文档历史 | 重做同一文档历史，包括 Outline 结构事务 |

Outline 的 Enter 和 Shift-Tab 由模式感知的 ProseMirror keymap 提供。Outline 未激活时命令返回 `false`，后续基础 keymap 会继续处理事件，所以 Document 不会经过 Outline 的空分支或 Outdent 逻辑。

## Node-specific Enter behavior

| 节点 | 已验证行为 |
| --- | --- |
| Paragraph | 在光标处分割；Document 与 Outline 共用底层编辑语义 |
| Heading | 在标题末尾按 Enter 保留原标题，并创建后续 paragraph |
| Blockquote | 第一次 Enter 在引用内增加段落；在空引用段落再次 Enter 会退出引用，创建普通 paragraph |
| Code block | Enter 始终先在代码块内部插入换行，不会被列表 Enter 拆成新项；Document 与 Outline 均如此 |
| Semantic bullet list | Enter 创建同级 `bullet` 项，不降级为默认 Outline 项 |
| Semantic ordered list | Enter 创建同级 `ordered` 项；原列表的起始序号属性保持不变 |

表格、图片、数学块等原子或复杂节点继续使用 ProseKit 自己的节点选择和输入规则；模式 keymap 不会无条件截获它们的 Enter。只有代码块换行和 Outline 空父分支是高优先级的定向规则，其余情况都会回落到节点或基础列表命令。

## Outline marker operations

| 操作 | 结果 |
| --- | --- |
| 点击圆点 | Focus/zoom 到该块；传入文档保持不变 |
| `Cmd/Ctrl` + 点击圆点 | 切换单个块是否被选择，可形成非连续选择 |
| `Shift` + 点击圆点 | 从最近的选择锚点到目标块建立连续选择，只包含当前可见投影中的块 |
| `Alt` + 点击圆点 | 折叠或展开该块的子树 |
| `Collapse / expand` | 优先作用于已选块；无选择时作用于 Focus 块或当前编辑块 |

Focus 可以通过稳定 block ID 或节点路径初始化。Focus 只改变可见投影；Outdent 不允许把块移动到当前 Focus 根之外。

## Logical Outdent

Logical Outdent 的含义是“只移动明确选中的块”。它接受连续或非连续选择，并将所有移动合并为一个 ProseMirror 事务，因此一次 Undo 会完整恢复全部块。

例如：

```text
P
  A
  B  ← selected
  C
  D  ← selected
  E
```

执行 Logical Outdent 后，`B` 与 `D` 各自向根移动一级；`A`、`C`、`E` 不会因为视觉顺序而被收养为其他块的子节点：

```text
P
  A
  C
  E
B
D
```

这个策略适合“我精确选中了哪些节点，就只改变哪些节点的父关系”。代价是它不承诺保持原来的深度优先可见顺序。

## Traditional Outdent

Traditional Outdent 的含义是“按经典大纲规则提升一段连续兄弟，同时保持深度优先可见顺序”。因此它只接受：

1. 所有选中块具有同一个父节点；
2. 选择是该父节点下的一段连续兄弟。

例如选择 `B`、`C`：

```text
P
  A
  B  ← selected
  C  ← selected
  D
  E
```

执行 Traditional Outdent 后：

```text
P
  A
B
C
  D
  E
```

`B`、`C` 被提升一级，原本排在所选区间之后的 `D`、`E` 被挂到最后一个提升块 `C` 下面。这样从上到下的可见顺序仍然是 `P, A, B, C, D, E`。

如果选择非连续，例如 `B` 与 `D`，或者跨越不同父节点，Traditional 命令会被禁用，并显示：

> Traditional outdent requires consecutive blocks under the same parent. Adjust the selection or switch to Logical outdent.

禁用时不会产生文档事务，也不会部分移动任何块。

## Browser test coverage

所有交互测试都通过公开 `Editor` UI，在独立 Vitest Browser 页面内启动真实 Chrome，并由 Playwright provider 驱动；测试不依赖 Electron，也不依赖桌面 renderer 页面结构。

- `packages/editor/src/document/document-interactions.test.tsx`：普通块 Enter 与历史、代码块、标题、引用、语义无序/有序列表、Document 原生 Tab/Shift-Tab。
- `packages/editor/src/outline/outline-interactions.test.tsx`：代码块、空分支回归、Enter/Tab/Shift-Tab、空叶 Backspace、语义列表、连续/非连续选择、Focus、折叠、Logical/Traditional Outdent 及原子撤销。
- `packages/editor/src/editor-mode.test.tsx`：受控/非受控切换、非空文档自由切换、两种列表语义、圆点对齐和跨模式历史。
