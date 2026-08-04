# macOS 26 Liquid Glass 阅读器控件调研

调研日期：2026-08-03

## 范围

本文只使用 Apple Human Interface Guidelines、Apple Developer Documentation、WWDC25 官方演讲和 Apple Books for Mac 官方用户指南，核对三个问题：

1. Liquid Glass 与普通毛玻璃或磨砂材质有什么区别。
2. macOS 阅读器窗口的 toolbar 按钮应如何组织和呈现。
3. `Publisher / Reader` 是否适合作为 EPUB 阅读器的顶层切换。

## 结论

### 1. 默认 Liquid Glass 不能被实现成灰蒙的重磨砂

Apple 将 Liquid Glass 描述为一种数字 meta-material，其核心光学特征是 `lensing`：它会动态弯折、塑形并集中来自背后内容的光，而此前的半透明材质主要散射光。控件还会在交互时产生 flex、光照和动态响应。因此，仅使用大面积灰色半透明填充和强 `backdrop-filter: blur(...)`，只实现了模糊与遮挡，没有表达 Liquid Glass 的主要特征。[WWDC25: Meet Liquid Glass, 1:55](https://developer.apple.com/videos/play/wwdc2025/219/?time=115)

Apple 还明确说明，开启 Reduce Transparency 后，Liquid Glass 会变得“frostier”并遮蔽更多底层内容。由此可见，灰蒙、厚重、低透出的磨砂效果更接近辅助功能降级态，不应作为默认外观。[WWDC25: Meet Liquid Glass, 18:22](https://developer.apple.com/videos/play/wwdc2025/219/?time=1102)

HIG 将 Liquid Glass 和 standard materials 分开：

- Liquid Glass 构成浮在内容上方的 controls/navigation 功能层，让底层内容可以滚过或透出。
- Standard materials 使用 blur、vibrancy 和 blending modes 等效果，在内容层内部建立结构。
- Liquid Glass 应克制地用于最重要的功能元素，不能把内容层或每个自定义控件都做成玻璃。
- Regular 变体会动态调整 luminosity 与 blur 以保持可读性；Clear 只适合照片、视频等视觉丰富的媒体背景。

[HIG: Materials](https://developer.apple.com/design/human-interface-guidelines/materials)

这意味着 Reader 的默认 toolbar controls 不应是始终不变的灰色磨砂胶囊。控件需要保持轻、透，让阅读内容成为背后的视觉输入，并通过细微边缘高光、vibrancy、hover/pressed 反馈和内容滚动关系表达其功能层位置。`prefers-reduced-transparency` 下才应显著提高遮蔽和实色程度。

### 2. Reader toolbar 应复用系统式按钮，而不是再包一层大玻璃容器

HIG 将 toolbar 定义为位于视图顶部、按逻辑功能分组的高频 commands、controls、navigation 与 search。Apple 对 macOS toolbar 的位置约定是：[HIG: Toolbars](https://developer.apple.com/design/human-interface-guidelines/toolbars)

- Leading edge：返回、前进、显示或隐藏 sidebar 等导航，以及 view title。
- Center area：常用控件，或未放在 leading edge 的 title。
- Trailing edge：必须保持可用的重要动作、inspector、search、More 和唯一 primary action。

控件应按功能和使用频率分组，通常最多三组。导航和关键动作应处于各自熟悉、视觉可区分的分组中。对于图标按钮，Apple 建议优先使用 system-provided symbols without borders；分组容器已经表达边界，系统也会处理 hover 与 selection 状态。自定义 toolbar 背景和 tinted controls 应减少，以免覆盖或干扰系统背景效果。[HIG: Toolbars](https://developer.apple.com/design/human-interface-guidelines/toolbars)；[Adopting Liquid Glass](https://developer.apple.com/documentation/technologyoverviews/adopting-liquid-glass)

对当前 Reader 的直接含义是：

- 左侧保留 Sidebar 和文档导航，它们属于同一导航区域，但不需要外套一个高、厚、有明显描边的大圆角面板。
- 右侧放 Appearance、批注和 More 等文档动作；仅在动作确实紧密相关时共享一个轻量 control group。
- 图标必须有 accessibility label 和 tooltip；不要再在图标 glyph 自身外画圆圈或边框。
- 优先复用 Editor 页面已经校准过的 titlebar button 尺寸、材质、hover、pressed、focus 与 disabled 状态，保持同一应用内的窗口 chrome 一致。
- Reader 内容可以延伸到 toolbar 下方形成连续背景，但正文与交互区域仍需要遵守 titlebar safe area。
- 不给 Reader canvas、整个 toolbar 或控件组增加一层大圆角玻璃边框，避免 glass-on-glass 和多余层级。

Electron/CSS 无法自动获得 AppKit 在 macOS 26 中提供的实时 lensing。当前实现至少应以 Editor 已验证的 titlebar controls 为基线，避免用更重的 blur 和灰色填充另造一套伪 Liquid Glass。

### 3. `Publisher / Reader` 不应是顶层 segmented control

当前 Apple Books for Mac 的官方流程是：指针移动到书页顶部，点击一个 Appearance 按钮，再在 appearance UI 内选择 `Original`、`Quiet` 或 `Paper` theme，并按需调整 font、bold text、spacing、justification、columns 以及 Light/Dark/Automatic 外观。官方 macOS 26 用户指南没有描述 `Publisher / Reader` 顶层切换。[Apple Books User Guide: Change a book's appearance](https://support.apple.com/guide/books/change-a-books-appearance-ibks8923126d/8.0/mac/26)

Apple Books 的阅读导航同样以书页为中心：目录、搜索、书签和 Read Aloud 从书顶部 toolbar 进入；上一页和下一页主要通过书页边缘箭头、trackpad/Magic Mouse swipe 或方向键完成。[Apple Books User Guide: Read books](https://support.apple.com/guide/books/read-books-ibks5f526382/8.0/mac/26)

HIG 规定 segmented control 用于紧密相关、影响同一 object/state/view，且需要持续展示选择状态的选项。段标签应使用名词或名词短语，单个 control 内不能混合“选择状态”和“执行动作”的语义。[HIG: Segmented controls](https://developer.apple.com/design/human-interface-guidelines/segmented-controls)

`Publisher / Reader` 把引擎内部的“出版者样式”和“用户覆盖样式”暴露成两个含义不清的产品模式，也与 Apple Books 的 Appearance 心智模型不一致。因此：

- 从 Reader 顶部 toolbar 删除 `Publisher / Reader` segmented control。
- 主界面只保留一个 Appearance 图标按钮。
- 使用 `Original / Quiet / Paper` 这类面向阅读结果的 theme 选择，或者采用与产品现有主题一致的名称。
- 如果底层确实需要独立控制是否尊重 publisher CSS，将其放入 Appearance popover 的高级或次级设置中，例如 `Use publisher styling` toggle；不要让它长期占据主 toolbar。
- 不支持自定义外观的 fixed-layout EPUB 不应显示一个无效切换；Appearance 入口应根据 reader capability 隐藏、禁用或仅展示仍适用的选项。

## 截图验收基线

修复后至少对比以下状态，不能只检查静止截图：

1. 默认静止态：内容能清楚透出，按钮不呈现持续灰蒙的厚磨砂底。
2. Hover 与 pressed：状态即时且克制，图标位置和 control 尺寸不跳动。
3. 阅读内容滚过 toolbar：控件仍可读，但内容没有被一整条固定灰色面板截断。
4. Sidebar 展开与收起：leading controls 始终位于 window controls 和 Sidebar 按钮之后，不重叠。
5. 窄窗口：title 或低优先级动作按既定规则收缩，leading/trailing 关键控件保持可达。
6. Reduce Transparency：控件变得更实、更 frostier，且这一状态与默认外观有清楚差异。
7. Reader 与 Editor 对照：titlebar icon button 的尺寸、边距、材质和交互状态属于同一套应用 chrome。

## 官方资料

- [Human Interface Guidelines: Materials](https://developer.apple.com/design/human-interface-guidelines/materials)
- [Human Interface Guidelines: Toolbars](https://developer.apple.com/design/human-interface-guidelines/toolbars)
- [Human Interface Guidelines: Segmented controls](https://developer.apple.com/design/human-interface-guidelines/segmented-controls)
- [Adopting Liquid Glass](https://developer.apple.com/documentation/technologyoverviews/adopting-liquid-glass)
- [WWDC25: Meet Liquid Glass](https://developer.apple.com/videos/play/wwdc2025/219/)
- [Apple Books User Guide: Change a book's appearance in Books on Mac](https://support.apple.com/guide/books/change-a-books-appearance-ibks8923126d/8.0/mac/26)
- [Apple Books User Guide: Read books in Books on Mac](https://support.apple.com/guide/books/read-books-ibks5f526382/8.0/mac/26)
