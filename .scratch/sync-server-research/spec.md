# `apps/sync-server` 架构可行性调研

调研日期：2026-08-29

## 结论

技术上可以在 `apps/` 下新增独立的 `sync-server`，但它不是给现有 Electron 应用增加一个 HTTP 入口那么简单。当前仓库已经接受了“已配对 Electron 设备之间的纯 P2P 同步”架构；中心服务器会直接改变身份、授权、游标、持久化和删除语义，因此必须先形成新的 ADR/协议决策，再实现服务端。

建议把 `apps/sync-server` 定义成独立 Node 服务，只复用跨平台的同步领域模型和编解码代码，不依赖 `apps/desktop/main`、Electron、桌面资产路径或客户端 JSON journal。服务端应采用自己的多租户同步存储和认证边界；Note 的 Loro update/snapshot 与个人 Learning mutation 仍保持两个同步域。

可行性分级：

| 方向 | 判断 | 原因 |
| --- | --- | --- |
| 作为当前 P2P 的可选中继/公网可达节点 | 可行，但需新 ADR | 当前 `/memorilo/sync/1` 把对端当作 `PairedDevice`，服务端不是该身份；还需要 relay 授权、连接策略和离线日志语义。 |
| 作为账户级权威同步服务 | 可行，但属于协议和数据模型重构 | 需要账户/设备认证、多租户隔离、服务端游标或版本向量、幂等、保留/GC、撤销和恢复。现有客户端接口不足以表达这些职责。 |
| 仅复制现有 `JsonSyncJournal` 或桌面 SQLite 到服务器 | 不可取 | journal 是单设备本地文件日志；SQLite schema 包含桌面投影、FTS/vector 和本地资源，不是服务端多租户模型。 |

## 当前架构事实

### Monorepo 与进程边界

- 仓库是 pnpm/Turbo monorepo。根工作区目前只包含 `apps/desktop`、`apps/desktop/*`、`packages/excalidraw/*` 和 `packages/*`，所以 `apps/sync-server` 不会被当前 glob 自动纳入；需要显式加入 `apps/*` 或 `apps/sync-server`。[`pnpm-workspace.yaml`](../../pnpm-workspace.yaml#L1-L5)
- Turbo 的 `build`、`lint`、`typecheck`、`test` 任务按 workspace package 的脚本运行；新服务需要自己的 `package.json` 脚本，才会参与对应任务。[`turbo.json`](../../turbo.json#L3-L33)
- Electron main 组合 SQLite、`SqliteEditorStorage`、Note application、Learning 和 P2P；renderer 通过 preload/IPC 使用窄接口。主进程初始化 P2P 和同步 provider 的位置是 [`apps/desktop/main/src/desktop-runtime.ts`](../../apps/desktop/main/src/desktop-runtime.ts#L174-L225) 与 [`apps/desktop/main/src/desktop-runtime.ts`](../../apps/desktop/main/src/desktop-runtime.ts#L342-L465)。窗口启用 `contextIsolation`、关闭 `nodeIntegration` 并使用 sandbox，网络私钥不应下沉到 renderer。[`apps/desktop/main/src/index.ts`](../../apps/desktop/main/src/index.ts#L86-L101)；Electron 官方 [Process Model](https://www.electronjs.org/docs/latest/tutorial/process-model) 与 [Context Isolation](https://www.electronjs.org/docs/latest/tutorial/context-isolation)
- `apps/desktop/api` 的 Hono app 是进程内路由器，由自定义 `memorilo:` protocol 和 IPC 调用；它不是监听公网端口的服务。路由还包含窗口、备份、阅读会话、资产等 Electron-only/contextual 操作，不应整体暴露给同步服务器。[`apps/desktop/api/src/server.ts`](../../apps/desktop/api/src/server.ts#L14-L58)；[`apps/desktop/api/src/rpc-routes.ts`](../../apps/desktop/api/src/rpc-routes.ts#L51-L97)；[`apps/desktop/api/src/operations.ts`](../../apps/desktop/api/src/operations.ts#L212-L225)；Hono 官方 Node 适配器文档：[Hono Node.js](https://hono.dev/docs/getting-started/nodejs)

### Note 持久化边界

- ADR 0001 将每个 Note 定义为一个 LoroDoc 协作与持久化 aggregate；Folder/Topic 树和 Topic block 共享同一 Note 历史，Note 是同步、回溯和恢复单位。[`docs/adr/0001-note-as-loro-aggregate.md`](../../docs/adr/0001-note-as-loro-aggregate.md#L1-L3)
- `editor-storage` 的 schema 同时保存 Note 元数据、checkpoint snapshot、按本地 sequence 的 `note_updates` 和 hash receipt；`note_update_receipts` 通过 `(note_row_id, update_hash)` 提供去重边界。[`packages/editor-storage/src/editor-storage-schema.ts`](../../packages/editor-storage/src/editor-storage-schema.ts#L17-L27)；[`packages/editor-storage/src/editor-storage-schema.ts`](../../packages/editor-storage/src/editor-storage-schema.ts#L99-L115)
- `saveNoteUpdates()` 先校验二进制/projection，再按 hash 过滤已接收 update，最后在一个 database batch 中写 `notes.latest_sequence`、update log、receipt 和 projection；重复 update 不增加 sequence。[`packages/editor-storage/src/editor-note-updates.ts`](../../packages/editor-storage/src/editor-note-updates.ts#L41-L59)；[`packages/editor-storage/src/editor-note-updates.ts`](../../packages/editor-storage/src/editor-note-updates.ts#L88-L117)；[`packages/editor-storage/src/editor-note-updates.ts`](../../packages/editor-storage/src/editor-note-updates.ts#L159-L199)
- checkpoint 只是可重建快照，并会删除达到 watermark 的旧 update；把客户端数据库文件或 checkpoint 当成服务器唯一真相会丢失增量和并发合并能力。[`packages/editor-storage/src/editor-note-records.ts`](../../packages/editor-storage/src/editor-note-records.ts#L58-L84)
- 对外 storage contract 暴露的是 `saveNoteUpdates`, `getNote`, `checkpointNote` 等本地聚合操作，没有“按账户拉取所有设备变更”或“服务端提交并分配全局游标”的接口。[`packages/editor-storage/src/editor-storage-contracts.ts`](../../packages/editor-storage/src/editor-storage-contracts.ts#L593-L610)

### Learning 同步边界

- Learning 数据与 Note 内容是明确分离的同步域；设计文档说远端同步服务尚不在当前实现范围。[`docs/fsrs-learning-system.md`](../../docs/fsrs-learning-system.md#L1-L3)；[`docs/fsrs-learning-system.md`](../../docs/fsrs-learning-system.md#L14-L30)
- 客户端已有 `learning_sync_outbox`、`learning_sync_received_mutations` 和 purge tombstone。schema 仍包含 `last_server_sequence`、`server_sequence` 等历史字段。[`packages/editor-storage/src/learning/schema.ts`](../../packages/editor-storage/src/learning/schema.ts#L204-L238)
- `AcknowledgeLearningSyncInput` 仍要求 `serverSequence`；仓储层的 `acknowledge()` 也会推进 `last_server_sequence`，而 P2P 路径另有只按 mutation id 删除 outbox 的 `acknowledgeMutations()`。[`packages/editor-storage/src/learning/types.ts`](../../packages/editor-storage/src/learning/types.ts#L295-L312)；[`packages/editor-storage/src/learning/learning-sync-repository.ts`](../../packages/editor-storage/src/learning/learning-sync-repository.ts#L254-L300)
- 当前桌面组合根把 pending learning mutations 写入本地 P2P journal，接收端在同一应用生命周期内调用 `learning.sync.applyRemote()`、`notes.saveNoteUpdates()`，再记录 received vector；这证明领域逻辑可复用，但不是服务器存储接口。[`apps/desktop/main/src/desktop-runtime.ts`](../../apps/desktop/main/src/desktop-runtime.ts#L342-L437)
- `LearningSyncStorage` 虽然是公开的 `applyRemote`/`listPending`/ack contract，但 `SqliteEditorStorage.open()` 会先初始化完整 editor schema（包括 embedding/vector 配置）再创建 Learning storage；服务器若只需同步日志，直接实例化该 composition 会带来不必要的桌面 FTS/vector/embedding 依赖。应新增 server-sync repository/port，或明确扩展 `editor-storage` 的可选 facet。[`packages/editor-storage/src/learning/types.ts`](../../packages/editor-storage/src/learning/types.ts#L362-L377)；[`packages/editor-storage/src/editor-storage.ts`](../../packages/editor-storage/src/editor-storage.ts#L100-L130)

### 现有 P2P 协议

- ADR 0007 明确规定：Noise + Yamux + mDNS 的 paired Electron 直连，不使用 rendezvous、relay、bootstrap、DHT 或同步协调器；服务器方案与该 ADR 的目标相冲突。[`docs/adr/0007-pure-p2p-learning-sync.md`](../../docs/adr/0007-pure-p2p-learning-sync.md#L1-L5)；[`docs/adr/0007-pure-p2p-learning-sync.md`](../../docs/adr/0007-pure-p2p-learning-sync.md#L17-L28)
- `SyncStateProvider` 只有客户端视角的 `getVersionVector`, `getChanges`, `applyChanges` 和 `acknowledgeChanges`；没有账户租户、服务端提交、设备注册、权限检查或全局查询接口。[`packages/sync/src/node.ts`](../../packages/sync/src/node.ts#L22-L29)
- `/memorilo/sync/1` 入站握手必须先找到本地 `PairedDevice`，并校验 `pairingId` 与 `sharedSecret`；随后执行 pull -> ack -> push -> ack。未配对连接会被关闭。[`packages/sync/src/node.ts`](../../packages/sync/src/node.ts#L324-L363)；[`packages/sync/src/node.ts`](../../packages/sync/src/node.ts#L365-L442)；[`packages/sync/src/node.ts`](../../packages/sync/src/node.ts#L505-L520)
- 协议消息把 `deviceId`, `membershipEpoch`, `versionVector`, `pairingId`, `sharedSecret` 放在 `hello` 中，change 只有 `note-update` 或 `learning-mutation` 两种 kind；这些字段可成为协议底层素材，但不能直接作为中心服务的账户认证合同。[`packages/sync/src/model.ts`](../../packages/sync/src/model.ts#L93-L129)
- 当前存在两套不同 cursor：`EditorNote` 的 `getVersion()`/`exportUpdates(from)` 是每个 LoroDoc 的 frontier，而 `JsonSyncJournal` 的 version vector 是跨所有 change 的 `(deviceId, sequence)`；桌面 runtime 先把每个 Loro update 包成 JSON/base64 `SyncChange` 再分配 device sequence。[`packages/editor/src/note/editor-note-collaboration-runtime.ts`](../../packages/editor/src/note/editor-note-collaboration-runtime.ts#L102-L109)；[`apps/desktop/main/src/desktop-runtime.ts`](../../apps/desktop/main/src/desktop-runtime.ts#L246-L263)；[`packages/sync/src/model.ts`](../../packages/sync/src/model.ts#L93-L117)
- 因此服务器可以先按 device sequence 保存 opaque change 做可靠中继，但不能仅凭 journal vector 高效判断某个 Note 的 Loro 缺口、快照裁剪或 frontier 恢复；权威服务需要新增 per-note frontier/snapshot 索引与协议字段。[`apps/desktop/main/src/notes/note-p2p-baselines.ts`](../../apps/desktop/main/src/notes/note-p2p-baselines.ts#L26-L42)
- `decodeMessage()` 目前只根据 `type` 做顶层分支检查，具体字段主要由 paired session 手工使用；把它直接暴露到公网会缺少严格的账户、租户、长度、速率和 payload schema 校验。[`packages/sync/src/model.ts`](../../packages/sync/src/model.ts#L199-L216)；[`packages/sync/src/node.ts`](../../packages/sync/src/node.ts#L324-L332)
- `JsonSyncJournal` 是单设备 JSON 文件，记录一个 `deviceId`、本地 sequence、changes、收到的 contiguous vector 和 gap；通过临时文件 rename 保证本地原子保存。它适合客户端离线 outbox/relay 原型，不适合多租户、并发写、索引查询、租户级 GC 或服务端备份。[`packages/sync/src/journal.ts`](../../packages/sync/src/journal.ts#L13-L30)；[`packages/sync/src/journal.ts`](../../packages/sync/src/journal.ts#L118-L140)；[`packages/sync/src/journal.ts`](../../packages/sync/src/journal.ts#L156-L211)；[`packages/sync/src/journal.ts`](../../packages/sync/src/journal.ts#L234-L239)

## 新增 `sync-server` 的可复用与隔离

### 可以复用

1. 从 `packages/sync` 提取纯领域模块：`SyncChange`/version-vector 算法、长度分帧、最大 frame 检查、Note update hash 和 Learning mutation id 的幂等规则。提取应保持 package public entry point，不让服务器 import `node.ts` 的 mDNS/TCP/Pairing 实现。
2. 从 `packages/editor-storage` 或更深层领域模块复用 Note/Learning 的验证和 merge 语义。服务器不应调用桌面 `NoteApplicationService`，但客户端与服务器可以共享协议 DTO/schema 和独立的 server repository contract。
3. 若采用 HTTP/WebSocket，复用 Hono 的 schema/wire 风格和统一错误编码；`createDesktopHonoApp` 本身含有桌面 contextual handlers，不应直接挂到公网。Hono 的 `app.fetch` 与 Node listener 是两个适配层，官方 Node adapter 负责真实监听。[`apps/desktop/api/src/server.ts`](../../apps/desktop/api/src/server.ts#L27-L58)；[Hono Node.js](https://hono.dev/docs/getting-started/nodejs)

### 必须隔离或重新设计

- **认证与授权**：当前 shared secret 是两台已配对设备之间的 grant，不等价于账户 token。中心服务至少需要 account/user identity、device key/token、设备撤销、Note ACL 或账户 scope、重放保护和速率/配额控制。
- **同步角色**：必须明确服务器是 durable relay（保存并转发客户端 change）还是 authoritative sync service（持有账户级日志、分配服务端 cursor、提供 full sync）。两者的 ack、GC 和离线设备语义不同。
- **服务端存储**：不能复用桌面 `notes`/projection 全库作为默认设计。最小 relay 可按 `(account_id, change_id)` 存不可变 envelope、设备 sequence、kind、payload、created_at、membership epoch 和 ack/watermark；权威服务还要存 Note head/snapshot、Learning event/mutation、资产 manifest、schema generation。数据库可以先用 SQLite 适配器验证，但生产多实例需要明确单写/锁、迁移、备份和对象存储策略。
- **附件**：Note 只在 Loro 数据中保存 `memorilo://asset/...` 引用；服务器若承担跨设备同步，还要定义内容 hash、manifest、分块上传、断点续传、临时文件校验和权限。不要把附件二进制塞进现有 Loro change。[`docs/research/libp2p-p2p-sync.md`](../../docs/research/libp2p-p2p-sync.md#L185-L187)
- **删除与回收**：Learning tombstone 只有在授权成员达到 watermark 后才能 purge；服务器加入后必须定义成员撤销、离线设备期限、服务端保留和恢复窗口，不能以“已发到 socket”作为 ack。[`docs/research/libp2p-p2p-sync.md`](../../docs/research/libp2p-p2p-sync.md#L154-L160)；[`docs/adr/0007-pure-p2p-learning-sync.md`](../../docs/adr/0007-pure-p2p-learning-sync.md#L11-L15)
- **生命周期与运维**：现有 MCP HTTP server 已实现 request supervisor、body/socket 限制、graceful drain 和关闭顺序，可作为生命周期样板；其 loopback host/origin/token 安全检查不能原样当作公网认证。[`apps/desktop/main/src/mcp/mcp-http-server.ts`](../../apps/desktop/main/src/mcp/mcp-http-server.ts#L116-L170)；[`apps/desktop/main/src/mcp/mcp-http-server.ts`](../../apps/desktop/main/src/mcp/mcp-http-server.ts#L230-L347)

## 推荐目标形态（待 ADR 确认）

```text
Electron main
  -> Sync client adapter (outbox, local receipt, retry)
  -> HTTPS/WebSocket or libp2p relay transport
  -> apps/sync-server
       -> account/device auth + ACL
       -> sync protocol adapter
       -> server sync repository (multi-tenant durable log)
       -> optional object storage for assets/snapshots
```

服务端只接收结构化 sync envelope，不接收任意桌面 RPC；客户端继续通过 `NoteAuthoritativeRuntime.applyExternalUpdates()` 和 `learning.sync.applyRemote()` 在本地事务中落地。协议应显式携带 protocol/schema generation、账户/设备身份、Note frontier 或 Learning device vector、change hash/id、批次大小和 ack 语义。当前文档已经建议 Note/Learning 分域、先 pull/merge 再 push/ack、长度限制、snapshot/chunk 和显式 full-sync recovery，可作为新 ADR 的初始约束。[`docs/research/libp2p-p2p-sync.md`](../../docs/research/libp2p-p2p-sync.md#L125-L183)；[`docs/research/libp2p-p2p-sync.md`](../../docs/research/libp2p-p2p-sync.md#L189-L201)

若目标只是跨公网连通而不改变纯 P2P 数据真相，可把 server 限定为 relay/rendezvous，并保留端到端设备授权；这仍然违反 ADR 0007 当前“无 relay/rendezvous”的决策，需要单独记录运营、metadata 泄露和失败恢复边界。若目标是登录账户后在任意设备恢复数据，则应选择权威服务模型，并接受从 `last_server_sequence`/P2P version vector 到服务端租户游标或混合 cursor 的显式迁移。

## 实施前必须回答的问题

1. 服务端是 durable relay 还是 authoritative account sync？是否允许服务器解密 Note/Learning payload，还是端到端加密只保存 opaque bytes？
2. 账户、设备、Note ACL 和设备撤销由谁签发和持久化？现有 pairingId/sharedSecret 是否只作为本地 bootstrap，还是要迁移为可验证 device credential？
3. Learning 是否恢复 server cursor，还是坚持设备 version vector？若恢复，如何处理现有 `last_server_sequence` 字段和 ADR 0007 的破坏性迁移要求？
4. Note update history、checkpoint、资产和 tombstone 的保留期限、GC watermark、备份和 full-sync recovery 是什么？
5. 服务端部署目标是单进程/单 SQLite，还是多实例/外部 SQL+对象存储？这决定 repository、事务和幂等键的实现，而不是由桌面 `EditorStorageDatabase` 自动决定。
6. 客户端如何发现和连接服务端（固定 HTTPS、WebSocket、libp2p relay 或多种 transport），以及网络断开、重试、限流和服务器迁移如何呈现给用户？

## 建议的下一步（仍不改代码）

先写一份 superseding ADR，选择 relay 或 authoritative 两种模型之一，并冻结认证、ack/cursor、删除/保留和加密边界。确定后再拆出一个不含 Electron 的 `packages/sync-protocol`（纯 DTO/schema/framing/domain rules），由 `apps/desktop` 和 `apps/sync-server` 分别实现 client/server adapter；最后才调整 `pnpm-workspace.yaml`、新增服务包和部署配置。这样可以复用已有 merge 语义，同时避免把桌面 IPC、native SQLite/embedding 依赖和单设备 journal 误当作服务器架构。

## 混合拓扑补充：服务器作为普通 libp2p peer

本节针对“`sync-server` 是一个普通 libp2p peer，Electron 客户端通过 WebSocket 连接；客户端之间继续使用 TCP/mDNS P2P”的方案。结论是：**传输层可行性高，现有实现复用度中等，协议/授权仍需明显改造**。

### 官方 WebSocket transport 能力

- 官方 `@libp2p/websockets` README 明确把它定义为基于 WebSocket 的 libp2p transport，示例在 Node 中用 `webSockets()` 拨号 `/dns4/example.com/tcp/9090/tls/ws`，因此服务端可拥有稳定的 DNS/PeerId multiaddr。[官方 README](https://github.com/libp2p/js-libp2p/blob/main/packages/transport-websockets/README.md)
- 官方 Getting Started 展示了 `transports: [webSockets()]`、Noise、Yamux 和 WebSocket listen address `/ip4/127.0.0.1/tcp/8000/ws` 的完整 Node 配置；官方配置文档也展示了 TCP + WebSocket 双 transport 并存的配置。[Getting Started](https://github.com/libp2p/js-libp2p/blob/main/doc/GETTING_STARTED.md#transports)；[Configuration](https://github.com/libp2p/js-libp2p/blob/main/doc/CONFIGURATION.md#basic-setup)
- transport 源码的 `WebSocketsInit` 提供 `http`/`https` server options；listener 根据 `/ws` 或 `/tls/ws` 创建 HTTP/HTTPS server，并通过 HTTP Upgrade 接入 WebSocket。也就是说，公网服务需要证书或由反向代理终止 TLS，且仍可在 WebSocket 之上运行 Noise。[transport source](https://github.com/libp2p/js-libp2p/blob/main/packages/transport-websockets/src/index.ts)；[listener source](https://github.com/libp2p/js-libp2p/blob/main/packages/transport-websockets/src/listener.ts)
- libp2p 浏览器文档指出：HTTPS 页面会阻止明文 `ws://`，需要可信证书的 `wss://`；WebSocket 在 libp2p 中还要经过 multistream、Noise/TLS 等握手，普通无域名节点因此不适合直接作为浏览器公网目标。[Browser Node Connectivity: WebSocket](https://libp2p.io/docs/browser-connectivity/#websocket)

### 对当前 `@memorilo/sync` 的直接影响

当前 `createP2pNode()` 的 transport/discovery 是固定的：listen 默认 TCP，`transports` 只有 `tcp()`，`peerDiscovery` 永远包含 `mdns()`。[`packages/sync/src/node.ts`](../../packages/sync/src/node.ts#L253-L261) 即使调用方传入 `/tcp/<port>/ws`，没有 `webSockets()` 也无法让该地址匹配 transport；需要给 node options 增加 transport/discovery 配置，或拆出客户端/服务器两种 composition root。

混合拓扑的理想组合是：

```text
Electron client node:
  transports: [tcp(), webSockets()]
  peerDiscovery: [mdns()]
  known server: /dns4/sync.example/tcp/443/tls/ws/p2p/<serverPeerId>

sync-server node:
  transports: [webSockets()]
  peerDiscovery: []
  listen: /ip4/0.0.0.0/tcp/443/tls/ws

client-to-client:
  existing TCP + mDNS + Noise + Yamux path remains enabled
```

客户端不能依赖 mDNS 发现公网服务器；服务端地址和 PeerId 必须来自配置、登录 bootstrap 或固定发现服务。libp2p 官方说明 discovery 事件只写入 peer store，应用仍需决定何时 dial，因此应为 server peer 建立显式重试/连接状态，而不是把它混进局域网 discovered peer UI。[Peer Discovery](https://github.com/libp2p/js-libp2p/blob/main/doc/PEER_DISCOVERY.md)

### “普通 peer”不等于“现有 PairedDevice”

WebSocket 只改变底层 transport，不会解决现有应用层身份约束：

- 入站 `/memorilo/sync/1` 先按远端 PeerId 查 `PairingManager.findByPeerId()`，找不到 `PairedDevice` 就关闭流；随后还要求 `pairingId` 与 `sharedSecret` 相等。[`packages/sync/src/node.ts`](../../packages/sync/src/node.ts#L505-L520)；[`packages/sync/src/node.ts`](../../packages/sync/src/node.ts#L324-L332)
- `PairingManager` 的本地身份和 grant 模型是一台设备加一组已配对设备，每个 grant 固定 `pairingId/deviceId/peerId/sharedSecret`；它不表达一个 server peer 为多个账户和设备提供动态授权。[`packages/sync/src/pairing.ts`](../../packages/sync/src/pairing.ts#L53-L66)；[`packages/sync/src/pairing.ts`](../../packages/sync/src/pairing.ts#L110-L124)
- `connection:open` 和定时重连也只对 `pairing.list()` 中的 peer 发起 sync；已知服务器地址若不写进 paired list，不会自动同步。[`packages/sync/src/node.ts`](../../packages/sync/src/node.ts#L582-L620)
- `SyncStateProvider.applyChanges()` 的 `peer` 参数是 `PairedDevice`，服务端 session 没有自然的本地 PairedDevice；强行构造 synthetic device 会把账户认证、设备撤销和服务端角色混入客户端 pairing 语义，后续难以区分直连设备与中心服务。[`packages/sync/src/node.ts`](../../packages/sync/src/node.ts#L22-L29)

因此有两个可选方向：

1. **过渡方案：服务器也维护 grant。** 给每个账户/设备预置 server-side `PairingGrant`，客户端把服务器当一个特殊 paired peer；可以最大限度复用当前 stream framing，但需要限制 pairing UI、设备名、membership epoch 和服务端多租户映射，且不能把 mDNS pairing flow 原样用于公网。
2. **推荐方案：新增 server role/auth handshake。** 保留 Noise 对 PeerId 的连接认证，在 `/memorilo/server-sync/1` 或同一协议的显式 `role: client|server` 中增加 account/device credential、nonce/signature/token、授权 scope、schema generation 和 replay expiry。把 session pull/push/ack 抽成 transport-neutral 模块，P2P pairing 与 server auth 作为两种 adapter；不要让服务端伪装 `PairedDevice`。

### 必要改造清单

| 边界 | 当前状态 | 混合拓扑需要的变化 |
| --- | --- | --- |
| Transport | `tcp()` + `mdns()` 固定；无 `@libp2p/websockets` 依赖 | 在 `@memorilo/sync` 增加官方 `@libp2p/websockets`，客户端组合 TCP/WS，服务器仅 WS；支持 `/ws` 与 `/tls/ws` 的 listen/dial multiaddr。 |
| Discovery | mDNS 事件和 paired list 驱动自动 sync | 为 server multiaddr/PeerId 提供 bootstrap 配置、显式 dial、重试和状态；服务器禁用 mDNS。 |
| Session | `node.ts` 内部直接绑定 PairingManager、客户端 provider 和 paired credentials | 提取通用 framed sync session；设备 P2P adapter 保持现有 pairing，server adapter 实现 role/auth/multi-tenant provider。 |
| Auth | `pairingId + sharedSecret`，只检查本地 paired peer | 增加账户/设备凭证、撤销、scope、nonce/expiry、速率与配额；Noise PeerId 不能单独作为账户授权。 |
| Cursor | journal device vector 全局；Note Loro frontier 未在 hello 中传输 | relay 可先按 device sequence 存 opaque change；若服务器做 per-Note delta/snapshot，需要 Note frontier/index 和恢复协议。 |
| Storage | 单设备 JSON journal；桌面 SQLite 全库 | server-side durable multi-tenant log/metadata，幂等键按 account/device/change；生产部署明确单写 SQLite 或外部 SQL/对象存储。 |
| Lifecycle | MCP server 有 Node HTTP drain 样板 | WebSocket listener 关闭时先停止 admission，再 drain active libp2p streams；设置连接/帧/账户配额和可观测性。 |

### 混合拓扑最终判断

- **连接可行**：官方 transport 支持 Node WebSocket listen/dial，TCP 和 WebSocket 可在同一客户端节点并存；Noise、Yamux、Identify 与现有 P2P 路径兼容。
- **不能零改动复用**：当前依赖缺少 `@libp2p/websockets`，node 选项固定 TCP/mDNS，server 入站会被 `PairedDevice` 检查拒绝，且自动 sync 只遍历 paired list。
- **建议实现边界**：先将同步会话/消息编解码从 `node.ts` 提取到无 transport/无 pairing 的公共模块；再分别实现 TCP/mDNS device adapter 与 WebSocket server adapter。服务端作为普通 libp2p peer 的 PeerId/Noise 身份可以复用，但账户授权、租户存储和 ack/cursor 不能复用当前 pairing contract。
- **ADR 影响**：这不再是“纯 P2P、无 relay/server”方案，必须更新 ADR 0007，明确服务器仅作 opaque relay 还是可读取/合并的 authoritative peer；客户端间 TCP/mDNS 保留并不消除该架构决策。

## 一手资料

- [ADR 0007：pure P2P synchronization](../../docs/adr/0007-pure-p2p-learning-sync.md)
- [libp2p P2P sync research in this repository](../../docs/research/libp2p-p2p-sync.md)
- [Hono Node.js adapter](https://hono.dev/docs/getting-started/nodejs)
- [Node.js HTTP `createServer`](https://nodejs.org/api/http.html#httpcreateserveroptions-requestlistener)
- [Electron Process Model](https://www.electronjs.org/docs/latest/tutorial/process-model)
- [Electron Context Isolation](https://www.electronjs.org/docs/latest/tutorial/context-isolation)
- [pnpm workspace configuration](https://pnpm.io/pnpm-workspace_yaml)
- [Turborepo repository structure](https://turborepo.com/docs/crafting-your-repository/structure)

## 多租户模式与服务器网页管理补充

本节按新增需求评估：一个服务器承载多个账号；每个账号可选择 relay 或 authoritative；管理员可关闭某种模式；authoritative 用户可清空自己在服务器上的数据；服务器提供网页操作；网页尽量复用本地 UI，并默认使用 neubrutalism。结论是这些需求可以共存，但必须把“同步模式”建模为**账户级 policy**，不能作为进程级开关或复用桌面配置。

### 账户、租户和同步模式

- 最小领域模型应至少有 `Account`、`UserCredential`、`Device`、`DeviceCredential`、`SyncPolicy`、`PairingSession`、`SyncNamespace`（Note/Learning）、`ChangeEnvelope`、`DeletionJob` 和 `AuditEvent`。`account_id` 是所有数据查询、唯一键和授权检查的第一列/第一条件；不要仅依赖 libp2p `PeerId`，因为一个 server peer 会服务多个租户。
- `SyncPolicy` 建议是 `relay | authoritative`，并包含 `enabled`、允许的 namespace、保留期限/配额和版本。客户端每次建立 session 都应读取服务器返回的 policy snapshot；服务端在接收每批 change 时再次授权，避免“连接建立时允许、策略随后关闭”造成越权。策略变化应有单调版本或 epoch，便于撤销旧 session。
- “服务器关闭某同步模式”应是 capability gate：新建账号/设备和新 session 拒绝该模式，已有连接收到明确的 policy-revoked 错误并排空；不能把已存 authoritative 数据静默当作 relay 数据，也不能自动降级而改变数据保密语义。关闭模式后的历史数据保留、迁移或删除应是单独的显式运维动作。
- relay 若“不保存传输数据”，只能做在线转发：服务端最多保存账户/设备元数据和短期连接状态，离线设备无法从服务器补齐变更。若产品要求离线恢复，relay 实际上必须持久化 opaque envelope，随后就需要保留期限、watermark、GC、备份和删除语义；“relay”不应成为绕开存储合规的名称。
- authoritative 模式要先明确服务端是否能解密 payload。明文 authoritative 需要按租户隔离的日志/快照/资产存储、加密静态数据、密钥轮换、审计和 retention；端到端加密 authoritative 则只能做 opaque envelope/密钥同步，服务器不能提供全文投影或内容级管理。两者的产品名称和用户提示必须区分。

### 多租户存储和授权边界

- 每条服务器记录都应带 `account_id`（必要时再带 `namespace_id`/`device_id`），并在 repository 层强制接收已授权的 tenant context，而不是让 handler 传任意 account id。应用层 ACL 仍必需；如果生产使用 PostgreSQL，可用 Row-Level Security 作为纵深防御，但不能把 RLS 当作唯一的业务授权层。参考 [PostgreSQL Row-Level Security](https://www.postgresql.org/docs/current/ddl-rowsecurity.html)。
- SQLite 单文件适合单实例开发或个人部署，但多租户并发写、在线备份和横向扩展需要明确单 writer/锁策略；多实例部署应选择外部 SQL，并把对象存储用于大快照/附件。不要在服务端直接打开 `SqliteEditorStorage`，因为它会初始化桌面 editor 的 FTS/vector/embedding 结构（见上文），也会把本地投影耦合到租户数据。
- 身份认证至少分成账号登录会话和设备同步凭证。网页 cookie session 应使用 Secure、HttpOnly、SameSite、短期 access/refresh 生命周期和服务端撤销；同步连接应使用单独的 device credential（短期 token 或签名公钥），带 `account_id`、`device_id`、scope、issued-at/expiry、nonce/replay 防护。libp2p Noise 只证明 transport peer identity，不能单独授予租户访问权。
- 账号创建和登录不得复用当前 `pairingId + sharedSecret`：该 grant 是本地两设备配对凭证，没有密码重置、设备撤销、会话管理或多租户 scope。认证流程应遵循 OWASP Authentication/Session Management 基线，并对新设备、导出和删除等敏感动作使用 step-up authentication。[OWASP Authentication Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Authentication_Cheat_Sheet.html)；[OWASP Session Management Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Session_Management_Cheat_Sheet.html)。

### 配对流程（服务器先建账号）

建议将用户可见流程拆成不可混淆的阶段：

```text
网页：创建 Account + 初始用户凭证
客户端：输入/扫描 server URL，完成 HTTPS/WSS bootstrap，校验 origin/证书/服务器 PeerId
网页：已登录用户点击“添加设备”，创建短期 PairingSession/challenge
客户端：展示 challenge，用户确认当前设备，生成 device key 或一次性 code
网页/服务器：确认 challenge 与账号、设备公钥和过期时间匹配
服务器：签发 scoped DeviceCredential，记录 device/membership epoch
客户端：保存凭证，首次同步按服务器 policy 执行
```

- pairing challenge 必须一次性、短 TTL、绑定账号和预期设备，确认后立即失效；网页展示的 code 不应成为长期同步 secret。客户端应显示服务器域名、账号和设备名，避免把恶意服务器或错误租户配对进去。
- 若使用 OAuth/OIDC 或外部身份提供商，客户端授权码流程应使用 PKCE（RFC 7636）并遵守 OAuth Security BCP（RFC 9700）；若不引入外部 IdP，仍要实现密码哈希、邮箱/恢复策略、会话撤销和速率限制。设备密钥可用 WebCrypto 生成，私钥只留在客户端安全存储，服务器保存公钥和撤销状态。参考 [RFC 7636 PKCE](https://www.rfc-editor.org/rfc/rfc7636) 与 [OAuth 2.0 Security Best Current Practice](https://www.rfc-editor.org/rfc/rfc9700)。
- 设备撤销应立即阻止新 session，并让现有 WebSocket/libp2p stream 在下一批边界重新检查 epoch；删除设备不应自动删除账号数据，除非另有明确的数据生命周期策略。

### authoritative 用户清空自身服务器数据

这是破坏性操作，必须定义为账户授权下的 deletion workflow，而不是一个普通 RPC：

1. 仅允许已认证的账号 owner/admin，并要求 step-up auth（重新输入密码、WebAuthn 或等效强认证）和 CSRF 防护。
2. 先创建带 scope、actor、reason、request id 和确认时间的 `DeletionJob`，返回可追踪状态；不要在 HTTP 请求中同步删除大量日志/快照/对象。
3. 冻结该账号的新同步写入，撤销或轮换 active device credentials，关闭账号的 active streams，再按事务顺序删除 change log、snapshots、projection、asset manifest/blob、pairing metadata、audit payload 等明确范围。
4. 单独定义备份、WAL、对象存储版本和灾备副本的 purge SLA；“主库删除成功”不等于所有备份立即不可恢复。保留必要的最小审计记录时，应去除内容 payload，并公开保留期限。
5. 完成后客户端本地数据默认仍保留，客户端收到 `account-data-reset` 状态并进入重新 bootstrap；不要未经确认远程擦除本地数据库。若产品要提供“同时清空所有设备”，应是另一项高风险、逐设备确认的操作。

可参考 [OWASP Authorization Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Authorization_Cheat_Sheet.html) 和 [OWASP Logging Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Logging_Cheat_Sheet.html) 设计权限、审计和不可抵赖记录。删除接口需明确幂等：重复提交返回同一 job 状态，不能因重试触发第二次未预期的删除。

### 服务器网页与本地 UI 复用

- `@memorilo/ui` 已通过公共入口导出 Button/Dialog/Dropdown/Tabs/TextField/Surface/Switch 等控件，以及 `getUiThemeClass`、`getUiThemeCssVariables` 和 `neubrutalism` theme definitions。[`packages/ui/src/index.ts`](../../packages/ui/src/index.ts#L1-L30)；[`packages/ui/src/theme.stylex.ts`](../../packages/ui/src/theme.stylex.ts#L211-L329) 因此可以复用控件、token、可访问性合同和基础 StyleX 样式。
- renderer 的主题 runtime 只依赖 DOM + `@memorilo/ui`，通过 `applyDesktopTheme()` 给 `documentElement` 写 class、dataset 和 CSS variables；服务端 Web composition root 可以实现对应的 `applyWebTheme()`，默认选择 `neubrutalism/light`，并允许账户/浏览器偏好覆盖 appearance。[`apps/desktop/renderer/src/app/configuration/theme-runtime.ts`](../../apps/desktop/renderer/src/app/configuration/theme-runtime.ts#L16-L36)
- 不能直接复用 `apps/desktop/renderer` 的 AppShell、路由模块和 feature 页面：root route 使用 Electron 窗口 panel/main 语义，`router` 使用 hash history，页面数据通过 `window.desktop.request()` 进入 preload/IPC；在普通浏览器里会直接抛出 “Electron request context is unavailable”。[`apps/desktop/renderer/src/routes/__root.tsx`](../../apps/desktop/renderer/src/routes/__root.tsx#L6-L23)；[`apps/desktop/renderer/src/app/router.tsx`](../../apps/desktop/renderer/src/app/router.tsx#L1-L8)；[`apps/desktop/renderer/src/shared/desktop-requests.ts`](../../apps/desktop/renderer/src/shared/desktop-requests.ts#L1-L12)
- `renderer-global.css` 还包含 `-webkit-app-region`、window-specific body modes、Excalidraw/FullCalendar/editor 特化选择器；这些规则会污染网页布局或依赖 Electron。网页应有独立 global CSS 和 layout，不应把整个 renderer stylesheet 打包进服务端。[`apps/desktop/renderer/src/styles/renderer-global.css`](../../apps/desktop/renderer/src/styles/renderer-global.css#L1-L42)
- 推荐组织方式是 `apps/sync-server/web`（独立 Vite web entry、TanStack Router browser history、HTTP/WS API client、account/admin/sync views），必要时再抽出 `packages/sync-web-ui` 放稳定的服务器页面组合组件。该包只依赖 `@memorilo/ui`、React、浏览器 API 和 server API contracts；桌面 renderer 继续保留自己的 feature-specific styles。不要把 `apps/desktop/api` 当成 web API，因为其 operations 中包含 Electron contextual handlers。
- 默认 neubrutalism 应在 Web composition root 明确调用公共 theme API，而不是修改 `@memorilo/ui` 的全局默认值；这样桌面仍可按平台默认 liquid-glass/fluent，服务器网页则有独立且可测试的默认。StyleX 需要独立 Vite/Babel 编译配置，确保 `@stylexjs/stylex` 与 `@stylexjs/babel-plugin` 版本一致（当前 `packages/ui` 已固定 0.19.0）。[`packages/ui/package.json`](../../packages/ui/package.json#L1-L28)

### Workspace、部署与生命周期建议

- 将 `apps/sync-server` 纳入 workspace 后，建议包内至少拆成 `server-core`（HTTP/WS/libp2p admission、auth、policy、lifecycle）、`server-storage`（repository/迁移/GC）和 `web`（静态资源构建）；若规模很小，也可先一个 app，但保留这些模块边界和 public contracts。共享协议应继续位于 `packages/sync-protocol` 或 `packages/sync` 的 transport-neutral entry，不能从 server import `node.ts` 的 Electron/P2P composition。
- 部署可以先采用一个 Node 进程同时提供 HTTPS API、WebSocket/libp2p listener 和静态 web assets；生产多实例时把 API/web 无状态化，把 sync repository、job queue、object storage 和密钥管理外置。无论单进程还是拆进程，关闭顺序都应是 stop admission -> 标记 policy/server draining -> 关闭新 pairing -> drain active streams/jobs -> flush durable writes -> close DB/telemetry。现有 MCP server 的 supervisor、body/socket 限制和 graceful drain 可作为生命周期参考，但它的 loopback/token 检查不能直接照搬公网。[`apps/desktop/main/src/mcp/mcp-http-server.ts`](../../apps/desktop/main/src/mcp/mcp-http-server.ts#L116-L170)
- 服务器 web 与 sync listener 共享账号域，但不共享凭证：浏览器 cookie/CSRF 保护管理 API；同步协议使用 device credential，并限制到 account/namespace/sync mode。静态 web 资源可由同一 Node 服务托管，也可交给 CDN；反向代理终止 TLS 时仍要把原始 host/origin、WebSocket upgrade 和 client IP/限流语义定义清楚。

### 新增需求的风险结论

| 需求 | 可行性 | 主要风险/前置决策 |
| --- | --- | --- |
| 多租户 server peer | 可行 | tenant context、跨租户查询防护、配额、审计和备份隔离；PeerId 不是租户身份。 |
| 每用户 relay/authoritative | 可行但协议不同 | relay 是否持久化、authoritative 是否解密；禁止进程全局 flag 或静默降级。 |
| 关闭某同步模式 | 可行 | 新连接拒绝、旧连接 drain、历史数据迁移/保留/删除策略必须显式。 |
| authoritative 用户清空数据 | 可行但高风险 | step-up auth、异步 deletion job、设备撤销、主库/备份/blob 清理范围；默认不擦客户端。 |
| 服务器网页操作 | 可行 | 独立 browser API/route；不要暴露桌面 contextual RPC。 |
| 复用本地 UI、默认 neubrutalism | 可行 | 复用 `@memorilo/ui` primitives/theme tokens；独立 web entry/CSS/build，不能搬桌面 AppShell。 |
| 客户端+网页 pairing | 可行 | 一次性 challenge、短 TTL、设备凭证、撤销和重放防护；不要把 shared secret 当账号认证。 |

在这些领域决策冻结前，不建议开始实现 `apps/sync-server`：最容易返工的是 relay/authoritative 的 ack、删除和加密语义，而不是 HTTP 或 WebSocket listener 本身。

## Hono 与 TanStack Start 组合评估

可以使用 Hono + TanStack Start，但两者应承担不同边界，而不是让两个框架共同定义同一套路由和生命周期：

- Hono 的 Node 适配器把 Fetch app 接到 Node HTTP server，并提供 graceful shutdown、静态文件和 WebSocket upgrade 能力。[Hono Node.js 文档](https://hono.dev/docs/getting-started/nodejs)
- TanStack Start 是基于 TanStack Router 的 full-stack React 框架，提供 SSR、server routes、server functions 和 client/server builds；官方 Node 部署形态通过 Nitro 输出 `.output/server/index.mjs`。[TanStack Start 概览](https://tanstack.com/start/latest/docs/framework/react/overview)；[Server Routes](https://tanstack.com/start/latest/docs/framework/react/guide/server-routes)；[Hosting / Node.js](https://tanstack.com/start/latest/docs/framework/react/guide/hosting)

推荐职责划分：

```text
TanStack Start: 账号网页、pairing 页面、设备/策略/删除操作界面、SSR
Hono:          /api/* 管理 API、认证会话、CSRF、错误编码、健康检查
libp2p peer:   /libp2p WebSocket upgrade、Noise/Yamux、sync session
```

### 集成边界

1. **推荐先分端口或分进程**：Start 的 Nitro/Node listener、Hono API listener 和 libp2p WebSocket listener 分开管理，由反向代理统一为同一域名。这样不会让两个框架抢占同一个 HTTP upgrade 或关闭顺序，也方便后续把同步节点横向扩展。
2. **同进程可行，但需要自定义 Node composition root**：TanStack Start 官方说明自定义 Node server 可以调用其 server entry 的 `fetch` handler；因此可由一个显式 dispatcher 将 `/api/*` 交给 Hono，将页面请求交给 Start fetch，将 libp2p upgrade 交给 libp2p listener。不要分别调用 Hono `serve()` 和 Start 默认 `start`，否则会重复监听同一端口。
3. **不要把 libp2p sync 当成 Hono 普通 WebSocket 路由**：libp2p WebSocket transport 需要 multiaddr、PeerId、multistream/Noise/Yamux 握手；Hono WebSocket helper 适合浏览器管理通道，不等价于 libp2p transport。两者应使用不同 path/端口和独立 admission、drain 逻辑。
4. **Hono 与 Start 的 API 只共享协议 DTO 和领域 service**：管理 API 可以被 Start server routes 调用，但认证、租户授权、删除 job 和 sync repository 应位于独立 server-core；不要让网页组件直接依赖 Hono context，也不要从 Start route 直接操作桌面 renderer 或 Electron IPC。

### 对本仓库的影响

- `apps/desktop/api` 已经使用 Hono，可复用其 schema/error 风格，但该 app 仍包含 Electron contextual handlers，不能直接作为公网 server app。[`apps/desktop/api/src/server.ts`](../../apps/desktop/api/src/server.ts#L27-L58)
- `apps/sync-server` 可以采用独立 TanStack Start web entry，并依赖 `@memorilo/ui`；默认 `neubrutalism` 主题仍应在 web composition root 应用。
- 新 app 需要加入 pnpm workspace glob，并明确 `dev/build/start` 脚本。若采用 TanStack Start Node/Nitro 输出，生产启动命令通常是 `node .output/server/index.mjs`；若采用自定义 dispatcher，则需要自己维护 HTTP、upgrade 和 graceful shutdown 的顺序。

### 结论

Hono + TanStack Start 是适合服务器网页和管理面的一组组合；它们不会替代 libp2p peer。首版建议：一个 Node 部署单元内运行独立的 Start web/API 与 libp2p listener，开发阶段可分端口，生产由反向代理统一为一个外部端口；若要求同一个 Node listener 直接处理所有 upgrade，则需要自定义 libp2p listener/transport。

## 仅使用 Hono 的评估

也可以只使用 Hono，不引入 TanStack Start。Hono 官方 Node 适配器支持把 Fetch app 接入 Node HTTP server，并提供静态文件、JSX/SSR、streaming、WebSocket upgrade 和 graceful shutdown 能力。[Hono Node.js 文档](https://hono.dev/docs/getting-started/nodejs)；[Hono JSX](https://hono.dev/docs/guides/jsx)；[Hono WebSocket Helper](https://hono.dev/docs/helpers/websocket)

推荐的单 Hono 形态是：

```text
Hono app
  /              管理网页（React/Vite 构建产物或 Hono JSX/SSR）
  /api/*         账号、pairing、设备、策略、删除 job API
  /libp2p        不由 Hono WebSocket helper 处理；交给 libp2p WebSocket transport
```

### 优点

- 少一个 full-stack framework 和一套 server runtime，Node 进程、配置、日志和关闭流程更简单。
- 当前仓库已经在 `apps/desktop/api` 使用 Hono，可以复用路由组织、validator、错误响应和 RPC client 风格。[`apps/desktop/api/src/server.ts`](../../apps/desktop/api/src/server.ts#L1-L60)
- Hono 的 Web Standard Fetch API 与服务端领域 service 边界匹配，未来若部署到其他 Node/Bun/边缘 runtime，迁移成本较低。

### 代价与边界

- 只用 Hono 时，网页是自建的 React/Vite SPA，或采用 Hono JSX/SSR；不会得到 TanStack Start 的 file-based app/server routes、SSR 数据加载和 full-stack router 约定。若使用 React SPA，仍需单独引入 TanStack Router（当前桌面 renderer 已使用）。
- `@memorilo/ui` 的 StyleX 组件可以复用，但需要为 Hono 的 web entry 配置 React/StyleX/Vite；Hono 本身不会替代前端构建工具。
- Hono 的 WebSocket helper 不能承载 libp2p peer 协议。libp2p transport 需要自己持有 Node upgrade/listener，建议使用独立端口或由同一 Node composition root 明确分发 upgrade。
- Hono JSX 是服务端渲染能力，不等于 React 19 客户端组件体系；如果管理网页需要复杂交互，React/Vite SPA 通常比把所有页面写成 Hono JSX 更合适。

### 选择建议

- **服务器网页以管理面为主，页面数量有限，优先降低部署复杂度**：选 Hono-only，React/Vite 作为前端，Hono 提供 API 和静态资源。
- **需要大量 SSR 页面、复杂路由数据加载或希望采用 TanStack 全栈约定**：选 TanStack Start + Hono 分工。
- 无论选择哪种网页框架，libp2p peer、同步 repository、租户授权和 deletion workflow 都应放在独立 server-core，不能埋进 UI route handler。

对当前需求，我倾向首版使用 **Hono-only + React/Vite + `@memorilo/ui`**：网页只是账号、pairing、策略和数据删除控制面，复杂度低于引入完整 TanStack Start；保留 TanStack Router 作为可选的纯前端路由层即可。若后续需要公开内容型页面或大量 SSR，再迁移网页层，不影响 Hono API 和 libp2p server-core。

## Cloudflare Workers 部署评估

### 可以直接运行的部分

- Hono 官方提供 Cloudflare Workers 入口；Workers 原生支持 Fetch handler 和 `WebSocketPair`，可以承载管理 API、React/Vite 静态资源或 Hono JSX、普通浏览器 WebSocket。[Hono Cloudflare Workers](https://hono.dev/docs/getting-started/cloudflare-workers)；[Cloudflare Workers WebSockets](https://developers.cloudflare.com/workers/runtime-apis/websockets/)
- D1 提供 SQLite 语义的 Worker binding，支持 prepared statements、batch transaction 和 session；R2 是 S3-compatible object storage，适合附件和大对象；Durable Objects 提供按对象全局唯一、强一致、单线程协调和长连接 WebSocket，适合按账号/同步空间分片。[D1 Worker API](https://developers.cloudflare.com/d1/worker-api/d1-database/)；[R2 overview](https://developers.cloudflare.com/r2/)；[Workers storage options](https://developers.cloudflare.com/workers/platform/storage-options/)；[Durable Objects WebSockets](https://developers.cloudflare.com/durable-objects/best-practices/websockets/)
- 因此“独立服务端数据库 + 文件对象存储”的抽象可以支持 `SQLite/D1`、`PostgreSQL/Hyperdrive`、本地文件系统或 `S3/R2` 多种 adapter。需要注意 D1 不是服务器本地 SQLite 文件，事务、连接和迁移接口都必须通过 binding 适配。

### 不能直接复用的部分

- 当前 `@libp2p/websockets` Node listener 源码依赖 `node:http`、`node:https`、`node:net` 和 `ws`，会创建 Node HTTP/HTTPS listener；它不能直接打包成 Cloudflare Worker 的普通模块，也不能在 Worker 上监听 TCP/multiaddr。[`@libp2p/websockets` listener source](https://github.com/libp2p/js-libp2p/blob/main/packages/transport-websockets/src/listener.ts)
- Workers 的 WebSocket API 与 libp2p WebSocket transport 不是同一层：Worker 可以接受浏览器 WebSocket，但要作为 libp2p peer，需要实现 Worker-compatible transport/upgrader，并重新验证 Noise、Yamux、Identify、流多路复用和 backpressure。不能只把 Hono `upgradeWebSocket()` 接到现有 `/memorilo/sync/1`。
- Workers 没有持久本地文件系统；relay 的“不保存传输数据”可以用 Durable Object 的在线连接状态实现，但对象休眠/重启后不能恢复未持久化 payload，正好符合“relay 不支持离线恢复”的产品语义。authoritative 则必须把日志/元数据写入 D1 或 Durable Object storage，把资产写入 R2。
- 长连接和同步顺序控制更适合 Durable Object，而不是把所有状态放在无状态 Worker isolate。按 `accountId` 或 `syncNamespace` 路由到 Durable Object 可提供单租户串行化；跨对象查询、全局后台任务和大规模历史日志仍需 D1/队列/外部数据库设计。

### 推荐的跨运行时形态

```text
Node deployment:
  Hono + @memorilo/ui web/API
  @libp2p/websockets Node peer
  SQLite or PostgreSQL + filesystem/S3

Cloudflare deployment:
  Hono Worker + static assets
  Durable Object: account/session WebSocket coordination
  D1: tenant metadata and authoritative sync records
  R2: assets/snapshots/blobs
  (not current Node @libp2p/websockets peer)
```

结论：**Hono 应用可以支持 Cloudflare Workers；当前 libp2p sync-server 不能原样迁移为 Worker peer。** 如果必须让服务器在 Cloudflare 上仍是 libp2p peer，需要单独设计 Worker transport/upgrader，或保留一个 Node libp2p gateway，让 Worker 只负责网页/API/存储。首版最稳妥的是先把协议和 repository 做成 runtime-neutral，再提供 Node peer adapter 与 Cloudflare Worker/DO adapter 两个部署形态。

### 范围决策

本项目暂不支持 Cloudflare Workers。目标运行时收敛为 Node.js：Hono、当前 Node 版 libp2p WebSocket transport、独立 SQLite/PostgreSQL repository，以及本地文件系统或 S3 兼容对象存储。Cloudflare Worker/DO/D1/R2 只保留为调研结论，不进入首版协议或部署约束。
