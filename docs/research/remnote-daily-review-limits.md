# RemNote 每日新卡、复习目标与队列限制调研

调研日期：2026-08-05

## 范围与证据等级

本文只使用 RemNote 第一方资料：当前 RemNote Help Center、RemNote 官方 Plugin SDK，以及 `remnoteio` 官方仓库。重点区分以下证据：

- **现行官方明确**：当前 Help Center 直接描述的用户可见行为。
- **官方接口证据**：官方 Plugin SDK 暴露的类型或字段。它能证明某个概念存在，但不能证明未公开的内部算法。
- **官方旧资源**：已归档的 `remnoteio/translation-legacy`。它只能证明旧版产品曾使用某项设置或文案，不能单独证明当前版本仍保留相同语义。
- **未知**：上述一手资料没有给出契约。本文不会用 Anki 行为、界面猜测或字段名称填补空白。

## 结论摘要

1. 当前 RemNote 没有公开成“一组挂在 Scheduler 上的每日新卡/复习硬上限”。公开资料显示至少有四套彼此不同的机制：`New Cards Per Day`、Daily Goal、Need to Learn、Max Stale Cards Per Day。
2. 当前 Help Center 明确仍有 `Settings > Flashcards > New Cards Per Day`，并称它是每天加入的**最大新卡数量**。但当前文档没有公开默认值、`0` 的语义、按账户还是按 Knowledge Base 计数、以及它在全局队列与文档队列之间如何共享额度。[Flashcard Statistics](https://help.remnote.com/en/articles/7970392-flashcard-statistics)（页面更新于 2026-07-31，访问于 2026-08-05）
3. Daily Goal 是**完成目标，而不是复习队列的硬停止上限**。用户达到目标后，RemNote 还会继续生成 stretch goal；因此“今日目标 50”不表示第 51 张 due card 不可复习。[Goals and Streaks](https://help.remnote.com/en/articles/7950933-goals-and-streaks)（页面更新于 2026-08-02，访问于 2026-08-05）
4. 当前 RemNote 会把导入和 AI 批量生成的新卡放入独立的 `Need to Learn` 队列，用户点击 `Learn new` 后才主动引入正常 spaced-repetition 流程。考试中的新卡也可以和 due reviews 分开练习。这说明 `New Cards Per Day` 不是所有新卡来源的唯一入口政策。[Importing from Anki](https://help.remnote.com/en/articles/6751471-importing-from-anki)；[Generating Flashcards with AI](https://help.remnote.com/en/articles/10102901-generating-flashcards-with-ai)；[The Flashcard Home](https://help.remnote.com/en/articles/7925835-the-flashcard-home)（均访问于 2026-08-05）
5. 当前第一方资料没有证明存在普通学习的 `Max Reviews Per Day` 硬上限。Daily Goal 可以选择“Review all due cards each day”或“Set a daily limit”，但后者仍被描述为想要完成的数量，且达到后仍有 stretch goals。
6. 当前第一方资料没有说明修改 `New Cards Per Day`、Daily Goal 或普通 Queue order 后会重建一份持久队列，也没有说明当天调高/调低上限如何影响已经进入队列的卡片。这些行为必须作为 Memorilo 自己的产品契约定义。

## 1. 这些设置分别属于什么作用域

### 1.1 Custom Scheduler：按 Card 的文档层级解析

RemNote 把一组调度算法及参数称为 Scheduler。`Global Default Scheduler` 应用于没有自定义 Scheduler 的卡；其他 Scheduler 可以分配给文档或文件夹。解析一张卡的 effective Scheduler 时，RemNote 从生成卡片的 bullet 开始向父级查找，直到找到自定义 Scheduler，否则回退到 Global Default。[Custom Schedulers](https://help.remnote.com/en/articles/6958056-custom-schedulers)（页面更新于 2026-07-31，访问于 2026-08-05）

该页面介绍的是算法和调度参数。它没有把 `New Cards Per Day`、Daily Goal 或队列排序列为 Scheduler 参数。当前帮助中心反而把它们放在以下位置：

| 机制 | 当前公开设置位置/归属 | 官方明确的作用域 |
| --- | --- | --- |
| Scheduler | `Settings > Schedulers` | Global Default，或分配给文档/文件夹并按祖先解析 |
| New-card maximum | `Settings > Flashcards > New Cards Per Day` | 公开资料只明确这是一个 Flashcards 设置；账户级与 Knowledge Base 级边界未知 |
| Daily Goal | `Settings > Goals & Streaks` | 可选择全部文档，或只计算 Exams 与 Currently Studying 文档/文件夹 |
| Exam daily target | 单个 Exam 的设置/Study Plan | 该 Exam 所选文档与文件夹 |
| Stale-card throttle | `Settings > Flashcards > Queue > Card Order > Max Stale Cards Per Day` | 当前文档只描述主队列逐日重新引入；更细作用域未知 |

因此，不能从 RemNote 资料得出“多个 Note 共享同一 Scheduler，就共享每日新卡/复习额度”的结论。公开的 Scheduler assignment 与公开的 Daily Goal/New Cards 设置是不同层次。

### 1.2 Daily Goal：用户目标可选择内容范围

Daily Goal 可以只计算 Exams 与 Currently Studying，也可以计算所有文档。Maintaining 文档不计入前一种目标，但其 due cards 仍会正常到期，并在高优先级 due cards 完成后继续出现在全局队列。这直接说明“是否计入目标”和“是否有资格进入队列”是两个概念。[Goals and Streaks](https://help.remnote.com/en/articles/7950933-goals-and-streaks)；[Setting Priorities and Disabling Flashcards](https://help.remnote.com/en/articles/7950982-setting-priorities-and-disabling-flashcards)（均访问于 2026-08-05）

### 1.3 Exam：每个考试有自己的目标，但不是普通 Scheduler 上限

考试可设置每日最大目标、学习日以及新卡学习计划。RemNote 会为考试计算独立的 daily goal section，并可在落后时建议临时提高目标。调整 Exam 参数时，官方明确说会重新计算 upcoming practice sessions。[Preparing for an Exam](https://help.remnote.com/en/articles/9101991-preparing-for-an-exam)（页面更新于 2026-08-04，访问于 2026-08-05）

这是 Exam overlay 的行为，不能外推成普通队列保存设置时也会重排或重建全部队列。

## 2. 每日新卡上限

### 2.1 当前能确认的行为

当前 `Flashcard Statistics` 对 Upcoming Cards forecast 的说明是：预测假设用户每天加入设置中允许的最大新卡数量，并明确给出设置路径 `Settings > Flashcards > New Cards Per Day`。因此截至本次调研，当前产品仍公开存在一个 new-card daily maximum。[Flashcard Statistics](https://help.remnote.com/en/articles/7970392-flashcard-statistics)（页面更新于 2026-07-31，访问于 2026-08-05）

当前 Card metadata 又把 `New` 定义为：卡片从未练习过，或刚刚 Reset scheduling。该定义能识别卡片状态，但没有说明 Reset 后的卡是否会再次消耗当天 new-card allowance。[Flashcard Statistics](https://help.remnote.com/en/articles/7970392-flashcard-statistics)（访问于 2026-08-05）

### 2.2 旧版文案只能作为历史证据

已归档的官方翻译仓库曾把该项命名为 `Max New Cards Per Day`，说明为：每天最多把这么多新建卡片纳入 flashcard queue，以免大量新卡一次性涌入；`Next Day Starts At` 定义每天新卡出现的时间。[translation-legacy `NEW_CARDS_PER_DAY` / `NEXT_DAY_STARTS_AT`](https://github.com/remnoteio/translation-legacy/blob/ad26931cac74a76eac85b6bb27ee53d7af704c04/en/all.json#L450-L456)（访问于 2026-08-05）

该仓库的 README 明确称其为旧翻译系统且已经归档。[translation-legacy README](https://github.com/remnoteio/translation-legacy/blob/ad26931cac74a76eac85b6bb27ee53d7af704c04/README.md)（访问于 2026-08-05）因此旧文案不能单独证明当前版本仍采用相同的 admission 时机、计数作用域或学习日边界。

### 2.3 Need to Learn 是另一条新卡引入路径

当前官方资料明确区分了“已经创建但尚未主动开始学习”与“已经进入正常复习流”的卡：

- 所有外部导入的 flashcards 会先进入独立的 `Need to Learn` 队列，不直接进入 active reviews；用户可以在准备好时逐步引入。[Importing from Anki](https://help.remnote.com/en/articles/6751471-importing-from-anki)；[Importing Notes](https://help.remnote.com/en/articles/7898005-importing-notes)；[Notes on RemNote Importers](https://help.remnote.com/en/articles/6330674-notes-on-remnote-importers)（页面均更新于 2026-08-05，访问于 2026-08-05）
- AI 生成的卡也进入 `Need to Learn`；用户按 `Learn new` 才开始学习。[Generating Flashcards with AI](https://help.remnote.com/en/articles/10102901-generating-flashcards-with-ai)（页面更新于 2026-08-05，访问于 2026-08-05）
- Exam 可把未见过的新卡与 due reviews 分开显示和练习；Exam Scheduler 会为新内容计算计划。[The Flashcard Home](https://help.remnote.com/en/articles/7925835-the-flashcard-home)；[Preparing for an Exam](https://help.remnote.com/en/articles/9101991-preparing-for-an-exam)（均访问于 2026-08-05）

官方没有说明这些 `Need to Learn` 卡在用户点击引入时如何消耗普通 `New Cards Per Day`，也没有说明导入、AI、普通手工新建和 Exam 新卡是否共用一个计数器。

## 3. 每日复习数量：目标，不是硬上限

### 3.1 Daily Goal 的三种计算方式

当前 Daily Goal 提供三种模式：[Goals and Streaks](https://help.remnote.com/en/articles/7950933-goals-and-streaks)（访问于 2026-08-05）

1. `Spread over the week`：把未来一周的 reviews 分成大致均匀的每日份额。
2. `Review all due cards each day`：目标包含当天所有 due cards。
3. `Set a daily limit`：用户选择每天想要完成的 cards 数量。

这里的 `limit` 是 goal 的配置方式，不是 queue eligibility 的硬上限。官方同时说明达到 Daily Goal 后会计算新的 stretch goal，用户仍可继续练习。

### 3.2 Today’s Goal 的 min/max 关系

对于普通 backlog，`Can I pause the flashcards scheduler?` 的现行说明是：RemNote 先计算“在 7 天内清空队列每天需要完成多少张”，然后要求用户完成这个数量；如果该所需数量大于用户设置的 Daily Goal，则改用 Daily Goal。按该原文，普通 catch-up 目标的上界关系是：

```text
Today's Goal = min(7 日内清空队列所需日均量, 用户配置的 Daily Goal)
```

[Can I pause the flashcards scheduler?](https://help.remnote.com/en/articles/7967414-can-i-pause-the-flashcards-scheduler)（页面更新于 2026-07-23，访问于 2026-08-05）

当前 Getting Started 文档从另一个角度确认：如果保持进度不需要做那么多，实际目标可低于配置目标；如果考试临近，实际目标可高于配置目标。[Getting Started with Spaced Repetition](https://help.remnote.com/en/articles/6022755-getting-started-with-spaced-repetition)（页面更新于 2026-07-25，访问于 2026-08-05）

因此不能把所有场景统一为一个 `min`：普通 catch-up 受配置目标封顶，但 Exam 可以显式临时抬高目标。`Spread over the week` 的精确 rounding、backlog 分配和跨时区公式没有公开。

### 3.3 哪一次作答计入目标

当前 FAQ 明确说明：对卡片按 `Forgot` 不增加 streak/Daily Goal 进度，因为目标是“今天答对的卡片数量”；卡片几分钟后再次出现并答对时，才计入目标。[Goals and Streaks](https://help.remnote.com/en/articles/7950933-goals-and-streaks)（访问于 2026-08-05）

这能确认 `Forgot` 与后续 successful recall 的差异，但仍没有公开以下细节：

- 同一 Card 在 learning/relearning steps 中多次成功是否每天只计一次；
- `Partially recalled`、`Recalled with effort`、`Easily recalled` 是否都以完全相同方式计数；
- `Skip`、Undo、Reset 如何回退当天 goal progress；
- 同一卡在 Global Queue 与 document-specific queue 中练习时是否共享同一个 daily-goal 去重键；
- List/Set 的每个 item rating 是一个 goal unit，还是完整 List/Set session 才是一个 unit。

## 4. List、Set、Partial 与 learning/relearning 如何计数

当前 Multi-Line 文档明确的是交互与调度形态：[Multi-Line (List & Set) Flashcards](https://help.remnote.com/en/articles/9216774-multi-line-list-set-flashcards)（页面更新于 2026-08-02，访问于 2026-08-05）

- List Card 每揭示一个 item 就立即评分该 item；
- Set Card 会区分 forgotten items 与 remembered items；
- 困难 item 会形成只隐藏一个 item 的 Partial List/Set Card，并像普通卡一样评分；
- Partial items 掌握后，完整 List/Set Card 才重新出现。

当前 FSRS 文档明确 new card 与忘记的旧卡会经过 learning/relearning steps，并在同一 session 内重复。[The FSRS Spaced Repetition Algorithm](https://help.remnote.com/en/articles/9124137-the-fsrs-spaced-repetition-algorithm)（页面更新于 2026-07-31，访问于 2026-08-05）

但是没有任何当前第一方资料把这些行为连接到 `New Cards Per Day` 或 Daily Goal 的计数器。因此以下全部为**未知**：

- 完整 List/Set 是消耗一个 new-card allowance，还是每个 item 消耗一个；
- Partial item 首次出现是否被视为 new card；
- learning/relearning 的同日重复是否消耗 daily review goal，是否只在首次成功时计一次；
- 一个 bullet 生成正向、反向或多个 Cloze Cards 时，是按 Card direction 分别消耗额度，还是按 source bullet 去重。

## 5. Global Queue 与文档队列

RemNote 的 Global Queue 展示所有 notes 中 due 的卡；从文档、文件夹、tag、portal 或 Cards Table 启动的队列只展示对应 scope 中 due 的卡。[Getting Started with Spaced Repetition](https://help.remnote.com/en/articles/6022755-getting-started-with-spaced-repetition)；[Practicing Specific Flashcards](https://help.remnote.com/en/articles/6904503-practicing-specific-flashcards)；[How does RemNote decide what flashcards are part of a document?](https://help.remnote.com/en/articles/8892109-how-does-remnote-decide-what-flashcards-are-part-of-a-document)（均访问于 2026-08-05）

Document Priority 明确影响 Global Queue 的先后顺序；例如 Currently Studying 先于 Maintaining，Paused 通常不进入任何队列，但用户仍可在 Paused 文档本身显式练习。[Setting Priorities and Disabling Flashcards](https://help.remnote.com/en/articles/7950982-setting-priorities-and-disabling-flashcards)（页面更新于 2026-08-05，访问于 2026-08-05）

没有找到官方资料说明：

- 每日在文档队列引入的新卡是否消耗同一个全局 `New Cards Per Day` 额度；
- 两个文档队列是否各有独立额度；
- 先在文档队列学习一张卡，之后进入 Global Queue 时是否重复计数；
- `Practice All` / `Practice in Order` 是否绕过 new-card allowance 或 Daily Goal 计数；
- 达到 Daily Goal 后，Global Queue 或文档队列是否会改变可选 Card 集合。

基于 stretch goal 和 Maintaining 的公开行为，只能可靠地说 Daily Goal 不应被解释成“达到后禁止继续取 due card”。

## 6. 默认值、`0` 与 unlimited

| 项目 | 当前官方可确认值 | `0` / unlimited 语义 |
| --- | --- | --- |
| Streak Goal | 默认 10 cards/day | 未说明 `0` |
| Daily Goal | 当前文档没有给出统一数字默认值 | 未说明；且它是目标，不是 hard cap |
| New Cards Per Day | 当前文档没有给出数字默认值 | 未说明 `0` 表示 0 张还是无限 |
| Max Reviews Per Day | 未找到普通队列的现行公开设置 | 不适用/未知 |
| Max Stale Cards Per Day | 默认 30 | 未说明 `0` |
| Exam maximum target | UI 中有 Recommended defaults，但文档未给数字 | 未说明 |

官方 Plugin SDK 0.0.46 的 public declarations 中仍可见内部 `Deck` slots：`MaxNewCardsPerDay`、`MaxTotalCardsPerDay` 及 Exam 对应字段；`QueueItemType` 也有 `AddExtraNewOrStaleCards`。[官方 Plugin SDK `interfaces.d.ts`](https://unpkg.com/@remnote/plugin-sdk@0.0.46/dist/interfaces.d.ts)（该版本发布于 2024-06-18，访问于 2026-08-05）

这些字段没有注释默认值、作用域、计数算法或 `0` 语义，而且 SDK 版本早于当前 Help Center。它们只能证明 RemNote 公共数据模型中曾/仍暴露这些概念，不能用来推导当前产品的 hard review limit。

## 7. 修改设置何时生效，是否重建队列

### 7.1 官方明确

- 调整 Exam 设置后，Exam Scheduler 会重新计算 upcoming practice sessions。[Preparing for an Exam](https://help.remnote.com/en/articles/9101991-preparing-for-an-exam)（访问于 2026-08-05）
- Scheduler assignment 的 effective value 按 Card 所在层级解析。[Custom Schedulers](https://help.remnote.com/en/articles/6958056-custom-schedulers)（访问于 2026-08-05）
- 当前 Queue SDK 可读取当前卡和 remaining card count，也支持插件在 `GetNextCard` callback 中接收 `cardsPracticed`、`subQueueId` 与 `numCardsRemaining`。这说明运行中的 queue 有 session state，但没有说明该 state 是否持久化或何时重建。[官方 Plugin SDK `queue.d.ts`](https://unpkg.com/@remnote/plugin-sdk@0.0.46/dist/name_spaces/queue.d.ts)；[官方 Plugin SDK `interfaces.d.ts`](https://unpkg.com/@remnote/plugin-sdk@0.0.46/dist/interfaces.d.ts)（访问于 2026-08-05）

### 7.2 官方未知

没有当前第一方资料说明：

- 保存普通 Queue order 设置会立即替换当前卡、只影响下一次选卡，还是下次打开 Queue 才生效；
- Queue 是预先持久化全部 CardID，还是每次动态查询下一张；
- 当天把 new-card maximum 从 20 降到 10 时，已经出现/预取的第 11–20 张是否被移出；
- 当天从 10 提到 20 时，是否立即补入 10 张，还是下一个 Study Day 才生效；
- 修改 Daily Goal 后，当前进度、stretch goal 和历史中记录的当日 goal 如何重算；
- 普通 Scheduler 参数保存后是否立即重算已有 due dates。

因此，“保存设置就会生成新队列”不是可从 RemNote 一手资料确认的事实。

## 8. 对 Memorilo 实现的直接建议

以下是基于证据边界做出的 **Memorilo 产品建议**，不是 RemNote 内部实现声明：

1. 分开建模 `daily new-card admission cap`、`daily completion goal` 与 `due review eligibility`。若目标是学习当前 RemNote，不应把 Daily Goal 实现成 due review 的硬上限。
2. 让顺序设置影响“下一次选卡”，无需持久化一份完整队列。保存 revision 后使当前 session 的 next-card selector 失效并重新查询，即可保证新卡顺序和复习顺序对下一张立即生效；已经展示的当前卡保持稳定。
3. 如果要实现用户原先提出的“每日复习硬上限”，必须明确标为 Memorilo 自己的产品选择，因为当前 RemNote 证据只支持 soft Daily Goal。
4. 在实现每日上限前，应显式决定以下四个未被 RemNote 公开的契约：
   - 额度是账户全局、每个 Optimizer、每个 Note，还是每个队列 scope；
   - 消耗单位是 distinct Review Target、Card、source definition 还是每条成功 Rating；
   - List/Set item、Partial、双向 Card 和 Cloze 如何计数；
   - 当天调高/调低上限如何处理已消耗额度与已经展示的当前卡。
5. 若采用最容易解释和跨 Global/Note/Topic 队列保持一致的规则，可以把额度记在 `profile + studyDay + targetKind` 上，所有 scope 共享已消耗额度，文档队列只是过滤候选集。这个规则与现有 Memorilo 的 Review Target 模型兼容，但它是 Memorilo 的设计，不能声称是 RemNote 已公开行为。

## 资料清单

### 当前 RemNote Help Center

- [Goals and Streaks](https://help.remnote.com/en/articles/7950933-goals-and-streaks)（页面更新于 2026-08-02，访问于 2026-08-05）
- [Flashcard Statistics](https://help.remnote.com/en/articles/7970392-flashcard-statistics)（页面更新于 2026-07-31，访问于 2026-08-05）
- [The Flashcard Home](https://help.remnote.com/en/articles/7925835-the-flashcard-home)（页面更新于 2026-08-05，访问于 2026-08-05）
- [Getting Started with Spaced Repetition](https://help.remnote.com/en/articles/6022755-getting-started-with-spaced-repetition)（页面更新于 2026-07-25，访问于 2026-08-05）
- [Custom Schedulers](https://help.remnote.com/en/articles/6958056-custom-schedulers)（页面更新于 2026-07-31，访问于 2026-08-05）
- [Can I pause the flashcards scheduler?](https://help.remnote.com/en/articles/7967414-can-i-pause-the-flashcards-scheduler)（页面更新于 2026-07-23，访问于 2026-08-05）
- [Importing from Anki](https://help.remnote.com/en/articles/6751471-importing-from-anki)（页面更新于 2026-08-05，访问于 2026-08-05）
- [Importing Notes](https://help.remnote.com/en/articles/7898005-importing-notes)（页面更新于 2026-08-05，访问于 2026-08-05）
- [Notes on RemNote Importers](https://help.remnote.com/en/articles/6330674-notes-on-remnote-importers)（页面更新于 2026-08-05，访问于 2026-08-05）
- [Generating Flashcards with AI](https://help.remnote.com/en/articles/10102901-generating-flashcards-with-ai)（页面更新于 2026-08-05，访问于 2026-08-05）
- [Preparing for an Exam](https://help.remnote.com/en/articles/9101991-preparing-for-an-exam)（页面更新于 2026-08-04，访问于 2026-08-05）
- [Practicing Specific Flashcards](https://help.remnote.com/en/articles/6904503-practicing-specific-flashcards)（页面更新于 2026-07-16，访问于 2026-08-05）
- [How does RemNote decide what flashcards are part of a document?](https://help.remnote.com/en/articles/8892109-how-does-remnote-decide-what-flashcards-are-part-of-a-document)（页面更新于 2026-07-16，访问于 2026-08-05）
- [Setting Priorities and Disabling Flashcards](https://help.remnote.com/en/articles/7950982-setting-priorities-and-disabling-flashcards)（页面更新于 2026-08-05，访问于 2026-08-05）
- [Multi-Line (List & Set) Flashcards](https://help.remnote.com/en/articles/9216774-multi-line-list-set-flashcards)（页面更新于 2026-08-02，访问于 2026-08-05）
- [The FSRS Spaced Repetition Algorithm](https://help.remnote.com/en/articles/9124137-the-fsrs-spaced-repetition-algorithm)（页面更新于 2026-07-31，访问于 2026-08-05）

### 官方 SDK 与旧资源

- [RemNote Plugin SDK 0.0.46 `interfaces.d.ts`](https://unpkg.com/@remnote/plugin-sdk@0.0.46/dist/interfaces.d.ts)（访问于 2026-08-05）
- [RemNote Plugin SDK 0.0.46 `queue.d.ts`](https://unpkg.com/@remnote/plugin-sdk@0.0.46/dist/name_spaces/queue.d.ts)（访问于 2026-08-05）
- [translation-legacy `NEW_CARDS_PER_DAY` / `NEXT_DAY_STARTS_AT`](https://github.com/remnoteio/translation-legacy/blob/ad26931cac74a76eac85b6bb27ee53d7af704c04/en/all.json#L450-L456)（官方旧资源，访问于 2026-08-05）
- [translation-legacy README](https://github.com/remnoteio/translation-legacy/blob/ad26931cac74a76eac85b6bb27ee53d7af704c04/README.md)（官方旧资源，访问于 2026-08-05）
