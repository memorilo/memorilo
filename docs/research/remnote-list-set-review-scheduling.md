# RemNote List / Set 复习交互与调度语义调研

调研日期：2026-08-06
观察的 RemNote Web 版本：1.27.19

## 范围与证据等级

本文回答当前 RemNote 的 List Card、Set Card、Partial Card 与调度之间的关系，并与 Memorilo 当前实现对照。

- **官方文档**：RemNote Help Center 明确承诺的用户可见行为。
- **生产实现观察**：对 RemNote 当前公开 Web bundle 的静态分析。它能说明 1.27.19 的实现，但不是稳定 API，后续版本可以改变。
- **Memorilo 实现**：当前仓库中的实际行为。

## 结论摘要

| 问题 | RemNote 1.27.19 | Memorilo 当前实现 | 是否一致 |
| --- | --- | --- | --- |
| List 评分 | 逐项揭示、逐项评分 | 逐项揭示、逐项评分 | 基本一致 |
| Set 评分 | 标出忘记项，再批量评价其余项 | 标出忘记项，再批量评价其余项 | 基本一致 |
| 完整卡状态 | 有 main Card 的复习历史和调度 | 有 whole main Target 的复习历史和调度 | 一致 |
| item 状态 | 从 `subCardScores` 派生 item 历史，并用 Scheduler 分别计算 | 每个 item 是独立 FSRS Target | 调度语义一致，持久化模型不同 |
| 下次到期 | 综合 main 与 sub-card 候选时间，取最早者 | 综合 main 与 item Target 候选时间 | 基本一致 |
| Partial 触发 | 最近两次 item 评分含 Again 或 Hard 时仍可视为困难项 | 使用相同的最近两次评分判断 | 一致 |
| Partial 评分 | 只更新对应 sub-card，不更新 main Card | 只更新对应 item Target | 基本一致 |
| Sibling bury | 未找到 List/Set 使用 Anki 式 sibling bury 的官方或生产证据 | 使用项目已选择的 Anki 式 bury 策略 | 不能声称一致 |

因此，准确答案是：**Memorilo 已按 RemNote 1.27.19 可观察到的行为实现 main Card 与 item/sub-card 并存的两层调度。** 两者的用户可见交互和调度选择语义一致；持久化模型仍不同：RemNote 在 main repetition 中保存 `subCardScores`，Memorilo 将 main 与 item 表示为独立但同属一个 Card 的 Review Targets，并用原子事务提交完整复习。

## 1. 官方文档中的交互

### 1.1 List：逐项揭示、逐项评分

RemNote 的 List Card 按顺序逐项揭示。用户看到每一项后立即为该项选择评分，再继续下一项。

> Just press the appropriate rating after seeing each item in the list – if you remember item 1, press *Recalled with effort*, then if you can't remember item 2, press *Forgot*, and so on.

来源：[Multi-Line (List & Set) Flashcards](https://help.remnote.com/en/articles/9216774-multi-line-list-set-flashcards)（更新于 2026-08-02，访问于 2026-08-06）

### 1.2 Set：标记遗忘项，再评价其余项

Set 一次揭示所有 items。用户先点击 `X` 标记具体遗忘项，然后选择一次评分；这个评分批量应用于其余记住的 items。若全部忘记，可以再次按 `Forgot`，一次标记全部。

> select the specific items you forgot by clicking the X's next to those items ... Once you've marked all of the items you forgot, select a rating button for the items you remembered.

因此 Set 既不是逐 item 分别点击四个评分按钮，也不是完全不区分 item 的整卡评分。

### 1.3 Partial Card

官方明确说 RemNote 会记录用户对每个 item 的表现，并为困难项安排只考一个特定 item 的 Partial List/Set Card。困难 Partial Cards 掌握后，完整卡会再次出现。

> you will get partial list/set cards in your queue, asking you to recall just one specific item.

> Once you've mastered all the partial cards ... RemNote will start showing you the full list card again.

[Card Clusters](https://help.remnote.com/en/articles/10104223-card-clusters)（更新于 2026-07-25）也说明 RemNote 可以单独测试用户正在困难的具体 items。

## 2. “一起调度”实际意味着什么

[Switching from Anki to RemNote](https://help.remnote.com/en/articles/8664083-switching-from-anki-to-remnote)（更新于 2026-07-15）写道：

> only one item is shown at a time, and all items are scheduled together.

这句话说明 List 是一张复合 Card，而不是把每个 item 暴露成互不相关的普通 Card。但它不能被解释成“内部完全没有 item 调度状态”。当前生产代码表明 RemNote 同时保留：

```text
完整 List / Set 的 main Card history
                  +
每个 item 的 sub-card history（由 subCardScores 派生）
                  |
                  v
分别经过 Scheduler / FSRS 计算候选时间
                  |
                  v
综合候选时间与困难项状态，决定 full 或 partial 展示
```

因此，“all items are scheduled together”描述的是产品层面的复合卡行为；内部仍有 item-level scheduling information。

## 3. RemNote 1.27.19 的两层调度

以下内容来自 2026-08-06 对 RemNote 1.27.19 公开生产 bundle 的静态分析，不属于官方稳定 API。

### 3.1 两类历史

Card repetition 会保存：

- main Card 的普通 repetition history；
- `subCardScores`，记录完整 List/Set 复习中每个 item 的评分；
- `isFullMultiLineRep`，区分完整 multi-line 复习与 Partial 复习。

调度代码会按 item 从 `subCardScores` 派生 sub-card history，并调用同一套 Scheduler/FSRS 逻辑为 main Card 与各 sub-card 分别计算下次时间。

### 3.2 完整 List 的评分

完整 List 逐项收集评分：

- 每个 item 的评分写入对应的 `subCardScores`；
- 同一轮还会聚合成一次 main Card 评分，更新 main Card history；
- 聚合不是简单地始终取最差 item，而是依据列表长度和失败比例作判断。

换言之，RemNote 的逐项评分同时服务于“困难项识别”和“完整卡长期调度”。

### 3.3 完整 Set 的评分

完整 Set 中：

- 用户标记的遗忘项得到失败评分（生产路径中可见 Again/Hard）；
- 其余 items 得到用户最后选择的批量评分；
- 最后的整体选择也用于 main Card 评分。

Memorilo 当前采用相同的评分分配，并在同一原子事务中更新 whole main Target。

### 3.4 Partial 的更新范围与退出判断

Partial 复习只更新对应 sub-card history，不写入 main Card history。生产调度逻辑把 item 的近期表现作为困难判断依据：最近两次评分中只要仍包含 Again 或 Hard，该 item 就仍可能进入 Partial 流程。

这意味着 `Hard` 也可能使 item 保持困难状态；并不是只有 `Again` 才触发，也不是一进入 FSRS 的 Review phase 就必然结束 Partial。

### 3.5 决定 full 还是 partial

调度会综合 main Card 与 sub-cards 的候选时间，并使用最早的相关时间。队列随后根据以下状态决定展示形态：

- main Card 到期时，展示完整 List/Set；
- main Card 尚未到期、但存在应补救的困难 items 时，展示 Partial；
- Partial 掌握后，后续重新回到完整卡进行整合复习。

RemNote 的 Partial 选择还可以表示困难项集合，而不必等同于“每个 queue item 永远只携带一个独立 item Target”。

## 4. Memorilo 当前实现

Memorilo 为 forward List/Set 建立一个 whole main Target 和多个稳定的 item Targets：

1. 完整 List 按顺序收集每个 item 的 Rating，最后依据 RemNote 1.27.19 的聚合规则生成 main Rating；所有 item events 与 main event 在一个数据库事务中提交。
2. 完整 Set 为被标记遗忘的 items 写 Again，为其余 items 写最后选择的批量 Rating，并用该批量 Rating 更新 main Target；这次完整复习同样原子提交。
3. main 与 items 各自通过同一 FSRS engine 计算状态和 due。队列综合两层候选时间，而不是只看 item 的最早 due。
4. item 的最近两次 canonical Ratings 中只要含 Again 或 Hard，就仍可能进入 Partial；Partial 只更新该 item Target，不更新 main Target。
5. main 到期时展示完整 Card；否则选择最困难项及其他已到期困难项。若全部 items 都会被选中，则展示完整 Card，而不是连续制造多个等价 Partial。

这种 Target 表结构没有复制 RemNote 的内部 `subCardScores` 存储格式，但保留了相同的两层状态所有权与可观察调度行为。`partial_active` 仅作为 canonical item history 的派生缓存，不取代 Review Event history。

## 5. Sibling bury

当前 Help Center 没有公开 List/Set item、Partial Card 或 Card Cluster 使用 Anki 式 sibling bury 的规则。生产 bundle 的上述 multi-line 调度路径也没有为这个结论提供证据。

因此 Memorilo 的三个 Anki 分类：

- bury new siblings；
- bury review siblings；
- bury interday learning siblings；

应视为项目选择采用的 Anki 队列策略，不能标注为严格复刻 RemNote。

## 6. 生产代码证据定位

以下是调研时 RemNote 1.27.19 加载的公开 bundle；hash 会随部署改变：

- [`FullAppBootstrap~3.488d7fc7dc038f40.bundle.js`](https://www.remnote.com/js/FullAppBootstrap~3.488d7fc7dc038f40.bundle.js)：模块 `188814`，main/sub-card 调度、Partial 选择与评分聚合。
- [`FullAppBootstrap~2.13d35be3fbbd06d1.bundle.js`](https://www.remnote.com/js/FullAppBootstrap~2.13d35be3fbbd06d1.bundle.js)：Card history 中的 `subCardScores`、`isFullMultiLineRep`。
- [`34810.6f403438cce68af6.bundle.js`](https://www.remnote.com/js/34810.6f403438cce68af6.bundle.js)：List/Set 评分交互和 full/partial 展示。
- [`57279.4403437211e96cff.bundle.js`](https://www.remnote.com/js/57279.4403437211e96cff.bundle.js)：将 `subCardScores` 持久化到 Card repetition。
- [`73449.78e2d90c57847652.bundle.js`](https://www.remnote.com/js/73449.78e2d90c57847652.bundle.js)：复习元数据中的 `Sub Card Info`。

## 资料清单

- [Multi-Line (List & Set) Flashcards](https://help.remnote.com/en/articles/9216774-multi-line-list-set-flashcards)（更新于 2026-08-02，访问于 2026-08-06）
- [Switching from Anki to RemNote](https://help.remnote.com/en/articles/8664083-switching-from-anki-to-remnote)（更新于 2026-07-15，访问于 2026-08-06）
- [Card Clusters](https://help.remnote.com/en/articles/10104223-card-clusters)（更新于 2026-07-25，访问于 2026-08-06）
- [The FSRS Spaced Repetition Algorithm](https://help.remnote.com/en/articles/9124137-the-fsrs-spaced-repetition-algorithm)（更新于 2026-07-31，访问于 2026-08-06）
- [RemNote Plugin SDK 0.0.46 Card API](https://unpkg.com/@remnote/plugin-sdk@0.0.46/dist/name_spaces/card.d.ts)（访问于 2026-08-06）
- 上述 RemNote 1.27.19 生产 JavaScript bundles（访问于 2026-08-06）
