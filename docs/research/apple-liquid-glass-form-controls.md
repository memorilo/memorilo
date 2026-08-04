# macOS 26 Liquid Glass 表单控件调研

调研日期：2026-07-30

## 问题

Book Sources 的 macOS 模态界面可以使用 Liquid Glass，但其中的 Text Field 应该是什么外观？本文只使用 Apple Human Interface Guidelines、Apple Developer Documentation 与 WWDC25 官方演讲，并把结论映射到当前 Electron/StyleX 实现。

## 结论

1. **Sheet 是玻璃层，输入框不是另一块玻璃。** Apple 要求避免 glass-on-glass；放在 Liquid Glass 上的元素应使用 fill、transparency 与 vibrancy，而不是再次应用玻璃材质。[Meet Liquid Glass, 13:04](https://developer.apple.com/videos/play/wwdc2025/219/?time=784)
2. **macOS 的常规表单控件仍是圆角矩形。** Mini、Small、Medium 控件继续使用 rounded rectangle；Large 与 Extra Large 才使用 capsule，胶囊在高密度桌面界面中应主要留给突出动作。[Get to know the new design system, 4:15](https://developer.apple.com/videos/play/wwdc2025/356/?time=255)；[Build an AppKit app with the new design, 11:05](https://developer.apple.com/videos/play/wwdc2025/310/?time=665)
3. **表单型 Sheet 应优先保证稳定可读性。** Regular Liquid Glass 会适应背景并维持可读性；Clear 更透明且需要媒体丰富的背景、dimming layer 和醒目的前景内容。输入密集的 Add Book Source 不满足 Clear 的适用条件。[HIG: Materials](https://developer.apple.com/design/human-interface-guidelines/materials)；[Meet Liquid Glass, 13:44](https://developer.apple.com/videos/play/wwdc2025/219/?time=824)
4. **标准控件和系统布局指标优先。** Apple 建议减少 controls、sheets 与 popovers 中的自定义背景，避免覆盖系统效果；控件形状与尺寸更新应由标准组件和布局指标承接。[Adopting Liquid Glass: Controls](https://developer.apple.com/documentation/technologyoverviews/adopting-liquid-glass#Controls)
5. **Text Field 的语义没有改变。** 它仍是供人输入少量、明确文本的矩形区域。Placeholder 可作为提示，但输入后会消失，所以独立 label 仍有价值；多个字段应等距、尽量纵向排列，并保持一致宽度。[HIG: Text fields](https://developer.apple.com/design/human-interface-guidelines/text-fields)
6. **macOS Sheet 是浮于父窗口上方的圆角卡片，父窗口需要 dim。** 它是一个短而聚焦的模态任务，不应通过多层模态或复杂层级增加认知负担。[HIG: Sheets](https://developer.apple.com/design/human-interface-guidelines/sheets)；[HIG: Modality](https://developer.apple.com/design/human-interface-guidelines/modality)

## 对当前 Electron/StyleX 界面的含义

当前 `shelfRouteStyles.sheet` 可以继续承担唯一的 Regular-like Liquid Glass 表面。`inputShell` 与 `textInput` 应视觉上回归 macOS 中等尺寸 Text Field：

- 保持圆角矩形，不改成全胶囊；现有约 `8px` 圆角可以作为截图校准起点，但这不是 Apple 公布的固定像素规范。
- 使用比 Sheet 表面更稳定、较实的中性 fill 和一条低对比边界，将可编辑区域清楚地从玻璃表面分离。
- 不为输入框增加 `backdrop-filter`、折射渐变、镜面顶边高光或多层悬浮阴影；这些会把输入框误读成第二层 glass。
- 聚焦状态使用系统强调色边界或柔和 focus ring；不要依靠提高透明度表达 focus。
- 保留字段上方的可见 label；placeholder 只提供示例或补充提示，不能代替 label。
- URL 字段已有明确的 “OPDS address” label，leading globe 不是必要语义。若它让控件更像搜索框或自定义玻璃组件，可移除并让 URL、Name、Username、Password 共用同一种 Text Field anatomy。
- 不逐个硬编码不同输入高度。Electron 无法自动获得 AppKit metrics，因此应定义一个共享的 macOS medium control token，再通过截图与实际 macOS 26 系统界面校准。
- `prefers-reduced-transparency` 下让 Sheet 和字段变得更实；`prefers-contrast: more` 下提高边界与文字对比，不能只保留 blur。

因此，本界面的方向不是“让输入框更液态”，而是**让 Sheet 保持一层 Liquid Glass，让输入框成为清楚、克制、熟悉的 macOS 填充控件**。

## 官方资料

- [Human Interface Guidelines: Materials](https://developer.apple.com/design/human-interface-guidelines/materials)
- [Human Interface Guidelines: Text fields](https://developer.apple.com/design/human-interface-guidelines/text-fields)
- [Human Interface Guidelines: Sheets](https://developer.apple.com/design/human-interface-guidelines/sheets)
- [Human Interface Guidelines: Modality](https://developer.apple.com/design/human-interface-guidelines/modality)
- [Adopting Liquid Glass](https://developer.apple.com/documentation/technologyoverviews/adopting-liquid-glass)
- [WWDC25: Meet Liquid Glass](https://developer.apple.com/videos/play/wwdc2025/219/)
- [WWDC25: Get to know the new design system](https://developer.apple.com/videos/play/wwdc2025/356/)
- [WWDC25: Build an AppKit app with the new design](https://developer.apple.com/videos/play/wwdc2025/310/)
