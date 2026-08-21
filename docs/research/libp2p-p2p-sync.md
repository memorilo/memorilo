# 通过 libp2p 实现 Memorilo P2P 同步的调研

调研日期：2026-08-20

本文研究如何把 libp2p 用作 Memorilo 的跨设备连接与传输层。资料优先采用 libp2p、js-libp2p、Loro 和本仓库源码/ADR 等一手来源；libp2p 事实按 2026-08-20 拉取的官方仓库 `main` 文档核对。本文不把 libp2p 当作 CRDT 或数据库同步协议：它提供 PeerId、连接、加密、复用、发现和 NAT 穿透能力，应用仍必须定义同步数据模型、授权、幂等、游标和删除语义。

## 结论摘要

1. **可行，目标是已配对设备之间的纯 P2P 同步。** Memorilo 已经有 Loro update、SQLite update receipt 和学习 outbox；libp2p 适合承载这些有序/可重试的二进制消息。首版不引入 rendezvous、relay、bootstrap、DHT 或同步服务器。
2. **Electron 主进程是 libp2p 节点的合适位置。** renderer 保持现有 IPC/应用服务边界，不让浏览器上下文直接持有私钥或监听网络。浏览器端受安全上下文限制，不能从页面拨打原始 TCP/QUIC；官方推荐的 WebSocket、WebTransport、WebRTC 还分别有证书、监听和信令约束。[libp2p Browser Node Connectivity](https://libp2p.io/docs/browser-connectivity/)
3. **Note 与学习数据必须分开同步。** 每个 Note 是一个 LoroDoc，使用 Loro version vector 导出增量；学习数据属于个人账户，按现有 `mutationId` outbox 事件协议同步。不要广播 SQLite 文件，也不要让 gossipsub 的“尽力传播”代替可靠增量拉取。
4. **连接发现只使用已配对 PeerId/地址和桌面 mDNS。** 原始 mDNS peer 只保留在网络层；B 发出配对探测后，只有开启五分钟发现窗口的 A 才回应并成为 UI 候选。配对授权才允许同步；不同网络的可达性不在本 ADR 范围内。
5. **第一阶段不需要 DHT、gossipsub、relay、bootstrap 或浏览器 renderer 节点。** 一个定向 sync stream、固定 protocol ID、有限设备配对和 mDNS 能先验证数据正确性；其它发现和 NAT 穿透能力必须另立 ADR。

## Memorilo 当前边界

相关 ADR 已经确定：

- [ADR 0001](../adr/0001-note-as-loro-aggregate.md) 规定每个 Note 是一个 LoroDoc；Folder/Topic 树、Topic block 和协作历史以该 Note 为同步、回溯和恢复单位。
- [ADR 0004](../adr/0004-personal-learning-sync.md) 规定个人 Review Event、Learning State、Optimizer 和 assignment 不进入协作 Note，而是在同一用户的设备间同步。其 transport/cursor 假设已由 [ADR 0007](../adr/0007-pure-p2p-learning-sync.md) supersede：纯 P2P 使用设备 version vector 和 membership epoch。

代码中 `EditorNote` 暴露 `exportSnapshot()`、`exportUpdates(from)`、`getVersion()` 和 `importUpdates()`；`NoteAuthoritativeRuntime.applyExternalUpdates()` 会导入更新、校验 Topic、写入投影并触发索引。[`packages/editor/src/note/editor-note-collaboration-runtime.ts`](https://github.com/memorilo/memorilo/blob/main/packages/editor/src/note/editor-note-collaboration-runtime.ts)；[`apps/desktop/main/src/notes/note-authoritative-external-updates.ts`](https://github.com/memorilo/memorilo/blob/main/apps/desktop/main/src/notes/note-authoritative-external-updates.ts)

`editor-storage` 把 `note_updates` 与 `note_update_receipts` 作为更新日志和 hash 幂等边界；checkpoint 是可重建快照，不是唯一事实来源。[`packages/editor-storage/src/editor-note-updates.ts`](https://github.com/memorilo/memorilo/blob/main/packages/editor-storage/src/editor-note-updates.ts) 学习存储则已有 `learning_sync_outbox`、`mutation_id`、旧 `last_server_sequence` 和 purge tombstone；这些 server-oriented 字段在纯 P2P 实现前必须迁移为设备 version vector/membership epoch。[`packages/editor-storage/src/learning/schema.ts`](https://github.com/memorilo/memorilo/blob/main/packages/editor-storage/src/learning/schema.ts)；[`packages/editor-storage/src/learning/learning-sync-repository.ts`](https://github.com/memorilo/memorilo/blob/main/packages/editor-storage/src/learning/learning-sync-repository.ts)

因此 libp2p 适配器应放在 **main -> editor-storage / Note runtime** 这一侧：它只负责连接、流和消息；它不直接读写 SQLite，不绕过 `applyExternalUpdates()`，也不把 renderer 的 Hono/IPC 请求暴露成远端 RPC。

## libp2p 提供什么

js-libp2p 的最小配置需要 transport 和 connection encryption；官方入门还建议 stream multiplexer。`createLibp2p()` 可组合多种 transport，匹配的 transport 才能互通；Noise 是官方示例使用的加密模块，Yamux 可在一条连接上复用多个协议流。[js-libp2p Getting Started](https://github.com/libp2p/js-libp2p/blob/main/doc/GETTING_STARTED.md)

需要明确的层次：

| 层 | libp2p 能力 | Memorilo 仍需定义 |
| --- | --- | --- |
| 身份 | PeerId、公钥身份、Noise 握手 | 账户/设备授权、撤销、设备显示名 |
| 连接 | TCP、WebSocket（按需） | 配对地址、重试、带宽/超时策略 |
| 复用 | **Yamux（必选）** | `/memorilo/sync/1` 等应用协议 |
| 发现 | **mDNS（必选）**、已知 multiaddr | 五分钟可发现窗口、探测/可用响应、已配对设备重连 |
| 加密 | **Noise（必选）** | 应用层授权、成员 epoch 和重放策略 |
| 广播 | 不使用 gossipsub | 不能替代持久日志、ack 和重放 |
| NAT | 首版不提供 relay/穿透 | 仅同步可达的已配对设备 |
| 数据 | 仅传输 bytes | Loro delta、snapshot、学习 mutation、资产块 |

## Electron、Node 与浏览器约束

### 推荐：main process 运行 Node libp2p

Memorilo 的 Electron main 已经拥有持久化、`better-sqlite3`、操作监督和关闭时 flush；把 libp2p 节点放在 main process 可以让私钥、数据库事务和网络生命周期位于同一个受控资源域。renderer 继续通过 preload 暴露的窄接口订阅同步状态。

建议的边界：

```text
renderer
  -> preload: sync status / pair device / start sync
  -> main IPC
  -> SyncApplication (账户授权、事务、重试)
  -> libp2p node (dial/listen/stream)
  -> editor-storage / NoteAuthoritativeRuntime
```

Electron 官方进程模型说明 main process 运行在 Node.js 环境，BrowserWindow 页面运行在独立 renderer process；Context Isolation 官方文档建议通过 preload 暴露受控 API。[Electron Process Model](https://www.electronjs.org/docs/latest/tutorial/process-model)；[Electron Context Isolation](https://www.electronjs.org/docs/latest/tutorial/context-isolation) Electron window 当前使用 `contextIsolation: true`、`nodeIntegration: false`、`sandbox: true`；不要为了 libp2p 改成 renderer 可访问 Node。main 的网络服务必须有明确 close/drain，与现有生命周期 supervisor 一起关闭。

### 浏览器与 WebView 不是同一运行时

libp2p 官方浏览器文档明确说明：页面不能拨打原始 TCP 或 QUIC，浏览器要求 secure context；WebSocket 需要浏览器信任的 TLS 证书，普通 libp2p 节点通常没有域名和 CA 证书，因此 WebSocket 在浏览器侧是受限方案。[Browser Node Connectivity](https://libp2p.io/docs/browser-connectivity/)

WebTransport 基于 QUIC，浏览器实现可通过 certificate hash 加 Noise 绑定 PeerId，但官方 js-libp2p transport README 目前注明它只支持拨出、不支持 Node.js 入站监听。[`@libp2p/webtransport` README](https://github.com/libp2p/js-libp2p/blob/main/packages/transport-webtransport/README.md)

WebRTC DataChannel 提供可靠流。浏览器到浏览器的 libp2p WebRTC 需要先通过 relay 交换 SDP，再用 ICE 打洞；WebRTC Direct 面向浏览器到公共节点，浏览器不能监听 WebRTC Direct 地址。握手后仍运行 Noise，以证明远端拥有与 PeerId 对应的私钥。[`@libp2p/webrtc` README](https://github.com/libp2p/js-libp2p/blob/main/packages/transport-webrtc/README.md)；[Browser Node Connectivity: WebRTC](https://libp2p.io/docs/browser-connectivity/#webrtc)

**结论：** 第一阶段不让 renderer/浏览器成为同步节点。浏览器支持属于未来单独 ADR；当前纯 P2P 决策不提供浏览器同步路径，也不假设 Electron Chromium 页面可以像 Node main 一样监听 TCP。

## 传输、发现与 NAT 方案

### Transport 选择

- **桌面首选：TCP。** Node/Electron 使用 TCP；WebSocket 只作为同样的点对点 transport 备用，不通过反向代理或服务器提供 `wss`。
- **WebRTC：** 需要信令/relay 和 STUN，首版不启用。
- **WebTransport：** 适合浏览器拨号到公开节点；当前 Node 端入站能力限制使它不适合作为 Electron 间主路径。
- **Yamux（必选）：** 一条连接上分离同步、资产和 ping/诊断流；每个流仍设置长度上限、deadline 和取消。

### Discovery 分层

js-libp2p 官方说明：发现事件会写入 peer store，但不会无条件自动连接；应用应在 `peer:discovery` / `peer:connect` 上决定行为。bootstrap 适合已知地址，mDNS 适合同一局域网的非浏览器节点，DHT 可做更广泛的 peer/content routing。[js-libp2p Peer Discovery](https://github.com/libp2p/js-libp2p/blob/main/doc/PEER_DISCOVERY.md)；[Getting Started: Peer Discovery](https://github.com/libp2p/js-libp2p/blob/main/doc/GETTING_STARTED.md)

Memorilo 应采用：

1. **临时发现窗口**：设备 A 在设置页允许发现五分钟；窗口只存在于本次应用进程，不写入持久化状态。
2. **探测/可用响应**：设备 B 对原始 mDNS peer 发送 `pairing-probe`。只有仍处于窗口内的 A 才返回带真实 `deviceId`、设备名和 `expiresAt` 的 `pairing-available`；未经响应的 mDNS peer 不进入 UI，过期响应立即失效。
3. **申请/批准**：B 只能向当前仍有效的可用设备发送申请，A 明确批准；发现和探测本身不授予任何同步权限。
4. **Emoji 核对**：批准后双方显示同一组五个 Emoji。只有双方分别确认顺序一致，才在各自设备持久化 PeerId、共享密钥和配对授权。
5. **设备名称**：默认使用操作系统 host name，允许用户在设置页修改，并在发现、申请、Emoji 核对和已配对列表中显示。名称只是展示元数据，不参与 PeerId、私钥、shared secret、pairingId、Emoji 或 membership epoch。
6. **不使用 rendezvous、委托 routing 或 DHT**：首版不把设备目录、Note 内容或发现记录放到第三方/公共网络。

Pubsub 本身不负责发现 peer；官方配置文档要求应用先发现和建立连接，并建议 Identify 用于交换支持的协议。[js-libp2p Configuration: Pubsub](https://github.com/libp2p/js-libp2p/blob/main/doc/CONFIGURATION.md#customizing-pubsub)

### NAT 与可达性边界

首版不启用 AutoNAT、Circuit Relay v2、DCUtR、UPnP/NAT-PMP 或其它打洞服务。mDNS 只解决同一局域网内的发现，不保证跨网络可达；跨网络设备必须通过用户提供的可达地址连接，失败时保持离线 outbox，不引入隐式服务器依赖。未来若要改变这个边界，必须另立 ADR。

## 身份、授权与安全模型

### 两种身份不能混淆

1. **网络身份**：libp2p PeerId 与节点私钥，Noise 握手确认“这条连接属于哪个 peer”。节点重装/换钥匙会产生新 PeerId。
2. **Memorilo 账户/设备身份**：账户公钥、设备公钥、设备撤销状态和共享 Note ACL。它决定“该 Peer 是否有权同步这个账户/Note”。

PeerId 本身不是账户登录，也不是共享 Note 授权。配对后由账户密钥签发设备证书/授权记录，例如：`accountId`、`deviceId`、`peerId`、允许的 scope、签发时间、过期时间、撤销 epoch。每条 sync hello 和 mutation 带设备签名或可验证的授权 token；接收端先验证账户/Note scope，再交给 storage。

### Noise 与应用层加密

libp2p 要求连接加密，js-libp2p 入门使用 `@chainsafe/libp2p-noise`；WebRTC 和 WebTransport 文档也说明要在 transport 之上做 Noise 以绑定 PeerId。[js-libp2p Getting Started](https://github.com/libp2p/js-libp2p/blob/main/doc/GETTING_STARTED.md)；[`@libp2p/webrtc` README](https://github.com/libp2p/js-libp2p/blob/main/packages/transport-webrtc/README.md)

Noise 只解决连接级保密/认证，不解决：

- relay/恶意 peer 转发的权限；
- 旧设备在撤销后的重放；
- 恶意或损坏的 Loro bytes；
- mutation 是否属于当前账户；
- 超大 payload、资源耗尽和压缩炸弹。

因此协议必须有版本、最大帧、最大 update/snapshot/asset 尺寸、请求 deadline、签名/授权校验、重放窗口和审计日志。Loro import 必须在现有 validation 与单一 storage operation 内执行；异常只回滚该批，不污染 authoritative cache。

## 同步协议建议

### 一个定向 request/response stream

应用协议建议使用固定 protocol ID：`/memorilo/sync/1`。一条 Yamux stream 处理一次双向 session；不要把每个 Loro update 单独建立 TCP 连接。消息可用 length-delimited CBOR/ protobuf；payload bytes 保持二进制，不转 base64 JSON。

建议消息序列：

```text
hello {
  protocolVersion, accountId, deviceId, peerId,
  authorizedScopes, noteHeads[], learningVersionVector, membershipEpoch,
  supportedTransports, schemaGenerations, maxFrame
}
challenge / auth
  -> account/device signature, nonce, expiry, membership epoch
plan {
  note: [{noteId, localVersion, need: update|snapshot|none}],
  learning: {fromVersionVector, membershipEpoch, outboxCount},
  assets: [{fileName, sha256, byteSize}]
}
note-update {noteId, baseVersion?, updateBytes, updateHash}
note-snapshot {noteId, version, snapshotBytes, snapshotHash}
learning-mutation {mutationId, entityKind, operation, payload, deviceSequence}
asset-manifest / asset-chunk {sha256, offset, bytes}
ack {updateHashes, mutationIds, assetHashes, peerVersionVector, membershipEpoch}
error {code, retryable, detail?}
```

关键规则：

- **先 pull/merge，再 push/ack。** 每个批次在本地事务中导入、投影、写 receipt、更新 outbox acknowledgement 和 version vector；连接中断可安全重试。
- **幂等**：Note 用已有 update hash receipt；学习用 `mutationId`，设备 sequence `(deviceId, deviceSequence)` 也必须唯一。重复 payload 必须返回已存在结果，不再次生成 review event。
- **版本协商**：协议版本、Loro/schema generation 和能力在 hello 中协商；不兼容时进入明确 full-sync，而不是静默丢弃字段。
- **公平性**：按 Note/学习域分页，单批设 byte 和 item 上限；大 snapshot/asset 走 chunk 和 resume offset。
- **确认语义**：远端 ack 只确认已经持久化的 mutation；不能以“写入 socket”作为成功。peer version vector 是持久化进度，不能替代 mutation receipt。

### Note（LoroDoc）

Loro 官方示例使用 `doc.export({ mode: "update" })` 发送完整更新，接收端 `import(bytes)`；同步点通过 `oplogVersion()`，随后用 `export({ mode: "update", from: version })` 导出增量。Loro README 还强调自动合并、P2P synchronization 和 delta updates。[Loro README：sync example](https://github.com/loro-dev/loro/blob/main/README.md#example)

Memorilo 可直接映射：

1. hello 交换 Note 的 frontiers/version vector，而非 `latest_sequence`（后者是本地 receipt 顺序）。
2. 对方缺少的部分使用 `exportUpdates(from)`；对方版本未知、checkpoint 被裁剪或 import 报 dependency/outdated 错误时发送 snapshot。
3. 接收端调用 `NoteAuthoritativeRuntime.applyExternalUpdates()`；它负责 Loro import、保护阅读条目、Topic validation、projection、checkpoint 和索引。
4. 只把被 receipt 接受的 `updateHash` 放入 ack。相同 hash 重传不得增加 `latest_sequence`。
5. 继续保留 update log；checkpoint 可以缩短恢复时间，但只有在所有已授权设备确认 prune watermark 后才可安全裁剪历史。

### 个人学习域

学习同步不应重用 Loro Note stream 的冲突语义。按 ADR 0004 的目标协议传输不可变 Review Event、Undo/Reset、Optimizer revision、assignment、card projection 和 tombstone：

- `mutationId` 是幂等主键；设备 version vector 只做增量游标，membership epoch 界定授权成员和 purge 边界。
- 并发离线 rating 全部保留；canonical learning state 使用既定的 `(occurredAt, eventId)` 规则和 lineage 规则重建，不把两个分支误当作一次普通顺序复习。
- Undo 是新事件，不能物理删除历史；删除/停用使用 generation/tombstone，等所有设备达到 watermark 后再 purge。
- 收到未知 optimizer revision、schema generation 或无法通过 sanity check 的事件时暂停正常 merge，保留 outbox，触发 full-sync/recovery。

ADR 0007 已确定纯 P2P 方案：不再使用 `last_server_sequence` 或任意单调服务端游标。每个 mutation 由 `(deviceId, deviceSequence, membershipEpoch)` 定位；节点交换设备 version vector，只发送对方缺失且本地已 durable 的 component。outbox 只有在当前授权成员都达到对应 vector，或设备在更高 membership epoch 被移除后，才允许清理；这个破坏性契约变更必须通过显式 schema migration 完成。

### 附件与文件

当前 Note Loro 数据只保存 `memorilo://asset/<uuid>.<ext>` 引用；asset repository 另存文件并记录文件名、大小和引用计数，尚未把内容 hash 作为通用 Asset identity。不要把附件塞进 Loro update。同步协议应新增 SHA-256 manifest 和 asset chunk：写临时文件、流式校验 hash、原子 rename、注册 asset，最后才 ack。缺少附件时 Note 仍可打开，但 UI 显示 unavailable，不能把损坏的 bytes 当作合法媒体。

## 离线、恢复与删除

### 离线队列

本地 mutation 先提交 SQLite，再加入 Note update receipt/outbox；同步器由 app focus、网络恢复、定时器或用户手动触发。连接失败只产生 retryable 状态，不能阻塞编辑/学习操作。关闭时沿用现有 lifecycle：停止接纳新 session，等待 in-flight transaction，flush cache/outbox，最后 `node.stop()`。

### Full sync 与 schema

Full sync 不是“把另一台 SQLite 覆盖过来”。它应是协议级 snapshot：先把当前数据库备份到现有 backup 机制，再导入 Loro snapshots、重建 projections、验证 asset manifest/learning schema，成功后原子切换。失败保留旧数据库和 outbox。schema generation、Loro encoding 版本、协议版本必须显式协商；不要在没有用户选择时自动做破坏性 one-way replacement。

### 删除与回收

Note entry 的 Loro 删除会随 CRDT update 合并；但为了防止长期离线设备复活删除内容，账户级删除还需要 durable tombstone/epoch。附件删除要等 Note 引用计数为零且超出安全窗口，不能仅因一次未见引用就 unlink。学习对象遵循 ADR 的 purge watermark；设备撤销也要阻止被撤销设备再推进 cursor。

## 威胁模型与运营风险

| 风险 | 影响 | 必须的控制 |
| --- | --- | --- |
| PeerId 冒充/中间人 | 读取或注入数据 | Noise + 账户设备签名 + 配对指纹校验 |
| 已撤销/被盗设备 | 继续读取或写入 | membership epoch、设备撤销记录、重新配对 |
| 恶意 update/mutation | 崩溃、投影污染、权限越界 | schema/size/depth 校验、单事务 import、结构化错误 |
| 重放/重复提交 | 重复 review 或复活删除 | nonce/expiry、mutationId、device sequence、tombstone generation |
| 局域网发现污染 | 假 peer、诱导连接 | 原始 mDNS 事件不进 UI；限时 probe/available、Noise PeerId、五 Emoji 核对和配对 ACL |
| DHT/pubsub/服务器依赖 | 引入未授权传播或基础设施依赖 | 首版不启用 DHT、pubsub、relay、rendezvous 或 bootstrap |
| metadata 泄露 | 暴露局域网设备在线关系/同步时间 | mDNS scope 限制、最少本地日志、应用层授权 |
| 浏览器/renderer 越权 | 私钥或任意远程 RPC 泄露 | main-only node、窄 preload API、sender checks、无通用 stream bridge |
| 大 snapshot/附件 DoS | 内存/磁盘耗尽 | 流式 chunk、配额、超时、临时目录清理、hash/size 上限 |

## TypeScript 技术栈与成熟度判断

js-libp2p 官方仓库提供 `libp2p`、`@libp2p/tcp`、`@libp2p/websockets`、`@libp2p/webrtc`、`@libp2p/webtransport`、`@chainsafe/libp2p-noise`、`@chainsafe/libp2p-yamux`、`@libp2p/bootstrap`、`@libp2p/mdns`、`@libp2p/kad-dht`、`@libp2p/identify`、`@libp2p/circuit-relay-v2`、`@libp2p/dcutr` 和 `@libp2p/gossipsub` 等模块。[js-libp2p README](https://github.com/libp2p/js-libp2p/blob/main/README.md)

对本仓库的现实判断：

- 该项目已使用 ESM、Node 22、TypeScript 和 Uint8Array，和当前 js-libp2p API 形态相容。
- `libp2p` 及其生态包必须固定一组兼容版本，并集中在独立的 `@memorilo/p2p-sync` package；`@memorilo/desktop-main` 只负责组合应用服务、存储和 IPC。首版依赖范围只保留 TCP、mDNS、Noise、Yamux 及必要的 identify/peer-id 模块。
- 不引入旧的 `libp2p-webrtc-star` 等历史包；使用 js-libp2p 官方 README 当前列出的 scoped packages。
- gossipsub 是 mesh/floodsub 风格的消息传播，官方文档强调 topic 订阅者会收到消息，但 pubsub 依赖外部 peer discovery，且消息可靠性/持久性不能替代本地 outbox；因此首版不启用。[libp2p Publish/Subscribe](https://libp2p.io/docs/pubsub/)；[`@libp2p/gossipsub` README](https://github.com/libp2p/js-libp2p/blob/main/packages/gossipsub/README.md)
- 采用 `@libp2p/interface` 的 stream 类型和项目已有 Effect lifecycle；不要把 libp2p 的事件直接暴露给 renderer。`@memorilo/p2p-sync` 公共入口只导出状态/命令，main-process adapter 负责生命周期组合。

## 分阶段落地建议

### Phase 0：连接与协议 spike

- 仅 Electron main，两台本机/局域网设备；TCP + Noise + Yamux + mDNS。
- 固定 `/memorilo/sync/1`，实现 hello/auth、length-delimited framing、最大帧、超时、结构化 error。
- 使用内存 Note/Learning fixtures 验证断线重连、重复 frame、半包和关闭；不接 DHT、pubsub、relay。

### Phase 1：已配对设备的 Note 增量同步

- 配对记录、PeerId/key 持久化、ACL 和 membership epoch。
- 直接调用 `applyExternalUpdates()`，利用 update receipts；frontier 差异优先，dependency 错误转 snapshot。
- main 中增加 SyncApplication 和状态查询 IPC；renderer 只显示连接/队列/冲突恢复状态。

### Phase 2：学习 outbox 与附件

- 实现 ADR 0007 的 pull/merge/push/ack、mutation 幂等、membership-epoch tombstone watermark 和 full-sync backup/recovery。
- 增加内容寻址 asset manifest/chunk、断点续传和磁盘配额。
- 使用端到端重启/离线矩阵验证“编辑不丢、Review Event 不重复、Undo 可重放”。

### Phase 3：纯 P2P 成熟化

- 固化 Noise、Yamux、mDNS、配对 ACL、membership epoch 和设备 version vector 的恢复/迁移流程。
- 增加跨网络的用户辅助地址交换、连接诊断和明确的离线状态；不引入 relay、bootstrap、rendezvous、DHT 或自动打洞。
- 记录连接成功率、mDNS 候选数、snapshot 比例、重试队列长度和 tombstone 阻塞原因；按 peer 和账户限流。

### Phase 4：明确留白

- 浏览器节点、WebRTC/WebTransport、跨网络 NAT 穿透和任何公共节点均不属于当前决策；若未来需要，另立 ADR 后再设计。

## 最终建议

libp2p 值得采用，但定位应是 **受账户授权的设备间连接层**，不是“自动同步一切”的产品协议。最小可交付架构是独立的 `@memorilo/p2p-sync` package，由 Electron main 组合运行：Noise + Yamux 连接上承载 Note Loro delta、学习 mutation 和后续 asset chunk；mDNS 只提供底层可达 peer，五分钟 probe/available 流程决定哪些设备可出现在配对 UI；SQLite receipt/outbox 继续是本地可靠性边界；Loro 继续是 Note 的合并事实来源；学习 ADR 继续是个人历史与冲突语义来源。纯 P2P 的设备 version vector 和 membership epoch 已记录在 [ADR 0007](../adr/0007-pure-p2p-learning-sync.md)；不引入其它服务器或隐式 NAT 基础设施。

## 主要官方来源

- [libp2p Browser Node Connectivity](https://libp2p.io/docs/browser-connectivity/)
- [libp2p Publish/Subscribe](https://libp2p.io/docs/pubsub/)
- [js-libp2p Getting Started](https://github.com/libp2p/js-libp2p/blob/main/doc/GETTING_STARTED.md)
- [js-libp2p Configuration](https://github.com/libp2p/js-libp2p/blob/main/doc/CONFIGURATION.md)
- [js-libp2p Peer Discovery](https://github.com/libp2p/js-libp2p/blob/main/doc/PEER_DISCOVERY.md)
- [`@libp2p/webrtc`](https://github.com/libp2p/js-libp2p/blob/main/packages/transport-webrtc/README.md)
- [`@libp2p/webtransport`](https://github.com/libp2p/js-libp2p/blob/main/packages/transport-webtransport/README.md)
- [`@libp2p/websockets`](https://github.com/libp2p/js-libp2p/blob/main/packages/transport-websockets/README.md)
- [`@libp2p/gossipsub`](https://github.com/libp2p/js-libp2p/blob/main/packages/gossipsub/README.md)
- [Loro README / sync example](https://github.com/loro-dev/loro/blob/main/README.md#example)
- [Memorilo ADR 0001：每个 Note 一个 LoroDoc](../adr/0001-note-as-loro-aggregate.md)
- [Memorilo ADR 0004：个人学习同步](../adr/0004-personal-learning-sync.md)
- [Memorilo ADR 0007：纯 P2P、设备 version vector 与 membership epoch](../adr/0007-pure-p2p-learning-sync.md)
