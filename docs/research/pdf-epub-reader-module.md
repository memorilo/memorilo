# PDF / EPUB 阅读模块调研

调研日期：2026-07-31

## 范围与结论

本文调研一个供 `@memorilo/editor` 使用、同时支持 PDF 与 EPUB 的可扩展阅读模块。目标不是把两个现成阅读器并排嵌入应用，而是让 Memorilo 拥有统一的界面、交互、状态与持久化模型，底层渲染库只负责格式相关能力。

建议新建独立工作区包，例如 `packages/reader`，由 `@memorilo/editor` 通过其公开入口使用。不要把 PDF 或 EPUB 引擎直接写进 editor，也不要跨包导入私有源码。模块应先定义稳定的 `ReaderEngine`、location、capability 与资源访问接口，再把具体库封装成可替换 adapter。

调研得到两条可行路线：

1. **交付风险较低：PDF.js + Readium TypeScript Toolkit。** PDF.js 负责 PDF，Readium 负责 EPUB，Memorilo 自己实现同一套 Reader Shell。这条路线能复用较成熟的文本选择、链接、搜索、EPUB locator 与排版能力，但 EPUB 的 publication opening/resource serving 集成较重；若改用 EPUB.js，可更快完成第一版，但其 npm 稳定发布长期滞后。
2. **渲染接口一致性更强：MuPDF.js 单引擎。** MuPDF 用同一套 `Document` / `Page` 抽象读取 PDF、EPUB 及更多格式，不需要让 EPUB 作为一组不可信网页 iframe 进入主 renderer。但它是渲染引擎而非完整 Web 阅读器，Memorilo 需要自己补齐文本层、选择、无障碍语义、链接/批注 overlay、页面虚拟化与搜索结果定位；当前 MuPDF 还把 EPUB 整体标记为 reflowable，不能从公开 API 保证 fixed/mixed-layout 的 EPUB 语义与原版 fidelity，同时必须先解决 AGPL-3.0-or-later 或商业授权选择。

当前不宜仅凭 API 表面直接选定 MuPDF.js。建议用同一组验收样本做一个限时原型，在 **PDF.js + Readium** 和 **MuPDF.js** 之间验证文本选择、中文与竖排、固定版面 EPUB、无障碍、长文档内存和打包方式，再作技术与授权决策。

## EPUB 两种模式的准确含义

EPUB 3.3 使用 `rendition:layout` 区分两类内容：

- `reflowable`：阅读系统根据 viewport、字体和用户设置动态排版与分页。
- `pre-paginated`：固定版面；每个 spine `itemref` 恰好构成一页。

W3C 还指出，固定版面用于内容与设计无法分离的场景；对其应用用户样式通常会破坏固有呈现。阅读系统也必须忽略 fixed-layout item 的 `rendition:flow`。[EPUB 3.3: Layout](https://www.w3.org/TR/epub-33/#layout)；[EPUB 3.3: Fixed layouts](https://www.w3.org/TR/epub-33/#sec-fixed-layouts)；[EPUB Reading Systems 3.3: Layout](https://www.w3.org/TR/epub-rs-33/#layout)

因此产品中的两种模式建议命名为：

- **出版者排版**：尊重出版物的 `rendition:layout`、publisher CSS 和 spine item override。可重排书籍保留出版社样式，固定版面保持原尺寸、图文关系和分页。
- **阅读器排版**：只对本身可重排的章节关闭或覆盖 publisher CSS，应用 Memorilo 的字体、字号、行距、页边距、栏数、主题和 paginated/scrolled 设置。

“阅读器排版”不是任意 fixed-layout EPUB 到 reflowable EPUB 的可靠转换。对纯图片、漫画、画册或复杂固定版面，若未来需要内容抽取，应作为单独的实验性功能，明确可能丢失图文关系、阅读顺序、公式、脚注和辅助功能语义；这属于产品与兼容性决策，不能在本模块中默认承诺。

混合版面 EPUB 也应逐 spine item 处理：可重排章节进入阅读器排版，固定页仍按固定版面显示，而不是把整本书强制切成一种 layout。

## 候选对比

| 方案 | 格式与版面 | 统一界面方式 | 主要优势 | 主要风险 | 许可证 / 维护状态 |
| --- | --- | --- | --- | --- | --- |
| PDF.js | PDF | 使用 display API、viewer components，自建 Memorilo UI | PDF Web 生态成熟；有 worker、文本层、注释层、查找和链接组件 | 只解决 PDF；直接嵌入 generic viewer 会形成另一套产品 UI | Apache-2.0；`pdfjs-dist` 6.2.108，2026-07-28 发布 |
| EPUB.js | EPUB，reflowable / pre-paginated | 使用 Rendition、manager、theme、annotation API，自建 UI | 接入较轻；CFI、主题、分页/滚动、highlight 能力直接可用 | npm 最新 0.3.93 发布于 2022；iframe 与 scripted content 安全边界；continuous manager 性能较弱 | BSD-2-Clause；源码仍有更新，但发布节奏不稳定 |
| Readium TS Toolkit | EPUB，reflowable / fixed | `EpubNavigator` 只提供 navigator，UI 由应用实现 | 标准化的 Publication、Locator、Decoration、Preferences；维护活跃 | 没有 PDF navigator；本地 EPUB opener/resource pipeline 需要额外工程；frame 脚本隔离需审计 | BSD-3-Clause；`@readium/navigator` 2.8.1，2026-07-29 发布 |
| MuPDF.js | PDF、EPUB、MOBI、FB2、CBZ、SVG、图像等 | 同一 `Document` / `Page` 接口，自建所有 UI 与 Web 交互层 | 单引擎接口一致；EPUB 不必作为网页 iframe 渲染；天然利于继续扩格式 | fixed/mixed EPUB fidelity 无公开保证；AGPL/商业授权；约 10 MB WASM；文本选择、无障碍和 viewer 基础设施需要自研；对象需显式销毁 | AGPL-3.0-or-later 或商业许可；`mupdf` 1.28.0 |
| foliate-js | EPUB，并以 PDF.js 提供实验性 PDF adapter | 已有较统一的 book/view 概念 | 体积小；架构与本任务高度相关，适合作为设计参考 | 官方将 PDF 标为 proof-of-concept / highly experimental；混合版面 EPUB 不支持；生态规模较小 | MIT；源码 package 为 0.0.0，无稳定 release，官方建议以 git submodule 使用 |

旧的 `readium-js` / `readium-js-viewer` 已归档，不应作为新模块基础。Electron 专用的 `r2-navigator-js` 与 streamer、webview、IPC、singleton/process 生命周期高度耦合，适合参考 Thorium 的成熟桌面流程，不适合成为一个由 editor 消费的轻量可替换 adapter。[readium-js](https://github.com/readium/readium-js)；[readium-js-viewer](https://github.com/readium/readium-js-viewer)；[r2-navigator-js](https://github.com/edrlab/r2-navigator-js/tree/01a5d14e44b2daab78ea16270b35a2fe9c36490a)

foliate-js 当前仓库的 `package.json` 版本为 `0.0.0`，README 说明项目没有稳定 release，并建议通过 git submodule 使用；因此它适合作为架构参考或原型材料，不应按普通稳定 npm 依赖评估。[foliate-js README](https://github.com/johnfactotum/foliate-js/blob/78914aef4466eb960965702401634c2cb348e9b1/README.md)；[`package.json`](https://github.com/johnfactotum/foliate-js/blob/78914aef4466eb960965702401634c2cb348e9b1/package.json)

## PDF.js

PDF.js 是 Mozilla 支持、基于 Web 标准的 PDF 解析与渲染平台。除官方 generic viewer 外，它公开了 `PDFViewer`、`PDFFindController`、`PDFLinkService`、`PDFHistory`、`EventBus`、text layer 和 annotation layer 等可组合组件，因此可以只采用引擎和必要 viewer primitives，由 Memorilo 统一实现 toolbar、sidebar、搜索面板、错误态和快捷键。[PDF.js README](https://github.com/mozilla/pdf.js/tree/73707b62e95d0e4d0f75c7c491c132064403a7de)；[viewer component exports](https://github.com/mozilla/pdf.js/blob/73707b62e95d0e4d0f75c7c491c132064403a7de/web/pdf_viewer.component.js)；[component example](https://github.com/mozilla/pdf.js/tree/73707b62e95d0e4d0f75c7c491c132064403a7de/examples/components)

适合本模块的能力包括：

- worker 中解析文档，避免主 renderer 长任务。
- range request、streaming 与 auto-fetch 控制，适配本地文件和未来远端资源。
- Canvas / OffscreenCanvas 渲染、可选的 WASM 图像解码。
- 独立文本层、链接服务、查找控制器与注释层。
- 页面粒度的按需加载和销毁，便于窗口化渲染。

[PDF.js display API](https://mozilla.github.io/pdf.js/api/)；[`getDocument` 参数与 transport](https://github.com/mozilla/pdf.js/blob/73707b62e95d0e4d0f75c7c491c132064403a7de/src/display/api.js)

`pdfjs-dist` 6.2.108 的 npm tarball 约 8.42 MB，本次解包约 34.50 MB；其中包含 legacy build、source maps、CMaps、standard fonts 等可选资产，不能把整个包的解包尺寸等同于最终应用增量。现代 minified worker 约 1.26 MB，应通过 bundler asset 配置和动态 import 明确实际进入安装包的文件。[npm package metadata](https://registry.npmjs.org/pdfjs-dist/6.2.108)

PDF 端首选 PDF.js。需要避免的做法是加载其完整 `web/viewer.html` 再套一层 Memorilo 外壳，因为这会保留 PDF.js 的导航、状态和键盘模型，破坏两种格式的一致性。

## EPUB.js

EPUB.js 是无强制产品 UI 的浏览器 EPUB renderer。`Rendition`、view manager、hooks、themes 与 annotations 允许宿主控制容器、分页/滚动、publisher CSS override、EPUB CFI、高亮和跳转。它读取 `rendition:layout` 并区分 `reflowable` 与 `pre-paginated`。[EPUB.js README](https://github.com/futurepress/epub.js/tree/eee359d0790002115a1156a9833c54f4bcd44c1d)；[`rendition.js`](https://github.com/futurepress/epub.js/blob/eee359d0790002115a1156a9833c54f4bcd44c1d/src/rendition.js)；[`layout.js`](https://github.com/futurepress/epub.js/blob/eee359d0790002115a1156a9833c54f4bcd44c1d/src/layout.js)

EPUB.js 是第一版成本最低的 EPUB 方案，但有三项风险：

1. npm 最新 `epubjs` 0.3.93 发布于 2022-02-16，虽然仓库后续仍有提交，稳定发布与源码存在明显时间差。[npm metadata](https://registry.npmjs.org/epubjs/0.3.93)
2. continuous manager 官方源码说明其性能弱于 default manager；长书连续滚动需要单独压测。[continuous manager](https://github.com/futurepress/epub.js/blob/eee359d0790002115a1156a9833c54f4bcd44c1d/src/managers/continuous/index.js)
3. 内容在 iframe 中呈现。脚本默认关闭；官方 README 明确警告启用 `allowScriptedContent` 会使当前 sandbox 不安全。[scripted content](https://github.com/futurepress/epub.js/blob/eee359d0790002115a1156a9833c54f4bcd44c1d/README.md#scripted-content)；[`iframe.js`](https://github.com/futurepress/epub.js/blob/eee359d0790002115a1156a9833c54f4bcd44c1d/src/managers/views/iframe.js)

0.3.93 tarball 约 2.23 MB、解包约 6.42 MB，minified bundle 约 224 KB，但还需计入 ZIP/XML 依赖及应用自己的资源处理代码。[npm metadata](https://registry.npmjs.org/epubjs/0.3.93)

若以交付速度优先，可以把 EPUB.js 放进严格的 engine adapter，并确保公共 API 不泄漏 `Rendition`、CFI 类实例或 iframe DOM，以便未来替换为 Readium 或 MuPDF。

## Readium TypeScript Toolkit

当前活跃的 Readium Web 实现是 `readium/ts-toolkit`。其设计把用户界面明确列为 non-goal；`EpubNavigator` 提供 fixed/reflowable frame manager、locator、位置变化、选区、decorations 和 typography preferences，适合被统一 Reader Shell 驱动。[Readium Web guidelines](https://github.com/readium/ts-toolkit/blob/1faa458ffafb9d3746478edad8829261e179a412/docs/README.md)；[`EpubNavigator`](https://github.com/readium/ts-toolkit/blob/1faa458ffafb9d3746478edad8829261e179a412/navigator/src/epub/EpubNavigator.ts)；[EPUB preferences](https://github.com/readium/ts-toolkit/blob/1faa458ffafb9d3746478edad8829261e179a412/navigator/src/epub/preferences/EpubPreferences.ts)

它比 EPUB.js 更接近长期阅读平台，但不是开箱即用的本地 EPUB reader：navigator 接收 `Publication`，资源通过 `Fetcher` 取得；本地 `.epub` 的解包、解析、RWPM manifest 构建和安全资源服务需要 Memorilo 另行实现或组合其他 Readium 组件。[`Publication`](https://github.com/readium/ts-toolkit/blob/1faa458ffafb9d3746478edad8829261e179a412/shared/src/publication/Publication.ts)；[`Fetcher`](https://github.com/readium/ts-toolkit/tree/1faa458ffafb9d3746478edad8829261e179a412/shared/src/fetcher)

现代 Readium Web 当前聚焦 EPUB，官方 meta repository 将 PDF 支持列为未来修订计划，不能把它当作 PDF/EPUB 单引擎。[Readium Web](https://github.com/readium/web/tree/737f11ce689adf77909795d83c0e8dd1fc5db434)

`@readium/navigator` 2.8.1 的 tarball 约 196 KB、解包约 1.03 MB，但真实集成还包括 `@readium/shared`、HTML injectables、Readium CSS 和 publication/resource pipeline。[npm metadata](https://registry.npmjs.org/@readium/navigator/2.8.1)

安全方面不能因为采用 Readium 就默认 publisher content 已隔离。当前 frame 使用 `allow-same-origin allow-scripts`，生成的 blob document CSP 允许部分 inline/blob script；必须在应用层定义是否删除 publisher scripts、怎样分配 origin、怎样禁止网络和访问 Electron bridge。[`FrameManager`](https://github.com/readium/ts-toolkit/blob/1faa458ffafb9d3746478edad8829261e179a412/navigator/src/epub/frame/FrameManager.ts)；[`FrameBlobBuilder`](https://github.com/readium/ts-toolkit/blob/1faa458ffafb9d3746478edad8829261e179a412/navigator/src/epub/frame/FrameBlobBuilder.ts)

## MuPDF.js

MuPDF.js 是 Artifex 提供的 WebAssembly 文档引擎。`mupdf` 1.28.0 用同一套 `Document` / `Page` API 打开 PDF、EPUB、MOBI、FB2、CBZ、SVG 和图像；`Document.style(publisherCSS, userCSS)` 与 `Document.layout(width, height, em)` 可以重新布局支持 reflow 的文档，页面 API 提供渲染、链接、搜索和 structured text。[MuPDF.js documentation](https://mupdfjs.readthedocs.io/)；[MuPDF.js source](https://github.com/ArtifexSoftware/mupdf.js/tree/f97c0a0a924c8aaec5b8fe656bc430eb0a7d8f89)

这给出最直接的统一引擎模型：PDF 和 EPUB 都进入相同的打开、分页、渲染、搜索和 outline 流程；EPUB 无需把 publisher HTML 直接挂进应用 renderer。未来增加 CBZ 等格式也不需要重新设计 Reader Shell。

但 MuPDF.js 只提供 engine primitives，并不等价于 PDF.js viewer components 或 Readium navigator。要达到桌面阅读器质量，Memorilo 仍需实现：

- 页面/画布虚拟化、渲染调度、缩放缓存和设备像素比处理。
- 与 canvas 对齐的 selectable text layer，以及复制、跨行/跨页 selection。
- 链接、批注、搜索结果与 selection overlay。
- 键盘、屏幕阅读器、结构语义、焦点移动和高对比度支持。
- 文档、page、pixmap、structured text 等 WASM 对象的确定性 `.destroy()` 生命周期。

`mupdf` 1.28.0 tarball 约 8.43 MB、解包约 14.30 MB；主 WASM 约 10.41 MB，另带约 3.61 MB Brotli 版本。动态加载能减少 editor 首屏成本，但不能消除安装包和首次加载成本。[npm metadata](https://registry.npmjs.org/mupdf/1.28.0)

许可证为 AGPL-3.0-or-later，Artifex 同时提供商业许可。对 Electron 桌面产品而言，这必须在选型前由项目明确决定，不能视为普通 MIT/BSD 依赖。[MuPDF.js LICENSE](https://github.com/ArtifexSoftware/mupdf.js/blob/f97c0a0a924c8aaec5b8fe656bc430eb0a7d8f89/LICENSE)

当前 1.28.0 wrapper 还有一个需纳入原型的缺陷：JavaScript `Document.isReflowable()` 调用 native function 后没有 `return`，类型声明也写成 `void`。不要通过 pnpm patch 修改依赖；如果最终采用，应先确认上游版本、通过 adapter 使用其他能力判断，或与用户确认后再决定兼容策略。[`dist/mupdf.js`](https://unpkg.com/mupdf@1.28.0/dist/mupdf.js)；[`dist/mupdf.d.ts`](https://unpkg.com/mupdf@1.28.0/dist/mupdf.d.ts)

更重要的是，当前 MuPDF core 在 `epub_init()` 中对 EPUB document 无条件设置 `is_reflowable = 1`；公开 C API 与 JS 文档只暴露 document-level 的 `is reflowable`、`style` 和 `layout`，没有按 spine item 切换 `reflowable` / `pre-paginated` 的公开语义。因此它不能保证 EPUB fixed-layout 的 one-spine-item-one-page、spread/page-position 或 mixed spine override；这一点直接影响“尽量保证原有排版”的硬要求。[`epub-doc.c`](https://github.com/ArtifexSoftware/mupdf/blob/176781fa9b7aec3a83c1f1a90beda8e560fb02d0/source/html/epub-doc.c#L1148-L1178)；[`document.h`](https://github.com/ArtifexSoftware/mupdf/blob/176781fa9b7aec3a83c1f1a90beda8e560fb02d0/include/mupdf/fitz/document.h#L675-L696)；[JavaScript `Document` reference](https://github.com/ArtifexSoftware/mupdf/blob/176781fa9b7aec3a83c1f1a90beda8e560fb02d0/docs/reference/javascript/types/Document.rst#L189-L217)

### EPUB 排版实测

本次使用官方 [IDPF EPUB 3 Samples](https://github.com/IDPF/epub3-samples) 与 MuPDF.js 1.28.0，在 600 × 800 layout viewport 下做了验证：

| 样本 | 内容类型 | 出版者排版 | 阅读器排版 | 观察 |
| --- | --- | --- | --- | --- |
| `moby-dick` | reflowable | 12pt，385 页 | 关闭 publisher CSS、18pt，900 页 | 字号和阅读器 CSS 能触发真实重排 |
| `sous-le-vent` | fixed / 图像页 | 13 页，约 1474 × 2324 | 仍为 13 页、同尺寸 | structured text 仅有 `[image]`，无法自动转换为可靠文字重排 |
| `cole-voyage-of-life` | mixed layout | 12 页 | 15 页 | 可重排章节变为 600 × 800 页面；约 1024 × 800 的固定画作页仍保持固定宽度 |

实测证明 MuPDF 能重排语义型 EPUB，且部分 mixed-layout 样书可以在视觉上保留固定页。但后者可能只是 publisher CSS、viewport 与绝对定位内容在统一 reflow layout 中得到近似呈现；结合上述源码，它不能证明 MuPDF 实现了 fixed/mixed-layout 的规范语义或对任意书籍保证 fidelity。阅读器排版也不能让固定/图像章节自动获得文字流。因此 MuPDF 在当前版本不能直接作为“原版式保证”的依据，只能保留为需进一步验证的候选。

## 建议的模块边界

建议由 `packages/reader` 暴露公共 React UI、领域类型和 engine contract，具体实现作为内部 adapter 或独立子入口按需加载：

```text
@memorilo/editor
      │ public API / adapters
      ▼
@memorilo/reader
  ├─ ReaderShell（React + StyleX）
  ├─ ReaderSession（统一状态与命令）
  ├─ ReaderEngine contract
  ├─ location / capability / event model
  ├─ source 与持久化 adapter
  └─ engines
       ├─ pdfjs + readium（双引擎路线）
       └─ mupdf（单引擎路线）
```

### Reader Shell

所有格式共用同一套 Memorilo 组件和视觉语言：

- toolbar：上一处/下一处、位置输入、缩放或字号、版面、主题。
- sidebar：目录、缩略图或章节、搜索结果、书签与批注。
- 阅读区：统一的 loading、empty、password、unsupported、error 状态。
- 同一套快捷键、焦点规则、context menu、进度表达和设置入口。

格式差异通过 capability 决定控件是否出现或怎样命名，例如 PDF 暴露 zoom/rotate，reflowable EPUB 暴露 font size/line height，fixed EPUB 暴露 fit page/fit width。不要为了表面统一而给不支持的格式伪造能力。

### Engine contract

公共接口应表达行为，不泄漏 PDF.js、Readium 或 MuPDF 类型。最小能力建议包括：

```ts
interface ReaderEngine {
  open(source: ReaderSource, options: OpenOptions): Promise<ReaderDocument>
  close(): Promise<void>
  getCapabilities(): ReaderCapabilities
  getOutline(): Promise<readonly OutlineItem[]>
  getLocation(): ReaderLocation
  goTo(target: ReaderTarget): Promise<void>
  next(): Promise<void>
  previous(): Promise<void>
  search(query: SearchQuery): AsyncIterable<SearchBatch>
  setPresentation(settings: PresentationSettings): Promise<void>
}
```

这只是调研阶段的形状，不是最终 API。实现时还需要定义 abort/cancellation、事件订阅、渲染 surface 生命周期与错误分类。

### Location 不应被压成单一页码

PDF 与 EPUB 的稳定位置语义不同：

- PDF：页索引，加可选 normalized page coordinates、text quote 或目标 destination。
- EPUB：publication locator，包含 href、type、locations/progression 和可选 EPUB CFI、text context。

公共 `ReaderLocation` 应是带 format/discriminant 的 opaque union。UI 可以显示统一的百分比或“当前位置 / 总量”，持久化层仍保存无损的格式原生位置。否则字体变化导致 EPUB 页码改变后，书签与批注会漂移。

### Capability negotiation

建议至少描述：

- `layout`: `fixed` / `reflowable` / `mixed`
- `flow`: `paginated` / `scrolled`
- text selection、search、outline、links、annotations
- reader typography、zoom、rotation
- scripting、media overlays、accessibility semantics

Reader Shell 只根据 capability 选择控制项；新格式通过新 engine adapter 和 capability 接入，不要求 editor 改写格式分支。

### Source 与持久化 adapter

阅读包不应直接依赖 Electron 文件路径或 editor-storage 私有实现。建议由宿主注入：

- `ReaderSource`：Blob/bytes、seek/range reader 或受控资源 URL。
- publication resource resolver：按规范解析 EPUB 内部资源，不暴露任意文件系统读取。
- progress/bookmark/highlight repository：保存 location 与用户数据。
- external link handler：交给 desktop 宿主确认和打开。

大型 engine、worker、WASM、CMaps 和 EPUB CSS 应动态 import，仅在打开相应格式时加载。

## Electron 安全边界

EPUB 是装有 HTML、CSS、字体、SVG、媒体乃至脚本的 ZIP 容器，必须按不可信主动内容处理。W3C Reading Systems 规范也单独规定 scripted content 的隔离及安全隐私要求。[EPUB Reading Systems: Scripted content security](https://www.w3.org/TR/epub-rs-33/#sec-scripted-content-security)；[Security and privacy](https://www.w3.org/TR/epub-rs-33/#sec-security-privacy)

当前桌面窗口已经启用 `contextIsolation: true`、`nodeIntegration: false`、`sandbox: true`，并限制导航和新窗口；这些基础设置应保留。但 renderer 在生产环境使用 `file://`，Electron 官方更推荐安全的自定义 protocol。引入 publication content 前，应避免让 EPUB iframe/blob 与拥有 `window.desktop` 的 renderer 共享可利用的 origin 或桥接面。[Electron Security](https://www.electronjs.org/docs/latest/tutorial/security)；[Context Isolation](https://www.electronjs.org/docs/latest/tutorial/context-isolation)；[Process Sandboxing](https://www.electronjs.org/docs/latest/tutorial/sandbox)

建议边界：

- publisher scripts 和 publication 发起的网络请求默认关闭。
- 若使用 iframe navigator，为每本 publication 建立隔离、非特权 origin；不能让内容访问 preload API、父页面 DOM 或任意 `file://` 路径。
- 更强隔离需求可采用无 preload、无 Electron API 的专用 sandboxed `WebContentsView`，但这会增加 selection、事件和窗口布局通信成本，应由原型验证。
- preload 只暴露 narrow methods，不暴露原始 `ipcRenderer`；main process 校验 IPC sender、frame 与参数。
- 禁止 publication 自主导航、创建窗口、申请权限或打开非允许 scheme；外部链接交给宿主确认。
- CSP 限制 `script-src`、`connect-src`、`frame-src`、字体和媒体来源，避免通配符。
- EPUB 解包限制 entry 数量、单项/总解压字节、压缩比、路径穿越、重复路径和 XML entity expansion，防止 ZIP bomb 与解析器滥用。

MuPDF.js 减少了 publisher HTML 直接运行的攻击面，但 WASM parser 仍处理不可信二进制输入，仍需 worker 隔离、资源上限、及时更新和崩溃恢复。

## 性能与包体策略

无论采用哪条路线，都不应在 editor 初始 bundle 同步加载阅读引擎：

- 按格式动态 import engine；worker/WASM 使用独立 asset chunk。
- PDF/fixed EPUB 只渲染 viewport 附近页面，离屏 canvas 释放 GPU/CPU 内存。
- reflowable EPUB 以章节/spine item 为资源和布局单元，不把整本书 DOM 同时挂载。
- 搜索、文本提取、缩略图和大图解码放入 worker 或后台任务，支持 AbortSignal。
- 设置文档级缓存预算；缩放或主题改变时使相关缓存失效。
- 明确释放 PDF page/render task、iframe/view、Blob URL 与 MuPDF WASM object。
- 对长 PDF、图片型 PDF、超长 EPUB、漫画/固定版面和混合版面分别记录打开时间、首屏时间、滚动帧率、峰值内存与关闭后残留。

npm 包解包尺寸只能用于比较依赖上限，不能替代 Electron asar/unpacked、压缩后安装包和运行时内存的实测。

## 推荐验证计划与决策门槛

第一阶段不应同时实现所有产品功能，而应建立同一 Reader Shell 骨架，对两条路线做垂直原型：

1. **PDF.js + Readium**：打开本地 PDF/EPUB，目录、跳转、选择、搜索、统一工具栏；验证 Readium publication opening 和 iframe origin 隔离成本。
2. **MuPDF.js**：使用相同 shell 和样本实现可见页渲染、文本选择、搜索、链接与 EPUB 两种排版；验证无障碍层和对象生命周期。

共同样本应覆盖：

- 文本型、扫描型、密码保护、长篇和含表单/链接的 PDF。
- 中文、日文竖排、RTL、脚注、复杂 CSS、字体嵌入的 reflowable EPUB。
- 固定版面、纯图片、漫画、mixed-layout 与损坏/恶意 EPUB。
- 键盘全流程、屏幕阅读器、200% 缩放、高对比度和 reduced motion。

最终选择至少通过以下门槛：

- **授权**：是否接受 MuPDF AGPL，或已有商业许可预算；未通过则排除 MuPDF 生产方案。
- **无障碍与选择**：MuPDF 自研文本/语义层是否能达到 PDF.js/Readium 的可用性；未通过则优先双引擎。
- **安全**：Readium/EPUB.js iframe 能否与 preload 和 privileged origin 实质隔离；未通过则考虑独立 WebContents 或 MuPDF。
- **一致性**：同一 Reader Shell 下，导航、搜索、进度、快捷键和错误态是否无需格式专属 UI。
- **性能与包体**：以打包后的 Electron 应用和目标设备实测，不只比较 npm 数字。
- **维护**：adapter 是否能屏蔽上游类型并独立升级；不能让 editor 文档模型绑定 EPUB CFI class、PDF.js object 或 MuPDF pointer。

在完成原型前，建议的默认方向是：**公共架构按可替换多引擎设计，优先验证 PDF.js + Readium 作为质量基线，同时把 MuPDF.js 作为单引擎重点候选。** EPUB.js 可以作为更快的第一版备选，但不应把它的 API 变成长期公共接口。

## 一手资料索引

- [W3C EPUB 3.3](https://www.w3.org/TR/epub-33/)
- [W3C EPUB Reading Systems 3.3](https://www.w3.org/TR/epub-rs-33/)
- [Mozilla PDF.js](https://github.com/mozilla/pdf.js/tree/73707b62e95d0e4d0f75c7c491c132064403a7de)
- [PDF.js API](https://mozilla.github.io/pdf.js/api/)
- [EPUB.js](https://github.com/futurepress/epub.js/tree/eee359d0790002115a1156a9833c54f4bcd44c1d)
- [Readium Web](https://github.com/readium/web/tree/737f11ce689adf77909795d83c0e8dd1fc5db434)
- [Readium TypeScript Toolkit](https://github.com/readium/ts-toolkit/tree/1faa458ffafb9d3746478edad8829261e179a412)
- [MuPDF.js](https://github.com/ArtifexSoftware/mupdf.js/tree/f97c0a0a924c8aaec5b8fe656bc430eb0a7d8f89)
- [MuPDF.js documentation](https://mupdfjs.readthedocs.io/)
- [foliate-js](https://github.com/johnfactotum/foliate-js/tree/78914aef4466eb960965702401634c2cb348e9b1)
- [Electron Security](https://www.electronjs.org/docs/latest/tutorial/security)
- [Electron Context Isolation](https://www.electronjs.org/docs/latest/tutorial/context-isolation)
- [Electron Process Sandboxing](https://www.electronjs.org/docs/latest/tutorial/sandbox)
- [IDPF EPUB 3 Samples](https://github.com/IDPF/epub3-samples)
