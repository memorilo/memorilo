# Neovide 光标移动、动画与粒子效果

调研日期：2026-08-28
资料范围：Neovide 官方配置文档、源码和 GitHub Issue/PR；源码链接固定到仓库 HEAD `ba8c41f423c9a8f0cb14ff19baa6f538c95e52bf`。

## 结论速览

Neovide 的“输入手感”主要来自光标，而不是对每个按键做独立动画：Neovim 更新光标网格位置后，渲染器让光标四个角以临界阻尼弹簧追赶目标。连续打字被识别为一至两个字符的短水平跳，默认使用 40 ms 的短动画；较长位移则按方向给四个角不同的时长，形成前端先到、尾部滞后的拖尾。粒子 VFX 同样由光标位移触发，默认关闭，属于可选装饰而非输入确认反馈。

## 1. 光标位移模型

### 四角独立跟随

光标不是每帧直接绘制一个固定矩形。`CursorRenderer` 为光标四个角各维护一个 `CriticallyDampedSpringAnimation`；每次目标网格位置变化时，角点保存当前位置与速度并向新的像素目标更新，最后用四个角拼成路径绘制。因此移动过程中光标可以短暂拉伸/倾斜，随后无 overshoot 地收敛。[`cursor_renderer/mod.rs`](https://github.com/neovide/neovide/blob/ba8c41f423c9a8f0cb14ff19baa6f538c95e52bf/src/renderer/cursor_renderer/mod.rs#L95-L156)

弹簧使用临界阻尼（`zeta = 1`）解析解；角点位置误差低于 0.01 时结束动画，动画长度被换算为约 2% 误差内到达目标的时间。该模型避免了线性插值的“匀速滑块感”，也不会像欠阻尼弹簧那样越过目标。[`animation_utils.rs`](https://github.com/neovide/neovide/blob/ba8c41f423c9a8f0cb14ff19baa6f538c95e52bf/src/renderer/animation_utils.rs#L57-L104)

### 短跳与长跳

- **短跳（打字路径）**：目标与上一次目标的位移在同一水平线上且不超过约两个字符时，使用 `min(animation_length, short_animation_length)`。默认总动画长度为 150 ms，短动画为 40 ms，所以逐字输入只留下轻微连续感，不会因动画落后造成明显延迟。[配置文档：Animation Length](https://neovide.dev/configuration.html#animation-length)、[Short Animation Length](https://neovide.dev/configuration.html#short-animation-length)、[`cursor_renderer/mod.rs`](https://github.com/neovide/neovide/blob/ba8c41f423c9a8f0cb14ff19baa6f538c95e52bf/src/renderer/cursor_renderer/mod.rs#L158-L177)
- **长跳**：角点根据自身相对位置与移动方向计算 alignment。前方角点使用更短的 leading 时长，后方角点使用完整 trailing 时长，于是矩形像有方向性的拖尾。`trail_size` 范围 0–1：值为 1 时前端立即抵达、尾部最长；降低它会缩短拖尾并增加整体滞后。[配置文档：Animation Trail Size](https://neovide.dev/configuration.html#animation-trail-size)、[`cursor_renderer/mod.rs`](https://github.com/neovide/neovide/blob/ba8c41f423c9a8f0cb14ff19baa6f538c95e52bf/src/renderer/cursor_renderer/mod.rs#L158-L177)
- **立即移动条件**：可将插入模式动画关闭（`g:neovide_cursor_animate_in_insert_mode = false`），也可关闭编辑区与命令行切换动画（`g:neovide_cursor_animate_command_line = false`）；此时角点重置并直接放到目标。[`cursor_renderer/mod.rs`](https://github.com/neovide/neovide/blob/ba8c41f423c9a8f0cb14ff19baa6f538c95e52bf/src/renderer/cursor_renderer/mod.rs#L501-L540)、[配置文档](https://neovide.dev/configuration.html#animate-in-insert-mode)

推荐调参起点：普通移动 120–180 ms；连续输入 30–50 ms；`trail_size` 先用 0.7–1.0，再根据光标是否显得“黏”或“跳”微调。必须保留关闭动画的路径，因为高延迟远程桌面、低刷新率或用户偏好下，动画本身可能妨碍定位。

## 2. 闪烁、失焦与形状反馈

这些不是位移动画，但决定光标在输入时是否“活着”：

- 闪烁时序由 Neovim `guicursor` 的 `blinkwait`、`blinkon`、`blinkoff` 驱动；`g:neovide_cursor_smooth_blink = true` 才会在显示/隐藏之间做渐变，并要求三项时长均有效。[`blink.rs`](https://github.com/neovide/neovide/blob/ba8c41f423c9a8f0cb14ff19baa6f538c95e52bf/src/renderer/cursor_renderer/blink.rs#L19-L26)、[配置文档：Animate cursor blink](https://neovide.dev/configuration.html#animate-cursor-blink)
- 窗口失焦时，块状光标改为轮廓；`g:neovide_cursor_unfocused_outline_width` 以 em 指定线宽，值小于等于 0 时不可见。[配置文档：Unfocused Outline Width](https://neovide.dev/configuration.html#unfocused-outline-width)
- `g:neovide_cursor_cell_color_fallback` 可让未指定显式颜色的块光标取覆盖网格单元颜色，避免高亮背景下光标突兀。[配置文档：Use covered cell colors](https://neovide.dev/configuration.html#use-covered-cell-colors-for-cursor-fallback)

## 3. 粒子 VFX

### 模式分类

`g:neovide_cursor_vfx_mode` 接受一个字符串或字符串数组，默认空数组（不产生粒子）；数组可同时启用多个 Trail/Highlight。源码把模式分成两类：[配置文档：Cursor Particles](https://neovide.dev/configuration.html#cursor-particles)、[`cursor_vfx.rs`](https://github.com/neovide/neovide/blob/ba8c41f423c9a8f0cb14ff19baa6f538c95e52bf/src/renderer/cursor_renderer/cursor_vfx.rs#L34-L140)

| 类别 | 模式 | 视觉行为 |
| --- | --- | --- |
| Trail | `railgun` | 粒子沿位移路径排列并旋转，方向性最强 |
| Trail | `torpedo` | 粒子从路径附近向后散开，像推进尾迹 |
| Trail | `pixiedust` | 小方块随机散射，最轻、最装饰化 |
| Highlight | `sonicboom` | 目标位置扩大的实心圆并淡出 |
| Highlight | `ripple` | 目标位置扩大的圆环并淡出 |
| Highlight | `wireframe` | 目标位置扩大的方框并淡出 |

Highlight 的半径随生命周期从 0 扩展到约三个字符高，alpha 使用二次 easing 衰减；Trail 则为每段位移生成粒子，粒子独立更新位置、旋转和剩余寿命。[`cursor_vfx.rs`](https://github.com/neovide/neovide/blob/ba8c41f423c9a8f0cb14ff19baa6f538c95e52bf/src/renderer/cursor_renderer/cursor_vfx.rs#L155-L221)

### 触发与参数

VFX 的更新接口接收 `current_cursor_destination` 和 `immediate_movement`。只要光标目标发生位移，Trail 就按 `位移距离 / 字符高度 × density` 取整生成粒子，并把小数余量带到下一次位移，避免短跳长期“欠账”；若是立即移动（例如关闭插入模式动画），不会生成新的 Trail 粒子。每个粒子独立更新位置和旋转，寿命耗尽后移除；Highlight 在光标跳转后重启。实现没有“仅可见字符输入时触发”的判断，普通模式移动、搜索跳转等位移也会触发；Issue #1723 和 #3088 正是围绕 typing-specific 行为的需求/反馈。[`cursor_vfx.rs`](https://github.com/neovide/neovide/blob/ba8c41f423c9a8f0cb14ff19baa6f538c95e52bf/src/renderer/cursor_renderer/cursor_vfx.rs#L229-L370)、[Issue #1723](https://github.com/neovide/neovide/issues/1723)、[Issue #3088](https://github.com/neovide/neovide/issues/3088)

主要参数及默认值：

| 参数 | 默认值 | 作用 |
| --- | ---: | --- |
| `cursor_vfx_opacity` | 200 | 粒子 alpha 上限（0–255 语义） |
| `cursor_vfx_particle_lifetime` | 0.5 s | Trail 粒子寿命 |
| `cursor_vfx_particle_highlight_lifetime` | 0.2 s | Highlight 扩散寿命；设为 0 时复用 Trail 寿命 |
| `cursor_vfx_particle_density` | 0.7 | 每行位移生成的粒子数量 |
| `cursor_vfx_particle_speed` | 10 px/s | 粒子速度 |
| `cursor_vfx_particle_phase` | 1.5 | 仅 Railgun：粒子群体相位/独立程度 |
| `cursor_vfx_particle_curl` | 1.0 | 旋转速度；Railgun 影响波形，其他 Trail 影响随机旋转 |

[配置文档：Particle Settings](https://neovide.dev/configuration.html#particle-settings)、[`CursorSettings` 默认值](https://github.com/neovide/neovide/blob/ba8c41f423c9a8f0cb14ff19baa6f538c95e52bf/src/renderer/cursor_renderer/mod.rs#L65-L88)

### 使用判断

- 默认关闭是合理的：粒子持续运动会增加视觉噪声，不能替代插入成功、组合输入提交等语义反馈。
- 若启用，优先使用短寿命（约 0.15–0.3 s）、低密度和低透明度；`sonicboom`/`ripple` 比 Trail 更容易表达一次跳转，连续打字不容易堆积尾迹。
- 不要把 VFX 与光标位移动画绑定成不可分割的开关：用户可能想保留 40 ms 的定位连续性，但关闭粒子；当前 Neovide 已分别提供 `cursor_animation_length`、`cursor_vfx_mode` 等设置。
- 需要“只在输入字符时反馈”时，必须在更上层根据编辑模式和编辑事件过滤，不能仅依赖现有 VFX API；官方 Issue 尚未提供独立 typing 开关。

## 4. 对产品实现的可借鉴点

1. **输入先到，反馈后跟。** 事件处理不应等待动画完成；动画只追踪最新目标，目标变化时重置误差和速度。
2. **短距离单独设定时长。** 连续输入使用 30–50 ms，跨行/跳转使用 120–180 ms，可在“即时”与“可感知”之间取得平衡。
3. **用角点/部件差异制造方向感。** 比整体平移更有表现力，但必须使用临界阻尼或等价的无 overshoot 模型，避免光标抖动。
4. **粒子是增强层。** 以位移距离控制生成量、以寿命控制性能上限，并提供总开关和低动效/低性能降级。
5. **保留可访问与失焦状态。** 失焦轮廓、静态光标和关闭动画不能被 VFX 覆盖；动画关闭后仍应立即显示最终位置。

## 官方来源

- [Neovide Configuration](https://neovide.dev/configuration.html)
- [Cursor renderer source](https://github.com/neovide/neovide/tree/main/src/renderer/cursor_renderer)
- [Animation utilities](https://github.com/neovide/neovide/blob/main/src/renderer/animation_utils.rs)
- [Issue #1723: typing-specific cursor VFX](https://github.com/neovide/neovide/issues/1723)
- [Issue #3088: particles in insert mode](https://github.com/neovide/neovide/issues/3088)
