# Microsoft Fluent UI / Fluent 2 设计系统调研

调研日期：2026-08-25

## 结论先行

Fluent UI 不是单一的 React 组件包，而是 Microsoft 的跨平台设计语言、设计资源和多套实现的集合。用户给出的 [Fluent UI 入口](https://developer.microsoft.com/en-us/fluentui#/) 仍是旧版开发者门户：页面导航和版本选择仍包含 Fluent UI React v8、v7、Fabric React 等历史版本。当前设计主线应以 [Fluent 2 Design System](https://fluent2.microsoft.design/) 为准；Web React 的当前实现是 [Fluent UI React v9](https://storybooks.fluentui.dev/react/)，包名为 `@fluentui/react-components`。

对本仓库最有价值的不是照搬 Microsoft 的全部视觉风格，而是借鉴其结构：`FluentProvider` 作为主题边界、语义设计 tokens、组件 slots、原生语义和可访问性约束，以及 Griffel 的原子化样式模型。Electron renderer 是 React，因而可以选择性借鉴 React v9 的架构；不建议为了使用 Fluent 而把整个 `packages/ui` 直接替换成 Fluent 组件库。

## 1. 入口与版本关系

### 1.1 旧入口 `developer.microsoft.com/en-us/fluentui#/`

旧入口仍提供 Fluent UI 的 Get started、Styles、Components、Resources 导航，并在页面数据中列出 Fluent UI React major 8、7、Fabric React 6/5。它适合查历史包、旧版文档和迁移背景，但不应被当作 Fluent 2 的规范入口。

来源：[旧 Fluent UI 开发者入口](https://developer.microsoft.com/en-us/fluentui#/)

### 1.2 当前 Fluent 2 文档

[Fluent 2 Design System](https://fluent2.microsoft.design/) 把入口拆为设计和开发两条路径，并提供 React、Web Components、iOS、Android、Windows 等平台。其 React 开发页明确要求新 Web React 项目使用 Fluent UI React v9、`@fluentui/react-components` 和 `FluentProvider`。

来源：[Fluent 2 Start developing](https://fluent2.microsoft.design/get-started/develop/)

### 1.3 v8 与 v9 的边界

- **v8 / Fluent 1 体系**：历史包 `@fluentui/react`，组件 API 以 `styles`、运行时 theme、render callbacks 和 data props 为主。
- **v9 / Fluent 2 体系**：`@fluentui/react-components`，采用 Fluent 2 tokens、`FluentProvider`、slots、JSX children、Griffel `makeStyles` 和新的组件 API。
- v9 不是 v8 的无缝小版本升级。官方迁移文档建议增量迁移，v8 与 v9 可并存；迁移期间可能暂时增加 bundle size，旧组件也并非全部已有 v9 对等组件。
- 官方组件映射显示若干 API 是重命名或整合（例如 `PrimaryButton`/`DefaultButton`/`ActionButton` 归并到 `Button appearance`，`ThemeProvider` 转为 `FluentProvider`，`ContextualMenu` 转为 `Menu` + `MenuTrigger`）。部分 v8 组件暂无直接等价物。

来源：[v9 Getting started migration](https://github.com/microsoft/fluentui/blob/master/apps/public-docsite-v9/src/Concepts/Migration/GettingStarted.mdx)、[v8 Component Mapping](https://github.com/microsoft/fluentui/blob/master/apps/public-docsite-v9/src/Concepts/Migration/FromV8/ComponentMapping.mdx)、[Fluent UI React Storybook](https://storybooks.fluentui.dev/react/)

## 2. Fluent 2 设计原则与视觉语言

Fluent 官方把设计原则定义为指导产品决策的共享价值，而不是一组装饰规则：

1. **Natural on every platform**：体验应适应设备和平台，优先复用用户熟悉的原生模式；官方说明约 80% 的常规体验可以复用平台组件，把精力集中在 signature experience。
2. **Built for focus**：减少视觉噪音和阻碍，让用户保持工作流，产品应推动行动而不是打断行动。
3. **One for all, all for one**：从不同能力和视角出发，把包容性尽早纳入设计和开发。
4. **Unmistakably Microsoft**：通过颜色、声音、插画、图标等 signature experience 建立 Microsoft 产品间的识别和连续性。

来源：[Fluent 2 Design principles](https://fluent2.microsoft.design/design-principles/)

### 2.1 Color

Fluent 2 把颜色分成三类 palette：

- **Neutral**：黑、白、灰，用于表面、文字、布局和交互状态。
- **Shared**：跨 Microsoft 365 产品复用的高价值颜色，用于头像、日历、徽章等可快速识别的对象。
- **Brand**：产品品牌色，用于产品识别、按钮和 CTA 等重点区域。

颜色应表达层级、状态和品牌，而不是填满大面积背景。Semantic colors（成功、警告、错误等）只用于传达重要信息，不应作为装饰。交互通常由 rest 到 hover 到 pressed/selected 逐步变深；focus 不改变控件填充，而使用更粗的 stroke 区分键盘焦点。

来源：[Fluent 2 Color](https://fluent2.microsoft.design/color/)、[Fluent 2 Color tokens](https://fluent2.microsoft.design/color-tokens/)

### 2.2 Shapes

Fluent 2 只使用少数可识别的形状语言：rectangle（按钮、输入、菜单、卡片）、circle（头像）、pill（滑块、开关、标签）和 beak（与对象关联的 popover/callout）。Web 矩形组件默认圆角通常为 4px；小组件 2px，大组件可使用 8px/12px。官方还规定了 None/Small/Medium/Large/X-Large/圆形的 radius tokens，以及 1/2/3/4px 的 stroke 厚度。

来源：[Fluent 2 Shapes](https://fluent2.microsoft.design/shapes/)

### 2.3 Elevation 和 Material

Elevation 用 shadow 与 light 表示对象沿 z 轴的层级，既帮助扫描也表示重要性。Fluent 阴影由 sharp directional key shadow 与 soft ambient shadow 组合，并提供 `$shadow2`、`$shadow4`、`$shadow8`、`$shadow16`、`$shadow28`、`$shadow64` 等等级；Windows 平台还会用 stroke 代替 key shadow。彩色表面不能直接复用中性色阴影，应使用 brand shadow tokens 调整亮度。

Material 描述表面质感：Solid 是默认不透明表面；Acrylic 是适合 popover/menu 等短暂浮层的半透明磨砂；Mica 是带桌面色调、用于 Windows 活跃窗口基底的材料；Smoke 用于 modal 下方的遮罩。

来源：[Fluent 2 Elevation](https://fluent2.microsoft.design/elevation/)、[Fluent 2 Material](https://fluent2.microsoft.design/material/)

### 2.4 Typography 和 Layout

Segoe 是 Fluent 的主要字体；Web 在可行时使用系统字体栈以保持平台熟悉感和可访问性。Fluent 的 type ramp 通过明确的语义角色、字号、字重、行高和基线组织层级，而不是让每个组件自行决定字体。

Layout 通过 spacing ramp、proximity、grid、alignment 和 responsive/adaptive 规则建立关系。Web 的全局 spacing ramp 包含 0、2、4、6、8、10、12、16、20、24、28、32、36、40、48、52、56 等值；12 列 grid 是常见且便于响应式拆分的框架。间距用于表达关系和视觉节奏，不应机械地在所有地方使用同一值。

来源：[Fluent 2 Typography](https://fluent2.microsoft.design/typography/)、[Fluent 2 Layout](https://fluent2.microsoft.design/layout/)

## 3. React v9 组件架构

### 3.1 Provider 和主题边界

`FluentProvider` 在 React 树上提供主题和全局样式，可以覆盖整个应用，也可以嵌套覆盖局部区域。官方最小使用方式如下：

```tsx
import { FluentProvider, webLightTheme, Button } from '@fluentui/react-components';

export function App() {
  return (
    <FluentProvider theme={webLightTheme}>
      <Button appearance="primary">Hello Fluent UI</Button>
    </FluentProvider>
  );
}
```

主题通过 CSS variables 写入 DOM；组件样式引用 tokens，而不是把具体颜色写死。

来源：[Fluent 2 React develop setup](https://fluent2.microsoft.design/get-started/develop/)、[FluentProvider usage](https://fluent2.microsoft.design/components/web/react/core/fluentprovider/usage/)、[React styling components](https://github.com/microsoft/fluentui/blob/master/apps/public-docsite-v9/src/Concepts/StylingComponents.mdx)

### 3.2 Slots：可组合的组件部件

v9 组件把可替换的部件暴露为 top-level slot props。例如 `Input` 有 `contentBefore`/`contentAfter`，`Button` 有 `icon`。slot 可以接受：

- primitive shorthand（字符串、React element）
- props object（包括 `className`、事件和 ARIA 属性）
- `as` 改变允许的原生元素类型
- render function 完全替换 slot 内容（应作为最后的 escape hatch，并重新验证可访问性）

组件的主要层级使用 JSX children（例如 `Accordion > AccordionItem > AccordionHeader/Panel`），而不是 v8 的数据数组和 render callbacks。官方建议：全局外观优先改 theme，单个实例用 `makeStyles` + `className`，行为或结构大改才使用 hooks composition API。

来源：[Customizing Components with Slots](https://github.com/microsoft/fluentui/blob/master/apps/public-docsite-v9/src/Concepts/Slots/Slots.mdx)、[v9 migration guide](https://github.com/microsoft/fluentui/blob/master/apps/public-docsite-v9/src/Concepts/Migration/GettingStarted.mdx)

### 3.3 Hooks composition

v9 的组件内部通常拆成 `useX_unstable(props, ref)` 计算 state、`useXStyles_unstable(state)` 应用默认样式和 `renderX_unstable(state)` 渲染。应用可以使用 slots 和 className 做常规扩展；需要自定义组件结构或复用行为 primitives 时才使用 hooks composition。官方明确把 hooks API 视为更强但更复杂的扩展点。

来源：[Advanced styling techniques](https://github.com/microsoft/fluentui/blob/master/apps/public-docsite-v9/src/Concepts/AdvancedStylingTechniques.mdx)、[Slots guidance](https://github.com/microsoft/fluentui/blob/master/apps/public-docsite-v9/src/Concepts/Slots/Slots.mdx)

## 4. Tokens、主题和 Griffel

### 4.1 两层 tokens

Fluent tokens 分两层：

- **Global tokens**：无上下文的原始值，例如颜色、字体、spacing、radius、stroke、animation。
- **Alias tokens**：带语义的值，例如 `colorNeutralForeground2Hover`、`colorBrandForegroundLinkPressed`、`spacingVerticalXL`。

Alias token 让组件依赖“用途”而不是具体 hex/pixel，支持 light、dark、high contrast 和 brand theme，并减少组件之间的主题脆弱性。

来源：[Fluent 2 Design tokens](https://fluent2.microsoft.design/design-tokens/)、[Fluent 2 Color tokens](https://fluent2.microsoft.design/color-tokens/)

### 4.2 Griffel styling

React v9 使用开源 [Griffel](https://griffel.js.org/) CSS-in-JS。`makeStyles` 生成类型安全、原子化 CSS classes，`mergeClasses` 负责按优先级合并和去重；不要简单拼接 class 字符串。主题变化只更新 CSS variables，不需要重写组件 class。

Griffel 的首次渲染仍会进行 style resolution，但可通过 `@griffel/webpack-loader` 或 `@griffel/babel-preset` 在 build time 预计算，减少运行时开销并支持更小的 bundle。限制包括 CSS shorthand 需要 Griffel 的 `shorthands` helper，以及需要理解 atomic class 的优先级。

来源：[Fluent v9 Styling components](https://github.com/microsoft/fluentui/blob/master/apps/public-docsite-v9/src/Concepts/StylingComponents.mdx)、[Build time styles](https://github.com/microsoft/fluentui/blob/master/apps/public-docsite-v9/src/Concepts/BuildTimeStyles.mdx)、[Griffel 官方文档](https://griffel.js.org/)

## 5. Accessibility 和 Motion

Fluent 官方称组件满足或超过 WCAG 2.1 AA，并要求使用者继续遵守语义结构、键盘导航、焦点管理、对比度、响应式和媒体替代文本等规范。重点包括：

- 标题按逻辑层级组织，避免只靠视觉字号表达层级。
- 键盘焦点遵循可预测的 z-pattern；关闭 dialog、popover 等临时 UI 后焦点不能丢失。
- 普通文字对比度至少 4.5:1，大文字至少 3:1，交互组件/图标与相邻颜色至少 3:1。
- 页面应在放大至 400% 时重排到约 320px 宽，文本缩放 200% 不裁切。
- 颜色不能作为唯一信息通道，状态要配合文字、图形或其他指示。

Motion 的四个原则是 Functional、Natural、Consistent、Appealing。动效应服务于状态变化和注意力移动，遵循 inertia/gravity/weight/velocity 等自然规律；大元素通常需要更长 duration，top-level 页面切换偏好快速 fade 而不是大幅滑动。必须支持 no-motion/reduced-motion，避免闪烁和突发运动，并用 ARIA live regions 等非视觉方式传达动画包含的信息。

来源：[Fluent 2 Accessibility](https://fluent2.microsoft.design/accessibility/)、[Fluent 2 Motion](https://fluent2.microsoft.design/motion/)

## 6. 跨平台范围

Fluent 2 的设计语言跨越：

- React Web：`@fluentui/react-components`，React + TypeScript + Griffel。
- Web Components：`@fluentui/web-components`，基于 FAST Element，使用 CSS variable tokens 和 `setTheme`。
- Apple：Fluent UI Apple，Swift/UIKit/AppKit，覆盖 iOS、iPadOS、macOS。
- Android：Fluent UI Android，Kotlin/Compose。
- Windows：WinUI 3 组件承载 Fluent 设计语言。

这说明 Fluent 的跨平台核心是 tokens、语义和行为原则，而不是在所有平台强行复用相同 DOM 或 CSS。Electron 应视为 Web/React 平台，并额外处理桌面窗口、键盘密度和系统主题集成。

来源：[Fluent 2 Start developing / platform tabs](https://fluent2.microsoft.design/get-started/develop/)

## 7. 对 Memorilo Electron/React 的建议

### 建议借鉴

1. **在 `packages/ui` 建立 provider/theme 边界**：可借鉴 `FluentProvider` 的思想，在 renderer composition root 应用主题，局部功能通过嵌套 provider 或语义上下文覆盖。
2. **建立语义 tokens**：把现有 StyleX theme tokens 按 surface、foreground、stroke、brand/status、spacing、radius、shadow、motion 分类；组件只引用语义 token，不直接写颜色和阴影。
3. **公共控件采用 slots/compound API**：`Root`、`Trigger`、`Content`、`Item` 等结构适合菜单、popover、dialog、tabs、toolbar；局部内容通过 slot 或明确的 slot props 扩展，避免布尔 prop 爆炸。
4. **保持原生语义和状态契约**：组件 API 同时定义 `disabled`、`focus-visible`、`selected`、`open`、`error`、reduced-motion 和 ARIA 行为，类似 Fluent v9 的 state/slot 分离。
5. **借鉴 Griffel 的原则而非强行引入**：StyleX 已是本仓库的样式基础，优先采用原子化、可静态分析、token 驱动和明确 merge 优先级；除非有性能或生态理由，不要在同一组件同时引入 Griffel 和 StyleX。
6. **桌面密度使用 Fluent 的布局方法**：spacing ramp、清晰层级、键盘导航和 focus ring 很适合编辑器、侧栏、命令面板和设置窗口。

### 采用风险

- **视觉不一定匹配产品**：Fluent 2 的默认圆角、阴影、Segoe/系统字体和 Microsoft brand palette 会把产品推向 M365 视觉；直接引入会削弱 Memorilo 已有的主题语言。
- **v8/v9 混用成本高**：两个包同时存在会增加 bundle、样式隔离、portal/z-index 和主题同步复杂度。官方迁移文档也把增量并存视为过渡方案，而不是终态。
- **组件覆盖不完整**：v8 到 v9 并非一一对应，部分复杂组件需要兼容包或自建实现；编辑器、树、数据表格和特殊浮层仍要评估功能与交互差异。
- **slots 不是无约束替换**：slot 的 `as` 类型受限，render function 替换整个 slot 后可能破坏焦点、ARIA 和布局；公共 `packages/ui` 应保持更小、更稳定的 API。
- **Griffel 与 StyleX 重叠**：两个 CSS-in-JS 运行时会造成心智和构建配置负担；本仓库已有 StyleX 约束，应只吸收设计系统和架构思想。
- **平台材料不可直接移植**：Mica/Acrylic 是 Windows 语义；Electron macOS 不应把它们当作通用玻璃效果，需要尊重 macOS 原生窗口和本仓库的 Apple design 约束。

### 推荐决策

不建议现在把 `packages/ui` 全量改成 Fluent UI。更合适的是：以 Fluent 2 的 tokens、Provider、slots、可访问性和 motion 原则作为参考，继续使用本仓库已有的 `@memorilo/ui`、StyleX 和主题系统；如果未来确实需要采用 Fluent React 组件，优先在一个低风险 renderer 页面做 v9 spike，验证 Electron 下的 bundle、portal、键盘焦点、主题切换、暗色模式和组件覆盖率，再决定是否扩大范围。

## 8. 官方资料索引

- [旧 Fluent UI 开发者入口](https://developer.microsoft.com/en-us/fluentui#/)
- [Fluent 2 Design System 首页](https://fluent2.microsoft.design/)
- [Fluent 2 Design principles](https://fluent2.microsoft.design/design-principles/)
- [Fluent 2 Start developing](https://fluent2.microsoft.design/get-started/develop/)
- [Fluent 2 Color](https://fluent2.microsoft.design/color/)
- [Fluent 2 Color tokens](https://fluent2.microsoft.design/color-tokens/)
- [Fluent 2 Design tokens](https://fluent2.microsoft.design/design-tokens/)
- [Fluent 2 Shapes](https://fluent2.microsoft.design/shapes/)
- [Fluent 2 Elevation](https://fluent2.microsoft.design/elevation/)
- [Fluent 2 Material](https://fluent2.microsoft.design/material/)
- [Fluent 2 Typography](https://fluent2.microsoft.design/typography/)
- [Fluent 2 Layout](https://fluent2.microsoft.design/layout/)
- [Fluent 2 Accessibility](https://fluent2.microsoft.design/accessibility/)
- [Fluent 2 Motion](https://fluent2.microsoft.design/motion/)
- [Fluent 2 React overview](https://fluent2.microsoft.design/components/web/react/)
- [Fluent UI React Storybook](https://storybooks.fluentui.dev/react/)
- [Fluent UI React GitHub repository](https://github.com/microsoft/fluentui)
- [v9 migration: Getting started](https://github.com/microsoft/fluentui/blob/master/apps/public-docsite-v9/src/Concepts/Migration/GettingStarted.mdx)
- [v8 to v9 component mapping](https://github.com/microsoft/fluentui/blob/master/apps/public-docsite-v9/src/Concepts/Migration/FromV8/ComponentMapping.mdx)
- [v9 breaking changes](https://github.com/microsoft/fluentui/blob/master/apps/public-docsite-v9/src/Concepts/Migration/HandlingBreakingChanges.mdx)
- [v9 slots](https://github.com/microsoft/fluentui/blob/master/apps/public-docsite-v9/src/Concepts/Slots/Slots.mdx)
- [v9 styling components](https://github.com/microsoft/fluentui/blob/master/apps/public-docsite-v9/src/Concepts/StylingComponents.mdx)
- [v9 build-time styles](https://github.com/microsoft/fluentui/blob/master/apps/public-docsite-v9/src/Concepts/BuildTimeStyles.mdx)
- [Griffel](https://griffel.js.org/)

## 资料性质说明

本文优先使用 Microsoft Fluent 2 官方设计页面、官方 React Storybook 和 `microsoft/fluentui` 源码仓库文档。Fluent 2 页面描述设计原则和平台指导；GitHub 文档描述 React v9 的实际 API、迁移约束与性能模型。关于 Memorilo 的建议是基于这些一手资料和当前仓库 Electron/React/StyleX 架构的工程判断，不是 Microsoft 的官方推荐。
