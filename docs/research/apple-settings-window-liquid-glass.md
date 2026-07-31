# macOS 设置窗口与 Liquid Glass 研究

研究日期：2026-07-31

## 结论摘要

1. 设置应从 macOS App 菜单中的 `Settings...` 打开，位置在 `About Memorilo` 之后的独立分组内，使用标准 `Command-,` 快捷键。设置是应用级命令，不应放进主窗口工具栏。
2. 设置应使用独立、非模态、单实例的顶层窗口。不要给 `BrowserWindow` 设置 `parent` 或 `modal`：Electron 的子窗口会始终位于父窗口之上，而 macOS 模态子窗口会变成附着于父窗口的 sheet，这都不符合“独立设置窗口”。再次选择设置时应聚焦已有窗口。
3. 当前只有一个设置 pane，窗口标题应为 `Memorilo Settings`（本地化后显示对应语言），无需增加 pane 导航工具栏。使用系统窗口框架和交通灯，不自绘窗口控件；关闭可用，最小化和最大化/全屏应禁用并呈灰态。
4. Liquid Glass 不是“整个窗口使用半透明卡片”。Apple 明确把它限定为浮在内容之上的控件与导航功能层，并要求避免 glass-on-glass。设置行属于内容层，应保持安静、清晰；语言使用 pop-up button，减少动画使用 switch。
5. Electron 的 `vibrancy` 是 macOS 标准材质接口，不等同于 Apple 在新 SDK 的 AppKit/SwiftUI 中提供的完整 Liquid Glass（动态 lensing、光照、形变与系统自适应）。实现可以使用原生窗口框架和克制的 vibrancy 来接近层级感，但不能把 CSS blur 或 Electron vibrancy 描述成“原生 Liquid Glass”。
6. Apple 建议应用遵循系统级 Reduce Motion，而不是重复提供全局选项。既然产品明确要求应用内开关，建议有效值为 `systemPrefersReducedMotion || appReduceMotion`：应用开关只能进一步减少动画，不能覆盖系统的减少动态效果。系统 Reduce Transparency / Increase Contrast 也必须保留可读的退化表现。
7. Apple 同样建议避免重复系统级语言与地区设置。产品若保留应用内语言，应明确它只控制 Memorilo 的界面语言，默认选项使用 `System Default`，并用 pop-up button 呈现互斥选项。

## Apple 官方规范

### 设置入口与窗口行为

Apple HIG 的 [Settings](https://developer.apple.com/design/human-interface-guidelines/settings) 明确说明：

- macOS 用户从 App 菜单选择 Settings 后，应用的自定义设置窗口打开。
- App 菜单必须包含 Settings；不要在窗口工具栏增加 Settings 按钮，因为这会挤占更常用命令的空间。
- 标准入口快捷键是 `Command-,`。
- 设置窗口的 minimize 和 maximize 按钮应呈禁用状态；窗口可以快速重新打开，没有必要最小化到 Dock，也无需扩大窗口查看内容。
- 多 pane 设置窗口通常使用不可自定义且始终显示的工具栏；窗口标题反映当前 pane。只有一个 pane 时，标题使用 `App Name Settings`。
- 若有多个 pane，应恢复上次打开的 pane。当前原型只有一个 pane，因此不应为了“像设置页”而制造空的 sidebar 或 toolbar。

Apple 的 [SwiftUI Settings scene](https://developer.apple.com/documentation/swiftui/settings) 也把 Settings 建模为专门用于查看和修改应用设置的独立 scene，而不是主内容窗口中的一个页面。

Apple HIG 的 [The menu bar](https://developer.apple.com/design/human-interface-guidelines/the-menu-bar) 进一步规定 App 菜单的典型顺序：

1. `About Memorilo`
2. 分隔线
3. `Settings...`
4. 可选的应用级配置命令
5. 分隔线及 Services / Hide / Quit 等标准命令

该页面还要求支持标准命令已有的快捷键，并保持系统定义的菜单顺序。`Settings...` 只用于应用级设置；文档级设置应放在 File 菜单。

### 独立窗口而非主窗口页面

Apple HIG 的 [Windows](https://developer.apple.com/design/human-interface-guidelines/windows) 将 auxiliary window 定义为专注于一个具体任务或应用区域的窗口。它还明确建议使用系统窗口框架与控件，不要自绘或模仿窗口 chrome。设置窗口应按这种辅助窗口处理：它与主窗口同时存在，拥有自己的焦点和关闭行为，但不阻塞主窗口。

对本项目的直接约束：

- 保留系统 window frame、阴影、关闭按钮和活动/非活动状态反馈。
- 不做无边框窗口，不自绘交通灯，不把设置做成主窗口内路由、sheet 或 modal。
- 设置窗口使用单实例：已存在时 `show`/`focus`，销毁后才创建新实例。
- 初始大小以两项设置刚好舒展为准，避免大面积空白；当前单 pane 可固定尺寸或设置紧凑的最小/最大尺寸。

### Liquid Glass 的层级与材质

Apple HIG 的 [Materials](https://developer.apple.com/design/human-interface-guidelines/materials) 和 [Adopting Liquid Glass](https://developer.apple.com/documentation/TechnologyOverviews/adopting-liquid-glass) 给出的核心规则是：

- Liquid Glass 是 controls/navigation 的独立功能层，浮在 content layer 上方；它不是页面背景或内容容器样式。
- 不要在 content layer 使用 Liquid Glass。内容背景应使用标准 material；toggle/slider 的可交互部分可以在激活时呈现玻璃质感。
- 少量使用，避免多个玻璃控件争抢注意力；避免玻璃元素彼此叠放或出现拥挤/重叠。
- `regular` 是默认、强调可读性的变体；`clear` 只适用于媒体丰富的背景，且可能需要约 35% 暗化层。设置窗口不是媒体背景，不应使用 clear 风格。
- 标准系统组件能自动根据重叠、焦点和辅助功能设置调整；自定义实现必须自行验证透明度、对比度、浅/深色以及焦点变化。

WWDC25 [Meet Liquid Glass](https://developer.apple.com/videos/play/wwdc2025/219/) 的官方讲稿补充了几个容易被视觉模仿忽略的原则：

- Liquid Glass 通过 lensing 来表达分层，不只是 blur；视觉与运动被设计为一个整体。
- 静止状态应保持安静，交互时才“活起来”。
- 它应保留为 navigation layer；不要把 table/list 本身做成玻璃，否则会弄乱层级。
- 避免 glass-on-glass；叠加内容使用 fill、transparency 和 vibrancy 表达，而不是再加一层 glass。
- Reduced Transparency 会让材质更磨砂，Increase Contrast 会增加黑白对比和边框，Reduced Motion 会降低效果强度并关闭弹性。

因此，本设置页的视觉方向应是：系统窗口 chrome + 一个安静的内容层 + 原生形态的 pop-up button 和 switch。不要把每一行包成玻璃卡片，也不要用多层 blur、强反射、高光描边或持续漂移动画来“模拟液态”。

### 语言与减少动画控件

Apple HIG [Pop-up buttons](https://developer.apple.com/design/human-interface-guidelines/pop-up-buttons) 建议用 pop-up button 呈现扁平、互斥选项，并提供合理默认值和清楚的上下文标签。语言设置适合以下结构：

- 行标签：`Language`
- 控件：pop-up button
- 默认项：`System Default`
- 其余项：仅列出应用实际完整支持的语言

Apple 的 [Mac User Guide: Change the language your Mac uses](https://support.apple.com/guide/mac-help/change-the-system-language-mh26684/mac) 确认 macOS 本身支持按应用选择语言，并在系统界面中用 pop-up menu 选择应用和语言。它也说明系统级变更可能需要退出并重新打开应用。本项目若承诺热更新，应把“即时更新界面与菜单”作为 Memorilo 自己的产品能力，而不是假定操作系统会自动完成运行时切换。

Apple HIG [Toggles](https://developer.apple.com/design/human-interface-guidelines/toggles) 说明 toggle 用于一对相反状态；macOS 中 switch、checkbox 和 radio 应位于 window body，而不是 toolbar 或 status bar。Switch 视觉权重更高，适合需要强调或影响较广的设置。减少动画应使用一行、尾随 switch，并以行标签清楚说明作用域。

Apple HIG [Accessibility](https://developer.apple.com/design/human-interface-guidelines/accessibility) 对 Reduce Motion 的具体退化建议包括：

- 减少自动与重复动画，尤其是 zoom、scale 和周边运动。
- 收紧 spring，移除 bounce。
- 用 fade 代替 x/y/z 位移过渡。
- 避免 blur 的进出场动画。

AppKit 的 [NSWorkspace.accessibilityDisplayShouldReduceMotion](https://developer.apple.com/documentation/appkit/nsworkspace/accessibilitydisplayshouldreducemotion) 则直接暴露系统减少动态效果偏好，并建议通过 accessibility display options change notification 响应变化。Electron 已把这一平台信息汇总到下文的 `getAnimationSettings()`。

## Electron 官方能力与限制

### App 菜单

Electron [Menu](https://www.electronjs.org/docs/latest/api/menu) 说明 `Menu.setApplicationMenu(menu)` 在 macOS 设置全局应用菜单，菜单本身是原生菜单。

Electron [Menus guide](https://www.electronjs.org/docs/latest/tutorial/menus) 建议标准动作优先使用 `role`，因为 role 会采用平台原生行为与默认 label/accelerator。当前 Electron 官方 role 列表没有 `settings` 或 `preferences` role；`appMenu` 只提供默认 App 菜单整体，不能附带自定义 Settings click handler。因此应自定义 App submenu，并对 About / Services / Hide / Quit 等项目继续使用标准 role，仅对 `Settings...` 使用 `click`。

Electron [Keyboard Shortcuts](https://www.electronjs.org/docs/latest/tutorial/keyboard-shortcuts) 说明应用内快捷键应挂在 MenuItem 的 `accelerator` 上；`CommandOrControl` 在 macOS 映射为 Command，在 Windows/Linux 映射为 Control。设置项可使用：

```ts
{
  label: 'Settings...',
  accelerator: 'CommandOrControl+,',
  click: openSettingsWindow,
}
```

`openSettingsWindow` 应始终复用并聚焦已有设置窗口。

### 独立 BrowserWindow

Electron [BrowserWindow](https://www.electronjs.org/docs/latest/api/browser-window) 与 [BaseWindowConstructorOptions](https://www.electronjs.org/docs/latest/api/structures/base-window-options) 给出的关键行为：

- `parent` 会创建 child window，child 始终位于 parent 之上。
- `parent + modal` 才是 modal；macOS 会把它显示为附着在父窗口的 sheet。
- 设置窗口应省略 `parent` 且保持 `modal: false`，从而成为独立顶层窗口。
- `minimizable: false`、`maximizable: false`、`fullscreenable: false` 对应 HIG 的禁用要求；`closable` 保持 `true`。
- `show: false` 后等待 `ready-to-show` 再显示可避免首次渲染闪烁；Electron 还建议设置接近页面的 `backgroundColor`，让窗口感觉更原生。
- `titleBarStyle: 'hidden'` / `'hiddenInset'` 会把内容扩展进标题栏，虽然仍保留交通灯，但会显著增加安全区、拖拽区和视觉还原成本。设置窗口应优先使用默认原生 title bar；只有截图验证确有收益时才采用 `hiddenInset`。

建议的 macOS 窗口语义（不是最终尺寸参数）：

```ts
new BrowserWindow({
  title: 'Memorilo Settings',
  show: false,
  parent: undefined,
  modal: false,
  closable: true,
  minimizable: false,
  maximizable: false,
  fullscreenable: false,
  resizable: false,
  // 保留默认原生 title bar；具体 width/height 由截图调试确定。
})
```

### Vibrancy 与辅助功能

Electron 的 BaseWindow options 支持 macOS `vibrancy`（如 `window`、`content`、`under-window`、`sidebar`）及 `visualEffectState: 'followWindow'`；后者会让材质随窗口 active/inactive 状态变化。它们是 NSVisualEffectView 风格的系统材质能力，不包含 Apple 新 Liquid Glass 的全部光学与动态行为。

若使用 vibrancy：

- 优先 `visualEffectState: 'followWindow'`，不要强制 `active`，否则失去 macOS 的窗口焦点层级反馈。
- 对只有两项设置的单 pane，不要使用 `sidebar`；没有导航结构就不该制造导航材质。
- 不在 renderer 再叠一层半透明卡片或 `backdrop-filter`。
- 必须在 Reduce Transparency 时切换到更实、更高对比的背景。

Electron [systemPreferences](https://www.electronjs.org/docs/latest/api/system-preferences) 提供 `getAnimationSettings().prefersReducedMotion`。Electron [nativeTheme](https://www.electronjs.org/docs/latest/api/native-theme) 提供只读的 `prefersReducedTransparency`。这两项应进入设置窗口的有效视觉状态，而不是只读取应用自己的开关。

推荐状态合并：

```ts
const effectiveReduceMotion = systemPrefersReducedMotion || appReduceMotion
```

这样应用设置可以进一步降低动画，却不会违反用户的系统级辅助功能选择。对系统 Reduce Transparency 同理，应直接降级材质，而不是提供允许应用重新打开透明度的反向覆盖。

## 可直接用于本项目的原型规格

### 窗口

- 顶层、非模态、单实例设置窗口；主窗口在设置窗口打开时仍可交互。
- 默认原生 title bar，标题为 `Memorilo Settings`；系统 traffic lights，关闭可用、最小化/最大化禁用。
- 不显示 pane sidebar/toolbar；只有设置项增长到多个稳定类别时再引入不可自定义的 pane toolbar。
- 单列 grouped form，两行等高；使用系统字体、标准间距和清晰的 label/control 对齐。
- 不使用嵌套卡片、装饰性玻璃块、大标题、渐变背景或持续动画。

### 两个设置项

| 设置 | 控件 | 初始建议 | 热更新行为 |
| --- | --- | --- | --- |
| Language | Pop-up button | `System Default` | 写入成功后立即更新所有已打开 renderer 的文案；若某些主进程原生菜单无法原位更新，重建 application menu |
| Reduce Motion | Trailing switch | `Off`，但有效值与系统偏好做 OR | 立即取消/替换非必要动画，spring/slide/scale 改为无动画或短 fade |

### 菜单与生命周期

- App 菜单中 `About` 后添加 separator，再添加 `Settings...`。
- `Settings...` 使用 `CommandOrControl+,`；macOS 显示为 Command-comma。
- 打开流程：窗口存在且未销毁时 `show()` + `focus()`；否则创建一次并在 `ready-to-show` 后显示。
- 关闭后清空持有的引用，确保下次可重新创建；不要累积订阅。

## 本地截图调试清单

至少比较浅色和深色各一张设置窗口截图，并检查以下项目：

- App 菜单中的 Settings 顺序、分组、ellipsis 和 `Command-,` 显示正确。
- 点击菜单打开的是独立窗口；主窗口可继续交互；设置窗口不是 sheet，也不会永远压在主窗口上。
- 连续点击设置菜单只出现一个窗口，第二次会把已有窗口带到前台。
- 标题、系统交通灯、窗口阴影和 active/inactive 外观符合系统窗口；minimize/maximize 呈禁用态。
- 两行控件无需滚动，窗口没有无意义的大面积空白；最长语言名称不会挤压标签或越界。
- Language 使用原生可识别的弹出选择形态，Reduce Motion 使用 switch，两个控件在行尾对齐。
- 没有 glass-on-glass、内容层 blur 卡片、低对比文字、重渐变或过度圆角。
- 切换系统 Dark Mode、Increase Contrast、Reduce Transparency、Reduce Motion 后重新截图；文本和边界仍清楚，材质按预期退化。
- 开启应用 Reduce Motion 后，不再出现 spring、bounce、slide、scale、blur-in/out；允许保留短而克制的 opacity fade。

## 官方来源

### Apple

- [Human Interface Guidelines: Settings](https://developer.apple.com/design/human-interface-guidelines/settings)
- [Human Interface Guidelines: The menu bar](https://developer.apple.com/design/human-interface-guidelines/the-menu-bar)
- [Human Interface Guidelines: Windows](https://developer.apple.com/design/human-interface-guidelines/windows)
- [Human Interface Guidelines: Materials](https://developer.apple.com/design/human-interface-guidelines/materials)
- [Human Interface Guidelines: Pop-up buttons](https://developer.apple.com/design/human-interface-guidelines/pop-up-buttons)
- [Human Interface Guidelines: Toggles](https://developer.apple.com/design/human-interface-guidelines/toggles)
- [Human Interface Guidelines: Accessibility](https://developer.apple.com/design/human-interface-guidelines/accessibility)
- [SwiftUI: Settings](https://developer.apple.com/documentation/swiftui/settings)
- [NSWorkspace.accessibilityDisplayShouldReduceMotion](https://developer.apple.com/documentation/appkit/nsworkspace/accessibilitydisplayshouldreducemotion)
- [Mac User Guide: Change the language your Mac uses](https://support.apple.com/guide/mac-help/change-the-system-language-mh26684/mac)
- [Adopting Liquid Glass](https://developer.apple.com/documentation/TechnologyOverviews/adopting-liquid-glass)
- [WWDC25: Meet Liquid Glass](https://developer.apple.com/videos/play/wwdc2025/219/)

### Electron

- [Menu](https://www.electronjs.org/docs/latest/api/menu)
- [Menus guide](https://www.electronjs.org/docs/latest/tutorial/menus)
- [MenuItem](https://www.electronjs.org/docs/latest/api/menu-item)
- [Keyboard Shortcuts](https://www.electronjs.org/docs/latest/tutorial/keyboard-shortcuts)
- [BrowserWindow](https://www.electronjs.org/docs/latest/api/browser-window)
- [BaseWindowConstructorOptions](https://www.electronjs.org/docs/latest/api/structures/base-window-options)
- [systemPreferences](https://www.electronjs.org/docs/latest/api/system-preferences)
- [nativeTheme](https://www.electronjs.org/docs/latest/api/native-theme)
