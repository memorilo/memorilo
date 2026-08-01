# Apple Liquid Glass 选区工具栏调研

调研日期：2026-07-31

## 范围与结论

本文只依据 Apple Human Interface Guidelines、Apple Developer Documentation、WWDC25 官方视频及其 transcript，回答 Web/Electron 阅读器中的横向选区工具栏应该如何借鉴 Liquid Glass。

结论先行：

- 选中文字后出现的这组命令，在 Apple 的组件语义中首先接近 **edit menu**，不是可任意造型的窗口 toolbar。HIG 明确把 iOS edit menu 描述为选区附近的紧凑横向列表，并规定它通常位于选区上方或下方。[HIG: Edit menus](https://developer.apple.com/design/human-interface-guidelines/edit-menus)
- 对当前 Electron 桌面产品而言，它仍是一个自定义的跨平台 selection action bar；不能声称它等同于 macOS 原生 edit menu，因为 HIG 在 macOS 上主要使用 context menu 和菜单栏提供编辑命令。[HIG: Edit menus](https://developer.apple.com/design/human-interface-guidelines/edit-menus)
- 正确方向是：**单一水平胶囊、内容直立、贴近选区、命令少而相关、一个共享的 Regular-like glass surface**。斜排、弧形命令路径和装饰性不规则轮廓都没有来自 Apple edit menu、toolbar 或 Liquid Glass 规范的依据。
- Liquid Glass 不是“半透明白色 + blur”，也不是奇异轮廓。Apple 将它定义为动态弯折和塑造光线的数字 meta-material；lensing、geometry-responsive highlights、内容感知阴影、环境适配和交互 morphing 是一个协同系统。[WWDC25: Meet Liquid Glass, 0:39](https://developer.apple.com/videos/play/wwdc2025/219/?time=39)；[同视频，10:44](https://developer.apple.com/videos/play/wwdc2025/219/?time=644)
- Web 实现应诚实地做 **Liquid Glass-inspired approximation**：模拟层级、半透明、边缘分离、克制高光和即时交互反馈；没有原生渲染管线时，不应伪造或宣称实现了真实 lensing/refraction、环境光响应或内容感知光学。

## 1. 什么是 Liquid Glass

Apple 的官方定义包含三个不可拆开的部分：

1. **功能层。** Liquid Glass 形成承载 controls 与 navigation 的独立 functional layer，浮在 content layer 上方，让下层内容仍可显露，同时保持控件可辨识。它不应成为普通内容区域的背景。[HIG: Materials](https://developer.apple.com/design/human-interface-guidelines/materials#Liquid-Glass)
2. **数字光学材质。** Apple 明确说它不是简单重现物理玻璃，而是会动态弯折和塑造光线的 digital meta-material。其主要视觉定义是 lensing，即透明对象通过对光的 warping 与 bending 表达存在、运动和形态。[WWDC25: Meet Liquid Glass, 0:39](https://developer.apple.com/videos/play/wwdc2025/219/?time=39)；[同视频，1:55](https://developer.apple.com/videos/play/wwdc2025/219/?time=115)
3. **流体行为。** 材质会实时响应触摸和 pointer，形状之间可 combine、blend 和 morph；标准系统组件还会依据重叠、焦点、尺寸、背景与辅助功能设置动态调整。[Applying Liquid Glass to custom views](https://developer.apple.com/documentation/swiftui/applying-liquid-glass-to-custom-views)；[Adopting Liquid Glass](https://developer.apple.com/documentation/technologyoverviews/adopting-liquid-glass)

所以，“Apple design”不是复制一张截图。它同时要求组件语义正确、层级清楚、几何有秩序、行为可预测、反馈即时、辅助功能完整。WWDC25 将这套设计系统描述为 visual design、information architecture 与 core components 的整体，而不是一套孤立特效。[WWDC25: Get to know the new design system](https://developer.apple.com/videos/play/wwdc2025/356/)

## 2. 选区工具栏的正确组件语义

### Edit menu，而不是自由造型浮层

HIG 对 edit menu 的要求与当前场景直接对应：

- 命令作用于当前选中的文字、图像、文件或对象。
- iOS 的样式是 **compact, horizontal list**；iPadOS 使用触摸揭示时也采用该横向样式。
- 默认位置在 insertion point 或 selection 的上方或下方，并使用 visual indicator 指向目标。
- 系统 edit menu 的 shape 与 pointer 不能随意改变，只能在必要时调整位置。
- 只提供与当前 selection 相关的命令；移除或禁用不适用的命令；自定义命令使用短动词，避免数量过多。

[HIG: Edit menus](https://developer.apple.com/design/human-interface-guidelines/edit-menus)

这为当前 Web 方案给出明确判断：**水平、紧凑、贴选区、稳定几何**才是应该模拟的 anatomy；斜向排列、曲线路径和为了“像液体”而扭曲轮廓，会破坏扫描顺序、目标映射和空间关系。

### Toolbar 原则仍可用于内部组织

虽然这个浮层不是窗口顶栏，toolbar 的动作组织原则仍适用于横向命令组：

- 避免拥挤；按功能与使用频率分组，把次要动作移入 More。
- 相关命令放在一起，布局与分组承担层级，不依赖额外边框和装饰。
- 常见动作优先使用简单、熟悉的 symbol；共享背景内不要混用文字按钮和图标按钮。
- system-provided symbols 不需要额外轮廓边框，因为共享容器已经表达边界。
- 每个图标都要有 accessibility label。

[HIG: Toolbars](https://developer.apple.com/design/human-interface-guidelines/toolbars)；[WWDC25: Get to know the new design system, 8:33](https://developer.apple.com/videos/play/wwdc2025/356/?time=513)

对当前工具栏的落地含义是：一个水平 capsule 中放置直立、等节奏的 action glyph；按钮默认安静，hover、focus 和 press 才显示 fill 反馈。每个按钮不应再套一块独立 glass。

## 3. Apple 官方材质层与 Web 映射

下表区分 Apple 原生行为、当前 Web 应模拟的视觉目标，以及不应伪造的效果。

| 层 | Apple 官方行为 | 当前 Web 横向工具栏应模拟 | 不应伪造 |
| --- | --- | --- | --- |
| Lensing / refraction | 透明对象实时弯折、塑造和集中下层光线，以定义轮廓、深度和运动；材质变大时折射与 lensing 更明显。[Meet Liquid Glass, 1:55](https://developer.apple.com/videos/play/wwdc2025/219/?time=115)；[同视频，7:02](https://developer.apple.com/videos/play/wwdc2025/219/?time=422) | 使用半透明背景、有限 blur/saturation、边缘亮度差和内外阴影，建立“下层可见但控件清楚”的轻量层级。将它称为 optical approximation。 | 不要复制并扭曲 PDF 文字来制造假折射，不要使用固定 SVG displacement、彩虹焦散或背景位移冒充实时 lensing。它们既不内容感知，也会损害阅读与选区定位。 |
| Highlights / specular-like response | 官方称为 **highlights layer**。光源依据材质 geometry 产生高光，光可以随设备运动沿轮廓移动。[Meet Liquid Glass, 11:04](https://developer.apple.com/videos/play/wwdc2025/219/?time=664) | 在 capsule 边缘保留非常克制的静态亮边或内高光；pointer-down 时可增加一次局部亮度反馈，但不能盖住 glyph。 | 不要做循环扫光、彩虹光带、跟随鼠标漂移的装饰性 sheen，或假装读取了设备姿态与环境光。Apple 的高光是材质系统响应，不是贴上去的渐变动画。 |
| Shadow / edge separation | 阴影会根据下层内容调整：覆盖文字时更明显，位于纯亮背景时减弱；更大、更厚的菜单使用更深、更丰富的阴影。[Meet Liquid Glass, 6:35](https://developer.apple.com/videos/play/wwdc2025/219/?time=395)；[同视频，7:02](https://developer.apple.com/videos/play/wwdc2025/219/?time=422) | 使用克制的 contact shadow + ambient shadow 与清晰边缘，在白页、密集文字、图片和深色背景上都能分离。大 annotation composer 可以比小 action bar 更不透明、阴影更深。 | 不要用一圈厚黑描边或过重投影替代层次；也不要声称固定 `box-shadow` 是内容感知阴影。 |
| Content adaptation | Liquid Glass 的 tint、dynamic range、明暗与阴影会根据背后内容、尺寸、焦点和环境持续调整，目标是让位于内容同时维持 legibility。[Meet Liquid Glass, 6:01](https://developer.apple.com/videos/play/wwdc2025/219/?time=361) | 至少提供明确的 light/dark、普通/高对比、普通/降低透明度状态，并在 PDF 白页、黑字、图片页、深色主题上逐一验证。前景 glyph 必须始终保持足够对比。 | 不要把固定透明白背景叫作“自动适配”。没有可靠的下层亮度采样时，应选择保守的 Regular-like 材质，而不是用频繁明暗翻转制造假智能。 |
| Interaction morphing | 按下时材质立即 flex 并 energize with light；静止态保持安静。控件切换状态时在同一 floating plane 上 morph，菜单从触发源原位展开，保持来源关系。[Meet Liquid Glass, 3:38](https://developer.apple.com/videos/play/wwdc2025/219/?time=218)；[同视频，4:43](https://developer.apple.com/videos/play/wwdc2025/219/?time=283) | hover/press 采用即时 fill、轻微 scale 或亮度响应；工具动作与颜色 palette 在同一 capsule 内替换内容，并保持工具栏锚点稳定。出现/消失从选区附近发生。 | 不要做闲置 wobble、夸张弹跳、整条工具栏的果冻扭曲或与触发点无关的飞入。不能保证连续几何、可打断和 Reduced Motion 时，短 fade/scale 比假 morph 更诚实。 |

### 为什么当前应采用 Regular-like，而不是 Clear-like

HIG 将 Regular 用于背景可能影响可读性、组件包含细小文字或位于 popover 等场景；Clear 只适合富媒体背景，并且需要足够暗的底层或 dimming layer。PDF 页面会在白底黑字、扫描图像、彩色插图之间快速变化，而选区工具栏使用细小 glyph，因此当前应优先模拟 Regular 的可读性和适配目标。[HIG: Materials](https://developer.apple.com/design/human-interface-guidelines/materials#Liquid-Glass)

不应把 Clear 的高透明度当成“更像玻璃”。WWDC25 明确指出 Clear 没有 Regular 的自适配行为，必须同时满足富媒体背景、dimming 不破坏内容、前景粗且亮等条件。[Meet Liquid Glass, 13:48](https://developer.apple.com/videos/play/wwdc2025/219/?time=828)

## 4. 当前横向 selection toolbar 的设计基线

### 几何与布局

- 使用单一水平 capsule；capsule 的半径等于高度的一半，这是 Apple 给出的系统几何定义。[Get to know the new design system, 3:49](https://developer.apple.com/videos/play/wwdc2025/356/?time=229)
- 图标按水平基线排列并保持直立，不沿曲线旋转或错位。
- 工具栏放在选区上方；空间不足时整体移到下方。移动的是容器位置，不是把内部动作翻转或改成斜向布局。
- 容器宽度由实际动作数决定。region selection 没有 Copy 时，应移除该 item 并收窄容器，不能留下空槽。HIG 要求只显示当前上下文相关的动作。[HIG: Edit menus](https://developer.apple.com/design/human-interface-guidelines/edit-menus)
- 工具栏必须在 viewport 内完成碰撞规避，不能遮住主要选区，也不能让任何图标、tooltip 或 focus ring 溢出可视区域。

### 表面与内容

- 只有外层 capsule 是 glass surface。
- 内部 glyph 使用高对比、无边框图标。hover、focus、press、selected 使用 fill、transparency 或 vibrancy-like overlay 表达，不为每个按钮再创建 glass circle。Apple 明确要求避免 glass on glass，并建议 glass 上层元素使用 fill、transparency 与 vibrancy。[Meet Liquid Glass, 13:24](https://developer.apple.com/videos/play/wwdc2025/219/?time=804)
- Tint 只用于当前选色、primary action 或有明确语义的强调。不能给每个 action 不同 tint；当所有元素都被 tint 时就没有层级。[Meet Liquid Glass, 17:21](https://developer.apple.com/videos/play/wwdc2025/219/?time=1041)
- color palette 在同一 glass surface 内替换 action row；不要弹出第二块 glass 叠在第一块上。
- annotation composer 若扩展为更大 popover，应保持与选区或 annotation action 的空间关系，并随面积增加提高遮蔽度和阴影深度；不要仅把小工具栏等比放大。[Meet Liquid Glass, 7:02](https://developer.apple.com/videos/play/wwdc2025/219/?time=422)

### 交互

- hover 只确认可点击性；press 在 pointer-down 立即响应。
- 动作完成后及时关闭或更新工具栏，不制造无意义的延迟。
- 从 action row 切换到 color palette 时，保持容器位置和外轮廓稳定，内部内容做短促、可打断的替换。
- 点击外部、selection 消失或按 Escape 时可以退出；键盘用户可以顺序聚焦所有动作。
- 自定义 glyph 必须有可访问名称和 tooltip；常见命令沿用熟悉图标，不创造难以识别的抽象符号。[HIG: Toolbars](https://developer.apple.com/design/human-interface-guidelines/toolbars)

## 5. 辅助功能不是附加项

Apple 把辅助功能作为 Liquid Glass 材质层的 modifier，而不是可选补丁：

- **Reduce Transparency：** 材质更 frosty，遮蔽更多下层内容。Web 近似应提高 surface opacity，并允许关闭或大幅降低 blur。
- **Increase Contrast：** 元素更接近明确的黑/白，并出现更强的对比边界。Web 近似应增强 foreground、边缘与 focus ring 对比。
- **Reduce Motion：** 降低效果强度并禁用 elastic properties。Web 近似应去掉弹性、位移和 blur 进出动画，保留静态反馈或短 fade。

[Meet Liquid Glass, 18:22](https://developer.apple.com/videos/play/wwdc2025/219/?time=1102)；[Adopting Liquid Glass](https://developer.apple.com/documentation/technologyoverviews/adopting-liquid-glass)

此外：

- 颜色 swatch 的选中状态不能只靠颜色，需同时提供 checkmark、轮廓或其他形状信号。
- 每个 icon action 都要有无障碍名称；支持键盘导航和可见焦点。
- 避免自动、重复、快速扫光；Reduce Motion 下用 fade 代替 x/y/z 位移，避免 blur 的进入/退出动画。

[HIG: Accessibility](https://developer.apple.com/design/human-interface-guidelines/accessibility)

## 6. 不应继续出现的设计

以下设计与 Apple 官方规范或 Liquid Glass 的工作方式冲突：

- 斜着排列的命令、弧形命令轨道、为了“液体感”而裁出的不规则菜单轮廓。
- 胶囊内部每个按钮再套一个独立 glass surface。
- 固定高透明度覆盖在任意 PDF 文字或图像上，却没有对比度和降低透明度方案。
- 用厚描边、强发光、彩虹渐变、循环扫光代替真实的 geometry-responsive highlight。
- 用夸张 wobble、弹跳和果冻拉伸代替来源明确、可打断的状态转换。
- 工具栏宽度固定但内容缺失，留下空槽；或动作、tooltip、focus ring 溢出容器。
- 将普通 `backdrop-filter` 效果宣称为完整 Liquid Glass。它只能承担 Web 近似中的 translucency/blur 层，不能自动获得 Apple 原生的 refraction、lensing、光照、内容适配与辅助功能行为。

## 7. 实现验收清单

- [ ] 单一水平 capsule；无斜排、无弧形动作路径、无 custom clip-path 造型。
- [ ] 位于 selection 上方或下方，并保持在 viewport 内；内部内容不翻转。
- [ ] 只显示当前 selection 可用的动作；无空槽。
- [ ] 只有外层是 glass；按钮反馈使用 fill，不叠加 glass。
- [ ] 在白页、密集黑字、彩色图像、深色页面上均保持 glyph 与边缘可辨识。
- [ ] hover、focus、press 和 selected 状态清楚；pointer-down 即时反馈。
- [ ] action row 与 color palette 在同一 surface 内切换，锚点稳定。
- [ ] Reduced Transparency、Increase Contrast、Reduce Motion 均有明确退化策略。
- [ ] swatch selection 不只依赖颜色；所有 icon 都有 label、tooltip 和键盘焦点。
- [ ] 没有把静态 blur、渐变高光或固定 shadow 描述成原生实时 lensing/content adaptation。

## 官方资料

- [Human Interface Guidelines: Materials](https://developer.apple.com/design/human-interface-guidelines/materials)
- [Human Interface Guidelines: Edit menus](https://developer.apple.com/design/human-interface-guidelines/edit-menus)
- [Human Interface Guidelines: Context menus](https://developer.apple.com/design/human-interface-guidelines/context-menus)
- [Human Interface Guidelines: Toolbars](https://developer.apple.com/design/human-interface-guidelines/toolbars)
- [Human Interface Guidelines: Accessibility](https://developer.apple.com/design/human-interface-guidelines/accessibility)
- [Adopting Liquid Glass](https://developer.apple.com/documentation/technologyoverviews/adopting-liquid-glass)
- [Applying Liquid Glass to custom views](https://developer.apple.com/documentation/swiftui/applying-liquid-glass-to-custom-views)
- [WWDC25: Meet Liquid Glass](https://developer.apple.com/videos/play/wwdc2025/219/)
- [WWDC25: Get to know the new design system](https://developer.apple.com/videos/play/wwdc2025/356/)
