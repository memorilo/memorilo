# Neubrutalism（新粗野主义）UI 设计调研

调研日期：2026-08-24

## 结论先行

可以找到相对完整的参考文档，最直接的是 [neubrutalism.com](https://neubrutalism.com/) 及其开源仓库 [neubrutalism/neubrutalism.com](https://github.com/neubrutalism/neubrutalism.com)。它不是一个官方标准，而是一套可参数化的视觉语法：厚描边、零模糊硬阴影、方角、平面高对比色块和强烈的字体层级。它比早期 web brutalism 更有秩序，也更适合组件库和商业产品。

需要注意：粗野主义的“醒目”不等于可访问。颜色对比、键盘焦点、点击目标尺寸和不依赖颜色传达状态，仍应以 [WCAG 2.2](https://www.w3.org/TR/WCAG22/) 为准。

## 1. 风格定义

`neubrutalism.com` 将 Neubrutalism 定义为一种当代 web/UI 设计运动，拒绝“抛光、无个性的中性化界面”，转而使用 graphic bluntness：高对比配色、粗体排版、明确的几何边界、醒目的结构、厚描边和硬阴影。[来源：网站 Definition / FAQ；[源码](https://github.com/neubrutalism/neubrutalism.com)]

它与 web brutalism 的区别可以概括为：

- **Web brutalism**：更偏原始、笨拙、反惯例，强调对主流设计规范的拒绝。
- **Neubrutalism**：保留反精致的能量，但把它整理成可复用的 token、组件和布局规则。

这意味着它不是“随便做得粗糙”，而是“有意让结构可见”。

## 2. Visual DNA：视觉语法

### 2.1 色彩：分类式、平面化，而非环境式

网站将颜色描述为 **categorical, not ambient**：颜色用来切分对象和层级，而不是制造柔和的氛围。典型做法是中性背景 + 黑色结构线 + 一到三个高饱和强调色；强调使用 flat fills，避免渐变。

网站示例 token：

```css
:root {
  --ink: #000;
  --bg: #FFFDF5;
  --yellow: #FFD23F;
  --pink: #FF6B6B;
  --blue: #74B9FF;
  --green: #88D498;
}
```

建议把颜色角色化，而不是把每个颜色直接散落在组件中：`surface`、`ink`、`accent`、`success`、`warning`、`danger`。这样可以更换主题而不破坏结构语言。

### 2.2 几何：厚边界、方角

最典型的结构是 `2–4px solid` 的明确描边，常用 `3px`；圆角通常为 `0`，或保持接近方角。网站明确建议为大多数组件使用一个 canonical stroke width，只有在表达层级时才偏离。

```css
--border: 3px solid #000;
--radius: 0;
```

描边在这里不只是装饰：它同时表达容器边界、可交互性、选中、焦点或错误状态。没有语义的边框应删除。

### 2.3 深度：硬偏移阴影

Neubrutalism 不使用拟真的环境阴影，而使用 offset 有、blur 为零的硬阴影，形成“叠放、错位、印刷套色”的感觉：

```css
--shadow-sm: 3px 3px 0 0 #000;
--shadow:    5px 5px 0 0 #000;
--shadow-lg: 8px 8px 0 0 #000;
```

网站建议把阴影分成等级：小阴影用于 badge/chip，中阴影用于 card/button，大阴影用于 overlay/hero/focus。所有元素都使用最大阴影会使层级失效。

### 2.4 排版：极端显示字体 + 平静正文

网站把排版定义为 assertive contrast：超大、重磅、紧凑的无衬线标题，与普通、易读、较宽松的正文形成对比。

推荐角色：

| 角色 | 网站示例 | 使用方式 |
|---|---|---|
| Display | Syne、Archivo Black、Bebas Neue | Hero、海报式标题、品牌语句 |
| Heading | Space Grotesk、Outfit | 区块标题、导航、组件标题 |
| Body | Inter、DM Sans | 长文本、表单说明、状态信息 |
| Mono | Space Mono、JetBrains Mono | token、代码、技术标签 |

核心原则是只让标题和 CTA “喊出来”，不要让所有文字都处于最大音量。正文可读性优先于风格一致性。

### 2.5 布局：有网格的破坏

好的 Neubrutalist 布局不是随机错位，而是先有底层网格，再局部使用偏移卡片、非对称间距、重叠或放大的模块制造张力。网站给出的判断是 **broken but not random**：宏观层可以不对称，微观层（表单字段、标签、错误状态、按钮）应保持机械对齐和可预测。

## 3. 组件和交互模式

### 3.1 Button

网站的 canonical button 是“描边 + 平面填充 + 硬阴影”：

```css
.btn {
  border: 3px solid #000;
  border-radius: 0;
  background: #FFD23F;
  color: #000;
  box-shadow: 5px 5px 0 0 #000;
  font-weight: 700;
  padding: 12px 24px;
  transition: transform 0.1s ease, box-shadow 0.1s ease;
}

.btn:hover {
  transform: translate(-2px, -2px);
  box-shadow: 7px 7px 0 0 #000;
}

.btn:active {
  transform: translate(3px, 3px);
  box-shadow: none;
}

.btn:focus-visible {
  outline: 3px solid #74B9FF;
  outline-offset: 3px;
}
```

交互隐喻是直接的物理反馈：hover 时“抬起”，active 时沿阴影方向“压下”。动效应短促、可中断，且不能替代焦点状态。

### 3.2 Card

Card 通常是白色或平面色块、厚边框、硬阴影和明确内边距；hover 时轻微向左上移动并增大阴影。Card 不需要圆角、玻璃材质或柔和渐变来表达层级。

### 3.3 Form 和 Toast

网站把输入框、select、textarea、checkbox、radio、toggle 和 toast 都纳入同一套语法：方角、粗边框、平面填充、硬阴影。Toast 使用高对比色、厚边框和硬阴影获得高可见性。

这里的关键不是“把每个控件染成彩色”，而是保持同一套边界、间距、状态和焦点约定。

## 4. 可访问性边界

`neubrutalism.com` 自己列出的常见失败包括：

- 黄色/白色等醒目配色仍可能对比度不足；
- 只用颜色表达成功、错误或选中状态；
- 厚边框造成点击区域看起来比实际更大；
- 大阴影遮住键盘焦点环。

实现时至少检查：

| WCAG 2.2 条目 | 对 Neubrutalism 的实际要求 |
|---|---|
| 1.4.3 Contrast (Minimum) | 普通文本至少 4.5:1，大文本至少 3:1。不要凭“颜色很亮”推断可读。 |
| 1.4.11 Non-text Contrast | 组件边界和状态指示需要足够对比度。 |
| 2.4.7 Focus Visible | 保留清晰、独立的键盘焦点样式；使用 `outline-offset`。 |
| 2.5.8 Target Size (Minimum) | AA 最小目标尺寸为 24×24 CSS px；视觉上的粗边框不等于实际命中区。 |
| 1.4.1 Use of Color | 不把颜色作为唯一的信息通道，配合文字、图标、形状或状态属性。 |

规范来源：[WCAG 2.2 1.4.3](https://www.w3.org/TR/WCAG22/#contrast-minimum)、[1.4.11](https://www.w3.org/TR/WCAG22/#non-text-contrast)、[2.4.7](https://www.w3.org/TR/WCAG22/#focus-visible)、[2.5.8](https://www.w3.org/TR/WCAG22/#target-size-minimum)、[1.4.1](https://www.w3.org/TR/WCAG22/#use-of-color)。

## 5. 适用场景与风险

### 适合

- 品牌官网、营销页、活动页、创作者工具；
- 需要强记忆点和明确 CTA 的产品入口；
- 设计系统文档、组件 playground、开发者工具；
- 可把“结构显性化”转化为产品个性的场景。

### 谨慎使用

- 高频、长时间使用的工作台；
- 数据密集型表格、编辑器和复杂设置页；
- 面向所有人群的公共服务；
- 需要安静、低刺激、内容优先的阅读流程。

更稳妥的产品策略是“表面层粗野、操作层克制”：在品牌入口、空状态、重点 CTA 和少量反馈组件中使用完整风格；在编辑器、表单、导航和密集信息区域保留规则化的布局和舒适的阅读密度。

## 6. 对实现的建议

1. 先建立 token：描边宽度、阴影偏移、圆角、表面色、结构色和强调色。
2. 为 `default / hover / active / focus-visible / disabled / selected / error` 定义完整状态，不只做静态截图。
3. 用语义组件承载风格：按钮、输入、卡片、徽章、提示、导航项共享结构规则。
4. 让宏观布局表达个性，让微观操作保持对齐、可预测和可键盘操作。
5. 在设计阶段就跑对比度检查，并在浏览器中实际检查键盘焦点、缩放、窄屏和 reduced-motion。

## 7. 资料索引

- [Neubrutalism.com：主参考文档](https://neubrutalism.com/)
- [Neubrutalism.com：GitHub 仓库与 README](https://github.com/neubrutalism/neubrutalism.com)
- [WCAG 2.2：W3C Recommendation](https://www.w3.org/TR/WCAG22/)
- [WCAG 2.2：Contrast (Minimum)](https://www.w3.org/TR/WCAG22/#contrast-minimum)
- [WCAG 2.2：Non-text Contrast](https://www.w3.org/TR/WCAG22/#non-text-contrast)
- [WCAG 2.2：Focus Visible](https://www.w3.org/TR/WCAG22/#focus-visible)
- [WCAG 2.2：Target Size (Minimum)](https://www.w3.org/TR/WCAG22/#target-size-minimum)
- [WCAG 2.2：Use of Color](https://www.w3.org/TR/WCAG22/#use-of-color)
- [MDN：`box-shadow`](https://developer.mozilla.org/en-US/docs/Web/CSS/box-shadow)
- [MDN：`border-radius`](https://developer.mozilla.org/en-US/docs/Web/CSS/border-radius)

## 资料性质说明

本文把 `neubrutalism.com` 作为风格的主要原始参考，把 W3C 作为可访问性规范来源。网站中的历史叙述、流行度判断和品牌案例属于该站点的编者综合，不应视为正式行业标准；本文主要保留其可观察的 UI 规则，并将规范性要求单独标出。
