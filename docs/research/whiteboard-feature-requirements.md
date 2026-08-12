# 白板功能需求调研

调研日期：2026-08-12

## 结论摘要

一个可长期使用的白板，不只是“能画线的画布”。成熟产品把能力分成四层：可直接操作的画布和对象模型、把对象组织成信息结构的关系/容器、多人协作与分享，以及保证数据不丢和能迁移的工程基础设施。Excalidraw 的公开模型强调元素、框架、库、嵌入和导出；tldraw 的编辑器模型强调工具、可扩展 shapes、assets、bindings、history 和同步；Apple Freeform 则覆盖形状、连接线、附件、手绘和协作等端用户工作流。

对于 OrcaNote/知识库型产品，建议先做“本地优先、可缩放、支持压感的对象画布 + 笔记块嵌入 + 稳定撤销/持久化”，再增加实时协作、模板和自动布局。下面的“必备”是可以形成可用产品的 P0；“增强”是成熟体验的 P1/P2；工程基础设施虽不一定显示在工具栏中，却应在第一版数据模型中预留。

对手写体验的判断：Excalidraw 的自由绘制元素有独立的 `pressures` 数组，因此可以保存并重绘基础压感笔迹；它适合草图、批注和知识卡片上的手写标记。若目标是 GoodNotes/Apple Notes 级别的墨迹体验，仍需补充压力曲线、倾斜角、掌托拒触、悬停预览、局部橡皮和高频笔划性能，或者把自由绘制层替换为 `perfect-freehand`/专用 ink renderer。[Excalidraw element 类型](https://github.com/excalidraw/excalidraw/blob/master/packages/element/src/types.ts)；[W3C Pointer Events Level 3](https://www.w3.org/TR/pointerevents3/)

## 1. 必备功能（P0）

| 能力 | 具体要求 | 为什么必须有 | 参考来源 |
| --- | --- | --- | --- |
| 无限画布与导航 | 平移、滚轮/触控板缩放、缩放到选择/内容、显示当前缩放；画布边界不应限制用户布局。 | 白板的核心空间模型；没有稳定导航，大图和思维导图不可用。 | [tldraw Editor](https://tldraw.dev/docs/editor)；[Apple Freeform User Guide](https://support.apple.com/guide/freeform/welcome/mac) |
| 指针与手写输入 | 鼠标、触摸、触控笔；读取 `PointerEvent.pressure`，保留压力点；`touch-action: none`、pointer capture、掌托/笔触冲突处理；至少有可调笔宽和颜色。 | 手写是白板区别于普通文档的输入方式；压感数据必须进入持久化模型，不能只保存最终位图。 | [tldraw Draw Tool](https://tldraw.dev/docs/tools)；[Pointer Events pressure](https://developer.mozilla.org/en-US/docs/Web/API/PointerEvent/pressure)（规范性 Web API 说明） |
| 基础绘图工具 | 自由笔、橡皮（对象级或笔划级）、直线、箭头、矩形、椭圆/圆、菱形、文本。 | Excalidraw、Freeform、Miro 等都把这些作为第一层工具，覆盖草图、标注和流程图。 | [Excalidraw integration](https://docs.excalidraw.com/docs/@excalidraw/excalidraw/integration)；[Apple：Freeform 中添加形状和线条](https://support.apple.com/guide/freeform/add-shapes-and-lines-fcf9b6f6b5c1/mac) |
| 选择与对象操作 | 点选、多选、框选/套索；拖动、调整尺寸、旋转、复制/粘贴、删除、撤销/重做；键盘方向键微调。 | 所有对象都需要可修正、可重排；选择状态也是后续分组、对齐和属性面板的基础。 | [tldraw Editor](https://tldraw.dev/docs/editor)；[Excalidraw UI options/API](https://docs.excalidraw.com/docs/@excalidraw/excalidraw/api/props/ui-options) |
| 样式与层级 | 线宽、填充、描边、透明度、字体/字号、端点样式；前移/后移、锁定，至少支持复制样式。 | 统一视觉编码和避免误操作需要对象级样式与层级。 | [Excalidraw JSON Schema](https://docs.excalidraw.com/docs/codebase/json-schema)；[tldraw Shapes](https://tldraw.dev/docs/shapes) |
| 连接线与绑定 | 箭头端点可吸附到形状/节点；移动节点时连接线跟随；支持折线或曲线中的一种。 | 流程图、关系图、思维导图的语义在“连接关系”，不能只是一条独立线段。 | [tldraw Shapes](https://tldraw.dev/docs/shapes)；[tldraw Bindings](https://tldraw.dev/sdk-features/bindings)；[Apple：连接线](https://support.apple.com/guide/freeform/connect-shapes-with-lines-fcf9b6f6b5c1/mac) |
| 文本与可读性 | 直接输入/编辑文本，换行、自动调整文本框，基本富文本（粗体/斜体可后置）；文本随缩放保持可读。 | 白板最终要承载解释和标签，而不只是图形。 | [Excalidraw JSON Schema](https://docs.excalidraw.com/docs/codebase/json-schema)；[Apple Freeform User Guide](https://support.apple.com/guide/freeform/welcome/mac) |
| 图片与文件对象 | 粘贴/拖放图片，显示加载/失败状态；文件对象至少能打开原文件或外部链接。 | 参考资料、截图和附件是成熟白板的常见内容；应与画布对象统一选中、移动和持久化。 | [Excalidraw integration](https://docs.excalidraw.com/docs/@excalidraw/excalidraw/integration)；[Apple Freeform User Guide](https://support.apple.com/guide/freeform/welcome/mac) |
| 撤销/重做与自动保存 | 对象级操作进入 history；应用退出或崩溃后可恢复最近状态；保存失败要可见并可重试。 | 直接操作具有高误触风险，数据安全是白板可用性的底线。 | [tldraw Editor](https://tldraw.dev/docs/editor)；[tldraw Persistence](https://tldraw.dev/docs/persistence) |
| 导入与导出 | 至少导出 PNG/SVG/PDF；保存可再次编辑的 JSON；导出应支持透明背景/选区或整板。 | 用户需要分享、归档、打印，也需要迁移而不被厂商锁定。 | [Excalidraw Export Utilities](https://docs.excalidraw.com/docs/@excalidraw/excalidraw/api/utils/export)；[Excalidraw JSON Schema](https://docs.excalidraw.com/docs/codebase/json-schema) |
| 笔记块/网页嵌入 | 画布对象可以引用稳定的笔记块 ID；默认显示卡片摘要，双击回到编辑器；嵌入渲染应支持自定义 React 组件。 | OrcaNote 的价值在“白板与结构化笔记互通”，不是把笔记导出成图片。 | [Excalidraw Render Props](https://docs.excalidraw.com/docs/@excalidraw/excalidraw/api/props/render-props)；[Excalidraw Embeddable Elements](https://docs.excalidraw.com/docs/@excalidraw/excalidraw/api/excalidraw-element-skeleton) |
| 快捷键与触控手势 | `V`/选择、`H`/平移、`E`/橡皮、`D`/笔、`R`/矩形等常用快捷键；空格拖动画布；触控设备提供双指缩放。 | 高频绘制依赖肌肉记忆，工具切换不能总依赖鼠标。 | [tldraw Tools](https://tldraw.dev/docs/tools)；[Excalidraw UI options](https://docs.excalidraw.com/docs/@excalidraw/excalidraw/api/props/ui-options) |

## 2. 增强功能（P1/P2）

### 2.1 组织与表达

- **分组、对齐、分布和吸附网格**：将多个对象视为一个单元，并提供水平/垂直对齐、等距分布和智能参考线。Miro、FigJam 和 Freeform 都把这些作为整理大板的基本操作；可参考 [Miro 对象编辑](https://help.miro.com/hc/en-us/articles/360017730114-Adding-and-editing-objects) 和 [Apple Freeform User Guide](https://support.apple.com/guide/freeform/welcome/mac)。
- **Frames/Sections/区域**：为内容建立命名区域，支持移动区域内对象、导出单个区域和演示模式。Excalidraw 的 frames 是独立的组织元素，见 [Frames](https://docs.excalidraw.com/docs/codebase/frames)。
- **便签、评论和反应**：便签要有颜色/标题/正文；评论附着到对象并可解决；反应用于快速投票。可参考 [FigJam 官方帮助](https://help.figma.com/hc/en-us/categories/360002051613-FigJam) 和 [Miro 官方帮助](https://help.miro.com/hc/en-us)。
- **对象库、模板和自定义组件**：收藏常用图形、贴纸、流程图模板或产品专用笔记卡。Excalidraw 的 library 是第一方扩展点，见 [Library API](https://docs.excalidraw.com/docs/@excalidraw/excalidraw/api/props/initialdata)。
- **富媒体与网页嵌入**：PDF、多页文档、视频、音频、网页 iframe；必须显示加载/权限/跨域失败状态，并提供安全沙箱。参考 [Excalidraw embeddable 元素](https://docs.excalidraw.com/docs/@excalidraw/excalidraw/api/excalidraw-element-skeleton)。
- **搜索与命令入口**：按文本、标签、对象类型或笔记块 ID 搜索；命令面板列出工具、排列、导出和视图动作。tldraw 的 Editor API 通过 commands/tools 扩展，见 [Editor](https://tldraw.dev/docs/editor)。

### 2.2 思维导图与结构化笔记

- **从大纲生成导图，导图节点回链块 ID**：节点增删/改名应能回写大纲；至少支持折叠、展开和焦点节点。
- **自动布局与手动微调并存**：树状、左右平衡、放射状等布局；自动布局后允许用户拖动并锁定局部位置。
- **语义连接与层级导航**：区分父子边和普通关系边；面包屑、缩放到节点、从节点打开原始笔记。
- **大数据量策略**：节点按视口/层级懒加载，避免一次性渲染整个知识库。tldraw 的可扩展 shapes/编辑器模型可作为实现参考：[Shapes](https://tldraw.dev/docs/shapes)。

### 2.3 协作与分享

- **实时协作**：多人光标、选区、在线状态、对象级并发编辑和断线重连；同步模型需要明确房间/文档边界。tldraw 官方同步方案见 [tldraw sync](https://tldraw.dev/docs/sync)。
- **权限与分享链接**：查看/评论/编辑/复制权限，访客身份和链接过期；服务端必须校验权限，不能只靠渲染器隐藏按钮。Miro 的 board sharing 作为产品参考：[Miro Help Center](https://help.miro.com/hc/en-us)。
- **评论审计与版本历史**：查看谁在何时改了对象，支持恢复到历史版本；冲突解决后保留可追踪记录。
- **演示/跟随模式**：按 Frame 顺序播放，主持人视角可被参与者跟随；适合会议和评审。

### 2.4 手写与专业输入增强

- 压感曲线、倾斜角 `tiltX/tiltY`、速度相关笔宽；支持钢笔、荧光笔、铅笔和形状识别。
- 手掌拒触、悬停预览、Apple Pencil 双指/悬停手势（平台允许时）；提供“仅笔输入”开关。
- 笔划平滑、简化和回放；橡皮擦支持整笔划、局部擦除两种模式。
- 手写 OCR/套索转文本（可后置，涉及本地模型和隐私）。

## 3. 工程基础设施（应在第一版设计中预留）

| 主题 | 最低要求 | 主要风险/实现提示 | 参考来源 |
| --- | --- | --- | --- |
| 数据模型 | 每个对象有稳定 ID、类型、几何、样式、父子/绑定关系和 `version`；笔划保存原始点（含 pressure/tilt），而非仅保存栅格。 | 稳定 ID 是撤销、引用、协作和迁移的共同键；模式升级需要迁移脚本。 | [Excalidraw JSON Schema](https://docs.excalidraw.com/docs/codebase/json-schema)；[tldraw Editor](https://tldraw.dev/docs/editor) |
| 历史与命令 | 所有变更通过可组合命令进入 undo/redo；合并连续笔划，避免每个 pointermove 都生成历史项。 | 直接改 DOM/Canvas 状态会导致撤销、持久化和协作不一致。 | [tldraw Editor](https://tldraw.dev/docs/editor) |
| 渲染性能 | 视口裁剪、空间索引、批量绘制、图片缓存、高 DPI 适配；大板滚动/缩放保持稳定帧率。 | Canvas/SVG 在万级对象或长笔划时容易掉帧；渲染层与文档层应分离。 | [tldraw Editor](https://tldraw.dev/docs/editor)（编辑器/渲染架构）；[Konva Performance Tips](https://konvajs.org/docs/performance/All_Performance_Tips.html) |
| 输入可靠性 | pointer capture、触摸 `touch-action`、窗口失焦收笔、压感缺失回退为 0.5/1、设备像素比处理。 | 不同浏览器/操作系统的 stylus 事件字段不一致，必须有降级和设备矩阵。 | [Pointer Events](https://www.w3.org/TR/pointerevents3/) |
| 本地持久化与离线 | 自动保存、崩溃恢复、增量快照；资源文件与文档元数据分离；离线可继续编辑。 | 先写临时快照再原子替换，防止进程中断破坏整板；限制单板资源大小。 | [tldraw Persistence](https://tldraw.dev/docs/persistence)；[tldraw sync](https://tldraw.dev/docs/sync) |
| 同步与冲突 | 若支持协作，使用 CRDT/操作日志，明确对象级冲突规则、离线队列、重连和服务器鉴权。 | “最后写入胜出”会丢笔划或移动；大二进制资源不应混入 CRDT 文本通道。 | [tldraw sync](https://tldraw.dev/docs/sync) |
| 资源与安全 | 图片/PDF/附件采用内容寻址或稳定资源 ID；外部 iframe 使用白名单、沙箱和 CSP；SVG/HTML 导入要清洗。 | XSS、恶意 SVG、超大图片和外链失效是常见风险。 | [Excalidraw integration](https://docs.excalidraw.com/docs/@excalidraw/excalidraw/integration)；[MDN iframe sandbox](https://developer.mozilla.org/en-US/docs/Web/HTML/Reference/Elements/iframe#sandbox) |
| 导入导出兼容 | JSON schema 带版本；导出 PNG/SVG/PDF 可复现；导入失败要报告具体对象而非静默丢弃。 | 第三方格式字段不完整时要保留未知字段，避免往返破坏数据。 | [Excalidraw Export Utilities](https://docs.excalidraw.com/docs/@excalidraw/excalidraw/api/utils/export)；[JSON Schema](https://docs.excalidraw.com/docs/codebase/json-schema) |
| 可访问性与国际化 | 工具栏可键盘访问，按钮有可读名称，颜色不能是唯一语义；支持 RTL、字号放大和减少动画。 | 画布本身无法完全依赖 DOM 语义，应为选中对象提供可访问摘要和替代操作。 | [WAI-ARIA Authoring Practices](https://www.w3.org/WAI/ARIA/apg/)；[tldraw UI](https://tldraw.dev/docs/user-interface) |
| 质量与观测 | 记录 pointer 输入丢失、渲染帧耗时、保存失败和同步延迟；建立长笔划/万对象/断网恢复测试。 | 白板问题往往只在特定设备和数据规模出现；没有指标难以复现。 | [tldraw sync](https://tldraw.dev/docs/sync)（同步状态/连接边界）；[Pointer Events](https://www.w3.org/TR/pointerevents3/) |

## 4. 推荐落地顺序

1. **P0 画布闭环**：导航、笔/橡皮、基础形状/文本/图片、选择变换、连接线、撤销重做、自动保存、PNG/SVG/JSON 导出。
2. **知识库整合**：稳定块 ID、笔记卡片嵌入、双击回链、框架/区域、从大纲生成思维导图。
3. **成熟交互**：分组对齐、库和模板、评论、搜索/命令面板、PDF/网页嵌入、演示模式。
4. **协作与专业手写**：CRDT 实时协作、权限/历史、压力曲线/倾斜/掌托、OCR 和形状识别。

不要为了追求工具数量而推迟 P0 的数据安全和输入可靠性。白板最难返工的部分是对象 schema、笔划数据和同步边界，应先固定这些契约，再扩展 UI 工具。

## 5. 主要官方来源

- [Excalidraw developer docs](https://docs.excalidraw.com/docs/)
- [Excalidraw JSON Schema](https://docs.excalidraw.com/docs/codebase/json-schema)
- [Excalidraw Frames](https://docs.excalidraw.com/docs/codebase/frames)
- [Excalidraw Render Props](https://docs.excalidraw.com/docs/@excalidraw/excalidraw/api/props/render-props)
- [Excalidraw Export Utilities](https://docs.excalidraw.com/docs/@excalidraw/excalidraw/api/utils/export)
- [tldraw Editor](https://tldraw.dev/docs/editor)
- [tldraw Tools](https://tldraw.dev/docs/tools)
- [tldraw Shapes](https://tldraw.dev/docs/shapes)
- [tldraw Bindings](https://tldraw.dev/sdk-features/bindings)
- [tldraw Persistence](https://tldraw.dev/docs/persistence)
- [tldraw sync](https://tldraw.dev/docs/sync)
- [Miro Help Center](https://help.miro.com/hc/en-us)
- [FigJam Help Center](https://help.figma.com/hc/en-us/categories/360002051613-FigJam)
- [Apple Freeform User Guide](https://support.apple.com/guide/freeform/welcome/mac)
- [W3C Pointer Events Level 3](https://www.w3.org/TR/pointerevents3/)
