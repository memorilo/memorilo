# Excalidraw 压感与荧光笔调研

调研日期：2026-08-12

## 结论

Orca Note `v1.89.1` 打包的是 `@excalidraw/excalidraw@0.18.0`。该版本可以做基础压感手写，但没有名为“荧光笔”的原生工具。荧光笔可以用自由绘制元素加粗、降低透明度来模拟；若要求恒定笔宽、稳定的专业马克笔效果，需要自定义或 fork 自由绘制渲染层。

## 压感：原生支持

Excalidraw `v0.18.0` 的 `ExcalidrawFreeDrawElement` 同时保存：

- `points`：局部坐标点；
- `pressures`：每个点的压力值；
- `simulatePressure`：鼠标等没有真实笔压时是否模拟压力。

在 `App.tsx` 中，创建自由绘制元素时会读取 `PointerEvent.pressure`，后续 pointer move 也会逐点追加压力。鼠标事件的典型压力值会被识别为模拟压力，触控笔则保留真实压力。[v0.18.0 `App.tsx`](https://github.com/excalidraw/excalidraw/blob/817d8c553c3389650f8b4503984a6d4a5d2f0c11/packages/excalidraw/components/App.tsx#L7431-L7450)

渲染路径使用 `perfect-freehand` 的 `getStroke()`。真实压力会以 `[x, y, pressure]` 输入，笔宽、thinning、smoothing 和 streamline 由渲染参数控制；因此这不是“只保存压力但画出来恒定宽度”。[v0.18.0 `renderElement.ts`](https://github.com/excalidraw/excalidraw/blob/817d8c553c3389650f8b4503984a6d4a5d2f0c11/packages/excalidraw/renderer/renderElement.ts#L1018-L1037)

这足以支持：Wacom/Surface 等触控笔的粗细变化、鼠标回退模拟、平滑笔迹和 SVG/Canvas 场景保存。输入质量仍取决于 Electron/浏览器是否正确报告 Pointer Events，以及设备驱动是否提供压力值。[Pointer Events Level 3](https://www.w3.org/TR/pointerevents3/)

## 荧光笔：可做，但不是原生工具

在 `v0.18.0` 的工具和元素类型中没有独立 `highlighter`/`marker` 元素。最小实现可以复用 `freedraw`：

```text
宽笔宽 + 高饱和颜色 + 低 opacity + 自定义 brush 标记
```

例如将元素标记为 `customData: { brush: "highlighter" }`，保存较大的 `strokeWidth` 和约 25%--40% 的 `opacity`。这样可以复用选择、移动、撤销、保存和导出；`customData` 也是 Excalidraw 基础元素的公开字段。[v0.18.0 element types](https://github.com/excalidraw/excalidraw/blob/817d8c553c3389650f8b4503984a6d4a5d2f0c11/packages/excalidraw/element/types.ts#L39-L80)

但这只是视觉模拟，有三个差异：

1. 默认自由绘制的压力变化会让荧光笔两端和转弯处变细；真正的马克笔通常需要恒定笔宽或独立压力曲线。
2. Excalidraw 没有通用的混合模式字段；半透明笔划覆盖文字的效果是普通 alpha 合成，不一定等同于系统荧光笔的 multiply 效果。
3. 高亮顺序由画布 z-order 决定。若笔划在文字上方，文字会被着色；若要自动置于文字下方，需要额外的层级策略。

因此“可用的高亮预设”不需要重写整个画布；“专业荧光笔”则需要扩展自由绘制的 stroke renderer，或维护一个小 fork。不要直接依赖 Excalidraw 当前 `master` 上尚未发布的 stroke variability API；应以实际锁定的 npm 版本为准。

## 能力边界

| 能力 | Excalidraw 0.18.0 | 备注 |
| --- | --- | --- |
| 基础压感 | 支持 | `pressures` + `perfect-freehand` |
| 鼠标回退 | 支持 | `simulatePressure` |
| 基础平滑 | 支持 | streamline/smoothing 参数已在渲染器中使用 |
| 荧光笔预设 | 可实现 | 复用 freedraw，设置宽度和透明度 |
| 恒定宽荧光笔 | 需扩展 | 默认渲染按压力变化 |
| 倾斜/旋转笔 | 未见持久化字段 | 需自行扩展 PointerEvent 数据模型 |
| 掌托拒触 | 有基础 pen mode | 需要在目标设备上验证，不等同于专业手写拒触 |
| 局部橡皮擦 | 需自行实现 | 默认模型以元素/笔划为粒度更容易复用 |

## 推荐路线

对于 OrcaNote 风格产品，建议先保留 Excalidraw 作为画布主体：

1. 第一阶段：使用原生 freedraw，确认压力数据、设备兼容性、保存和导出。
2. 第二阶段：增加“荧光笔”预设，复用 freedraw，并保存 `customData.brush`、宽度、透明度和颜色。
3. 第三阶段：如果手写成为核心场景，再替换/扩展 stroke renderer，加入恒定宽、压力曲线、倾斜和局部橡皮。

这条路线能保留 Excalidraw 的选择、历史、场景 JSON 和导出能力，同时避免为了一个笔刷过早重写整个白板。

## GoodNotes 级马克笔的实现方式

专业马克笔不应只被建模成“更粗的 freedraw”。建议把它建模成独立的 `marker` 笔划，并保存原始输入点和笔刷参数：

```ts
type MarkerStroke = {
  id: string;
  points: Array<{ x: number; y: number; pressure: number; time: number; tiltX?: number; tiltY?: number }>;
  size: number;
  color: string;
  opacity: number;
  blendMode: "normal" | "multiply";
  brush: "marker" | "highlighter";
};
```

渲染时用 `perfect-freehand` 或同类 stroke-outline 算法生成填充轮廓，而不是直接画一条固定宽度的 Canvas 线。荧光笔通常把 `thinning` 设为接近 0，使笔宽基本恒定；普通钢笔再根据压力使用更大的 thinning。颜色叠加可用独立墨迹层或 `multiply` 合成；若要求 SVG/PDF 可复现，必须在导出管线中显式处理混合模式，不能假设普通 alpha 就等价。

在 Excalidraw `0.18.x` 中，自由绘制的 `getStroke()` 参数在渲染器内是固定的（例如 `thinning: 0.6`、`size: strokeWidth * 4.25`），公共 API 没有完整的笔刷插件接口。因此 GoodNotes 级马克笔有两个实际选择：

1. 维护一个小 fork，增加 `marker` 元素或可持久化的 stroke options，并把它接入 Excalidraw 的历史、选择和导出；
2. 在 Excalidraw 画布上叠加独立的墨迹 Canvas/OffscreenCanvas，自己同步相机变换、撤销、保存、命中测试和导出。

第二种更容易快速迭代笔刷，但会增加对象选中、导出和协作同步的工作；如果手写是产品核心，第一种通常更长期可控。桌面 Electron 场景可用 Pointer Events 的 `getCoalescedEvents()` 获取高频笔点；iPad 原生应用若追求 Apple Pencil 的悬停和掌托体验，应评估 PencilKit，而不是只依赖 WebView。
