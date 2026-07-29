# Apple Liquid Glass 与 macOS 界面参考

调研日期：2026-07-30

## 范围

本文整理 Apple 关于 Liquid Glass、macOS sidebar、toolbar、search field、list、窗口布局、动效和辅助功能的公开设计资料。

资料仅来自 Apple Human Interface Guidelines、Apple Developer Documentation 和 WWDC25 官方演讲。本文不包含产品方案、第三方实现参数或对特定应用的设计建议。

## 1. Liquid Glass 的层级

Apple 将 Liquid Glass 描述为位于内容之上的功能层，主要承载 navigation 与 controls。Toolbar、tab bar、sidebar 等界面元素位于这一层，应用内容则位于 content layer。[HIG: Materials](https://developer.apple.com/design/human-interface-guidelines/materials)；[WWDC25: Meet Liquid Glass](https://developer.apple.com/videos/play/wwdc2025/219/)

Apple 的资料强调以下原则：

- Liquid Glass 不应作为普通内容的通用背景。
- 应优先使用系统提供的标准组件和材质，让系统负责光学效果、交互状态与辅助功能适配。
- 自定义 glass 应保持克制，只用于最重要的功能元素。
- 不应在 glass 表面继续堆叠 glass。位于 glass 上方的元素应使用 fill、transparency 和 vibrancy 表达状态与层级。
- Glass 的外观会依据背后内容、元素大小、窗口焦点、交互状态和辅助功能设置发生变化。

[HIG: Materials](https://developer.apple.com/design/human-interface-guidelines/materials)；[Adopting Liquid Glass](https://developer.apple.com/documentation/technologyoverviews/adopting-liquid-glass)；[WWDC25: Meet Liquid Glass](https://developer.apple.com/videos/play/wwdc2025/219/)

### Regular 与 Clear

Apple 提供 Regular 和 Clear 两种 Liquid Glass 变体：

- Regular 用于大多数界面，能在不同背景上维持较稳定的可读性。Sidebar 是 Apple 列举的典型用途之一。
- Clear 更透明，适用于媒体丰富且背景内容能够提供足够对比的场景。必要时应配合 dimming layer 保证前景可读性。

[HIG: Materials](https://developer.apple.com/design/human-interface-guidelines/materials)

## 2. macOS Sidebar

HIG 将 sidebar 定义为位于窗口 leading side、用于导航到应用主要区域或顶层内容集合的组件。[HIG: Sidebars](https://developer.apple.com/design/human-interface-guidelines/sidebars)

Apple 对 sidebar 内容组织的指导包括：

- 使用简短、清晰的标签。
- 使用熟悉的 symbol 表示项目。
- 可使用 disclosure control 对大量内容进行分组。
- 可允许用户自定义重要区域及其顺序。
- 通常避免超过两级层级；数据层级更深时，可以在 sidebar 与 detail view 之间加入独立的 content list。
- macOS 应响应系统 General 设置中的 sidebar icon size，不应假定固定的 row、文字或 glyph 尺寸。

[HIG: Sidebars](https://developer.apple.com/design/human-interface-guidelines/sidebars)

### Inset 与 Floating

Apple 在 WWDC25 中说明，新设计中的 sidebar 是 inset 的，并使用 Liquid Glass。相邻 scroll view 可以延伸到 sidebar 下方，从而保持内容在窗口中的连续性。[WWDC25: Get to know the new design system, 12:34](https://developer.apple.com/videos/play/wwdc2025/356/?time=754)

AppKit 演讲将 sidebar 描述为“a pane of glass that floats above the window's content”，并将其与 inspector 的 edge-to-edge glass 区分开来。[WWDC25: Build an AppKit app with the new design, 4:19](https://developer.apple.com/videos/play/wwdc2025/310/?time=259)

HIG 同样说明，sidebar 可以像 toolbar 一样浮在 content layer 上。内容可以直接延伸到它的下方；对于不适合直接延展的视觉内容，可以使用 background extension effect。[HIG: Sidebars](https://developer.apple.com/design/human-interface-guidelines/sidebars)

### Window、圆角与 Concentricity

新 macOS 设计使用 concentricity 协调 window、sidebar、toolbar 和 controls 的圆角。内层元素的曲率与它所在容器的曲率形成同心关系。[WWDC25: Build an AppKit app with the new design, 7:04](https://developer.apple.com/videos/play/wwdc2025/310/?time=424)

Apple 还区分了两种 window corner：

- 带完整 toolbar 的 window 使用较大的 outer corner radius。
- 只有 title bar 的 window 使用较小的 corner radius，以包围 window controls。

[WWDC25: Build an AppKit app with the new design, 7:04](https://developer.apple.com/videos/play/wwdc2025/310/?time=424)

### Sidebar 与 Inspector

Apple 在 AppKit 演讲中展示 sidebar 与 inspector 同时存在的窗口结构：

- Sidebar 是浮于内容上方的 inset glass pane。
- Inspector 使用沿窗口边缘的 edge-to-edge glass，并与内容并排。
- 两者承担不同的结构角色。

[WWDC25: Build an AppKit app with the new design](https://developer.apple.com/videos/play/wwdc2025/310/)

### 显示与隐藏

HIG 要求 macOS 应用提供显示或隐藏 sidebar 的 toolbar control，并提供对应的 View menu 命令。Sidebar 通常不应默认隐藏；窗口空间不足时，可以自动隐藏，并在空间恢复后重新显示。[HIG: Sidebars](https://developer.apple.com/design/human-interface-guidelines/sidebars)

## 3. Toolbar 与 Title Bar

macOS toolbar 位于窗口顶部，可以位于 title bar 下方，也可以与 title bar 集成。Toolbar 用于放置高频命令、导航、搜索和当前位置相关的控件。[HIG: Toolbars](https://developer.apple.com/design/human-interface-guidelines/toolbars)

Apple 对 toolbar 布局的指导包括：

- 根据功能关系和使用频率组织控件，并保持分组数量克制。
- Leading edge 通常放置 back、forward、show/hide sidebar 和 view title。
- Trailing edge 通常放置 inspector、search、More 和 primary action。
- Search、segmented control、pop-up button 与普通 action button 是不同的控制类型，应遵循各自的容器和分组方式。
- 非交互 title 与 status 不应获得类似 button 的 glass backing，以免产生可点击的错觉。
- Primary action 可以单独 tint；过多 tint 会削弱视觉重点。
- 窗口缩小时，中间 toolbar items 可以进入 overflow，leading 与 trailing 的关键控件应保持可达。

[HIG: Toolbars](https://developer.apple.com/design/human-interface-guidelines/toolbars)；[WWDC25: Build an AppKit app with the new design](https://developer.apple.com/videos/play/wwdc2025/310/)

### Window Controls 与 Safe Area

Safe area 用于协调窗口内容、window controls、title bar、sidebar 和相邻 split view。浮动 sidebar 覆盖相邻区域时，系统会调整 safe area，使正文与交互控件保持在 unobscured region 中。[Adopting Liquid Glass](https://developer.apple.com/documentation/technologyoverviews/adopting-liquid-glass)；[WWDC25: Build an AppKit app with the new design, 5:24](https://developer.apple.com/videos/play/wwdc2025/310/?time=324)

## 4. Search Field

Apple 根据搜索作用域区分 search field 的位置：[HIG: Search fields](https://developer.apple.com/design/human-interface-guidelines/search-fields)

- 搜索跨多个 column 或作用于全局内容时，通常位于 toolbar trailing side。
- 搜索仅用于过滤 sidebar 或 navigation 内容时，可以放在 sidebar 顶部。
- 搜索结果应尽可能随输入即时更新。
- 应优先展示最相关的结果。
- 当单一结果集不足以表达作用域时，可以提供 scope 或 token。

## 5. List、Selection 与 Source List

Apple 区分导航选择与短暂动作反馈：[HIG: Lists and tables](https://developer.apple.com/design/human-interface-guidelines/lists-and-tables)

- 导航列表的当前选择应持续显示，以帮助用户确认当前位置。
- 执行短暂动作的列表只需要在动作期间显示 highlight。
- 使用系统 list 与 selection style 时，系统会处理标准 hover、selection、focus 和窗口 active/inactive 状态。

HIG 建议 sidebar item 使用简洁标签和熟悉的 symbol。Sidebar icon 默认可以跟随用户选择的 system accent color；固定颜色应仅在颜色能够澄清语义时使用。[HIG: Sidebars](https://developer.apple.com/design/human-interface-guidelines/sidebars)

## 6. Content、Background Extension 与 Scroll Edge

新设计鼓励内容 edge-to-edge，并允许 sidebar 与 toolbar 浮在内容之上。系统通过 safe area 保护不能被遮挡的正文和交互区域。[Adopting Liquid Glass](https://developer.apple.com/documentation/technologyoverviews/adopting-liquid-glass)

Background extension effect 用于在不拉伸主要内容的情况下，把邻近视觉延伸到 sidebar 或其他浮动界面下方。Apple 将其描述为对边缘视觉进行镜像和模糊的效果。[HIG: Sidebars](https://developer.apple.com/design/human-interface-guidelines/sidebars)；[WWDC25: Build an AppKit app with the new design](https://developer.apple.com/videos/play/wwdc2025/310/)

Scroll edge effect 在滚动内容与浮动界面相遇时提供可读性边界：

- 它使用渐变 blur，而不是固定的硬分隔线。
- 同一 view 不应混用或叠加多个 scroll edge effect。
- macOS 的 hard style 可用于 pinned text、无背景 control 或 table header 需要更明显分离的场景。

[WWDC25: Get to know the new design system](https://developer.apple.com/videos/play/wwdc2025/356/)；[WWDC25: Meet Liquid Glass](https://developer.apple.com/videos/play/wwdc2025/219/)

## 7. 形状、密度与颜色

Apple 使用控件尺寸表达不同的信息密度：[WWDC25: Get to know the new design system](https://developer.apple.com/videos/play/wwdc2025/356/)

- macOS 的 Mini、Small 和 Medium 控件保持 rounded rectangle，以适应高密度界面。
- Large 与 Extra Large 控件更接近 capsule，适合需要突出显示的动作。
- Concentricity 用于协调相邻或嵌套形状的 radius 与 margin。

Apple 要求 tint 具有明确功能意义。Primary action 可以使用强调色，但同时给大量元素着色会削弱层级。应用的个性色彩应主要存在于 content layer，而不是覆盖整个 functional layer。[WWDC25: Meet Liquid Glass](https://developer.apple.com/videos/play/wwdc2025/219/)

对于 sidebar 这类大面积 glass，系统会限制背景变化导致的频繁 light/dark appearance 翻转，以减少视觉干扰。[WWDC25: Meet Liquid Glass](https://developer.apple.com/videos/play/wwdc2025/219/)

## 8. 动效与交互反馈

Apple 将 Liquid Glass 的视觉、运动和交互共同设计。控件在按下时会即时 flex 和 illuminate，并可以在状态变化时 morph。[WWDC25: Meet Liquid Glass](https://developer.apple.com/videos/play/wwdc2025/219/)

Apple 展示的菜单和控件转换会保持与触发源的空间关系：界面从触发控件附近展开或变形，而不是从无关位置出现。Glass 的出现与消失被描述为 materialize 与 dematerialize，而不仅是 opacity fade。[WWDC25: Meet Liquid Glass](https://developer.apple.com/videos/play/wwdc2025/219/)；[WWDC25: Get to know the new design system](https://developer.apple.com/videos/play/wwdc2025/356/)

## 9. 辅助功能

系统辅助功能设置会直接改变 Liquid Glass 的表现：[Adopting Liquid Glass](https://developer.apple.com/documentation/technologyoverviews/adopting-liquid-glass)；[WWDC25: Meet Liquid Glass](https://developer.apple.com/videos/play/wwdc2025/219/)

- Reduce Transparency：材质变得更 frosty，提高对背后内容的遮蔽。
- Increase Contrast：元素趋向更明确的黑色或白色，并获得更清晰的对比边界。
- Reduce Motion：降低动态效果强度并关闭 elastic behavior。

Apple 要求在不同显示环境和辅助功能设置下检查自定义颜色、动画与材质。系统组件会自动获得相应适配；自定义组件需要单独验证。[Adopting Liquid Glass](https://developer.apple.com/documentation/technologyoverviews/adopting-liquid-glass)

## 官方资料

- [Human Interface Guidelines: Materials](https://developer.apple.com/design/human-interface-guidelines/materials)
- [Human Interface Guidelines: Sidebars](https://developer.apple.com/design/human-interface-guidelines/sidebars)
- [Human Interface Guidelines: Toolbars](https://developer.apple.com/design/human-interface-guidelines/toolbars)
- [Human Interface Guidelines: Search fields](https://developer.apple.com/design/human-interface-guidelines/search-fields)
- [Human Interface Guidelines: Lists and tables](https://developer.apple.com/design/human-interface-guidelines/lists-and-tables)
- [Adopting Liquid Glass](https://developer.apple.com/documentation/technologyoverviews/adopting-liquid-glass)
- [WWDC25: Meet Liquid Glass](https://developer.apple.com/videos/play/wwdc2025/219/)
- [WWDC25: Get to know the new design system](https://developer.apple.com/videos/play/wwdc2025/356/)
- [WWDC25: Build an AppKit app with the new design](https://developer.apple.com/videos/play/wwdc2025/310/)
