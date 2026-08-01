# Anki 复习数据同步机制调研

调研日期：2026-08-01

## 范围与来源

本文只研究与 Memorilo FSRS 学习数据有关的 Anki 同步语义：增量与全量同步、同卡离线评分冲突、复习历史、删除标记、Undo、时钟偏差、schema 变化，以及媒体同步边界。结论只使用 Anki 官方手册与 `ankitects/anki` 官方源码。

源码引用固定在 Anki 提交 [`dc2998fbc1079e392c30b9103c8cc862a4f7c35d`](https://github.com/ankitects/anki/tree/dc2998fbc1079e392c30b9103c8cc862a4f7c35d)。

## 结论摘要

1. Anki 的常规同步是按 server update sequence number（USN）交换变更，不是每次上传整个数据库；本地待同步对象使用 `usn = -1`，服务端按递增 USN 提供上次水位之后的变更。
2. 同一张 Card 在两个设备离线评分时，Anki **保留两条 review history**，但 Card 的当前调度状态采用“最近一次回答后的状态”。它不会在同步时把两次并发评分依次重放成一个新状态。
3. `revlog` 以唯一 ID 做幂等追加；Card、Note 和配置等可变对象则比较 modification time，采用较新的对象。复习事实与当前投影是两条不同的合并路径。
4. Anki 的 Card/Note/Deck 删除通过 `graves` tombstone 同步；但 revlog 删除不能同步。Anki Undo 会直接删除本地 revlog，且开始常规同步时会清空 Undo 队列，因此这个 Undo 机制不能满足 Memorilo 已确定的“撤销也要同步、历史可审计”要求。
5. schema timestamp 不一致、首次同步、完整性问题或不兼容结构变更会要求单向 full upload/download；full sync 传输并替换完整 collection SQLite 文件。
6. Collection 与 media 是独立同步流程。即使 collection 做单向 full sync，media 仍按自身变更日志双向合并。
7. Anki 在同步握手时比较客户端和服务端当前时间，偏差超过 300 秒就中止。这个限制保护依赖时间戳的冲突决议与复习时间线。

## 1. 同步所有权与范围

Anki 的同步单位是一个 profile 对应一个 AnkiWeb account；同一个用户可以在多个设备上使用该账户，不同用户应使用不同账户。官方明确警告多个用户/profile 共用一个账户会丢失数据。[官方 FAQ：Synchronizing multiple profiles](https://github.com/ankitects/anki/blob/dc2998fbc1079e392c30b9103c8cc862a4f7c35d/docs-site/faqs/synchronizing-multiple-profiles.mdx#L5-L11)

对 Memorilo 的直接借鉴是：

- Learning State、Review Event、Optimizer 和 Note-to-Optimizer assignment 应属于**个人账户学习域**，在该用户的设备间同步；
- 它们不应进入协作 Note 的共享 CRDT，也不应让 Note 协作者看到或共同修改；
- Note/Topic/Block 只提供内容身份，个人学习域通过稳定 ID 引用内容。

这比把学习状态共享给协作者更接近 Anki 的用户模型，也避免一个人的 Rating 改变另一个人的 due date。

## 2. 常规增量同步

Anki 为同步对象保存 USN。客户端本地新变更记为 `-1`；服务端对象使用递增 USN，查询时客户端取 `usn = -1` 的本地待上传对象，服务端取 `usn >= lastSyncedUsn` 的对象。[`storage/sync.rs`](https://github.com/ankitects/anki/blob/dc2998fbc1079e392c30b9103c8cc862a4f7c35d/rslib/src/storage/sync.rs#L11-L73)

常规同步在一个数据库事务中依次处理：删除标记、非分块配置对象、服务端到客户端的 Card/Note/revlog chunks、客户端到服务端的 chunks、sanity check 和 finalize；失败时回滚本地事务并 abort 服务端 session。[`collection/normal.rs`](https://github.com/ankitects/anki/blob/dc2998fbc1079e392c30b9103c8cc862a4f7c35d/rslib/src/sync/collection/normal.rs#L80-L140)

Anki 的 chunk 同时传输 Cards、Notes 和 revlog，默认每批最多 250 个对象。上传成功后，客户端把这些对象的 `-1` USN 改成此次服务端 USN。[`collection/chunks.rs`](https://github.com/ankitects/anki/blob/dc2998fbc1079e392c30b9103c8cc862a4f7c35d/rslib/src/sync/collection/chunks.rs#L90-L170) [`storage/sync.rs`](https://github.com/ankitects/anki/blob/dc2998fbc1079e392c30b9103c8cc862a4f7c35d/rslib/src/storage/sync.rs#L48-L61)

### 对 Memorilo 的建议

学习同步采用同类的 server cursor 模型：

```text
每个账户：serverRevision 单调递增
每个设备：lastPulledRevision
每个本地 mutation：pending，直到服务端确认 revision
拉取：revision > lastPulledRevision，分页
推送：按 mutationId 幂等接收
```

一次同步应在本地事务内完成 `pull -> merge -> push -> acknowledge -> rebuild affected projections -> advance cursor`。网络重试必须允许重复发送同一 mutation，不得重复生成 Review Event。

## 3. 同卡离线评分的冲突语义

Anki 官方手册给出的明确契约是：如果同一张 Card 在两个位置都被复习，两条复习都会出现在 revision history 中，而 Card 保留为“最近回答时”的状态。[官方手册：Conflicts](https://github.com/ankitects/anki/blob/dc2998fbc1079e392c30b9103c8cc862a4f7c35d/docs-site/manual/syncing.mdx#L74-L91)

源码对应两条独立路径：

- revlog 逐条 `INSERT OR IGNORE`，以 review ID 去重，不覆盖另一条历史；[`collection/chunks.rs`](https://github.com/ankitects/anki/blob/dc2998fbc1079e392c30b9103c8cc862a4f7c35d/rslib/src/sync/collection/chunks.rs#L155-L173) [`storage/revlog/add.sql`](https://github.com/ankitects/anki/blob/dc2998fbc1079e392c30b9103c8cc862a4f7c35d/rslib/src/storage/revlog/add.sql)
- Card 是可变的 materialized state；当本地 Card 也有待同步修改时，只有远端 `mtime` 更大才覆盖本地 Card。[`collection/chunks.rs`](https://github.com/ankitects/anki/blob/dc2998fbc1079e392c30b9103c8cc862a4f7c35d/rslib/src/sync/collection/chunks.rs#L175-L216)

因此，Anki 的准确模型是：

```text
review history = 两端历史的并集
current card state = 最近回答产生的 Card 状态
```

它不是：

```text
合并历史 -> 按时间重放全部并发 Rating -> 得到 current state
```

### 与 Memorilo 历史重放要求的冲突

Memorilo 已确定 Optimizer 参数变化后要从历史重新生成 Learning State。若两个设备从同一个 base state 离线评分，Anki 的“保留两条 history + 最近 state 胜出”没有定义未来重放时应把两条评分视为：

- 两次先后发生的连续复习；还是
- 两个竞争分支，其中只有较新的分支影响调度；还是
- 两条都参与优化训练，但只有 winner 进入单 Card 的 scheduling lineage。

这是 Anki 参考无法替 Memorilo 回答的领域问题。为了不隐藏冲突，Review Event 至少应保存 `eventId`、`deviceId`、`answeredAt`、`baseStateRevision` 和 `resultStateRevision`。这样同步后能识别“同一 base 的两个回答”，而不是误认为普通连续复习。

建议采用最接近 Anki 的规则：**两条 Event 永久保留并都可参与统计/优化；当前 Learning State 采用确定性较新的 Event 结果；Card 历史重放只沿 canonical parent lineage，竞争分支不作为下一次调度的前置复习。** 确定性比较键应为 `(answeredAt, eventId)`，不能只比较秒级时间。

## 4. Review Event、Learning State 与幂等 ID

Anki revlog 的主键通常是回答发生时的毫秒时间戳；本地插入若发生 ID 冲突，会生成一个新 ID，同步合并则只接受唯一 ID。[`scheduler/answering/revlog.rs`](https://github.com/ankitects/anki/blob/dc2998fbc1079e392c30b9103c8cc862a4f7c35d/rslib/src/scheduler/answering/revlog.rs#L31-L53) [`storage/revlog/mod.rs`](https://github.com/ankitects/anki/blob/dc2998fbc1079e392c30b9103c8cc862a4f7c35d/rslib/src/storage/revlog/mod.rs#L63-L94)

Memorilo 不应把 wall-clock timestamp 同时当唯一 ID 和冲突顺序。建议：

- `eventId`: UUIDv7/ULID 等跨设备唯一 ID，用于幂等和稳定引用；
- `answeredAt`: 实际回答时间，用于 FSRS elapsed time；
- `deviceId + deviceSequence`: 设备内因果顺序和诊断；
- `serverRevision`: 服务端确认后分配，只用于增量同步水位，不改写回答时间；
- Learning State 是可重建投影，不是唯一事实来源，但应同步其 winning revision 以快速收敛并检测重建差异。

服务端必须对 `eventId` 建唯一约束。重试同一 Rating 只能返回已存在结果，不能产生第二条复习记录。

## 5. Optimizer 与 assignment 冲突

Anki 的 deck config 与 Memorilo 的 FSRS Optimizer 最接近：同一个配置对象可被多个 Deck 使用，作为独立同步对象传输；合并时相同 ID 比较 `mtime`，较新的整个配置对象获胜。[`collection/changes.rs`](https://github.com/ankitects/anki/blob/dc2998fbc1079e392c30b9103c8cc862a4f7c35d/rslib/src/sync/collection/changes.rs#L181-L200) [`collection/changes.rs`](https://github.com/ankitects/anki/blob/dc2998fbc1079e392c30b9103c8cc862a4f7c35d/rslib/src/sync/collection/changes.rs#L291-L305)

Memorilo 可采用对象级 last-write-wins，但应让 tie-breaker 与设备时钟无关：

- Optimizer 设置作为一个有 `optimizerId` 和 `revision` 的整体对象同步；参数、目标记忆率、steps 和 queue policy 一次原子提交；
- Note assignment 作为独立的个人学习域记录同步，而不是写入共享 Note 内容；
- 同一 Optimizer 的并发修改由较大的服务端 revision 获胜；客户端提交携带 base revision，发现并发覆盖时可提示，但同步必须确定性收敛；
- archive 是 tombstone 状态，不是物理删除；archive 与并发 assignment 合并后，任何指向 archived Optimizer 的 assignment 都自动修复到 Global FSRS Optimizer，并按已确定规则重建调度；
- Global FSRS Optimizer 使用固定 ID，永远不可 archive；“恢复默认”是一次普通的可同步设置 revision，不是删除再创建。

纯用本地 `updatedAt` 比较虽然更接近当前 Anki 源码，但会把时钟偏差直接变成配置丢失，因此不建议照搬。

## 6. 删除、inactive 与 tombstone

Anki 对 Card、Note 和 Deck 的删除写入 `graves`。同步先交换 graves，再删除对应本地对象并保存 grave，避免另一设备的旧对象复活。[`collection/start.rs`](https://github.com/ankitects/anki/blob/dc2998fbc1079e392c30b9103c8cc862a4f7c35d/rslib/src/sync/collection/start.rs#L18-L73) [`collection/graves.rs`](https://github.com/ankitects/anki/blob/dc2998fbc1079e392c30b9103c8cc862a4f7c35d/rslib/src/sync/collection/graves.rs#L16-L61)

Memorilo 的语义不同：内容消失时 Card 先变成 Inactive Card，仍保留历史、Learning State 并参与 Optimizer 训练。因此建议分两层：

1. `inactive` 是 Card 投影上的可同步状态，带 revision；同一 CardID 再次从内容投影出现时恢复 active，不重置进度。
2. “维护数据库”才产生永久删除 tombstone，删除 Card、Review Target、Review Event、Learning State 和相关 projection。tombstone 必须先同步到服务端并覆盖所有旧 revision，之后才允许服务端按明确的设备保留期/全设备水位做垃圾回收。

仅在本机 `VACUUM` 后忘记 tombstone 会让离线旧设备重新上传已永久清理的数据。实现维护功能时，必须测试“设备 A 清理、设备 B 长期离线后重连”的场景。

Archived FSRS Optimizer 同理：archive 先同步；维护操作物理删除时仍需保留同步 tombstone，直到服务端确认不会被旧设备复活。

## 7. Undo 与 Reset

Anki Undo 会直接删除刚添加的 revlog，并恢复之前的 Card；源码明确注释“Anki can not sync revlog deletions”。同时，常规同步开始前会丢弃 Undo 和 study queues。[`revlog/undo.rs`](https://github.com/ankitects/anki/blob/dc2998fbc1079e392c30b9103c8cc862a4f7c35d/rslib/src/revlog/undo.rs#L7-L42) [`storage/revlog/mod.rs`](https://github.com/ankitects/anki/blob/dc2998fbc1079e392c30b9103c8cc862a4f7c35d/rslib/src/storage/revlog/mod.rs#L106-L112) [`collection/normal.rs`](https://github.com/ankitects/anki/blob/dc2998fbc1079e392c30b9103c8cc862a4f7c35d/rslib/src/sync/collection/normal.rs#L82-L90)

Memorilo 已要求历史可审计且撤销需要同步，所以不能照搬删除语义：

- Undo 追加一个引用 `eventId` 的 `ReviewReverted` mutation；原 Review Event 不修改、不删除；
- 重复 Undo、跨设备收到同一 revert 必须幂等；
- 如果被撤销 Event 已有后续 canonical Event，需从受影响点重建 Learning State；
- Reset Scheduling 也应是追加事件，形成新的 scheduling epoch；此前历史继续保留，但从后续 scheduling 与 optimization 样本中排除；
- Undo Reset 可通过追加 revert 指向 Reset Event，不应删除 reset marker。

“撤销最新评分”中的“最新”必须以当前 target 的 canonical、未撤销 Event 为准，而不是设备本地最后插入的任意行。

## 8. Full sync 与 schema 变化

Anki 比较 collection modified timestamp 与 schema timestamp：内容时间相同则无需同步；schema 相同但内容不同则常规同步；schema 不同则要求 full sync。[`collection/meta.rs`](https://github.com/ankitects/anki/blob/dc2998fbc1079e392c30b9103c8cc862a4f7c35d/rslib/src/sync/collection/meta.rs#L59-L89) 本地也会在“schema 自上次同步后变化”时直接报告 Full Sync。[`collection/status.rs`](https://github.com/ankitects/anki/blob/dc2998fbc1079e392c30b9103c8cc862a4f7c35d/rslib/src/sync/collection/status.rs#L13-L31)

Full upload 读取并发送完整 collection SQLite 文件，服务端校验后原子替换；full download 下载、校验并原子替换本地 collection。[`collection/upload.rs`](https://github.com/ankitects/anki/blob/dc2998fbc1079e392c30b9103c8cc862a4f7c35d/rslib/src/sync/collection/upload.rs#L34-L101) [`collection/download.rs`](https://github.com/ankitects/anki/blob/dc2998fbc1079e392c30b9103c8cc862a4f7c35d/rslib/src/sync/collection/download.rs#L20-L62)

官方手册同时说明 full/one-way sync 不能合并两端变更，用户必须选择保留本地或服务端副本；不兼容的 Note 格式变化是典型触发条件。[官方手册：Conflicts](https://github.com/ankitects/anki/blob/dc2998fbc1079e392c30b9103c8cc862a4f7c35d/docs-site/manual/syncing.mdx#L85-L111)

对 Memorilo：

- 首版新数据库可以直接以新的 learning schema 作为基线，符合“不迁移旧库”的当前决定；
- 从产品上线开始仍需保存 `syncProtocolVersion` 与 `learningSchemaVersion`；
- 向后兼容的字段新增可继续增量同步；无法被旧客户端安全忽略的语义变化必须阻止旧客户端写入，并要求升级或 full snapshot；
- full snapshot 是灾难恢复和协议升级路径，不应成为普通多设备冲突的解决办法。

## 9. 时钟偏差

Anki 在 meta 握手时取客户端和服务端当前时间，偏差绝对值超过 300 秒就返回 `ClockIncorrect` 并中止同步。[`collection/status.rs`](https://github.com/ankitects/anki/blob/dc2998fbc1079e392c30b9103c8cc862a4f7c35d/rslib/src/sync/collection/status.rs#L42-L61)

Memorilo 的 `answeredAt` 直接影响 FSRS elapsed time，不能完全改用 server receipt time；但配置冲突和增量水位也不应依赖 wall clock。建议：

- 同步时检测偏差；超过 5 分钟阻止产生依赖错误时间的合并结果并提示校准系统时间；
- 保留客户端 `answeredAt` 和服务端 `receivedAt`，便于诊断；
- serverRevision 决定同步顺序，`eventId` 决定平局，wall clock 只表达实际复习时间；
- 对明显倒退的同设备时间、未来时间和负 elapsed interval 做校验，不静默改写历史。

## 10. Media 必须分离

Anki 官方手册明确：collection 的单向 full sync 不影响 media，media 始终按自己的变更合并。[官方手册：Media / Conflicts](https://github.com/ankitects/anki/blob/dc2998fbc1079e392c30b9103c8cc862a4f7c35d/docs-site/manual/syncing.mdx#L50-L68) [`syncing.mdx`](https://github.com/ankitects/anki/blob/dc2998fbc1079e392c30b9103c8cc862a4f7c35d/docs-site/manual/syncing.mdx#L113-L123)

源码中 MediaSyncer 有独立的 media database、`last_sync_usn`、pending uploads、分批下载/上传与 finalize 流程。[`media/syncer.rs`](https://github.com/ankitects/anki/blob/dc2998fbc1079e392c30b9103c8cc862a4f7c35d/rslib/src/sync/media/syncer.rs#L40-L140)

Memorilo Learning sync 不应传 Note 正文或媒体 blob。Review Event 只保存 `noteId/topicId/sourceBlockId/cardId/reviewTargetId` 等稳定引用；只读 Editor 展示时再由内容同步层和 Note LRU pool 解析当前内容。这样 learning full sync 不会覆盖协作内容，内容/媒体同步失败也不会破坏复习历史。

## 11. 推荐的同步不变量

实现前应把以下规则写成数据库约束与同步测试契约：

1. 同一 `eventId` 无论重试多少次，只存在一条 Review Event。
2. 两个设备离线评分同一 Review Target 后，两条 Event 都保留，所有设备得到同一个 canonical winner。
3. Undo/Reset 通过追加 mutation 收敛，不依赖删除 revlog。
4. Inactive Card 不进队列、不渲染，但其 history 在维护前继续同步和参与 Optimizer 训练。
5. 永久维护删除后，离线旧设备不能复活 Card、Event 或 Archived Optimizer。
6. Optimizer 与 Note assignment 的并发修改在所有设备确定性收敛；assignment 不得指向 archived/missing Optimizer。
7. Global FSRS Optimizer 永远存在、固定 ID、可编辑、不可 archive。
8. sync cursor 只在完整事务成功后前移；中断和重试不能丢 Event 或重复评分。
9. full learning sync 不覆盖协作 Note 内容；media 同步与 learning/collection 同步互不改变彼此的冲突决议。
10. Learning State 可从 canonical、未撤销、当前 scheduling epoch 的 Review Events 重建；缓存投影与重建结果不一致时以事件重建为准并报告完整性问题。

## 12. Memorilo 已采用的并发分支规则

Anki 已明确同卡离线复习的 UI 结果，但没有提供“未来用新 FSRS 参数重放并发历史”的契约。根据“冲突行为参考 Anki”和“全部有效个人记忆数据继续参与优化”的产品决定，Memorilo 采用：

- 同一 base state 的并发 Rating 全部保留；
- scheduling replay 只沿 deterministic canonical lineage，不把并发分支伪装成连续复习；
- 参数优化按 occurredAt 使用所有未撤销 Rating，每条 Event 只作为一次观测进入训练；
- Learning State 与训练样本因此是两个明确投影，不能共用一个“只取 winner”的过滤器。

完整字段与事务规则见 [FSRS Learning System Design](../fsrs-learning-system.md)。
