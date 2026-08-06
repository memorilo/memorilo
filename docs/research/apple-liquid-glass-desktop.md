# Apple Liquid Glass：紧凑 macOS 界面设计基线

调研日期：2026-08-03

## 结论

Liquid Glass 不是在灰色面板上叠加半透明白色和 `backdrop-filter: blur()`。Apple 将它定义为一种会动态弯折和塑造光线的数字元材质，并明确对比：旧材质散射光，Liquid Glass 则实时弯折、塑造并聚集光线。它通过 lensing、refraction、环境高光、自适应阴影以及交互时的 flex、illumination 和 morph 来表达自身的形状与层级。[Meet Liquid Glass, 0:39](https://developer.apple.com/videos/play/wwdc2025/219/?time=39) [Meet Liquid Glass, 1:55](https://developer.apple.com/videos/play/wwdc2025/219/?time=115) [Meet Liquid Glass, 11:04](https://developer.apple.com/videos/play/wwdc2025/219/?time=664)

在桌面应用中，Liquid Glass 应是浮在内容之上的**功能层**，承载导航和高频控件；表单、列表和编辑内容仍属于连续的 content layer。它的正确使用重点不是“把页面玻璃化”，而是让少量浮动控件在内容之上形成清楚、动态且克制的层级。[Adopting Liquid Glass](https://developer.apple.com/documentation/technologyoverviews/adopting-liquid-glass) [Meet Liquid Glass, 7:40](https://developer.apple.com/videos/play/wwdc2025/219/?time=460)

## 与普通毛玻璃的区别

| 维度 | Apple Liquid Glass | 通用毛玻璃 / 磨砂玻璃 |
| --- | --- | --- |
| 光学表现 | 通过 lensing 弯折背景光线，并结合 refraction、动态高光和自适应阴影定义轮廓 | 主要是均匀 blur、低透明 fill 和固定描边 |
| 运动 | 出现和消失时调节光线弯折而 materialize；按压时 flex、illumination；按钮可 morph 成菜单或 popover | 通常只做 opacity、blur 或 scale 动画 |
| 环境适应 | 根据背后内容、重叠、窗口焦点和 light/dark 状态改变外观 | 常是固定的 RGBA 和固定模糊半径 |
| 层级角色 | 少量用于 controls/navigation 的浮动功能层 | 常被当作任意页面、面板或 Card 的装饰背景 |

Apple 说明较大的 glass 元素会表现得像更厚的材料，使用更深阴影、更强 lensing/refraction 和更柔和的光散射。因此，单纯增加 blur 并不能模拟尺寸变化后的 Liquid Glass 物理感。[Meet Liquid Glass, 7:02](https://developer.apple.com/videos/play/wwdc2025/219/?time=422)

## 材料应该放在哪里

- **放在最上层的导航与控件。** Toolbar、sidebar、sheet、popover 和标准 controls 是 Apple 明确列出的采用位置。[Adopting Liquid Glass](https://developer.apple.com/documentation/technologyoverviews/adopting-liquid-glass)
- **不要把内容面板做成玻璃。** Apple 直接以 table view 为反例：把它变成 Liquid Glass 会与其他元素竞争并破坏层级，应留在 content layer。[Meet Liquid Glass, 13:04](https://developer.apple.com/videos/play/wwdc2025/219/?time=784)
- **不要 glass-on-glass。** 玻璃上方的选中态、图标或附属元素应使用 fill、transparency 和 vibrancy，而不是再叠一层玻璃。[Meet Liquid Glass, 13:24](https://developer.apple.com/videos/play/wwdc2025/219/?time=804)
- **不要为了“玻璃感”增加无意义的分栏。** macOS sidebar 是有明确导航职责的浮动 glass pane；inspector 则是与内容并排的 edge-to-edge glass。没有第二套导航或检查器职责时，不应制造另一条内部 rail。[Build an AppKit app with the new design, 4:19](https://developer.apple.com/videos/play/wwdc2025/310/?time=259)
- **保持内容连续。** Apple 鼓励内容 edge-to-edge 延伸到浮动 toolbar/sidebar 下方，再由 safe area 和 scroll edge effect 保障可读性，而不是用一块不透明灰底切断页面。[Build an AppKit app with the new design, 9:30](https://developer.apple.com/videos/play/wwdc2025/310/?time=570) [Get to know the new design system, 12:34](https://developer.apple.com/videos/play/wwdc2025/356/?time=754)

## macOS 控件密度与形状

Apple 没有把所有 Liquid Glass 控件都设计成移动端大胶囊。在 macOS 上，Mini、Small 和 Medium 仍使用 rounded rectangle，以适配 inspector、popover 等紧凑、高密度环境；只有 Large 和 Extra Large 才使用 capsule，并用于真正突出的动作。[Build an AppKit app with the new design, 11:40](https://developer.apple.com/videos/play/wwdc2025/310/?time=700) [Get to know the new design system, 4:15](https://developer.apple.com/videos/play/wwdc2025/356/?time=255)

对桌面工具页的直接含义：

- 默认使用 Mini/Small/Medium 级别的紧凑高度和 rounded rectangle，不把普通 Save、Reset、Delete 做成宽大的胶囊。
- Large/Extra Large 只留给用户打开应用就是为了完成的核心动作；“Optimize”如果需要强调，也应是工具栏中唯一的 prominent action，而不是让所有按钮一起变大。
- 控件和窗口边缘使用 concentric 关系；圆角来自容器几何，不用一组任意的大圆角把每个区域都做成 Card。[Build an AppKit app with the new design, 7:04](https://developer.apple.com/videos/play/wwdc2025/310/?time=424)

## Toolbar、分组与 Popover

macOS toolbar 中，相关的普通 action buttons 共享一块 glass；segmented control、pop-up button 和 search 等不同类型的控件各自形成独立元素。分组表达功能关系，不能靠装饰和随意的背景块制造层级。[Build an AppKit app with the new design, 1:34](https://developer.apple.com/videos/play/wwdc2025/310/?time=94) [Get to know the new design system, 9:07](https://developer.apple.com/videos/play/wwdc2025/356/?time=547)

- 同一组内的图标按钮应共享一个外层材质；每个按钮内部只用 fill/透明度表示 hover、press 和 selected。
- 不同职责的控件要留出间隔。Apple 特别指出 segmented control、pop-up button 和 search 不应与普通 action button 强行熔成一个控件。
- 标题、状态文字等非交互内容不应带 glass backing，否则看起来像按钮。[Build an AppKit app with the new design, 2:53](https://developer.apple.com/videos/play/wwdc2025/310/?time=173)
- Toolbar 过于拥挤时，应删除低价值项目或把次要动作移入 More menu，并按功能和使用频率分组。[Get to know the new design system, 9:22](https://developer.apple.com/videos/play/wwdc2025/356/?time=562)
- Popover 应从触发按钮附近产生，并可由按钮形状 morph 成更厚、更具深度的材质；标准 popover 会自动采用 Liquid Glass。[Adopting Liquid Glass](https://developer.apple.com/documentation/technologyoverviews/adopting-liquid-glass) [Meet Liquid Glass, 7:02](https://developer.apple.com/videos/play/wwdc2025/219/?time=422)
- 多个自定义 glass shape 靠近时，应共享一个渲染容器和采样区域，使它们可以按距离 join/separate，并保持一致的折射与性能；这不是把每个子按钮再套一层 glass。[Build an AppKit app with the new design, 19:35](https://developer.apple.com/videos/play/wwdc2025/310/?time=1175)

## 内容交界、颜色与静止状态

- Glass 的 resting state 应安静，交互时才通过光与形变“活起来”；不能依靠持续发亮、强渐变或大面积蓝色来证明它是玻璃。[Meet Liquid Glass, 4:10](https://developer.apple.com/videos/play/wwdc2025/219/?time=250)
- Tint 只服务于明确的状态或重要动作。普通功能层保持中性；macOS 的 primary action 可以作为独立的 prominent text button，但不要求整页使用蓝色。[Meet Liquid Glass, 15:58](https://developer.apple.com/videos/play/wwdc2025/219/?time=958) [Get to know the new design system, 9:56](https://developer.apple.com/videos/play/wwdc2025/356/?time=596)
- Scroll edge effect 只在浮动 UI 与滚动内容相交时使用，用于可读性而非装饰；同一 view 不叠加多个 effect。macOS 可在 pinned text、无背景 control 或 table header 下使用更明确的 hard style。[Get to know the new design system, 11:02](https://developer.apple.com/videos/play/wwdc2025/356/?time=662)

## 辅助功能

Liquid Glass 的辅助功能退化也是材质定义的一部分，而不是可选 polish：[Adopting Liquid Glass](https://developer.apple.com/documentation/technologyoverviews/adopting-liquid-glass) [Meet Liquid Glass, 18:22](https://developer.apple.com/videos/play/wwdc2025/219/?time=1102)

- **Reduce Transparency：** 材质变得更 frosty，并更多遮蔽背后内容。也就是说，“磨砂”是减少透明度时的退化状态，不是默认 Liquid Glass 的目标外观。
- **Increase Contrast：** 元素趋向明确的黑或白，并增加对比边界。
- **Reduce Motion：** 降低效果强度并关闭 elastic behavior；仍要保留清楚、即时的状态反馈。
- 紧凑工具栏以 symbol 代替文字时，每个 icon 仍需要独立的 accessibility label；视觉分组不能代替可访问名称。[Adopting Liquid Glass](https://developer.apple.com/documentation/technologyoverviews/adopting-liquid-glass)
- 系统标准组件自动适配这些设置；Web/Electron 自定义模拟必须分别验证浅色、深色、失焦窗口和上述三种辅助功能状态。

## 对 Memorilo Optimizer 页的约束

1. 保留应用现有左侧导航；Optimizer 页面内部不再增加第二条 optimizer rail。
2. 页面主体是一块连续、正常的 content canvas，不铺灰色 glass panel，也不把每个设置区再包装成玻璃 Card。
3. Optimizer 列表负责选择和新建；参数化详情路由直接确定当前 Optimizer，不在详情页重复提供选择器。
4. 设置字段直接排在内容层，通过排版、间距和 section label 建立层级；状态文字没有 glass backing。
5. 子按钮的 hover/selected 使用 fill、透明度和前景对比；外层已经是 glass 时，子按钮不能再次使用 glass、blur 和高光描边。
6. Optimize 等配置动作靠近它直接影响的设置区域；静止态不显示持续亮斑，交互只使用轻微的填充、缩放和阴影变化，不使用指针追光或固定径向渐变来模拟 illumination。
7. 默认控件保持桌面 Small/Medium 密度。只给真正需要突出且频率较低的页面级动作独立 prominent treatment。

## Apple 官方来源

- [Adopting Liquid Glass](https://developer.apple.com/documentation/technologyoverviews/adopting-liquid-glass)
- [WWDC25: Meet Liquid Glass](https://developer.apple.com/videos/play/wwdc2025/219/)
- [WWDC25: Build an AppKit app with the new design](https://developer.apple.com/videos/play/wwdc2025/310/)
- [WWDC25: Get to know the new design system](https://developer.apple.com/videos/play/wwdc2025/356/)
