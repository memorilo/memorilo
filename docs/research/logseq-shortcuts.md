# Logseq 快捷键调研（完整分类版）

调研日期：2026-08-24

## 范围与证据

- Logseq 主仓库固定提交：[`4975d5c21398d6173a2ef4444cb0f7c44817000e`](https://github.com/logseq/logseq/tree/4975d5c21398d6173a2ef4444cb0f7c44817000e)。默认 keymap 位于 [`src/main/frontend/modules/shortcut/config.cljs`](https://github.com/logseq/logseq/blob/4975d5c21398d6173a2ef4444cb0f7c44817000e/src/main/frontend/modules/shortcut/config.cljs)。
- Logseq 官方文档固定提交：[`08f855f24d66e4509b7ea808554c13b4649e6ee1`](https://github.com/logseq/docs/tree/08f855f24d66e4509b7ea808554c13b4649e6ee1)。[Keyboard shortcuts](https://github.com/logseq/docs/blob/08f855f24d66e4509b7ea808554c13b4649e6ee1/pages/Keyboard%20shortcuts.md#L13-L30) 说明快捷键可配置，并解释 `mod` 的平台映射。
- 本次环境无法解析 GitHub，未重新验证远端 HEAD。除仓库既有固定提交研究外，还从本机官方 Logseq 2.0.1 的 `app.asar/js/main.js.map` 读取同名 `frontend/modules/shortcut/config.cljs`，用于补齐默认分类；本机 bundle 的 `frontend.version` 为 `2.0.1-alpha+nightly.20260710`。

Logseq 支持用户重绑定，所以下表是默认 mapping；某台机器的最终事实以 **Settings > Keymap** 为准。

## 记号

| 源码记号 | macOS | Windows/Linux |
| --- | --- | --- |
| `mod` | `Cmd` | `Ctrl` |
| `alt` | `Option` | `Alt` |
| `ctrl` | `Control` | `Control` |

`g j`、`t r` 之类是依次按下的 chord，不是组合键。

## 基础编辑与格式化

| 操作 | macOS | Windows/Linux |
| --- | --- | --- |
| 新 Block | `Enter` | `Enter` |
| Block 内换行 | `Shift+Enter` | `Shift+Enter` |
| Backspace / Delete | `Backspace` / `Delete` | 同左 |
| 跟随光标下链接 | `Cmd+O` | `Ctrl+O` |
| 在侧栏打开光标下链接 | `Cmd+Shift+O` | `Ctrl+Shift+O` |
| 粗体 / 斜体 | `Cmd+B` / `Cmd+I` | `Ctrl+B` / `Ctrl+I` |
| 高亮 | `Cmd+Shift+H` | `Ctrl+Shift+H` |
| 删除线 | `Cmd+Shift+S` | `Ctrl+Shift+S` |
| 插入链接 | `Cmd+L` | `Ctrl+L` |
| 清空 Block | `Ctrl+L` | `Alt+L` |
| 删除光标前至行首 | `Ctrl+U` | `Alt+U` |
| 删除光标后至行尾 | 无默认绑定 | `Alt+K` |
| Block 开头 / 结尾 | 无默认绑定 | `Alt+A` / `Alt+E` |
| 前一个 / 后一个词 | `Ctrl+Shift+B` / `Ctrl+Shift+F` | `Alt+B` / `Alt+F` |
| 删除后一个词 | `Ctrl+W` | `Alt+D` |
| 删除前一个词 | 无默认绑定 | `Alt+W` |
| 复制当前 Block embed | `Cmd+Shift+E` | `Ctrl+Shift+E` |
| 粘贴为单 Block 纯文本 | `Cmd+Shift+V` | `Ctrl+Shift+V` |
| 插入 YouTube 时间戳 | `Cmd+Shift+Y` | `Ctrl+Shift+Y` |
| 撤销 | `Cmd+Z` | `Ctrl+Z` |
| 重做 | `Cmd+Shift+Z` 或 `Cmd+Y` | `Ctrl+Shift+Z` 或 `Ctrl+Y` |
| 复制 / 剪切 | `Cmd+C` / `Cmd+X` | `Ctrl+C` / `Ctrl+X` |
| 复制 Block 文本 | `Cmd+Shift+C` | `Ctrl+Shift+C` |

## Block 树、选择与导航

| 操作 | macOS | Windows/Linux |
| --- | --- | --- |
| 上下导航 | `↑` / `↓`，或 `Ctrl+P` / `Ctrl+N` | 同左 |
| 左右/跨 Block 边界 | `←` / `→` | 同左 |
| 上移 / 下移 Block | `Cmd+Shift+↑` / `Cmd+Shift+↓` | `Alt+Shift+↑` / `Alt+Shift+↓` |
| 移动已选择的多个 Block | `Cmd+Shift+M` | `Ctrl+Shift+M` |
| 进入选中 Block 编辑 | `Enter` | `Enter` |
| 在侧栏打开选中 Block | `Shift+Enter` | `Shift+Enter` |
| 扩展 Block selection | `Option+↑` / `Option+↓` | `Alt+↑` / `Alt+↓` |
| 扩展文字/跨 Block 选择 | `Shift+↑` / `Shift+↓` | 同左 |
| 选择 parent | `Cmd+A` | `Ctrl+A` |
| 选择全部 Block | `Cmd+Shift+A` | `Ctrl+Shift+A` |
| 删除 Block selection | `Backspace` 或 `Delete` | 同左 |
| 展开 / 折叠 children | `Cmd+↓` / `Cmd+↑` | `Ctrl+↓` / `Ctrl+↑` |
| 切换 children | `Cmd+;` | `Ctrl+;` |
| 缩进 / 反缩进 | `Tab` / `Shift+Tab` | 同左 |
| Zoom in | `Cmd+.` 或 `Cmd+Shift+.` | `Alt+→` |
| Zoom out | `Cmd+,` | `Alt+←` |
| 循环 TODO | `Cmd+Enter` | `Ctrl+Enter` |
| Jump | `Cmd+J` | `Ctrl+J` |

Document mode 可交换 Enter 与 Shift+Enter 的新 Block/换行语义。Block selection、文本编辑和自动补全也会让相同按键进入不同 handler。

## 搜索与页面导航

| 操作 | macOS | Windows/Linux |
| --- | --- | --- |
| 全局搜索 | `Cmd+K` | `Ctrl+K` |
| 当前页搜索 | `Cmd+Shift+K` | `Ctrl+Shift+K` |
| 搜索主题 | `Cmd+Shift+I` | `Alt+Shift+I` |
| 命令面板 | `Cmd+Shift+P` | `Ctrl+Shift+P` |
| Electron 页内查找 | `Cmd+F` | `Ctrl+F` |
| 查找下一个 | `Enter` 或 `Cmd+G` | `Enter` 或 `Ctrl+G` |
| 查找上一个 | `Shift+Enter` 或 `Cmd+Shift+G` | `Shift+Enter` 或 `Ctrl+Shift+G` |
| 后退 / 前进 | `Cmd+[` / `Cmd+]` | `Ctrl+[` / `Ctrl+]` |
| 重建索引 | `Cmd+C`，再 `Cmd+S` | `Ctrl+C`，再 `Ctrl+S` |
| Journals | `G`，再 `J` | 同左 |
| Home | `G`，再 `H` | 同左 |
| 所有页面 | `G`，再 `A` | 同左 |
| Graph view | `G`，再 `G` | 同左 |
| 所有 Graphs | `G`，再 `Shift+G` | 同左 |
| 快捷键页 | `G`，再 `S` | 同左 |
| 明天 / 下一个 / 上一个 Journal | `G T` / `G N` / `G P` | 同左 |
| Flashcards | `G F` 或 `T C` | 同左 |
| 今天页面打开到侧栏 | `Cmd+Shift+J` | `Alt+Shift+J` |

## 界面、Graph 与侧栏

| 操作 | macOS | Windows/Linux |
| --- | --- | --- |
| 设置 | `T S` 或 `Cmd+,` | `T S` |
| 右侧栏 / 左侧栏 | `T R` / `T L` | 同左 |
| 帮助 | `Shift+/`（`?`） | 同左 |
| 切换主题 | `T T` | 同左 |
| Contents | `Option+Shift+C` | `Alt+Shift+C` |
| Document mode | `T D` | 同左 |
| 切换 Block 编号列表 | `T N` | 同左 |
| 高亮最近 Block | `Cmd+C`，再 `Cmd+R` | `Ctrl+C`，再 `Ctrl+R` |
| 宽屏模式 | `T W` | 同左 |
| 主题颜色 | `T I` | 同左 |
| 插件面板 | `T P`（插件系统启用时） | 同左 |
| 展开 Block 显示 | `T O` | 同左 |
| 方括号显示 | `T B` | 同左 |
| 自定义外观 | `C C` | 同左 |
| 收藏当前页面 | `Cmd+Shift+F` | `Ctrl+Shift+F` |
| Quick add | `Cmd+E` | `Ctrl+Alt+E` |
| 打开 Graph | `Option+Shift+G` | `Alt+Shift+G` |
| 保存 DB Graph | `Cmd+S` | `Ctrl+S` |
| 发布对话框 | `Cmd+M` | `Ctrl+M` |
| Shell command | `Cmd+Shift+1` | `Ctrl+Shift+1` |
| 关闭窗口 | `Cmd+W` | `Ctrl+W` |
| 关闭侧栏顶部项 | `C T` | 同左 |
| 清空侧栏 | `Cmd+C`，再 `Cmd+C` | `Ctrl+C`，再 `Ctrl+C` |

Electron、publishing 模式和插件 feature flag 会使部分命令 inactive。

## 属性、补全、PDF 与卡片

| 操作 | macOS | Windows/Linux |
| --- | --- | --- |
| 添加属性 | `Cmd+P` | `Ctrl+Alt+P` |
| Tags / Deadline / Status | `P T` / `P D` / `P S` | 同左 |
| Priority / Icon / Reaction | `P P` / `P I` / `P R` | 同左 |
| 添加评论 | `Ctrl+Space` | `Ctrl+Space` |
| 隐藏属性显示 | `P A` | 同左 |
| 补全确认 | `Enter` | `Enter` |
| 补全上一个 / 下一个 | `↑` / `↓` 或 `Ctrl+P` / `Ctrl+N` | 同左 |
| 补全 Shift 确认 | `Shift+Enter` | 同左 |
| 补全 Meta 确认 | `Cmd+Enter` | `Ctrl+Enter` |
| PDF 上一页 / 下一页 | `Option+P` / `Option+N` | `Alt+P` / `Alt+N` |
| 关闭 PDF / PDF 查找 | `Option+X` / `Option+F` | `Alt+X` / `Alt+F` |

复习卡片上下文：`S` 显示/隐藏答案，`1` Again，`2` Hard，`3` Good，`4` Easy。

## 上下文冲突

- `Enter`、`Shift+Enter`、`Cmd/Ctrl+Enter` 在编辑器、Block selection、补全、查找和 Flashcards 中有不同动作。
- `Alt+F` 在 PDF 中是查找，在 Windows/Linux 编辑器中是向前移动一个词。
- `Cmd/Ctrl+C` 是复制，也是 `Cmd/Ctrl+C` 后接 `S`、`R`、`C` 等 chord 的前缀。
- 没有默认 binding 的命令未列入表格；插件还可动态增加自己的分类和绑定。

## 来源

- [默认快捷键 map](https://github.com/logseq/logseq/blob/4975d5c21398d6173a2ef4444cb0f7c44817000e/src/main/frontend/modules/shortcut/config.cljs)
- [核心 Outline 快捷键定义](https://github.com/logseq/logseq/blob/4975d5c21398d6173a2ef4444cb0f7c44817000e/src/main/frontend/modules/shortcut/config.cljs#L97-L255)
- [官方 Keyboard shortcuts 文档](https://github.com/logseq/docs/blob/08f855f24d66e4509b7ea808554c13b4649e6ee1/pages/Keyboard%20shortcuts.md#L13-L30)
- [仓库内 Logseq Outline 固定版本调研](https://github.com/logseq/logseq/blob/4975d5c21398d6173a2ef4444cb0f7c44817000e/src/main/frontend/handler/editor.cljs#L2235-L2308)
