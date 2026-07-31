# Card hover 与 Liquid Glass 控件设计基线

调研日期：2026-07-31

## 结论

Card 的正文属于内容层。Card hover 可以出现一层克制、向正文外扩展的范围材质，但不能把正文直接染成高饱和渐变玻璃板。Preview 与 Options 是 Card 的功能控件，应在 Card 右上角组成一个独立的 Liquid Glass 控件组，并与 Card 范围材质同时 materialize。

Options 中的 Direction 与 Set/List 是持久状态。当前选项必须使用明确的 tint、内描边、文字对比与轻微抬升感；未选项保持透明。不能只依赖难以察觉的阴影差异。

## 官方依据

- Apple 将 Liquid Glass 定义为浮在内容上方、承载 controls 与 navigation 的独立 functional layer；内容继续位于 content layer。[Meet Liquid Glass, 7:40](https://developer.apple.com/videos/play/wwdc2025/219/?time=460)
- Apple 明确展示了不应把 table view 之类的普通内容改成 Liquid Glass，否则会与其他元素竞争并破坏层级；同时要求避免 glass on glass。[Meet Liquid Glass, 13:04](https://developer.apple.com/videos/play/wwdc2025/219/?time=784)
- 相邻且属于同一逻辑组的 glass controls 应共享一个容器和统一的渲染效果，而不是每个按钮各做一层互相采样的 glass。[Build an AppKit app with the new design, 19:35](https://developer.apple.com/videos/play/wwdc2025/310/?time=1175)
- Liquid Glass 不只是透明背景。Apple 描述的材质包含 lensing、highlight、shadow、adaptive contrast，并通过 flex、illumination 与 morph 响应交互。[Meet Liquid Glass](https://developer.apple.com/videos/play/wwdc2025/219/)
- Glass 对象出现和消失时应 materialize/dematerialize，而不只是做 opacity fade。[Meet Liquid Glass, 2:55](https://developer.apple.com/videos/play/wwdc2025/219/?time=175)
- tint 应服务于明确的功能或状态。Apple 在 macOS toolbar 中把 prominent tint 用于显示状态或强调重要动作；同时警告不要给所有元素着色。[Build an AppKit app with the new design, 3:30](https://developer.apple.com/videos/play/wwdc2025/310/?time=210)；[Meet Liquid Glass, 16:00](https://developer.apple.com/videos/play/wwdc2025/219/?time=960)
- Reduce Transparency、Increase Contrast 和 Reduce Motion 会改变材质及动画表现，自定义实现需要提供对应适配。[Adopting Liquid Glass](https://developer.apple.com/documentation/technologyoverviews/adopting-liquid-glass)

## 在 Memorilo Card 中的落地

### Card 范围

- 一个 Card 只有一个范围材质，多行 Question/Answer 仍共享同一个外轮廓。
- 材质通过不参与排版的伪元素向外扩展，正文的坐标、padding 和缩进不发生变化。
- 默认状态不持续显示大面积面板；hover、focus-within 或 popup 打开时才显示。
- 使用低色度半透明 fill、backdrop blur、顶部高光和克制阴影表达 Clear/Regular-like material，不使用装饰性的蓝色径向渐变。

### Card 控件

- Preview 与 Options 位于整个 Card 的右上角，而不是 delimiter 箭头附近。
- 两个按钮共享一个 glass control group；按钮本身使用 fill、transparency 与 vibrancy 表达 hover/press，避免 glass on glass。
- 箭头只表达 Basic、Reverse 或 Bidirectional 方向，不承担点击发现性。
- Preview 直接打开预览；Options 打开 Direction 与 Set/List 设置。
- 控件和 Card 范围材质在同一次 hover 中出现，使用短促的 opacity、scale 与 blur 变化；press 立即缩放反馈。

### Options 选中态

- `aria-pressed="true"` 是语义来源。
- 视觉上同时使用 tint fill、内描边、较高字重和轻微抬升阴影。
- 未选项保持透明；hover 不能与 selected 混淆。

### 辅助功能

- `prefers-reduced-motion: reduce`：取消位移动画，仅保留即时或短促的透明度反馈。
- `prefers-reduced-transparency: reduce`：使用接近不透明的浅色 fill，移除 backdrop blur。
- `prefers-contrast: more`：增加明确边界和前景对比。
