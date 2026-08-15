# RemNote List Card 与复习队列调度调研

调研日期：2026-08-01；实现状态更新：2026-08-16

本文保留只依赖 RemNote 官方文档和公开接口时能够得到的证据边界。后续对 RemNote 1.27.19 生产 bundle 的补充分析与 Memorilo 当前 main/item 两层实现见 [RemNote List/Set 两层复习调度](./remnote-list-set-review-scheduling.md)；当前实现合同以 [FSRS Learning System Design](../fsrs-learning-system.md) 为准。

## 范围与证据等级

本文只调查 RemNote 对以下问题公开到什么程度：

- List / Set Card 如何逐项评分，列表项是否独立调度；
- 到期时间之外的队列政策，包括优先级、短期学习、同日重复、顺序以及相关卡片的处理；
- 评分后返回上一张卡与撤销评分的行为；
- 哪些行为适合 Memorilo 借鉴，哪些内部规则仍未公开。

证据按以下等级区分：

- **官方明确行为**：RemNote 当前帮助中心直接描述的产品行为。
- **官方接口证据**：RemNote Plugin SDK 或 `remnoteio` 官方仓库公开的接口、类型或资源；能证明能力边界，但不等于内部实现。
- **官方旧资源**：`remnoteio/translation-legacy` 中的设置文案。它可证明这些概念曾作为正式设置存在，但仓库已标为 legacy，不能单独证明当前版本仍使用完全相同的默认值或算法。
- **未知 / 推断**：公开资料没有给出契约；本文不会把观察或类比写成 RemNote 的内部事实。

## 结论摘要

1. RemNote 的 List Card 确实要求**每揭示一个列表项就为该项评分**；Set Card 则先标记忘记的具体项目，再为其余项目统一评分。困难项之后会成为只隐藏一个项目的 Partial List/Set Card；掌握困难项后，完整卡片才恢复出现。[Multi-Line (List & Set) Flashcards](https://help.remnote.com/en/articles/9216774-multi-line-list-set-flashcards)（访问于 2026-08-01）
2. 公开资料能证明 RemNote 保存项目级表现并能单独调度 Partial Card，但**不能证明每个列表项从创建起就拥有独立 CardID、完整 FSRS 状态和独立 due date**。Partial Card 的生成阈值、身份派生和它与完整 List Card 的状态合并规则均未公开。
3. RemNote 的复习队列不是简单的 `ORDER BY due`：还有文档优先级、学习/重学习步骤、队尾提前学习、stale card 限流、new-card 日上限以及显式的关联卡片聚类。公开资料没有给出这些规则最终合成一个队列时的完整比较器。[Setting Priorities and Disabling Flashcards](https://help.remnote.com/en/articles/7950982-setting-priorities-and-disabling-flashcards)；[The Anki SM-2 Spaced Repetition Algorithm](https://help.remnote.com/en/articles/6026144-the-anki-sm-2-spaced-repetition-algorithm)；[Can I pause the flashcards scheduler?](https://help.remnote.com/en/articles/7967414-can-i-pause-the-flashcards-scheduler)（均访问于 2026-08-01）
4. 没有找到 RemNote 当前帮助中心对“撤销上一次评分”的正式说明。Plugin SDK 只明确提供“返回上一张卡”和 lookback 状态，没有定义该操作会删除、替换还是保留刚写入的复习记录。Memorilo 后续采用了追加 Undo Event 并重放状态的自有合同，不能声称照搬了 RemNote。[QueueNamespace](https://unpkg.com/@remnote/plugin-sdk@0.0.46/dist/name_spaces/queue.d.ts)（访问于 2026-08-01）

## 1. List / Set Card 的评分与调度

### 1.1 List Card 是逐项揭示、逐项评分

List Card 由 numbered multi-line items 构成。复习时项目按顺序逐个揭示；用户看到每一项后立即选择该项的评分，再进入下一项。官方示例明确描述了“item 1 记得则评分、item 2 忘记则评分”的连续过程，而不是完成整张列表后只给一个总评分。[Multi-Line (List & Set) Flashcards](https://help.remnote.com/en/articles/9216774-multi-line-list-set-flashcards)（访问于 2026-08-01）

这意味着至少存在两个不同层次：

- 完整列表是一次有顺序的复习展示；
- 每个 item 是独立的评分输入目标。

但它仍不足以证明“每个 item 永远是一张完整、独立的 FSRS Card”。官方没有公开列表项的 CardID、due、stability、difficulty 或 review-state schema。

### 1.2 Set Card 也是项目级反馈，但交互不同

Set Card 一次揭示所有项目。全部记住时，用户直接选择 `Partially recalled`、`Recalled with effort` 或 `Easily recalled`；忘记部分项目时，先点击每个遗漏项旁的 `X` 将其标红，再为剩余记住的项目评分；完全忘记时可以再次选择 `Forgot`，把全部项目标为忘记。[Multi-Line (List & Set) Flashcards](https://help.remnote.com/en/articles/9216774-multi-line-list-set-flashcards)（访问于 2026-08-01）

因此，List 与 Set 可以共享“项目级评分结果”领域概念，但不能共享完全相同的复习交互状态机：List 是按序逐项产生结果，Set 是一次展示后批量划分 forgotten / remembered items。

### 1.3 Partial List/Set Card 是困难项的补救队列单位

RemNote 会跟踪用户反复困难的具体项目，并在 Queue 中生成只隐藏一个项目的 Partial List/Set Card。用户像普通卡片一样回答和评分；当对应困难项都掌握后，RemNote 才重新显示完整 List/Set Card。[Multi-Line (List & Set) Flashcards](https://help.remnote.com/en/articles/9216774-multi-line-list-set-flashcards)（访问于 2026-08-01）

从公开行为可以可靠得到的状态关系是：

```text
完整 List/Set Card
  -> 收集各 item 的评分结果
  -> 困难 item 进入 Partial Card 复习
  -> Partial Card 达到“掌握”条件
  -> 完整 List/Set Card 恢复出现
```

以下实现细节未公开：

- 一次 `Forgot` 是否立即创建 Partial Card，还是需要累计多次困难评分；
- Partial Card 是否从一开始就存在，只是平时不进队列；
- Partial Card 是否有独立 CardID 和独立 FSRS memory state；
- 完整卡片在 Partial Card 活跃期间是暂停、改期，还是仅被队列过滤；
- item 被重排、移动、改写或删除后，历史如何匹配；
- “掌握”的具体阈值以及完整卡片恢复时的 due 计算。

### 1.4 递归 Multi-Line Card 会产生多个正式卡片

如果一个 multi-line item 自己也是 multi-line card，RemNote 会为该子项的问题生成卡片，同时仍为顶层列表生成完整卡片。顶层默认只显示 direct children，不显示 grandchildren；展开状态在 Queue/Preview 与 Editor 中分别持久化。[Multi-Line (List & Set) Flashcards](https://help.remnote.com/en/articles/9216774-multi-line-list-set-flashcards)（访问于 2026-08-01）

这能证明“嵌套的卡片定义”与“顶层 List item 的项目级评分”不是同一概念。一个 item 可以同时是顶层列表的答案项，以及另一张有自己 prompt 的正式 Card。

## 2. 到期时间之外的队列政策

### 2.1 Queue scope 与 due 过滤

RemNote 有全局队列和文档队列。全局队列从所有 notes 中选择 due cards；文档队列只选择属于指定文档范围的卡片。Cards Table 也能先过滤再练习，`Practice with Spaced Repetition` 只纳入过滤结果中已经 due 的卡片。[Getting Started with Spaced Repetition](https://help.remnote.com/en/articles/6022755-getting-started-with-spaced-repetition)；[Practicing Specific Flashcards](https://help.remnote.com/en/articles/6904503-practicing-specific-flashcards)（均访问于 2026-08-01）

`Practice All` 是另一种模式，可选择记录或不记录评分。记录评分时，RemNote 会把“提前复习”写入 scheduling history，并在计算时考虑它发生得过早，避免连续提前复习把间隔无限推远。[Resetting Flashcard Scheduling](https://help.remnote.com/en/articles/7230389-resetting-flashcard-scheduling)（访问于 2026-08-01）

### 2.2 文档优先级先于普通 due card

RemNote 公开了五级文档优先级：

| 优先级 | 官方队列行为 |
| --- | --- |
| Exam | 除 Paused 外优先于其他层级 |
| Currently Studying | 到期后最先进入全局队列 |
| Maintaining | 当前到期的 Currently Studying 卡完成后出现 |
| Paused | 通常不进入任何队列，但 due clock 继续运行 |
| No Priority | 在 Maintaining 之后出现 |

卡片如果经 hierarchy、portal 或 source 同时属于多个文档，RemNote 会按“最近的有优先级祖先”以及“多个 placement 取较高优先级”等规则求 effective priority。这里的 priority 决定何时进入全局学习流，并不替代单卡的 scheduler due date。[Setting Priorities and Disabling Flashcards](https://help.remnote.com/en/articles/7950982-setting-priorities-and-disabling-flashcards)（访问于 2026-08-01）

### 2.3 学习和重学习步骤制造同日重复

RemNote 的 FSRS 为新卡提供 learning steps，为遗忘的旧卡提供 relearning steps。它们是短的固定间隔，例如 `1m,10m`；卡片会在当前 session 中再次出现，完成步骤后才进入 FSRS 的正常长期调度。[The FSRS Spaced Repetition Algorithm](https://help.remnote.com/en/articles/9124137-the-fsrs-spaced-repetition-algorithm)（访问于 2026-08-01）

RemNote 对 Anki SM-2 的公开说明进一步解释了队尾提前学习：当已无其他 due card 时，Learning Phase 卡可以在真正到期前出现，默认最多提前 15 分钟；用户可通过 `Learn Ahead Limit` 调整。帮助中心没有明确给出 FSRS 是否复用完全相同的默认 15 分钟，但官方设置文案把 Learn Ahead 描述为通用 Queue 行为。[The Anki SM-2 Spaced Repetition Algorithm](https://help.remnote.com/en/articles/6026144-the-anki-sm-2-spaced-repetition-algorithm)；[translation-legacy `LEARN_AHEAD_LIMIT`](https://github.com/remnoteio/translation-legacy/blob/ad26931cac74a76eac85b6bb27ee53d7af704c04/en/all.json#L442-L445)（均访问于 2026-08-01）

### 2.4 `Skip` 不评分，并延后约一小时

在普通复习中，`Skip` 用于误读问题或意外翻面：RemNote 不记录 rating，并在一小时后重新显示，以便用户忘掉刚看到的答案后再诚实评分。[Getting Started with Spaced Repetition](https://help.remnote.com/en/articles/6022755-getting-started-with-spaced-repetition)（访问于 2026-08-01）

这是一条 queue deferral policy，不应伪装为 FSRS 的第五种 rating。

### 2.5 stale card 会被暂时扣留并限量重引入

如果一张卡距离上次出现已经超过原计划间隔的两倍，或至少逾期一周（取更长者），RemNote 将其标为 stale。stale cards 会先从正常队列扣留，再逐日少量重新引入；帮助中心给出的默认值为每日 30 张，并允许在 `Max Stale Cards Per Day` 中调整。[Can I pause the flashcards scheduler?](https://help.remnote.com/en/articles/7967414-can-i-pause-the-flashcards-scheduler)（访问于 2026-08-01）

这说明 `dueAt <= now` 不是进入队列的充分条件。Card 还可能因 backlog protection 被 withheld。

### 2.6 新卡日上限与学习日边界

RemNote 官方旧翻译资源包含两个通用队列设置：`Max New Cards Per Day` 限制每天加入队列的新卡数量，`Next Day Starts At` 定义每天新卡出现的时间。[translation-legacy `NEW_CARDS_PER_DAY` / `NEXT_DAY_STARTS_AT`](https://github.com/remnoteio/translation-legacy/blob/ad26931cac74a76eac85b6bb27ee53d7af704c04/en/all.json#L450-L456)（访问于 2026-08-01）

由于该仓库已经标为 legacy，本文只把它作为“RemNote 队列曾明确区分 new-card introduction policy 与 scheduler due”的证据，不据此锁定 Memorilo 的默认数值，也不声称当前产品设置位置永远不变。

### 2.7 普通顺序不是固定文档顺序

RemNote 明确反对让大量卡片长期以固定顺序出现，因为前一题会成为后一题的额外提示。需要记住短列表顺序时使用 List Card；只想一次性按文档顺序浏览时使用 `Practice all flashcards in order`。普通 spaced-repetition queue 则应避免稳定的相邻顺序。[Can I make my cards appear in a specific order?](https://help.remnote.com/en/articles/8038791-can-i-make-my-cards-appear-in-a-specific-order)（访问于 2026-08-01）

在针对文档或选定卡片的 practice modes 中，RemNote 明确区分：

- `Practice with Spaced Repetition` 只显示当前 due cards；
- `Practice All Flashcards` 显示全部卡片，并以随机顺序练习；
- `Practice All Flashcards in Order` 显示全部卡片，按文档中的顺序练习；
- `Practice Without Recording Answer Choices` 不改变 spaced-repetition history。

`Practice All` 连续提前练习同一批卡时仍会记录表现，但 RemNote 会考虑复习过早这一事实，不会因为重复十遍就把下一次 due 无限推远。[Practicing Specific Flashcards](https://help.remnote.com/en/articles/6904503-practicing-specific-flashcards)（访问于 2026-08-01）

在 `Practice All Flashcards in Order` 中，如果同一个 bullet 生成正向卡、反向卡等多个方向，RemNote 会先展示第一方向的全部卡片，再展示第二方向的全部卡片；官方给出的理由是避免一张卡的答案立刻泄露给反向卡。这条规则只明确适用于 in-order practice，不能推断普通 due queue 会采用相同的 sibling 分组或 bury。[Practicing Specific Flashcards](https://help.remnote.com/en/articles/6904503-practicing-specific-flashcards)（访问于 2026-08-01）

Anki SM-2 调度还会给长期 interval 添加少量随机噪声，避免同日引入、同评分的卡片永远同日出现。该文档只证明 RemNote 的 SM-2 行为，不能直接推断 RemNote FSRS 使用相同 fuzz 规则。[The Anki SM-2 Spaced Repetition Algorithm](https://help.remnote.com/en/articles/6026144-the-anki-sm-2-spaced-repetition-algorithm)（访问于 2026-08-01）

### 2.8 关联卡片可以“聚类”，但没有公开 sibling burying

RemNote 的 Card Cluster 是作者显式建立的关联组。当组内某张卡到期时，复习界面会显示它之前的 cluster items 作为上下文、隐藏之后的项目；spaced-repetition 模式仍只测试组内真正 due 的卡片，并不会因为一张到期就强制复习整组。[Card Clusters](https://help.remnote.com/en/articles/10104223-card-clusters)（访问于 2026-08-01）

官方旧翻译资源还列出四种“Prefer to practice ... together”队列偏好：Document、Hierarchy、Reference、Tag Clusters。`Prefer` 表明它们是软排序偏好，而不是改变 due 或合并调度状态；公开资源没有给出这些偏好的权重、tie-breaker 或与 priority 的组合顺序。[translation-legacy `ORDERING`](https://github.com/remnoteio/translation-legacy/blob/ad26931cac74a76eac85b6bb27ee53d7af704c04/en/all.json#L485-L502)（访问于 2026-08-01）

本次没有找到官方资料说明：

- 从同一个 bullet 生成的正向、反向和多个 Cloze 卡会自动 bury 或错开；
- 同一个 Document / Note 中的普通卡会因共享来源而被 suppress 到下一天；
- List 的 Partial Cards 是否被视为普通 sibling；
- 到期时间、priority、stale、learning steps 与 clustering 的最终排序比较器。

因此 RemNote 资料不能替 Memorilo 决定“同 Note 卡处理”，也不能把关联卡聚类误写成 Anki 式 sibling burying。Memorilo 后续明确采用 Anki 分类的三个开关，并把同一 Note 内相同 `sourceBlockId` 的 Cards 定义为 sibling group，包括兄弟 CardTopics 与嵌套 CardTopic 投影；这是项目自己的队列政策。

## 3. 返回上一张卡与撤销评分

### 3.1 官方公开了 lookback，没有公开 Undo Review 契约

Plugin SDK 0.0.46 的 Queue API 提供：

- `goBackToPreviousCard()`：返回队列中的上一张卡；
- `inLookbackMode()`：判断是否处于返回查看状态；
- `rateCurrentCard(score)`：为当前卡评分。

SDK 注释只把第一个操作定义为 “Go back to the previous card in the queue”，没有说它会撤销上一条评分、恢复旧 due、删除 review event 或修改队列计数。[QueueNamespace](https://unpkg.com/@remnote/plugin-sdk@0.0.46/dist/name_spaces/queue.d.ts)（访问于 2026-08-01）

RemNote 官方 Gamepad 插件也把 `Go Back To Previous Card` 注册为独立 queue interaction，并调用同一个 API；它没有实现或声明 `Undo Rating`。[Official Gamepad `buttonMapping.tsx`](https://github.com/remnoteio/remnote-gamepad/blob/84da4a2870950dcabc342d1152ce65e58b06a7c9/src/widgets/funcs/buttonMapping.tsx)；[`gamePadQueueHandler.tsx`](https://github.com/remnoteio/remnote-gamepad/blob/84da4a2870950dcabc342d1152ce65e58b06a7c9/src/widgets/gamePadQueueHandler.tsx)（均访问于 2026-08-01）

### 3.2 复习历史是追加记录，但 reset 采用“保留并忽略过去”

公开 SDK 的 `Card.repetitionHistory` 是一组带 `date`、`score`、可选 `responseTime` 与 `scheduled` 的 repetition entries；`updateCardRepetitionStatus(score)` 的公开语义是 append repetition。它没有公开删除最后一条 repetition 的方法。[Card / RepetitionStatusInterface](https://unpkg.com/@remnote/plugin-sdk@0.0.46/dist/name_spaces/card.d.ts)；[interfaces.d.ts](https://unpkg.com/@remnote/plugin-sdk@0.0.46/dist/interfaces.d.ts)（均访问于 2026-08-01）

Reset Scheduling 的官方行为也不是删除历史：系统追加一条 `Reset` metadata entry，使此前记录不再参与调度，但保留它们供 analytics 使用。[Resetting Flashcard Scheduling](https://help.remnote.com/en/articles/7230389-resetting-flashcard-scheduling)（访问于 2026-08-01）

这些证据支持“复习历史优先采用可审计的事件流”，但不能回答评分 Undo 应使用删除、反向事件还是修改原事件。RemNote 当前公开资料对这一点仍是未知。

## 4. 对 Memorilo 可可靠借鉴的行为与落地状态

以下行为已有足够一手证据，可以作为产品参考：

1. List review session 必须保留逐项评分，不能只把整张 ListCard 压成一个总 Rating；Memorilo 同时从逐项结果聚合 main Rating，用于完整卡长期调度。
2. 完整列表与困难单项需要两种复习形态；困难项补救完成前可暂缓完整列表。
3. item-level rating target、嵌套 CardTopic 所拥有的正式 Card 与完整 List Card 是三个可重叠但不能合并的概念。
4. FSRS 的长期 due 之外还需要独立队列政策。Memorilo 当前已实现 learning/relearning steps、new-card introduction、顺序政策和 Sibling Bury；Skip deferral、stale withholding 与 Document Priority 尚未实现。
5. 关联卡片的“同时提供上下文”“软聚类排序”“独立 due”可以并存，Card Cluster 不需要共享一个 scheduler state。
6. Reset 和普通 review history 应保持可审计；当前 materialized scheduling state 不能成为唯一事实来源。

以下内容不能直接照抄 RemNote，因为尚未公开或证据只来自 legacy 资源：

1. List item / Partial Card 的 ID、数据库表和 FSRS 状态结构。
2. Partial Card 的生成、掌握与完整卡恢复阈值。
3. 同一 Note、同一 Definition 或双向/Cloze siblings 是否 bury、suppress 或错开。
4. priority、due、stale、learning steps 与 cluster preference 的最终队列比较器。
5. 当前 RemNote FSRS 是否使用 interval fuzz，以及具体随机分布。
6. 返回上一张卡是否会撤销或改写上一条评分。

## 5. Memorilo 当前实现决策

Memorilo 没有假设 RemNote 的内部表结构，而是明确采用以下领域边界：

```text
List/Set CardTopic
  -> owned List/Set Card
       -> whole main Target
            -> main rating history / FSRS state
       -> stable item Targets by itemBlockId
            -> item rating history / FSRS state
            -> derived Partial eligibility
```

Forward List/Set CardTopic 拥有对应 List/Set Card；该 Card 从首次投影起就建立一个 whole main Target 和全部稳定 item Targets。完整 List 逐项评分并聚合 main Rating；完整 Set 区分遗忘项后使用整体 Rating 更新 main；所有 item events 与 main event 在一个事务中提交。Partial Review 只更新对应 item，最近两次 canonical Ratings 中含 Again 或 Hard 的 item 保持困难状态。

Undo 已定义为追加 Undo Event，并从剩余 canonical history 重算 materialized state、Partial 缓存、Sibling Bury 与每日计数。这些都是 Memorilo 的产品合同，不是本文声称的 RemNote 行为。

## 资料清单

### RemNote Help Center

- [Multi-Line (List & Set) Flashcards](https://help.remnote.com/en/articles/9216774-multi-line-list-set-flashcards)（访问于 2026-08-01）
- [Getting Started with Spaced Repetition](https://help.remnote.com/en/articles/6022755-getting-started-with-spaced-repetition)（访问于 2026-08-01）
- [Practicing Specific Flashcards](https://help.remnote.com/en/articles/6904503-practicing-specific-flashcards)（访问于 2026-08-01）
- [Setting Priorities and Disabling Flashcards](https://help.remnote.com/en/articles/7950982-setting-priorities-and-disabling-flashcards)（访问于 2026-08-01）
- [The FSRS Spaced Repetition Algorithm](https://help.remnote.com/en/articles/9124137-the-fsrs-spaced-repetition-algorithm)（访问于 2026-08-01）
- [The Anki SM-2 Spaced Repetition Algorithm](https://help.remnote.com/en/articles/6026144-the-anki-sm-2-spaced-repetition-algorithm)（访问于 2026-08-01）
- [Can I pause the flashcards scheduler?](https://help.remnote.com/en/articles/7967414-can-i-pause-the-flashcards-scheduler)（访问于 2026-08-01）
- [Can I make my cards appear in a specific order?](https://help.remnote.com/en/articles/8038791-can-i-make-my-cards-appear-in-a-specific-order)（访问于 2026-08-01）
- [Card Clusters](https://help.remnote.com/en/articles/10104223-card-clusters)（访问于 2026-08-01）
- [Resetting Flashcard Scheduling](https://help.remnote.com/en/articles/7230389-resetting-flashcard-scheduling)（访问于 2026-08-01）

### 官方接口与仓库

- [RemNote Plugin SDK 0.0.46: QueueNamespace](https://unpkg.com/@remnote/plugin-sdk@0.0.46/dist/name_spaces/queue.d.ts)（访问于 2026-08-01）
- [RemNote Plugin SDK 0.0.46: Card](https://unpkg.com/@remnote/plugin-sdk@0.0.46/dist/name_spaces/card.d.ts)（访问于 2026-08-01）
- [RemNote Plugin SDK 0.0.46: Interfaces](https://unpkg.com/@remnote/plugin-sdk@0.0.46/dist/interfaces.d.ts)（访问于 2026-08-01）
- [RemNote Official Gamepad plugin, pinned commit](https://github.com/remnoteio/remnote-gamepad/tree/84da4a2870950dcabc342d1152ce65e58b06a7c9)（访问于 2026-08-01）
- [RemNote legacy English settings, pinned commit](https://github.com/remnoteio/translation-legacy/blob/ad26931cac74a76eac85b6bb27ee53d7af704c04/en/all.json)（访问于 2026-08-01）
