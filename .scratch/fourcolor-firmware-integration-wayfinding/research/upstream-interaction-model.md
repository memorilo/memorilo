# 上游四彩固件交互模型（NOTE4C 映射研究）

## 研究范围

本文只依据 `LazyYoun/youn-ink-fourcolor-firmware` 的源码，固定在提交
[`51812e4ab3fa80ba7a5a5a274635ca2cf3901a25`](https://github.com/LazyYoun/youn-ink-fourcolor-firmware/tree/51812e4ab3fa80ba7a5a5a274635ca2cf3901a25)。
重点是实际按键路径，而不是 README 中列出的所有页面名称。该提交同时保留了
LVGL 和 RawDraw 两代代码；以下“可用”特指 `Application -> RawDrawUiManager ->
PageRenderer -> CustomLcdDisplay` 这条路径。

## 结论先行

上游的产品交互是“三键、页面上下文优先”的模式：UP/DOWN 负责列表或月份移动，
BOOT 负责进入/确认，长按负责离开页面或执行全局动作。设备启动后直接显示相册；
普通用户实际可到达的页面主要是相册、设置和 AP/Wi-Fi 配网页。`RawDrawPageId` 中的
日历、天气、年度进度、老黄历、人生进度、电子书、新闻、聊天等 renderer 虽然存在，
在此提交没有统一的产品级页面入口。

这套“命令路由 + 页面 renderer + 异步显示”结构适合 NOTE4C，但不能原样复制两个行为：

1. 上游四彩刷新期间会锁住导航点击，长刷新期间后续点击被丢弃；NOTE4C 当前需求是刷新期间仍可操作，应保留 Rust 的最新状态合并策略。
2. 上游声明了双击事件，但 NOTE4C 板级代码没有给任何按钮注册 `OnDoubleClick`，因此双击相关逻辑在真机上不可达，不能把它作为唯一入口。

## 1. 按键事件从 GPIO 到页面

### 1.1 原始事件能力

公共 `Button` 包装 `iot_button`，可注册按下、抬起、长按、单击、双击和多击回调
（[`button.h`](https://github.com/LazyYoun/youn-ink-fourcolor-firmware/blob/51812e4ab3fa80ba7a5a5a274635ca2cf3901a25/firmware/main/boards/common/button.h#L8-L34)、
[`button.cc`](https://github.com/LazyYoun/youn-ink-fourcolor-firmware/blob/51812e4ab3fa80ba7a5a5a274635ca2cf3901a25/firmware/main/boards/common/button.cc#L42-L133)）。

Zectrix 板将 GPIO39 映射为 UP、GPIO18 映射为 DOWN、GPIO0（BOOT）映射为确认键，
导航长按阈值为 1000 ms（[`zectrix-s3-epaper-4.2.cc`](https://github.com/LazyYoun/youn-ink-fourcolor-firmware/blob/51812e4ab3fa80ba7a5a5a274635ca2cf3901a25/firmware/main/boards/zectrix-s3-epaper-4.2/zectrix-s3-epaper-4.2.cc#L35-L67)）。

板级代码为 UP/DOWN 同时按住维护 held/按下时间状态，在两个键都长按时只触发一次
`OnWifiConfigComboLongPress()`；单键长按释放后会抑制随后的单击，避免一次长按被解释为
“长按 + 点击”（[`zectrix-s3-epaper-4.2.cc`](https://github.com/LazyYoun/youn-ink-fourcolor-firmware/blob/51812e4ab3fa80ba7a5a5a274635ca2cf3901a25/firmware/main/boards/zectrix-s3-epaper-4.2/zectrix-s3-epaper-4.2.cc#L349-L446)）。

注意：该板级实现只调用了 `OnClick`、`OnLongPress`、`OnPressDown/Up`，没有调用
`OnDoubleClick`；所以 `kUpDoubleClick`、`kDownDoubleClick`、`kBootDoubleClick`
虽在 `ButtonEvent` 中定义，却不是这块板的真实输入（事件定义见
[`page_renderer.h`](https://github.com/LazyYoun/youn-ink-fourcolor-firmware/blob/51812e4ab3fa80ba7a5a5a274635ca2cf3901a25/firmware/main/ui/renderers/rawdraw/page_renderer.h#L17-L30)）。

### 1.2 Application 转发

`Application::OnUpClick/OnDownClick/OnBootClick` 先记录活动 LED，再把对应的
`ButtonEvent` 转给 RawDraw 管理器；UP/DOWN 长按在应用层承担离开设置、进入设置的全局
语义，UP+DOWN 长按进入 Wi-Fi 配网；BOOT 长按在配网/AP 模式退出，否则转给页面（
[`application.cc`](https://github.com/LazyYoun/youn-ink-fourcolor-firmware/blob/51812e4ab3fa80ba7a5a5a274635ca2cf3901a25/firmware/main/application.cc#L364-L431)）。

### 1.3 RawDrawUiManager 的事件优先级

`HandleInput()` 的顺序是：

1. 导航点击在 `input_refresh_locked_` 时直接消费并丢弃；
2. BOOT 长按优先处理 AP 传图退出、相册进入 AP；
3. BOOT 双击的天气/照片详情快捷路径在此提交被 `#if 0` 禁用；
4. UP 双击切换“快速切换”弹层（但如上所述，板级没有产生该事件）；
5. 弹层打开时 UP/DOWN 循环选择、BOOT 确认，长按或双击关闭；
6. 其余事件交给当前 `PageRenderer::HandleInput()`，处理成功后清屏重绘并请求刷新。

源码见 [`rawdraw_ui_manager.cc`](https://github.com/LazyYoun/youn-ink-fourcolor-firmware/blob/51812e4ab3fa80ba7a5a5a274635ca2cf3901a25/firmware/main/ui/rawdraw_ui_manager.cc#L710-L849) 和快速切换处理
[`#L1082-L1122`](https://github.com/LazyYoun/youn-ink-fourcolor-firmware/blob/51812e4ab3fa80ba7a5a5a274635ca2cf3901a25/firmware/main/ui/rawdraw_ui_manager.cc#L1082-L1122)。

快速切换列表在该提交实际只有“相册”和“设置”两项（[`#L647-L660`](https://github.com/LazyYoun/youn-ink-fourcolor-firmware/blob/51812e4ab3fa80ba7a5a5a274635ca2cf3901a25/firmware/main/ui/rawdraw_ui_manager.cc#L647-L660)），不是所有 `RawDrawPageId` 的总菜单。

## 2. 真机可达的页面操作

### 相册（默认页）

- 普通“记忆卡”模式：UP/DOWN 选择上一张/下一张（到边界停止，不循环）；BOOT 进入选中照片的全屏模式。
- 全屏模式：UP/DOWN 切换照片；BOOT 返回记忆卡模式。
- BOOT 双击会打开删除确认框；确认框内 UP/DOWN 在“删除/取消”间切换，BOOT 确认，BOOT 长按或双击取消。由于板级未注册双击，真机默认无法打开该删除框。
- 相册页 BOOT 长按由全局管理器接管，启动 AP 传图；AP 运行时 BOOT 长按退出并回到相册。

实现：[`photo_gallery.cc#L184-L247`](https://github.com/LazyYoun/youn-ink-fourcolor-firmware/blob/51812e4ab3fa80ba7a5a5a274635ca2cf3901a25/firmware/main/ui/renderers/rawdraw/photo_gallery.cc#L184-L247)、
[`rawdraw_ui_manager.cc#L717-L733`](https://github.com/LazyYoun/youn-ink-fourcolor-firmware/blob/51812e4ab3fa80ba7a5a5a274635ca2cf3901a25/firmware/main/ui/rawdraw_ui_manager.cc#L717-L733)。

### 设置

设置 renderer 将“可选择项”和 Section 分开，UP/DOWN 在可选项之间移动并在首尾循环；
UP 长按跳顶部，DOWN 长按跳底部；BOOT 对 Checkbox 执行切换，对 Action/带回调项目执行
回调（[`settings_renderer.cc#L976-L1034`](https://github.com/LazyYoun/youn-ink-fourcolor-firmware/blob/51812e4ab3fa80ba7a5a5a274635ca2cf3901a25/firmware/main/ui/renderers/rawdraw/settings_renderer.cc#L976-L1034)）。

对话框保持“UP/DOWN 选择、BOOT 确认、长按取消/关闭”的一致模式：音量对话框 UP/DOWN
按 10 调整、长按直接到 100/0、BOOT 保存；主题、服务器、OTA、关于/存储对话框都有同一
种拦截式处理（[`settings_renderer.cc#L756-L975`](https://github.com/LazyYoun/youn-ink-fourcolor-firmware/blob/51812e4ab3fa80ba7a5a5a274635ca2cf3901a25/firmware/main/ui/renderers/rawdraw/settings_renderer.cc#L756-L975)）。应用层另外规定：在设置页 UP 长按返回相册，任意页 DOWN 长按进入设置（[`application.cc#L383-L400`](https://github.com/LazyYoun/youn-ink-fourcolor-firmware/blob/51812e4ab3fa80ba7a5a5a274635ca2cf3901a25/firmware/main/application.cc#L383-L400)）。

### AP 传图 / Wi-Fi 配网

AP 传图页只显示连接说明和状态；BOOT 短按被忽略，BOOT 长按退出。传图服务器通过
回调通知 `kApStarted`、`kImageSaved`、`kError` 等状态，管理器只在有价值的状态变化时
请求重绘，避免上传过程中的瞬时文字触发慢刷新（[`rawdraw_ui_manager.cc#L253-L319`](https://github.com/LazyYoun/youn-ink-fourcolor-firmware/blob/51812e4ab3fa80ba7a5a5a274635ca2cf3901a25/firmware/main/ui/rawdraw_ui_manager.cc#L253-L319)、
[`ap_transfer_renderer.cc#L248-L257`](https://github.com/LazyYoun/youn-ink-fourcolor-firmware/blob/51812e4ab3fa80ba7a5a5a274635ca2cf3901a25/firmware/main/ui/renderers/rawdraw/ap_transfer_renderer.cc#L248-L257)）。

UP+DOWN 长按进入 Wi-Fi 配网 AP，页面显示 SSID、密码和 URL；配网状态由网络回调更新，
BOOT 长按退出配网并回到 Station（[`application.cc#L402-L431`](https://github.com/LazyYoun/youn-ink-fourcolor-firmware/blob/51812e4ab3fa80ba7a5a5a274635ca2cf3901a25/firmware/main/application.cc#L402-L431)）。

## 3. 已实现但没有稳定入口的页面交互

这些行为可作为 NOTE4C 的后续页面规范，但不能宣称是该提交的默认产品导航：
在 Zectrix 板的实际回调链中，UP 长按先被 `Application::OnUpLongPress()`（仅设置页返回）
消费，DOWN 长按先被 `Application::OnDownLongPress()`（全局进入设置）消费，因此表中
renderer 的 UP/DOWN 长按分支不会自动到达；若要启用，必须在 Application 做页面上下文路由。

| 页面 | UP/DOWN | BOOT/长按 | 来源 |
| --- | --- | --- | --- |
| 日历 | 普通模式翻月；选择模式移动日期光标；长按翻上/下月 | 进入选择模式、确认日期 | [`calendar_renderer.cc#L90-L160`](https://github.com/LazyYoun/youn-ink-fourcolor-firmware/blob/51812e4ab3fa80ba7a5a5a274635ca2cf3901a25/firmware/main/ui/renderers/rawdraw/calendar_renderer.cc#L90-L160) |
| 天气 | 在最多 4 个预报卡片间移动 | 任一导航键长按或 BOOT 长按立即刷新 | [`weather_renderer.cc#L300-L326`](https://github.com/LazyYoun/youn-ink-fourcolor-firmware/blob/51812e4ab3fa80ba7a5a5a274635ca2cf3901a25/firmware/main/ui/renderers/rawdraw/weather_renderer.cc#L300-L326) |
| 年度进度 | 概览与月份选择 | BOOT 从月份回概览；UP 长按跳当前月 | [`yearprogress_renderer.cc#L340-L382`](https://github.com/LazyYoun/youn-ink-fourcolor-firmware/blob/51812e4ab3fa80ba7a5a5a274635ca2cf3901a25/firmware/main/ui/renderers/rawdraw/yearprogress_renderer.cc#L340-L382) |
| 老黄历 | UP/DOWN 上/下月 | BOOT 长按回今天 | [`almanac_renderer.cc#L257-L282`](https://github.com/LazyYoun/youn-ink-fourcolor-firmware/blob/51812e4ab3fa80ba7a5a5a274635ca2cf3901a25/firmware/main/ui/renderers/rawdraw/almanac_renderer.cc#L257-L282) |
| 聊天 | 按步长上下滚动；长按到顶/底 | BOOT 打开音量对话框；对话框中 UP/DOWN 调整、BOOT 保存 | [`chat_renderer.cc#L430-L490`](https://github.com/LazyYoun/youn-ink-fourcolor-firmware/blob/51812e4ab3fa80ba7a5a5a274635ca2cf3901a25/firmware/main/ui/renderers/rawdraw/chat_renderer.cc#L430-L490) |
| 电子书 | 文件列表选择或阅读器翻页 | 文件列表 BOOT 交给应用打开；阅读器 BOOT 返回列表 | [`ebook_renderer.cc#L256-L317`](https://github.com/LazyYoun/youn-ink-fourcolor-firmware/blob/51812e4ab3fa80ba7a5a5a274635ca2cf3901a25/firmware/main/ui/renderers/rawdraw/ebook_renderer.cc#L256-L317) |
| 新闻 | 列表选择；预览中 UP/DOWN 滚动/切换底部按钮 | BOOT 打开预览；预览中确认关闭或请求 TTS | [`news_renderer.cc#L269-L340`](https://github.com/LazyYoun/youn-ink-fourcolor-firmware/blob/51812e4ab3fa80ba7a5a5a274635ca2cf3901a25/firmware/main/ui/renderers/rawdraw/news_renderer.cc#L269-L340) |
| 日志 | 上下滚动 | BOOT 长按重新采集日志 | [`log_renderer.cc#L216-L257`](https://github.com/LazyYoun/youn-ink-fourcolor-firmware/blob/51812e4ab3fa80ba7a5a5a274635ca2cf3901a25/firmware/main/ui/renderers/rawdraw/log_renderer.cc#L216-L257) |

## 4. Application、RawDrawUiManager、CustomLcdDisplay 的回调流

1. `Application::Initialize()` 创建 `RawDrawUiManager`，注入一个 `RefreshCallback`；管理器创建全部 renderer 和 `ApTransferServer`，再绑定状态、图片保存、设置变化等回调（[`application.cc#L145-L163`](https://github.com/LazyYoun/youn-ink-fourcolor-firmware/blob/51812e4ab3fa80ba7a5a5a274635ca2cf3901a25/firmware/main/application.cc#L145-L163)、[`rawdraw_ui_manager.cc#L224-L319`](https://github.com/LazyYoun/youn-ink-fourcolor-firmware/blob/51812e4ab3fa80ba7a5a5a274635ca2cf3901a25/firmware/main/ui/rawdraw_ui_manager.cc#L224-L319)）。
   `RawDrawUiManager` 还公开了 `PageSwitchCallback`，但该提交的 `Application` 没有注册它；页面切换副作用主要由 manager 自己完成。
2. `SwitchPage()` 初始化目标 renderer、更新标题、清空共享 framebuffer、调用 `RenderAll()`，然后请求全屏刷新；页面切换因此是“状态改变 -> 一次完整重绘”（[`rawdraw_ui_manager.cc#L470-L512`](https://github.com/LazyYoun/youn-ink-fourcolor-firmware/blob/51812e4ab3fa80ba7a5a5a274635ca2cf3901a25/firmware/main/ui/rawdraw_ui_manager.cc#L470-L512)）。
3. `CustomLcdDisplay` 建立独立 FreeRTOS 刷新任务。任务在互斥锁下快照 framebuffer，做差分、去重、短暂 debounce，再调用 `EPD_Display()` 或 `EPD_DisplayPart()`；四彩面板被显式强制走 FULL。四彩采样间隔为 12 s，普通 dirty debounce 为 3 s（[`custom_lcd_display.cc#L444-L470`](https://github.com/LazyYoun/youn-ink-fourcolor-firmware/blob/51812e4ab3fa80ba7a5a5a274635ca2cf3901a25/firmware/main/boards/zectrix-s3-epaper-4.2/custom_lcd_display.cc#L444-L470)、[`#L618-L650`](https://github.com/LazyYoun/youn-ink-fourcolor-firmware/blob/51812e4ab3fa80ba7a5a5a274635ca2cf3901a25/firmware/main/boards/zectrix-s3-epaper-4.2/custom_lcd_display.cc#L618-L650)）。
4. 刷新开始时管理器设置 `input_refresh_locked_`；显示空闲回调 `SetOnRefreshIdle()` 清除它（[`rawdraw_ui_manager.cc#L356-L369`](https://github.com/LazyYoun/youn-ink-fourcolor-firmware/blob/51812e4ab3fa80ba7a5a5a274635ca2cf3901a25/firmware/main/ui/rawdraw_ui_manager.cc#L356-L369)、[`custom_lcd_display.h#L78-L82`](https://github.com/LazyYoun/youn-ink-fourcolor-firmware/blob/51812e4ab3fa80ba7a5a5a274635ca2cf3901a25/firmware/main/boards/zectrix-s3-epaper-4.2/custom_lcd_display.h#L78-L82)）。因此上游“页面代码可以立即改状态”与“导航点击在物理刷新期间被丢弃”是两个同时存在的事实。

## 5. 对 NOTE4C 的直接映射建议

当前 NOTE4C 只有 UP、OK（BOOT）、DOWN 三键，且 Rust 已有 `Gesture`（Tap、LongPress、Repeat、UP+DOWN 长按）和 `route_gesture()`。建议采用以下映射：

| 上游语义 | NOTE4C 命令映射 | 说明 |
| --- | --- | --- |
| UP/DOWN 单击 | `SelectPrevious` / `SelectNext` | 列表、相册、月份、卡片统一方向；边界策略由页面决定（设置可循环，相册可停止）。 |
| BOOT 单击 | `ActivateSelection` | 进入全屏/详情、切换 TODO、确认对话框。 |
| BOOT 长按 | 页面上下文命令；默认 `NextPage` | 不要把它硬编码成单一“语音”动作；相册/AP/配网等全局模式先拦截。 |
| UP/DOWN 长按 | 快速跳顶/底或页面自定义 | 对应上游设置、聊天、日志的“跳顶/跳底”。 |
| UP/DOWN 同时长按 | `EnterProvisioning` | 与上游 Wi-Fi 配网组合键一致。 |
| 重复（Repeat） | 等价连续 UP/DOWN | NOTE4C 可在长按期间滚动；上游只声明重复/双击能力，页面实现以点击为主。 |

实现上应保留上游的边界：输入只修改 Rust/Application 快照，renderer 纯函数生成帧，
由单一显示拥有者提交刷新。不要复制上游“`input_refresh_locked_` 丢弃导航”的策略；
NOTE4C 的最新状态合并通道应继续接收输入，在显示忙时只合并 render revision。若将来增加
删除、快速切换等功能，优先使用长按或三键组合，并在屏幕 footer 明示操作，不依赖真机不可达
的双击事件。
