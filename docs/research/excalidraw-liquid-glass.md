# Excalidraw Liquid Glass：避免做成传统毛玻璃的官方核查

调研日期：2026-08-12

## 核查范围

本文件只把 Apple 官方资料作为 Liquid Glass 的事实依据：

- [Apple Developer：Adopting Liquid Glass](https://developer.apple.com/documentation/TechnologyOverviews/adopting-liquid-glass)
- [Apple HIG：Materials](https://developer.apple.com/design/human-interface-guidelines/materials)
- [Apple Developer：Applying Liquid Glass to custom views](https://developer.apple.com/documentation/swiftui/applying-liquid-glass-to-custom-views)
- [WWDC25：Meet Liquid Glass](https://developer.apple.com/videos/play/wwdc2025/219/)

本地核查对象：

- `output/playwright/excalidraw-liquid-glass-v2-light.png`
- `output/playwright/excalidraw-liquid-glass-v3-background-response.png`
- `output/playwright/excalidraw-liquid-glass-v3-menu.png`
- `output/playwright/excalidraw-liquid-glass-v2-optical-stress.png`
- `packages/excalidraw/css/theme.scss`
- `packages/excalidraw/css/variables.module.scss`
- `packages/excalidraw/css/styles.scss`

文中“传统毛玻璃”是一个工程诊断用简称，指固定的“半透明浅色填充 + 大半径 blur + 固定白边 + 固定阴影”。它可以形成 frosted glass，但缺少 Apple 官方反复强调的 lensing、环境自适应和流体行为。

## 总结判断

上一版实现确实是传统 GNOME 式毛玻璃：固定乳白填充、大半径 blur、白边和灰色投影主导视觉。这个判断不能被“背景能透出”掩盖，因为 Apple 明确把 lensing（弯曲、塑形和聚光）作为 Liquid Glass 的主要视觉定义。

本轮已按该标准重做外围材质：compact toolbar、zoom/undo 控件、菜单和 panel 降低填充与 blur；主表面使用 regular 层，边缘伪元素通过 Excalidraw 根节点内的 SVG displacement filter 对背景做受控位移；轮廓高光缩窄为 2px，按钮使用胶囊/同心圆角，菜单和文字面板提高局部 regular 厚度以保证可读性。压力场景中高对比线条会在玻璃边缘发生轻微折射，普通浅色场景则保持克制。

这仍然是 Chromium/Electron 中的 Liquid Glass-inspired Web material，不是 Apple 系统级材料：Web 没有系统环境光模型、自动 dynamic range、背景感知阴影或跨组件的真正 morph。现在可以诚实地说“有可观察的边缘 lensing 近似”，不能声称完全复刻 Apple Liquid Glass。

## 必须出现的视觉特征

| 必须出现 | Apple 官方行为与证据 | 网页验收标准 |
| --- | --- | --- |
| 独立、克制的功能层 | HIG `Liquid Glass`：材料承载控件与导航并浮于内容层；不要用于内容层，也不要过度使用。[Materials](https://developer.apple.com/design/human-interface-guidelines/materials#Liquid-Glass) | 玻璃只用于工具栏、菜单、属性浮层和少量导航控件；画布、笔迹、图形、文字和选区不玻璃化。 |
| 背景连续性 | HIG：内容应能从功能层下方 peek through，同时维持控件可读性。[Materials](https://developer.apple.com/design/human-interface-guidelines/materials#Liquid-Glass) | 跨过玻璃边界的图形、颜色或文字仍能被识别为同一背景，而不是在白卡下面消失；regular 材料可模糊和调整亮度，但不能完全切断场所感。 |
| 可观察的 lensing | Apple：lensing 通过弯曲、塑造和集中光线表达材料的存在、运动和形态；不是上一代材料的散射模糊。[Meet Liquid Glass，`01:55–02:51`](https://developer.apple.com/videos/play/wwdc2025/219/?time=115) | 至少在边缘和圆角附近能看到背景纹理发生受控位移、压缩或放大；仅增加 blur、contrast 或白色描边不算 lensing。 |
| 几何与运动感知高光 | Apple：环境光产生的 highlights 会按材料几何和运动变化。[Meet Liquid Glass，`11:04–11:37`](https://developer.apple.com/videos/play/wwdc2025/219/?time=664) | 直边、圆角和按压状态的高光分布不同；hover/press 时高光立即改变，静止后回落。整圈均匀白边或永远固定在左上角不合格。 |
| 背景感知分离 | Apple：阴影在覆盖文字时变深，在纯色浅背景上变浅。[Meet Liquid Glass，`11:38–12:03`](https://developer.apple.com/videos/play/wwdc2025/219/?time=698) | 复杂背景和纯色背景至少使用不同的离散阴影/边界状态；不能在所有背景上固定一团相同的灰影。 |
| 环境自适应 | Apple：材料各层依据背后内容持续改变；tint、shadow 与 dynamic range 一起维持清晰度。[Meet Liquid Glass，`06:00–06:47`](https://developer.apple.com/videos/play/wwdc2025/219/?time=360) | 浅、深、彩色和文字密集背景上不能始终是同一 RGBA；前景图标和材料明暗需有明确的背景分类响应。 |
| 尺寸带来厚度变化 | Apple：材料 morph 到更大尺寸时更厚，阴影更深、lensing/refraction 更明显、散射更柔和。[Meet Liquid Glass，`06:51–07:25`](https://developer.apple.com/videos/play/wwdc2025/219/?time=411) | compact toolbar、menu、large panel 不能只改面积；应有不同的折射强度、边缘宽度、散射和阴影重量。 |
| 交互时 flex 和发光 | Apple：材料响应输入时立即 flex 并 energize with light，静止状态保持安静。[Meet Liquid Glass，`03:10–04:18`](https://developer.apple.com/videos/play/wwdc2025/219/?time=190) | pointer-down 当帧出现轻量压缩及光学响应，释放后连续恢复；不能只有 hover 换底色或机械 scale。 |
| materialize 与 morph | Apple：玻璃不是普通 fade，而是调制 lensing 后 materialize；相关控件在同一浮动平面中连续 shape-shift。[Meet Liquid Glass，`02:55–05:20`](https://developer.apple.com/videos/play/wwdc2025/219/?time=175) | 菜单从触发按钮所在位置展开；相关小表面能连续过渡成大表面。若做不到真实 morph，至少保持相同空间来源与材质参数连续，不能中央淡入。 |
| 有语义的 tint | Apple：tint 只强调主要元素和动作；所有元素都 tint 会失去层级。[Meet Liquid Glass，`15:57–17:26`](https://developer.apple.com/videos/play/wwdc2025/219/?time=957) | 只给当前工具、主动作或特殊状态着色；普通容器与次级控件保持中性。 |

## 必须避免的视觉特征

1. **大面积乳白填充主导材料。** 如果第一眼先看到白卡，第二眼才看到 blur，就是传统毛玻璃，不是轻量透明 lens。
2. **把 blur 当成 lensing。** Apple 明确区分上一代材料的光散射与 Liquid Glass 的实时弯曲、塑形和聚光；继续增大 blur 半径不会跨过这条边界。[Meet Liquid Glass，`02:29–02:47`](https://developer.apple.com/videos/play/wwdc2025/219/?time=149)
3. **均匀描边和贴图式高光。** 固定渐变可以装饰表面，但不能冒充几何/运动感知的环境高光。
4. **所有背景使用同一阴影。** 在均匀浅背景上保留厚重灰雾，正好违背 Apple 所演示的背景感知阴影。
5. **固定的浅色/深色皮肤。** Apple 表示材料不是固定 light/dark appearance，而是各层根据背后内容改变。[Meet Liquid Glass，`06:21–06:47`](https://developer.apple.com/videos/play/wwdc2025/219/?time=381)
6. **玻璃套玻璃、控件逐个玻璃化。** Apple 要求避免控件拥挤和 Liquid Glass 互相叠放。[Adopting Liquid Glass，Controls](https://developer.apple.com/documentation/TechnologyOverviews/adopting-liquid-glass#Controls)
7. **把 Clear 当默认。** HIG 只建议在视觉丰富的媒体背景上使用 clear；明亮背景可能需要 35% dark dimming。普通 toolbar、sidebar 和文字面板应优先 regular。[Materials，Liquid Glass](https://developer.apple.com/design/human-interface-guidelines/materials#Liquid-Glass)
8. **只 fade、不表达来源关系。** 相关表面应从触发位置 materialize/morph；无来源的淡入会失去 Apple 所强调的直接关系。
9. **所有控件都染品牌色。** Apple 明确称这样会让任何东西都不再突出。

## 上一版错误诊断与本轮修正

### 1. 主表面仍由固定浅色填充定义

旧版 `theme.scss:22–24` 将 compact、panel、menu 固定为浅蓝白 RGBA，panel alpha 为 `0.74`，同时使用 `blur(22px/30px)`。结果是左侧面板和顶部工具栏接近白色实心卡片，典型 GNOME 毛玻璃观感。本轮将 compact/panel/menu 改为低 alpha regular 层（约 `0.14/0.46/0.58`），分别使用 `blur(7px/14px)`，只在文字较多的 menu/panel 保留较厚的 regular 背景。

### 2. 名为 lensing 的 mixin 并未位移背景

旧版 `variables.module.scss:3–30` 的 `liquidGlassLensing` 只有固定渐变和二次 blur，命名虽然叫 lensing，但不会位移背景几何。本轮新增 `components/liquidGlass.ts`，按每个表面的实际宽高、圆角和深度生成专属 SVG displacement map，并通过 `ResizeObserver` 更新 `--glass-edge-filter`。`::before` 的 2px mask 只让滤镜作用于表面边缘，避免把工具栏内容和画布对象整体扭曲。Chromium 实测显示动态 `data:` SVG filter 已被真实应用；边缘折射是 Web 端近似，并不等同于 Apple 系统级的连续 lensing。

### 3. 高光变丰富了，但仍是固定贴图

本轮保留方向性高光作为 Web 近似，但将边缘从 3px 收到 2px，并在 hover/press 时立即提高伪元素 brightness/saturation；主工具栏和菜单也接入共享边缘滤镜。它仍不是 Apple 那种随设备光源和真实几何连续变化的高光。

### 4. 阴影仍不感知背景

旧版 compact/panel 阴影宽且固定，在纯色浅背景上形成灰雾。本轮收紧投影范围并降低浅色 panel 的阴影强度；尺寸仍分为 compact/panel 两档。由于 CSS 无法无成本读取后方 Canvas 像素，尚未实现 Apple 系统级的连续背景感知阴影。

### 5. 材料没有环境分类

代码仍以 light/dark 两组 token 为主，没有 Apple 系统级的逐像素环境分类；但透明度、saturate、contrast 和 brightness 现在会让真实 Canvas 颜色参与材料，stress 截图可见蓝/粉内容进入 toolbar/panel。连续环境 tint、dynamic range 和阴影采样仍是明确的后续边界。

### 6. 按压反馈只完成了机械部分

`variables.module.scss:70–94` 和 `:149–154` 已在 active 时缩放、提亮、增饱和，这是比无反馈更好的基础。但 Apple 的行为是 flex 与 energize with light 同时发生；当前主要是 `scale(0.95/0.97)`、背景色和固定 inset shadow，玻璃高光本身不变，也没有与邻近玻璃相互反射。

### 7. 已做对的部分

- 截图中的画布对象不玻璃化，功能层与内容层划分正确。
- 顶部 toolbar 是一个共享表面，没有给每个工具重复 backdrop blur。
- 紫色 tint 只用于当前 Marker 和选中项，符合选择性强调。
- compact/panel 使用不同 blur 和 shadow，已有材料厚度分级的骨架。
- `theme.scss:390–460` 提供不支持 backdrop filter、Reduce Transparency、Increase Contrast 和 Reduce Motion 的降级。
- `Applying Liquid Glass to custom views` 要求多个 effect 使用 container 以改善性能并支持融合/morph；当前共享 toolbar 容器的方向比逐按钮玻璃正确。[官方示例](https://developer.apple.com/documentation/swiftui/applying-liquid-glass-to-custom-views#Combine-multiple-views-with-Liquid-Glass-containers)

## Chromium / Electron 中可真实实现的方案

以下是针对固定 Chromium 版本的工程判断，不是 Apple 对 Web API 的承诺。

### 可可靠实现

- **Regular 基底：** 小面积半透明背景配合 `backdrop-filter` blur/saturate/brightness，保留实色 fallback。
- **受控边缘 lensing：** 对已知 Canvas 内容增加一个小范围、低分辨率的 WebGL/WebGPU 折射采样层，或在测试确认兼容后用 SVG displacement 处理边缘带；只在 toolbar/menu/panel 边缘工作，不覆盖整块画布。
- **几何/指针高光：** 用 CSS custom properties 传入元素尺寸、指针归一化坐标和 press 状态，驱动 radial gradients、mask 与 pseudo-elements。它仍是近似，但可以做到随几何和交互变化，不再是固定贴图。
- **离散背景自适应：** 依据已知画布主题、surface 下方的区域分类或低频亮度采样，选择 `light-solid`、`light-busy`、`dark`、`colorful` 等材质 token；动态调整背景 alpha、前景色、边界与阴影。
- **材料厚度分级：** compact、menu、panel 使用不同的 edge band、折射幅度、散射、阴影和背景 alpha，而不只是不同 blur 半径。
- **交互状态：** pointer-down 即刻更新 scale、edge highlight、亮度与折射强度；pointer-up 连续恢复。变化只用 compositor/GPU 友好路径，书写时可冻结。
- **来源一致的 materialize：** 从触发控件的 bounding rect 计算 `transform-origin`，用 clip/mask/transform 在 menu 与按钮之间建立连续关系；相关表面可用 View Transitions 或统一 overlay layer 管理。
- **可访问性与降级：** 继续保留减少透明度、高对比和减少动态效果；关闭折射后界面仍必须完整可用。

### 不能诚实宣称完全复刻

- CSS `backdrop-filter` 只能模糊/调色背景，不能自动获得 Apple 系统材料的实时物理 lensing。
- Chromium 没有 Apple Liquid Glass 的环境光模型、自动 luminance/tint/dynamic-range 算法和系统 vibrancy。
- 任意 DOM 与 Canvas 背景无法无成本作为统一可位移纹理；真实折射通常需要复制/采样背景或额外 GPU 合成。
- CSS 无法自动让多个独立 DOM 表面的玻璃场彼此融合、反射并 shape-morph；必须把它们放进自建的统一渲染层。
- Apple 的 system setting 与玻璃 adaptive behavior 在 Web 中不会自动出现，应用必须自行实现并测试。
- 在无限画布上做逐帧、逐像素背景分析和折射会直接与压感手写争夺 GPU/合成预算。书写延迟优先级高于材质精度。

因此正确的产品表述应是 **Liquid Glass-inspired Web material**。除非实际实现了可观察的边缘背景位移、环境分类和交互高光，否则更准确的名称仍是 adaptive frosted glass。

## 修正标准

### 静态截图必须通过

1. 测试场景必须让文字、彩色形状、深浅色块跨过 toolbar 和 panel 的边缘；均匀浅灰背景不能作为唯一验收图。
2. 跨过边缘的背景必须出现可见但克制的几何位移/压缩，而不只是失焦。
3. compact、menu、panel 必须能从边缘厚度、折射幅度、散射和阴影读出不同材料重量。
4. 纯色浅背景上的阴影应轻于文字密集背景；对比截图必须能看出差异。
5. 前景图标和文本在浅、深、彩色背景上都清晰，但表面不能因此统一退化成近实心白卡。
6. 选中 tint 保持少量且有语义；未选中工具不应各自呈现玻璃按钮轮廓。

### 动态录屏必须通过

1. pointer-down 当帧出现 flex 与高光响应，不能只有延迟 hover。
2. 高光随指针/几何移动，且在静止状态收敛为安静表面。
3. menu 从触发按钮的位置 materialize；开关过程中背景折射和表面厚度连续变化。
4. toolbar 中相关玻璃形状靠近、展开或合并时维持同一视觉平面，不发生两层 blur 交叠。
5. Reduce Motion 下移除弹性和明显形变；Reduce Transparency 下使用实色且保持完整层级。
6. 触控笔落笔时冻结非必要材质动画；长笔划、缩放和平移不得因折射层增加可感知延迟。

### 否决条件

出现以下任一项，都不应验收为 Liquid Glass：

- 只调大 blur、alpha、border 或 shadow；
- 背景几何从未发生可观察的 lensing；
- 高光和阴影在所有位置、背景、尺寸和交互状态都相同；
- toolbar、panel 与每个子按钮层层使用 backdrop filter；
- 界面在均匀浅灰背景上看起来只是悬浮白卡；
- 为追求折射牺牲压感手写的跟手性。

## 官方证据与精确位置

- [Adopting Liquid Glass](https://developer.apple.com/documentation/TechnologyOverviews/adopting-liquid-glass)
  - `Visual refresh`：移除会干扰系统材料的自定义背景、测试透明度和 fluid morphing、避免过度使用。
  - `Controls`：克制用色、避免拥挤和玻璃叠放、保证背景内容下方的可读性。
  - `Navigation`：材料位于界面的顶层功能层。
  - `Menus and toolbars`：按功能关系组织工具组。
- [Human Interface Guidelines: Materials](https://developer.apple.com/design/human-interface-guidelines/materials)
  - `Liquid Glass`：功能层而非内容层；克制使用；regular/clear 的语义、可读性与 clear 的 dimming 条件。
- [Applying Liquid Glass to custom views](https://developer.apple.com/documentation/swiftui/applying-liquid-glass-to-custom-views)
  - `Overview`：材料会模糊背后内容、反射周围颜色和光，并实时响应 touch/pointer。
  - `Combine multiple views with Liquid Glass containers`：共享容器用于性能、形状融合和 morph。
  - `Morph Liquid Glass effects during transitions`：matched geometry 与 materialize 的官方模型。
  - `Optimize performance when using Liquid Glass effects`：过多 container 或独立 effect 会降低性能，应限制同时出现的效果数量。
- [WWDC25: Meet Liquid Glass](https://developer.apple.com/videos/play/wwdc2025/219/)
  - [`01:55–02:51`](https://developer.apple.com/videos/play/wwdc2025/219/?time=115)：lensing 是主要视觉定义，实时弯曲、塑造和聚光。
  - [`02:55–05:20`](https://developer.apple.com/videos/play/wwdc2025/219/?time=175)：materialize、即时 flex/发光、静止状态与上下文 morph。
  - [`06:00–07:25`](https://developer.apple.com/videos/play/wwdc2025/219/?time=360)：背景/尺寸适应、dynamic range 与材料厚度。
  - [`08:09–08:26`](https://developer.apple.com/videos/play/wwdc2025/219/?time=489)：附近彩色内容的光溢出到表面与阴影。
  - [`11:04–12:03`](https://developer.apple.com/videos/play/wwdc2025/219/?time=664)：几何/运动高光与背景感知阴影。
  - [`13:48–15:08`](https://developer.apple.com/videos/play/wwdc2025/219/?time=828)：Regular、Clear、dimming 与适用条件。
  - [`15:57–17:26`](https://developer.apple.com/videos/play/wwdc2025/219/?time=957)：自适应 tint 与选择性强调。
  - [`18:08–18:45`](https://developer.apple.com/videos/play/wwdc2025/219/?time=1088)：Reduce Transparency、Increased Contrast 与 Reduced Motion。
