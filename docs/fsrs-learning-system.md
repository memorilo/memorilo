# FSRS Learning System Design

本文记录 Memorilo 原生 FSRS 学习系统的已确认设计及当前实现合同。当前实现覆盖本地 schema、FSRS 调度与优化、Card reconciliation、队列、Undo/Reset、维护、同步 outbox 和 Electron IPC；Learning 评分 UI、CardSurface 以及远端同步服务不在本次实现范围。

相关调研：

- [Anki 队列排序与 sibling bury](./research/anki-queue-ordering-and-sibling-burying.md)
- [Anki 式复习数据同步](./research/anki-sync-review-data.md)
- [RemNote List/Set 与队列调度](./research/remnote-list-card-queue-scheduling.md)
- [Anki、RemNote 与 SuperMemo](./research/spaced-repetition-anki-remnote-supermemo.md)

## 1. 核心不变量

1. Card 内容属于 Note/Loro，学习数据库不复制题面或答案。
2. CardID 是 Card 学习进度的稳定身份；普通内容编辑不重置进度。
3. Review Event graph 是历史真源，Learning State 和 due 是 canonical scheduling lineage 的可重建投影。
4. 每个 Note 只有一个 effective Optimizer；多个 Note 可以共享同一个 Optimizer。
5. 没有显式 assignment 的 Note 使用 Global Optimizer。
6. Global Optimizer 不可删除、不可改名，但可编辑参数、优化参数和恢复默认设置。
7. Inactive Card 不进入任何普通 Learning UI，但历史在永久清理前继续参与训练。
8. Note 内容同步与个人学习同步是两个边界；协作者不共享个人学习进度。

## 2. 模块与所有权

packages/editor 继续拥有 Card Definition、CardID、投影和只读 editor surface。packages/editor-storage 拥有学习 schema、事务、历史重放、队列查询和同步持久化。Electron main process 组合 SQLite driver、FSRS engine 和 IPC；renderer 只消费公开 learning service，不直接执行 SQL 或 FSRS。

FSRS state transition 与 Queue Policy 在产品中同属 Optimizer，但实现必须拆成两个内部模块：

- Scheduler Config：FSRS weights、目标记忆率、learning/relearning steps、最大间隔和 interval fuzz。
- Queue Policy：new/review/interday 顺序、review sort、Sibling Bury、Study Day 和 learn-ahead。

## 3. Card 内容与只读显示

Learning 数据只保存 cardId、noteId、topicId、sourceBlockId 和可选 itemBlockId。显示时加载当前 Note，通过只读 editor projection 定位 Card：

    CardSurface({
      topic,
      focus: { cardId, itemBlockId },
      side: "question" | "answer",
      appearance: "preview" | "review",
    })

Editor Preview 使用当前 Topic 的 live adapter；Learning 使用 stored Note adapter。Note runtime pool 采用 LRU，最多保留 64 份 Note。同步、历史重放和参数优化直接查询 SQLite，不加载该缓存。

CardPreview 的手写富内容渲染最终应由 CardSurface 取代，Preview 与正式 Review 因而共享 editor 的不可编辑视觉投影。Rating、reveal、计时、Undo 和队列状态仍属于 CardSurface 外部。

Inactive Card 或 Inactive Target 在解析内容前就从查询结果过滤，不能因缓存命中而出现在 Learning 页面。

## 4. Review Target 模型

### 4.1 普通 Card

BasicCard、Cloze Card 和 Backward List/Set 各有一个 whole-card Review Target；一次 Review 产生一个 Again、Hard、Good 或 Easy。

### 4.2 Forward List/Set

Forward List/Set 的每个稳定 member block 是一个 item Review Target，身份由 cardId + itemBlockId 确定。完整 Card 是这些 Target 的组合展示，不额外接受一个总 Rating：

- ListCard 按顺序 reveal，并为每个 item 单独评分。
- SetCard 同时 reveal 所有 item，但仍为每个 item 记录标准四级 Rating。
- Again 立即令该 item 进入 Partial 模式。
- Hard 使用 FSRS 缩短该 item 间隔，但不进入 Partial。
- 困难 item 完成 learning/relearning steps 前，完整 List/Set 被 queue withholding。
- 所有 Partial item graduate 后，完整 Card 在所有 active item Target 的最早 due 到达时重新进入队列。

Partial Card 只是单一 item Target 的复习展示，不是新的 Card Definition，也不生成新的 CardID。member 从投影中消失时，该 item Target 变为 inactive；恢复相同 itemBlockId 后继续原进度。

### 4.3 Sibling Group

所有 sourceBlockId 相同的 Card 属于同一个 Sibling Group，包括 Bidirectional 产生的两个 Card。Bury 只改变当前 Study Day 的 queue eligibility，不修改 due、Learning State 或 Review Event。

短时 learning/relearning 和 Partial steps 对时间敏感，按 Anki 队列优先级先收集；较晚收集的 sibling 不反向 bury 已进入的短时学习 Target。

## 5. 逻辑数据库模型

所有学习数据与现有 Note 数据存放在同一个 SQLite 数据库，由 packages/editor-storage 管理。旧数据库不迁移；实现该 schema 前由用户手动删除旧数据库。

### 5.1 learning_optimizers

| 字段 | 约束/含义 |
| --- | --- |
| optimizer_id | UUID 主键 |
| name | active 普通 Optimizer 内唯一 |
| is_global | 每个账户恰好一条；固定 identity |
| status | active 或 archived |
| current_revision_id | 指向当前配置快照 |
| created_at / updated_at | 审计与同步冲突处理 |
| sync_sequence | 最近服务器确认序号 |

Global 行允许修改 current_revision_id，不允许改 name、status 或 identity。普通 Optimizer 的删除是 archived 状态转换，不是立即 DELETE。

### 5.2 learning_optimizer_revisions

每次编辑、参数优化或恢复默认设置都创建不可变 revision：

| 字段 | 含义 |
| --- | --- |
| revision_id / optimizer_id | revision identity 和 owner |
| desired_retention | 目标记忆率 |
| fsrs_parameters | 版本化 FSRS weights |
| learning_steps / relearning_steps | 固定短时 steps |
| maximum_interval / enable_fuzz | 长期间隔政策 |
| queue_policy | 版本化的 Queue Policy |
| fsrs_version | 解释参数和重放所需的算法版本 |
| created_at / sync_sequence | 审计与同步 |

Review Event 不以外键绑定历史 revision。参数变化后的重放必须使用 Note 当前 effective Optimizer 的 current revision 解释全部有效 Rating；这正是“从历史重新计算”，而不是让旧事件永远锁定旧参数。旧 revision 只用于审计、并发编辑和回滚当前配置。

### 5.3 note_optimizer_assignments

| 字段 | 约束/含义 |
| --- | --- |
| note_id | 每个账户内唯一 |
| optimizer_id | active Optimizer |
| updated_at / sync_sequence | last-write-wins 的同步元数据 |

没有 assignment row 即使用 Global。普通 Optimizer 归档时，受影响 row 在同一事务中改为显式 Global assignment，便于同步删除操作的结果。

### 5.4 learning_cards

| 字段 | 约束/含义 |
| --- | --- |
| card_id | 来自 editor projection 的稳定 CardID |
| note_id / topic_id | 内容定位与训练分组 |
| source_block_id | Sibling Group identity |
| topic_order / source_order | 不含内容的投影顺序，用于 New gather |
| kind / direction | 不含内容的投影类型元数据 |
| active | 当前是否仍由 Note 投影 |
| first_seen_at / last_seen_at / inactive_at | reconciliation 审计 |
| sync_sequence | 同步元数据 |

删除内容只把 active 设为 false。禁止以 replaceTopicCards 的“集合中不存在”为理由级联删除历史。

### 5.5 learning_targets

| 字段 | 约束/含义 |
| --- | --- |
| target_id | 稳定 UUID 或确定性 identity |
| card_id | 所属 CardID |
| target_kind | whole 或 item |
| item_block_id | item Target 必填，whole 为 null |
| target_order | List/Set member 的投影顺序 |
| active | 当前是否仍由 Card 投影 |
| partial_active | item 是否处于 Partial 补救流程 |

唯一约束覆盖 whole(card_id) 和 item(card_id, item_block_id)，确保重投影不会创建第二份进度。

### 5.6 review_events

Review Event 是 append-only 事实：

| 字段 | 含义 |
| --- | --- |
| event_id | UUIDv7，幂等 identity |
| account_id / device_id / device_sequence | 离线来源 |
| server_sequence | 服务器确认后填写 |
| target_id / card_id / note_id | 重放与训练索引 |
| event_kind | rating、undo 或 reset |
| rating | Rating event 的四级结果 |
| occurred_at | 用户操作发生时间 |
| response_millis | 可选答题耗时 |
| scheduled_days / elapsed_days | rating 当时的审计数据 |
| base_event_id | 回答时所基于的 canonical Rating；用于识别离线并发分支 |
| result_state | 回答当时生成的完整 FSRS state/due 审计快照 |
| undoes_event_id | Undo event 引用的 Rating event |
| reset_epoch | Reset 的新 epoch |
| fsrs_version | 创建 event 的算法契约版本 |

Undo 和 Reset 不 UPDATE/DELETE 旧 event。有效历史由事件集合推导：

- 被有效 Undo event 引用的 Rating 不参与当前重放或优化。
- 当前 Reset epoch 之前的 Rating 保留审计，但不参与当前重放或优化。
- 同一 base_event_id 产生多个离线 Rating 时形成竞争分支，不把它们伪装成连续复习。
- 分支 winner 按 occurred_at、event_id 确定；server_sequence 只用于同步水位。

每个 Target 的 Rating event 形成以 base_event_id 连接的 graph。Learning State 沿 canonical lineage 重建：每个 fork 只选择 winner 及其后继，其他分支永久保留用于审计和 Optimizer 训练，但不作为下一次调度的前置 Rating。

### 5.7 learning_states

每个 active/inactive Target 最多一行物化状态：

| 字段 | 含义 |
| --- | --- |
| target_id | 主键 |
| phase | new、learning、review、relearning |
| due_at | 精确 UTC due |
| stability / difficulty | FSRS memory state |
| step_index | learning/relearning step |
| reps / lapses | 当前 reset epoch 的统计 |
| last_review_at | 最近有效 Rating |
| optimizer_revision_id | 本次物化所用 current revision |
| winning_event_id | 当前 canonical lineage 的 leaf |
| replayed_through_event_id | 增量校验 |
| state_hash | sanity check |

该表可丢弃并从 review_events 重建。Inactive 不等于无 Learning State；只有永久维护才删除。

### 5.8 queue_exclusions

Bury、Partial withholding 和 Study Day 临时过滤不混入 FSRS state。queue_exclusions 保存或投影：

- target/card/sibling group；
- reason：sibling_bury、partial_parent、manual_skip；
- until study day 或精确时间；
- 产生该 exclusion 的 Review Event；
- sync sequence。

可从 Review Event 和 revision 重建的 exclusion 仍允许物化，以保证查询性能。Skip 若以后实现，不是第五种 Rating。

### 5.9 learning_sync_state 与 tombstones

客户端保存 device identity、last server sequence、schema generation、full-sync-required 和最近 sanity hash。永久清理不为每条历史制造海量墓碑，而是发布按 Card/Optimizer scope 的 purge tombstone 与 generation；active List/Set 中单独消失的 item 使用 Target scope tombstone。所有已知设备确认 prune watermark 后，服务器和客户端才可丢弃对应历史与 tombstone。

## 6. 写入与重放事务

### 6.1 Card reconciliation

保存/索引 Note 后，从当前 Topic 投影 Card identities：

1. upsert 当前 Card 和 Target identity；
2. 将相同 CardID/Target 重新设为 active；
3. 将本次 scope 中消失的 identity 标为 inactive；
4. 不删除 Review Event 或 Learning State；
5. 不加载其他 Note。

内容编辑、移动和改写不重置进度。只有稳定 identity 真正变化时才形成新的学习对象。

### 6.2 Rating

一次 Rating 必须是单一 SQLite transaction：

1. 校验 Target active 且可评分；
2. 以当前 winning_event_id 作为 base_event_id，插入 Rating event 和 result_state；
3. 读取 Note 当前 effective Optimizer revision；
4. 若 state 的 optimizer_revision_id 已过期，从当前 Reset epoch 的 canonical scheduling lineage 重放；否则允许增量 state transition；
5. 更新 Learning State、Partial 状态和 queue exclusions；
6. 提交后返回新的 due/interval 与 Undo token。

这样普通 Optimizer 参数变化或 assignment 变化不会立刻改变 due；该 Target 下一次评分时，会先用新 revision 从历史重建，再加入本次 Rating。

### 6.3 Undo

Undo 默认只暴露当前 Target canonical lineage 的最新 Rating。事务追加 Undo event，随后从剩余 graph 重新选择 canonical lineage，并重建 Target state、Partial gate、Sibling Bury 和 session counters。若同步后出现以被撤销 event 为 base 的后继，这些依赖分支不进入当前调度 lineage，但事件本身仍保留审计。

### 6.4 Reset Scheduling

Reset 追加新的 reset epoch，保留所有旧 event；目标立即回到 new/初始 learning 状态。普通内容编辑绝不隐式触发 Reset。未来优化训练只查询当前 epoch 的有效 Rating。

## 7. Optimizer 操作

### 7.1 普通编辑、切换与恢复默认

编辑目标记忆率、队列政策或恢复默认设置都创建新 revision。普通 Note assignment 切换只更新 assignment；现有 due 保持不变，Target 在下一次 Rating 时按新 revision 全历史重放。

Global Optimizer 使用完全相同的 revision 机制，因此“默认”只表示 fixed fallback identity，不表示只读配置。

### 7.2 参数优化

训练集按当前 assignment 现算：

1. 找到当前分配给 Optimizer 的所有 Note；
2. 读取这些 Note 的 active 和 inactive Card/Target 的全部有效 Rating，包括离线竞争分支；
3. 排除被 Undo 的 Rating 和当前 Reset epoch 之前的 Rating；
4. 不加载 Note 内容，也不经过 64-Note LRU；
5. 生成新的 Optimizer revision。

训练数据按 occurred_at 形成每个 Target 的观测时间线，因此每条未撤销 Rating 都只进入一次样本；canonical lineage 只限制调度重放，不删除竞争分支的个人记忆数据。

参数优化提供 Reschedule now switch：

- 关闭：只切换 current revision，不改任何现有 due；各 Target 在下次 Rating 时全历史重放。
- 开启：同一作业批量重放所有已分配 Note 的 Target，立即更新 active Target 的 due/queue；inactive Target 也更新 Learning State，但不进队列。

### 7.3 删除普通 Optimizer

删除确认 Dialog 必须说明使用它的 Note 数量。确认后在一个可恢复事务/作业中：

1. 将 Optimizer 标为 archived；
2. 把所有 assignment 切到 Global；
3. 使用 Global current revision 从各 Target 当前 Reset epoch 的历史立即重建 Learning State 和 due；
4. 更新队列；
5. 保留原 Optimizer 和 revision，等待数据库维护。

这是普通 assignment 切换“不立即改 due”的唯一业务例外。归档完成后 Optimizer 不可再分配。

## 8. Queue Policy

首版默认值：

| Policy | Default |
| --- | --- |
| New gather | Source Block order |
| New/review | Mixed |
| Interday learning | Before review |
| Review sort | Due date, then deterministic random |
| Bury new siblings | On |
| Bury review siblings | On |
| Bury interday siblings | On |
| Interval fuzz | On |
| Study Day boundary | Local 04:00 |

队列收集优先级遵循 Anki：intraday learning/relearning、interday learning、review、new。随机与 fuzz 必须使用可重放的 seed（Target/Event/Study Day），避免同一历史在不同设备重建出不同 due。

Queue Policy 属于 Optimizer revision，多个 Note 共享 Optimizer 时共享同一政策。Bury 范围固定为 sourceBlockId，不扩大到整个 Memorilo Note。

## 9. Anki 式个人同步

学习数据按账户跨设备同步，不进入 Note 的 LoroDoc。协议采用 Anki 的主要机制：

1. 首次 Upload/Download 单向选择；
2. 正常同步按服务器单调 sequence 增量分块；
3. Review Event 按 eventId 做集合合并；
4. 同一 base 的两个离线 Rating 都保留为分支，当前 state 沿最近回答分支的 canonical lineage 重放；
5. Optimizer current revision 和 assignment 的并发编辑按 server sequence last-write-wins，旧 revision 保留；
6. schema/sanity 不兼容时要求 full sync；
7. Note 内容和媒体保持独立同步。

同步前比较设备与服务器时钟，偏差超过 5 分钟时停止，避免“最近回答”被错误时钟破坏。eventId 是相同 occurred_at 的稳定 tie-break；server sequence 只作为同步水位，不把较早但晚上传的离线评分变成最新评分。

Anki 本地删除 revlog 的 Undo 无法同步；Memorilo 使用 append-only Undo event，这是为满足“保留历史 + 跨设备撤销”所做的有意调整。

## 10. 数据库维护

Settings 的 Maintain Database 是显式破坏性操作，执行前必须显示预计删除的 inactive Card/Target、Review Event 和 archived Optimizer 数量。

在支持同步后，维护必须先达到 clean sync 和 prune watermark；离线或存在未确认设备时不允许假装完成账户级永久删除。确认后按 scope：

1. 删除 inactive Card、其 Target，以及 active List/Set 中单独 inactive 的 item Target；
2. 删除这些 Target 的 Review Event、Learning State 和 queue exclusions；
3. 删除 archived Optimizer 及不再被 current pointer 使用的 revision；
4. 写入 purge tombstone/generation，防止旧设备复活数据；
5. 检查外键和 sanity counts；
6. 执行 VACUUM。

Active Card 的 Review Event 不能因为其历史 Optimizer 已归档而删除；Review Event 不外键绑定 Optimizer revision，因此清理 Optimizer 不破坏活动历史。

实现阶段必须为维护路径添加严格测试，至少覆盖：

- inactive/active 边界与相同 CardID 恢复；
- 只删除目标 scope，活动历史零丢失；
- archived Optimizer 被使用时切 Global 并完成重放；
- 事务中途失败完全回滚；
- Undo/Reset 后删除样本集合正确；
- 离线设备同步后不会复活已 purge 数据；
- tombstone/prune watermark 未满足时拒绝永久清理；
- foreign_key_check、sanity counts 与 VACUUM 后可重新打开数据库。

## 11. 实现顺序

1. 在 packages/editor-storage 中加入 schema、repository 和 projection reconciliation。
2. 接入经过验证的 FSRS engine，完成 Rating、Replay、Undo 和 Reset transaction。
3. 实现 Optimizer revision、assignment、训练与可选立即重调度。
4. 实现 Queue Policy、Partial gate 和 Sibling Bury。
5. 以 CardSurface 替换 Preview 的重复内容渲染，并加入 64-Note LRU。
6. 实现个人学习同步和 full-sync recovery。
7. 最后开放数据库维护入口及其严格测试。

本设计不要求为旧数据库写迁移或向前兼容代码。若实现时需要改变这一点，必须先询问用户。
