# Anki 队列排序与 sibling bury 调研

调研日期：2026-08-01

本文只记录 Anki 官方手册对队列政策的公开契约，用于设计 Memorilo 的 FSRS Optimizer 配置。资料固定在 Anki 手册提交 [`d2484ca416682d9a7c39fdca1d8fd34ab75bf22b`](https://github.com/ankitects/anki-manual/tree/d2484ca416682d9a7c39fdca1d8fd34ab75bf22b)。

## 队列政策不是 FSRS 参数

Anki 将 FSRS memory parameters 与 deck preset 的 display order、learning steps、daily limits 和 burying 分开配置。Memorilo 可以把它们放进同一个可复用的 Optimizer/Profile 记录中供用户管理，但实现上仍应保持两个内部层次：FSRS 负责状态转移与长期间隔，Queue Policy 负责收集、排序、混排和暂时隐藏。

## 可配置的顺序

官方手册的 Display Order 包含：

- New Card Gather Order：Deck、Deck then random notes、Ascending/Descending position、Random notes、Random cards。
- New Card Sort Order：Card type then order gathered、Order gathered、Card type then random、Random note then card type、Random。
- New/Review Order：new cards 与 review cards 混排、先 new、后 new。
- Interday Learning/Review Order：跨日 learning/relearning cards 与 review cards 混排、先学习、后学习。
- Review Sort Order：Due date then random、Due date then deck、Deck then due date、Ascending/Descending intervals、Ascending/Descending ease，以及 FSRS 下的 Ascending retrievability。

来源：[Deck Options - Display Order](https://github.com/ankitects/anki-manual/blob/d2484ca416682d9a7c39fdca1d8fd34ab75bf22b/src/deck-options.md#display-order)（访问于 2026-08-01）。

`Ascending retrievability` 是 FSRS 模式下对 SM-2 `Relative overdueness` 的对应策略，按记忆可提取概率优先，而不是把 due 时间作为唯一排序字段。

## Bury siblings

Anki 将同一 Note 生成的多张 Card 称为 siblings，例如正反向 Card 或同一文本的多个 Cloze。启用 sibling bury 后，回答一张 Card 会把同组其他 eligible Card 推迟到下一个学习日；这不会修改 due、review history 或 memory state。

Bury 有三个独立开关：

- Bury new siblings
- Bury review siblings
- Bury interday learning siblings

Anki 的收集顺序是 intraday learning、interday learning、review、new。较晚收集的 sibling 不能 bury 较早收集的 sibling；学习中的卡片通常不被隐藏，因为短学习步骤对时间敏感。

来源：[Deck Options - Burying](https://github.com/ankitects/anki-manual/blob/d2484ca416682d9a7c39fdca1d8fd34ab75bf22b/src/deck-options.md#burying)；[Studying - Siblings and Burying](https://github.com/ankitects/anki-manual/blob/d2484ca416682d9a7c39fdca1d8fd34ab75bf22b/src/studying.md#siblings-and-burying)（访问于 2026-08-01）。

## 学习日与 Learn Ahead

Anki 的 `Next day starts at` 以当前时区定义学习日边界，默认凌晨 4 点；跨过日界的学习卡在目标学习日开始时进入队列。`Learn ahead limit` 只在没有其他可学习卡时允许提前显示短延迟 learning 卡，默认 20 分钟，设为 0 则关闭。

来源：[Preferences - Next day starts at / Learn ahead limit](https://github.com/ankitects/anki-manual/blob/d2484ca416682d9a7c39fdca1d8fd34ab75bf22b/src/preferences.md#scheduler)（访问于 2026-08-01）。

## 对 Memorilo 的直接含义

1. Optimizer/Profile 需要保存 Queue Policy，而不是只保存 FSRS weights。
2. `Bury` 应是队列过滤或延迟记录，不应写成第五种 Rating，也不应重算 Learning State。
3. Memorilo 需要定义自己的 sibling group。Anki 的 Note 不能直接对应 Memorilo 的 Note，因为 Memorilo Note 是协作聚合；双向 Card 至少应共享一个 sibling group，但同一 Source Block 中不相关的多个 Definition 是否共享，需要产品决定。
4. FSRS 下的 review 排序应优先考虑 retrievability；若首版只支持 due 排序，应把它标记为 Queue Policy 的简化实现，而不是 FSRS 行为本身。
