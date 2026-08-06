# FSRS Learning System Design

本文记录 Memorilo 原生 FSRS 学习系统的已确认设计及当前实现合同。当前实现覆盖本地 schema、FSRS 调度与优化、Card reconciliation、队列、Undo/Reset、维护、同步 outbox、Electron IPC，以及基于只读 CardSurface 的 Learning 评分 UI；远端同步服务仍不在当前实现范围。

相关调研：

- [Anki 队列排序与 sibling bury](./research/anki-queue-ordering-and-sibling-burying.md)
- [Anki 式复习数据同步](./research/anki-sync-review-data.md)
- [RemNote List/Set 两层复习调度](./research/remnote-list-set-review-scheduling.md)
- [RemNote List/Set 与队列调度](./research/remnote-list-card-queue-scheduling.md)
- [RemNote 每日新卡、复习目标与队列限制](./research/remnote-daily-review-limits.md)
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
9. Optimizer 只拥有 FSRS 调度参数；全局 Flashcards 设置拥有队列政策，Goals & Streaks 设置拥有每日目标。
10. 每日目标是完成进度而不是 due review 的硬上限；新卡和到期复习使用独立入口。

## 2. 模块与所有权

packages/editor 继续拥有 Card Definition、CardID、投影和只读 editor surface。packages/editor-storage 拥有学习 schema、事务、历史重放、队列查询和同步持久化。Electron main process 组合 SQLite driver、FSRS engine、当前 Desktop Configuration 和 IPC；renderer 只消费公开 learning service，不直接执行 SQL 或 FSRS。

学习配置按 RemNote 的产品边界分成三个模块：

- Optimizer / Scheduler Config：FSRS weights、目标记忆率、learning/relearning steps、最大间隔和 interval fuzz，按 Note assignment 解析。
- Flashcards / Queue Policy：new/review/interday 顺序、review sort、Sibling Bury、Study Day、learn-ahead 和每日新卡引入上限，全局生效。
- Goals & Streaks：Daily Goal 模式和固定目标值，全局生效，不改变 Card due 或 queue eligibility。

editor-storage 接收一个只读配置 provider，每次计算进度或选择下一张 Card 时读取最新 snapshot。保存设置不创建或持久化完整队列；已经展示的当前 Card 保持稳定，下一次选择立即使用新设置。

## 3. Card 内容与只读显示

Learning 数据只保存 cardId、noteId、topicId、sourceBlockId 和可选 itemBlockId。显示时加载当前 Note，通过只读 editor projection 定位 Card：

    CardSurface({
      topic,
      focus: { cardId, itemBlockId },
      side: "question" | "answer",
      appearance: "preview" | "review",
    })

Editor Preview 使用当前 Topic 的 live adapter；Learning 使用 stored Note adapter。Note runtime pool 采用 LRU，最多保留 64 份 Note。同步、历史重放和参数优化直接查询 SQLite，不加载该缓存。

Editor 卡片菜单的 Preview 与正式 Learning Review 现在都使用 CardSurface，共享 editor 的只读、聚焦视觉投影。旧 CardPreview 仅保留为公开兼容导出和隔离测试夹具，不再被生产界面使用。Rating、reveal、计时、Undo 和队列状态仍属于 CardSurface 外部。

Inactive Card 或 Inactive Target 在解析内容前就从查询结果过滤，不能因缓存命中而出现在 Learning 页面。

## 4. Review Target 模型

### 4.1 普通 Card

BasicCard、Cloze Card 和 Backward List/Set 各有一个 whole-card Review Target；一次 Review 产生一个 Again、Hard、Good 或 Easy。

### 4.2 Forward List/Set

Forward List/Set 同时拥有一个 whole main Target 和多个 item Target。main Target 身份由 cardId 确定；每个稳定 member block 的 item Target 身份由 cardId + itemBlockId 确定：

- 完整 ListCard 按顺序 reveal 并收集每个 item 的四级评分；最后一个 item 完成时，所有 item Rating 与聚合得到的 main Rating 在一个事务中提交。
- 完整 SetCard 同时 reveal 所有 item；被标记遗忘的 item 写 Again，其余 item 写最后选择的批量 Rating，该批量 Rating 同时作为 main Rating。
- main 与 item 各自保留 Review Event history，并通过同一 FSRS engine 计算状态与 due。
- item 最近两次有效 Rating 中只要含 Again 或 Hard，就仍属于困难项；Partial Review 只更新对应 item，不更新 main。
- main 到期时展示完整 Card；main 尚未到期时，队列从困难 items 中选择最困难项及其他已到期困难项作为 Partial。若所有 items 都被选中，则退化为完整 Card。
- 没有困难项时，main 或任一 item 的最早 due 可以使完整 Card 重新进入队列。

Partial Card 只是单一 item Target 的复习展示，不是新的 Card Definition，也不生成新的 CardID。`partial_active` 是由 item canonical history 派生的查询缓存，不是第二份历史真源。member 从投影中消失时，该 item Target 变为 inactive；恢复相同 itemBlockId 后继续原进度。

### 4.3 Sibling Group

所有 sourceBlockId 相同的 Card 属于同一个 Sibling Group，包括 Bidirectional 产生的两个 Card。Bury 只改变当前 Study Day 的 queue eligibility，不修改 due、Learning State 或 Review Event。

短时 learning/relearning 和 Partial steps 对时间敏感，按 Anki 队列优先级先收集；较晚收集的 sibling 不反向 bury 已进入的短时学习 Target。

## 5. 逻辑数据库模型

所有学习数据与现有 Note 数据存放在同一个 SQLite 数据库，由 packages/editor-storage 管理。当前 schema 初始化使用幂等 `CREATE TABLE IF NOT EXISTS`；启动时会从现有 Review Events 重算 Card introduction，并有限回填当前学习日的 Sibling Bury 派生索引。开发阶段旧数据库直接删除并重建，项目尚未建立通用的版本化 schema migration 框架。

### 5.1 learning_optimizers

| 字段 | 约束/含义 |
| --- | --- |
| optimizer_id | UUID 主键 |
| name | active Optimizer 间大小写不敏感唯一 |
| is_global | 当前本地学习域恰好一条；固定 identity |
| status | active 或 archived |
| current_revision_id | 指向当前配置快照 |
| created_at / updated_at | 审计与同步冲突处理 |
| sync_sequence | 预留的实体同步序号；当前本地写入使用 -1，确认流程只推进全局 last_server_sequence |

Global 行允许修改 current_revision_id，不允许改 name、status 或 identity。普通 Optimizer 的删除是 archived 状态转换，不是立即 DELETE。

### 5.2 learning_optimizer_revisions

每次编辑、参数优化或恢复默认设置都创建不可变 revision：

| 字段 | 含义 |
| --- | --- |
| revision_id / optimizer_id | revision identity 和 owner |
| configuration_json | 目标记忆率、FSRS weights、learning/relearning steps、最大间隔和 fuzz 的完整快照 |
| fsrs_version | 解释参数和重放所需的算法版本 |
| created_at / sync_sequence | 创建时间与预留的实体同步序号 |

Review Event 不以外键绑定历史 revision。参数变化后的重放必须使用 Note 当前 effective Optimizer 的 current revision 解释全部有效 Rating；这正是“从历史重新计算”，而不是让旧事件永远锁定旧参数。旧 revision 用于审计并保留历史配置，当前界面不提供选择旧 revision 回滚的操作。

### 5.3 learning_note_optimizer_assignments

| 字段 | 约束/含义 |
| --- | --- |
| note_id | 每个账户内唯一 |
| optimizer_id | active Optimizer |
| updated_at / sync_sequence | 更新时间与预留的实体同步序号；远端 last-write-wins 尚未实现 |

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
| sync_sequence | 预留的实体同步序号 |

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
| partial_active | 从 item canonical Rating history 派生的 Partial 状态缓存 |
| created_at / inactive_at | identity 建立和停用时间 |

唯一约束覆盖 whole(card_id) 和 item(card_id, item_block_id)，确保重投影不会创建第二份进度。

### 5.6 learning_review_events

Review Event 是 append-only 事实：

| 字段 | 含义 |
| --- | --- |
| event_id | UUIDv7，幂等 identity |
| device_id / device_sequence | 本地事件来源和单调序号 |
| server_sequence | 预留的事件服务端序号；当前确认流程只更新全局 last_server_sequence |
| target_id / card_id / note_id | 重放与训练索引 |
| event_kind | rating、undo 或 reset |
| rating | Rating event 的四级结果 |
| occurred_at | 用户操作发生时间 |
| response_milliseconds | 可选答题耗时 |
| scheduled_days / elapsed_days | rating 当时的审计数据 |
| base_event_id | 回答时所基于的 canonical Rating；用于识别离线并发分支 |
| result_state_json | 回答当时生成的完整 FSRS state/due 审计快照 |
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
| scheduled_days / learning_steps | FSRS 调度天数与学习步骤状态 |
| reps / lapses | 当前 reset epoch 的统计 |
| last_review_at | 最近有效 Rating |
| optimizer_revision_id | 本次物化所用 current revision |
| winning_event_id | 当前 canonical lineage 的 leaf |
| state_hash | sanity check |

该表可丢弃并从 review_events 重建。Inactive 不等于无 Learning State；只有永久维护才删除。

### 5.8 learning_card_introductions

该派生表为每个曾被有效评分的 Card 保存最早 `introduced_at`。每日新卡额度按 Card 计数，而不是按 List/Set item Target 或 Rating 次数计数。启动回填、乱序 Rating 和 Undo 都必须把该值恢复为全部未撤销 Rating 的最早时间；没有剩余有效 Rating 时删除该行。

Reset Scheduling 只重置调度状态，不抹除 Card 曾经被引入的事实。删除 Card 时通过外键级联删除对应 introduction。

### 5.9 learning_sibling_bury_events

该派生表以产生 bury 原因的 Rating Event 为主键，并保存 source Card、Note、`sourceBlockId`、评分前队列类别和发生时间。它不逐个写入被 bury 的 Card，也不修改 FSRS state 或 due。

查询按当前 Study Day、Undo Event 和三个实时开关决定该原因是否有效。表可从 Review Event 与 Card projection 有限回填；当前 outbox 记录 source queue fact，未来入站同步可据此重新建立本地派生行。

### 5.10 queue_exclusions

该表保留给明确作用于单张 Card 且有截止时间的非 sibling 临时过滤，例如未来的 manual skip。表约束仍包含 `sibling_bury` reason，但当前调度器不读取或写入这类行；Sibling Bury 只以 5.9 的事件派生表为准。Partial eligibility 从 item canonical Rating history 动态判断，Target 的 `partial_active` 只是同一判断的派生缓存，不重复投影到这里。Skip 若以后实现，不是第五种 Rating。

### 5.11 learning_sync_state 与 tombstones

`learning_sync_state` 当前保存 device identity、next device sequence、last server sequence 和 schema generation；`learning_sync_outbox` 保存待发送的 assignment、card、optimizer、review-event 与 tombstone mutations。当前没有 full-sync-required、sanity hash、入站 merge 或设备 prune watermark 字段。

永久维护会为 Card、Optimizer 或单独 inactive item Target 写入 scoped purge tombstone，而不是为每条历史制造墓碑。远端同步实现后，服务器和客户端何时可删除 tombstone 仍需由设备确认与 prune-watermark 协议补齐。

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

普通 Card、Backward List/Set、Cloze 和 Partial item 使用单 Target 事务：

1. 校验 Target active，并核对 prepare 阶段返回的 eventId、winning event、state hash 和 Optimizer revision；
2. 读取 Note 当前 effective Optimizer revision，以当前 winning_event_id 作为 base_event_id 重放并生成 Rating Event 与 result state；
3. 原子更新 Learning State、派生的 Partial 状态缓存、Sibling Bury 索引、同步 outbox 和 new-card introduction；
4. 提交后返回新的 state、due/interval 与 Undo token。

完整 Forward List/Set 使用多 Target 事务：

1. 要求恰好一个 active main Target，并要求评分覆盖按投影顺序排列的全部 active item Targets；
2. 核对 main 和所有 items 的完整 preparation tokens，任一 Target 的 state、winning event 或 Optimizer revision 过期都拒绝整次提交；
3. List 从逐项 Ratings 聚合 main Rating；Set 使用整体 Rating 作为 main Rating，并校验遗忘项与其余 item Ratings 的组合；
4. 为所有 items 和 main 生成各自的 Review Event、Learning State 与派生更新，再通过一次 SQLite batch 一并提交；禁止只提交其中一部分；
5. 完整重试仅在所有相同 Event 已提交时视为幂等成功，检测到部分已提交则报错。

普通 Optimizer 参数变化或 assignment 变化不会立刻改变 due；Target 下一次评分时，会先用新 revision 从历史重建，再加入本次 Rating。完整 List/Set 的 preparation token 校验保证这一规则同时作用于 main 和每个 item。

### 6.3 Undo

Undo 默认只暴露当前 Target canonical lineage 的最新 Rating。事务追加 Undo event，随后从剩余 graph 重新选择 canonical lineage，并重建 Target state、派生的 Partial 状态缓存、Sibling Bury、每日进度和 introduction。若同步后出现以被撤销 event 为 base 的后继，这些依赖分支不进入当前调度 lineage，但事件本身仍保留审计。

### 6.4 Reset Scheduling

Reset 追加新的 reset epoch，保留所有旧 event；目标立即回到 new/初始 learning 状态。普通内容编辑绝不隐式触发 Reset。参数优化训练只查询当前 epoch 的有效 Rating。

## 7. Optimizer 操作

### 7.1 普通编辑、切换与恢复默认

编辑目标记忆率或恢复默认设置会创建新 Optimizer revision。普通 Note assignment 切换只更新 assignment；现有 due 保持不变，Target 在下一次 Rating 时按新 revision 全历史重放。Flashcards 和 Goals 设置不创建 Optimizer revision。

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

## 8. 全局练习政策与动态选卡

### 8.1 RemNote 产品边界

当前一手资料明确支持以下行为：

- `New Cards Per Day` 属于全局 Flashcards 设置，不属于 Scheduler；它限制每个 Study Day 引入的新 Card。
- Daily Goal 属于 Goals & Streaks，是软完成目标。达到目标后仍可继续复习，所有 due review 仍保持 eligible。
- 新内容和 due reviews 有独立入口；普通复习入口不能返回 `phase = new` 的 Card。
- `Forgot` 不增加 Daily Goal 进度；同一 Card 当天后续答对才增加进度。

当前 RemNote 没有公开默认 new-card 数量、`0` 语义、List/Set 计数单位、同日调高/调低规则或保存后队列重建规则。Memorilo 为这些未知项采用以下显式合同：

- 默认每日新卡为 20；`0` 表示不引入新卡，不复用为 unlimited。
- 额度在所有 Global/Note/Topic scope 间共享，并按 Card 去重；首次实际 Rating 消耗额度。
- 当天调低时不撤销已消耗额度，剩余额度最低为 0；调高后下一次选卡立即获得差额。
- Undo Card 的最后一条有效 Rating 会返还 introduction；Reset 不返还。
- List/Set 的多个 item Target 共用一份 Card introduction。

这些是 Memorilo 为补全公开证据空白所做的产品决策，不声称是 RemNote 内部实现。

### 8.2 Daily Goal

Daily Goal 支持 `Spread over the week`、`Review all due cards each day` 和 `Set a daily limit`。进度按 Study Day 内 whole Target 至少出现一次非 `Again` Rating 的 distinct Card 计数；同一卡的短期 learning/relearning 重复和 item Rating 不重复增加，单独的 Partial Review 也不增加整卡进度。目标值和剩余 due 数量每次查询动态计算，不写入 Card due，也不截断 review queue。

首版只支持“所有 Note”作用域；RemNote 的 Exam / Currently Studying 范围需要未来的 Document Priority 和 Exam 领域模型，不能用 Note assignment 或 Optimizer assignment 代替。

### 8.3 排序与立即生效

Flashcards 设置保存后不生成持久队列 snapshot。`getNextNewItem` 与 `getNextReviewItem` 每次都从当前 Learning State、scope 和最新配置重新选择；已经返回给调用方的当前 Card 不会被替换。因此 new gather、interday order、review order、learn-ahead 和当日额度都从“下一张”开始生效。

普通 spaced-repetition 入口优先返回已 due 的 learning/relearning 与 review Card；只有没有 due Card 时才使用 learn-ahead。随机顺序按 Study Day 和 CardID 生成确定性 key，FSRS fuzz 按 Target/Event seed 生成，保证相同历史可重放。

### 8.4 Anki 式 Sibling Bury

Sibling 的范围固定为同一 Note 内相同的 `sourceBlockId`，不扩大到整个 Memorilo Note。队列构建严格使用 Anki 的收集顺序：intraday learning、interday learning、review、new。前面收集到的 Card 只能 bury 同类或后续队列中的 sibling；intraday learning Card 自身不会被 bury，但会参与 seen-sibling 判定并可 bury 后续队列。

三个开关按目标 Card 当前所属队列生效：`Bury new siblings` 控制 new，`Bury review siblings` 控制 review，`Bury interday learning siblings` 控制 interday learning。开关保存后，下一次动态选卡立即按新值重新计算。队列收集阶段只保留每组中首个未被 bury 的 Card；评分后则在当前 Study Day 内保留 source Card 的原队列类别，使后续重建队列仍能执行同一顺序规则。

`learning_sibling_bury_events` 是由 Rating Event 派生的本地索引，不修改 FSRS state、due 或 Review Event 历史。评分被 Undo 后，对应派生事件因 `undoes_event_id` 自动失效；跨过 Study Day 边界后不再参与过滤。打开数据库时会从当前学习日内的有效 Rating Event 对该派生索引做幂等校验与有限回填。

RemNote 当前公开资料没有证明它会自动执行相同的 sibling bury，因此不能把该行为描述成 RemNote 兼容性要求。

## 9. Anki 式个人同步协议设计

当前实现仅完成本地同步基础设施：Review Events 带 device sequence，写入会进入 learning sync outbox，并提供服务器 sequence 确认和 purge tombstone 持久化。远端传输、服务端、入站合并、时钟校验、full-sync recovery 和账户级设备协调尚未实现。因此本节描述目标协议，不是当前已经可用的跨设备功能。

目标协议中，学习数据按账户跨设备同步，不进入 Note 的 LoroDoc，并采用 Anki 的主要机制：

1. 首次 Upload/Download 单向选择；
2. 正常同步按服务器单调 sequence 增量分块；
3. Review Event 按 eventId 做集合合并；
4. 同一 base 的两个离线 Rating 都保留为分支，当前 state 沿最近回答分支的 canonical lineage 重放；
5. Optimizer current revision 和 assignment 的并发编辑按 server sequence last-write-wins，旧 revision 保留；
6. schema/sanity 不兼容时要求 full sync；
7. Note 内容和媒体保持独立同步。

远端同步接入后，客户端应在同步前比较设备与服务器时钟，偏差超过 5 分钟时停止，避免“最近回答”被错误时钟破坏。eventId 是相同 occurred_at 的稳定 tie-break；server sequence 只作为同步水位，不把较早但晚上传的离线评分变成最新评分。

Anki 本地删除 revlog 的 Undo 无法同步；Memorilo 使用 append-only Undo event，这是为满足“保留历史 + 跨设备撤销”所做的有意调整。

## 10. 数据库维护

底层维护操作已经由 editor-storage 实现，并经 main/preload 暴露 `getMaintenanceEstimate` 与 `maintainDatabase`；renderer 的 Settings 目前没有 Maintain Database 入口。未来开放界面时，它必须作为显式破坏性操作，先展示预计删除的 inactive Card/Target、Review Event 和 archived Optimizer 数量。

当前本地维护按 scope：

1. 删除 inactive Card、其 Target，以及 active List/Set 中单独 inactive 的 item Target；
2. 删除这些 Target 的 Review Event、Learning State 和 queue exclusions；
3. 删除 archived Optimizer 及不再被 current pointer 使用的 revision；
4. 写入 purge tombstone/generation，为未来同步防止旧设备复活数据；
5. 检查外键和 sanity counts；
6. 执行 VACUUM。

Active Card 的 Review Event 不能因为其历史 Optimizer 已归档而删除；Review Event 不外键绑定 Optimizer revision，因此清理 Optimizer 不破坏活动历史。

现有 storage integration tests 已覆盖 inactive item/card 的 scope、活动历史保留、归档 Optimizer、完整事务回滚、存在未确认 outbox 时拒绝维护，以及 VACUUM 后重新打开文件数据库。远端设备不会复活已 purge 数据和 prune-watermark 协调仍需等同步实现后补齐。

在远端同步可用后，账户级永久删除还必须先达到 clean sync 和 prune watermark；存在离线或未确认设备时不能把本地 purge 宣称为全账户永久删除。当前实现只在数据库曾确认过服务器 sequence 且仍有 pending outbox 时拒绝维护，不具备远端设备协调能力。

## 11. 实现状态与剩余顺序

1. 已完成 editor-storage schema、repository、Card projection reconciliation、Review Event 和 materialized state。
2. 已完成 FSRS engine、Rating/Replay/Undo/Reset、Optimizer revision/assignment/optimization 与可选立即重调度。
3. 已完成全局练习政策、动态选卡、Daily Goal、两层 List/Set、派生 Partial 状态和 Sibling Bury。
4. 已完成 Preview/Review 共用 CardSurface，以及 main process 的 64-Note LRU。
5. 已完成本地同步 outbox、server-sequence acknowledgement 和 purge tombstone；远端 transport、入站 merge 与 full-sync recovery 尚未实现。
6. 已完成底层数据库维护、IPC 和 integration tests；Settings 入口与远端 prune-watermark 协调尚未实现。

开发阶段的旧数据库直接删除并按当前 schema 重建；当前 List/Set 两层 Target 模型不提供旧学习 schema 的迁移或兼容路径。未来若上线后出现破坏性 schema 或配置格式变更，必须重新确认兼容范围。
