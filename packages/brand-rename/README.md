# dsh-brand-rename

DSH Web 界面的品牌与文案改造，六部分：

### A. 侧栏左上角品牌区

- **删除**「deepseek」左侧的**鲸鱼图标**
- 把 **deepseek** 字样换成 **Demiurge**
- 原样保留右侧的 **HARNESS 徽标**（逐像素不变）与原有排版尺寸

### B. 新会话 Hero 区

- 标题文字**可保留多条**（默认 `嗨，想我了吗？`；最多 10 条，每条 ≤60 字）
- **每条可以再配一行英文副标题**（≤80 字，与它上面对应的那条中文配对显示；留空就不显示）
- **中文标题自己也能调**：字号（直接改 font-size，放大会把整块自然撑高，同时按同比例给行高）、
  上下 / 左右（走 transform，只挪视觉位置、不挤动布局）；字号留在「默认」就跟随系统
- 英文行是**悬浮**的（不占版面高度）：**字号 / 上下 / 左右**三根滑杆自己调，两端都支持负值
- **可锁定**：同一行有「锁定大小与位置」开关，锁上后中文 / 英文两组滑杆都不可拖动（防误触）；
  文字编辑和增删标题不受影响，状态存 `localStorage`
- **调整时半透明**：按住滑杆或聚焦英文输入框时设置面板变半透明，能直接看到后面的新会话页；松手/失焦立刻还原（不透明度可调 20%–90%）
- 每次打开新会话按**随机**或**顺序**选一条：
  - **随机**：从非空标题里随机抽一条，并避免与上一次重复；
  - **顺序**：按列表顺序取一条，到底后回到第一条循环；
- 空行不参与抽取；**一条都没有**则保留系统原文
- **删除**标题右侧的 **预览版** 徽标（英：`Preview`）

### C. 输入框提示文案

- **各会话状态**的灰色提示文字都可自定义，且**逐条分开设置**
- 每条可以再填一句**英文**（你自己写），显示时**中文一行、英文另起一行**
  （两侧都留空才保持系统默认）

### E. 权限名称

- 「**仅可查看 / 工作区内修改 / 完全权限**」三项的显示名可自定义
- 输入框旁的权限选择器与「设置 → 权限」**两处同时生效**
- 留空 = 保留系统原文；确认弹窗里带「完全权限」字样的文案会**一并替换**

### H. 模式滑块（工作模式 / 纯文本对话模式）

- Hero 标题（含下方英文副标题）**正下方**一个两档滑块：
  左「工作模式 / Work」= 原来的 `standard` 预设；右「纯文本对话模式 / Plain chat」= 本地 `chat` 预设
- 切换走 DSH 自己的 RPC（`remote.agentPresets.select`），和界面原生那个预设下拉同一通道；
  **只有空白会话切得动** —— 一旦发过消息会话不再是 blank，滑块随 Hero 一起消失
  （"输入提示词后即刻固定" 是 DSH 原生行为）
- 中文 + 换行英文，两档各自成行；轨道也能点，点一下切到另一档

「纯文本对话模式」预设（`~/.dsh/.agent-presets/chat/`）：
人设 = Cyrene-Agent 的 Chat 模式原文四篇（`chat_system.md` + `chat_identity.md` + `soul.md` +
`canon_quotes.md`，取自 Cyrene-Agent 上游 `prompts/`，一字未改）末尾另加一段表情包规则；
`complete: true` + `includeRuntimeContext: false`，即**这套提示词就是全部系统提示词**
（不叠加编码 Agent 的身份 / 工具规范 / 运行时上下文）；工具只挂 `dsh-tool-web`（联网搜索），
表情包工具由宿主提供。

### G. 状态栏单位的英文

- 屏幕下方那串「**3 轮 5 步** · 1.2k tokens · **缓存命中 45%**」里的三个词，
  各自在**后面**接一句英文（默认 `Rounds` / `Steps` / `Cache hit`，可自己改）
- 留空则不加；改设置时旧的那截会**先撤掉**，不会新旧并存

### F. 侧栏文字的英文

- 左下角「**设置**」和它上方的「**美化**」后面各接一句英文（默认 `Settings` / `Beautify`，可自己改）
- 中间空一格；留空 = 只显示原文

### D. 设置行

- B、C、E、F 的输入面板，挂在 **设置 → 通用**（`settings.general.item`）
- C 的面板可折叠；改动即时生效，写入 `localStorage`

## A 的实现方式

侧栏品牌区由两个 `single` 槽位渲染（由 `@deepseek-ai/dsh-client-ui-sidebar` 声明）：

| 槽位 | 官方占用 |
| --- | --- |
| `sidebar.brand.mark` | `FishLogo`（鲸鱼） |
| `sidebar.brand.name` | `BrandWordmark`（一个 SVG，同时画了 deepseek 字母 **和** HARNESS 徽标） |

槽位注册带 `priority`，`single` 槽位**同优先级重复注册会抛错，换优先级即可遮蔽，最低优先级渲染**。
官方用默认 `0`，本插件用 `-1` 接管。

关键点：`deepseek` 是**矢量路径不是文字**，且与 HARNESS 徽标同处一个 SVG。为了不动徽标：

1. 仍然渲染官方 `BrandWordmark`（`includeMark: false`）——徽标因此完全不变；
2. 用 CSS 只隐藏那 9 条字母路径：字母是该 `<svg>` 的**直接子节点**，
   而鲸鱼和徽标都包在 `<g>` 里，所以 `.dsha-brand-wordmark > path` 精确命中字母；
3. 把 `Demiurge` 以绝对定位叠在原字母位置。

### 关于「字体保持不变」

原字样是绘制出来的 logo 矢量，**本身没有字体**，因此无法复用同一字体。
本插件用 `font-family: inherit` 跟随页面 UI 字体，并按截图实测对齐：
原字母 ink 高约 17 CSS px、宽约 95 px，SVG 以 `size=24`（156×24）1:1 渲染，
文字取 18px / 600 字重，落在字母区内且不会碰到徽标。

## B 的实现方式

Hero 区结构（`@deepseek-ai/dsh-client-ui-conversation`）：

```html
<span class="<hash>_titleGroup">
  <span>探索未至之境</span>                       <!-- 纯文本，无插槽 -->
  <span class="<hash>_previewBadge">预览版</span>  <!-- 纯文本，无插槽 -->
</span>
```

这里**没有可用的槽位**（该区唯一的槽位是图标 `conversation.hero.brand.mark`），
也不能靠覆盖 locale —— `locale.register` 对**同 namespace + 同语言**会直接抛错：

```
locale namespace "conversation" already has locale "zh"
```

所以只能改 DOM。

标题的设置值是**列表 + 选取方式**：

| 存储值 | 含义 | 表现 |
| --- | --- | --- |
| `headlines: null`（键不存在） | 没设过 | 用插件默认值 `嗨，想我了吗？`（单条） |
| `headlines: []` | 一条都没有 | **不重命名**，保留系统原文 `探索未至之境` |
| `headlines: [...]` | 候选列表 | 每次新会话按 `headlineMode` 选一条 |

```jsonc
{
  "headlines": ["嗨，想我了吗？", "今天想做什么？", "从哪开始？"],
  "headlineEns": ["Hey, missed me?", "What shall we do today?", "Where do we start?"],
  "headlineStyle": { "size": 0, "gap": 0, "offsetX": 0 },      // 中文标题；size 0 = 跟随系统
  "headlineEnStyle": { "size": 14, "gap": 6, "offsetX": 0 },
  "panelDim": true,              // 调整时让设置面板半透明（默认开）
  "panelDimAlpha": 0.5,          // 半透明的程度
  "placeholderEns": {            // 各状态提示的英文（与 placeholders 同 key）
    "hero": "Describe what you want to build…"
  },
  "sidebarLabels": { "settings": "Settings", "beautify": "Beautify" },
  "statsLabels": { "turns": "Rounds", "steps": "Steps", "cache": "Cache hit" },
  "headlineMode": "random",      // random = 随机（默认）；sequence = 顺序轮换
  "headlineCursor": 2,           // 顺序模式的游标（内部状态，自动维护）
  "headlineLast": "从哪开始？"    // 上一次抽到的那条，随机模式用来避免连着重复
}
```

`headlineEns` 与 `headlines` **按序号配对**（第 i 条英文是第 i 条中文的副标题），
所以增删条目时两个数组一起动；中文为空的行走不到，那条英文也就不会出现。

英文行是自己插进标题组的节点（前端没有这个槽位），所以带一个
`dsha-headline-en` 类名，标题识别循环会**跳过**它 —— 否则它那格空文本会被
当成「空的标题格」而被写进中文标题。

**中文标题的样式**走 `applyHeadlineStyle(el)`：字号写 `font-size`（同时按前端
`26px/32px ≈ 1.2308` 的配比写 `line-height`，否则放大后会被固定行高压扁），
上下/左右写 `transform`（纯视觉偏移）。`size === 0` 表示不干预 —— 此时连行内
样式都不写，跟系统默认完全一致；滑杆上显示的是第一次补丁时从
`getComputedStyle` 读到的系统字号，拖动即接管。列表被清空、标题退回系统原文时
样式照样生效（用户要的就是"原中文也能调"）。

**英文行的定位方式：悬浮。** 英文行 `position:absolute`、挂在标题组（`position:relative`）
下方：`top:100%` 贴中文、`left:50%` + `translateX(-50%)` 居中，再叠上用户的
上下/左右偏移。因为脱离了文档流，把它往下挪时**输入框和整张卡片的高度一帧都不变**。
（最初做成在流里、靠 `flex-direction:column` 排在中文下面，结果是拖上间距会把
卡片一起撑高 —— 所以改成了悬浮。）定位与字号全部走行内样式，不依赖那份
`<style>`（热替换时它可能来不及更新）。

## 调整时半透明

设置面板是盖在页面上的 `role="dialog"` + `aria-modal` 浮层，下面是半透明遮罩和
对话页本身 —— 所以把它调成半透明就能"透过面板"看新会话页。

- 用 `[role="dialog"][aria-modal="true"]` 找面板，再用行上的标记类名
  `dsha-brand-row` 确认「这个 dialog 是我们的设置面板」，不误伤别的弹窗；
- **交互时**才透明：滑杆 `pointerdown` / 英文输入框 `focus` 打开，指针松开
  （监听 window 的 pointerup/pointercancel/mouseup/touchend）或失焦关闭；
- 指针按着时忽略 `blur`，否则「先编辑英文再拖滑杆」会在拖到一半被还原；
- 只在值真的变了才写 `style.opacity`，避免每次指针松开都做一次无谓的 DOM 写入。

所以「恢复默认」按钮写回 `headlines: null`（回到插件默认），而把条目删光是
`headlines: []`（回到系统原文），两者是不同的意图，不能混为一谈。

抽取规则：

- 空行 / 纯空白条目在抽取时被**忽略**，但保留在面板里可继续编辑；
- **一次新会话只抽一次**：判定依据是「离开新会话页 → 再回来」（Hero 整块不在场），
  页面内部的重渲染、标题格节点被 React 重建，都只把**同一条**写回去；
  只有缺席 ≥ 800ms 才算真的换了页面（挡住 React 抖动式拆建）。
  所以标题不会自己在屏幕上几秒变一次；
- 顺序模式的游标与「上次结果」都落盘，刷新页面后接着轮换、继续避免重复；
- 随机模式在候选 >1 时排除上一次，避免出现「随机却老撞同一条」的观感。
- 设置里改了列表：当前这条若还在，就不动；被删掉了才换一条顶上（不推进轮换）。

旧版单个 `headline` 字段会自动迁移：`'x'` → `['x']`、`''` → `[]`、`null` → `null`。

### 标题格的识别：结构优先，不依赖原文

`_titleGroup` 里除徽标外只剩一格，**位置本身就是最硬的证据**。所以：

| 标题格的现状 | 判定 | 动作 |
| --- | --- | --- |
| 系统原文（`探索未至之境` / `Into the Unknown`） | 一次新的出现 | 抽一条写进去 |
| **空的**（且没有我们的标记） | 一次新的出现 | 抽一条写进去 |
| 正是我们写进去的那条 | 归我们管 | 只在它已经不合法时才换 |
| 其它非空文案 | 不认识 | 只清过期标记，绝不改文本 |

「空的一格也要接管」是实机踩出来的：某些版本/时机下前端这一格渲染出来就是空的
（`t("hero.headline")` 没给出文本），如果只能靠「先认出原文」判断，插件会永远
认不出它，用户设的标题一条都写不进去 —— 而空 ≠ 别人写的文案，接管它是安全的。
（还原用的 `data-dsha-headline-orig` 此时记下的是空串，语义仍然自洽。）

标题节点沿用和输入框提示同一套三情形状态机（`data-dsha-headline-orig` /
`data-dsha-headline-applied`），保证列表变了能重抽、清空时能还原、
且系统原文变更时不会被旧快照盖掉。

## C 的实现方式

灰色提示最终显示的是 `composePlaceholder(中文, 英文)`：**中文一行、英文另起一行**（`\n` 连接）；
任何一侧留空就只用另一侧，两边都空则完全不动（保持系统默认）。

官方那条 CSS 是 `white-space:nowrap` + 省略号，所以写我们自己的文案时会在节点上
补一个行内 `white-space:pre-line`（既认 `\n` 也会自动折行），还原成官方原文时再摘掉。两个数组按同一个
状态 key 配对（`placeholders` / `placeholderEns`），所以增删状态不会错位。

输入框（`InputBar`）里，灰色提示是这样一个普通节点：

```html
<div class="<hash>_placeholder" data-composer-placeholder="true">文案</div>
```

旁边 contenteditable 上另有 `data-placeholder` / `aria-label` 两个属性同步。

- `data-composer-placeholder` 是**稳定的 data 属性**（不是 hash 类名），选择器可靠；
- `conversation.composer.bar` 虽然是槽位，但是 `single` 且文本面是 **Lexical 编辑器**
  —— 接管它等于重写整个输入框，所以这里同样只改 DOM。

### 支持的 7 种状态

官方 `InputBar` 的提示按状态取值，本插件逐条分开支持：

| 状态 | 官方原文（zh） |
| --- | --- |
| `hero` | 描述你想要构建的内容, / 调用指令, @ 文件或对话 |
| `default` | 发消息或创建任务, / 调用指令, @ 文件或对话 |
| `plan` | 描述你的任务以生成计划 |
| `steerQueue` | Cmd/Ctrl+Enter 插话发送全部排队消息 |
| `workspace` | 选择一个工作区开始 |
| `unavailable` | 会话不可用 |
| `parentOffline` | 父会话已离线，无法继续发送；仍可停止当前运行 |

这 7 条官方原文（中/英各一份）构成一张表，同时充当**运行时识别基准**与
**设置面板输入框的灰字提示** —— 单一数据源，看到的就是系统默认。

识别方式是把节点当前文本**归一化后**（忽略空白与中英全半角逗号）比对这张表。

### 状态机：三个情形

每个提示节点只会落进三种情形之一（这是本节的核心）：

| 情形 | 判据 | 动作 |
| --- | --- | --- |
| **A** | 当前文本是某个状态的**官方默认** | 有自定义就替换；没有就只清标记、不碰文本 |
| **B** | 当前文本正是**我们写进去的**文案 | 设置改了就跟上；清空了就还原成记录里的原文 |
| **C** | 其它（不认识的文案） | **只清过期标记，绝不改文本** |

情形 C 是刻意留的。如果将来 DSH 改了官方原文，这张表就认不出来 ——
此时若拿手里存的旧原文去「还原」，就会把新文案盖掉。所以「是不是我们写的」
必须靠 `data-dsha-ph-applied` 这个**自己写入的值**判断，而不是靠「不匹配就还原」。

> 这套逻辑有 Node 桩 DOM 的行为测试覆盖。测试文件在 `tests/`：
> `placeholder.test.mjs`（输入框提示 + 英文换行，46 项）与 `headline-multi.test.mjs`
> （中英标题的大小与位置 / 侧栏与状态栏英文 / 模式滑块 / 随机与顺序 / 空标题格兜底 / 权限改名，216 项）。跑法：
>
> ```sh
> node tests/placeholder.test.mjs && node tests/headline-multi.test.mjs
> ```

## E 的实现方式

三个权限预设的文案活在**两个已经注册好的 locale 命名空间**里：

| 命名空间 | 预设名键 | 出现在 |
| --- | --- | --- |
| `conversation` | `access.preset.readOnly` / `access.preset.workspaceWrite` / `access.preset.fullAccess` | 输入框旁那个权限选择器 |
| `settings.permission` | `preset.readOnly` / `preset.workspaceWrite` / `preset.fullAccess` | 设置 → 权限 那一行 |

`locale.register` 对**同命名空间 + 同语言**会直接抛错，所以这两个不能重新注册。
本插件改走**直接改写字典对象**这条路：

1. 从 `ctx.locale.dicts` 拿到这两个命名空间的字典；
2. 每个键**第一次**见到的值记进 `permissionOriginals`（原值快照，之后不再覆盖）；
3. 有自定义名就写进去，没有就写回原值（原本没有这个键就删掉）；
4. 改完推一次 `ctx.locale.publish(active, false)` 让用 `t()` 的组件当场重渲染。

`t()` 是渲染时现场读字典的，所以即使不推 publish，下次渲染也会读到新文案 ——
publish 只是让它立刻生效。

**确认弹窗**（`access.confirm.*` / `confirm.*` 的标题、说明、按钮）里的
「完全权限」是**拼进句子**的，所以改名时按「原文.replace(原预设名 → 新预设名)」派生：
预设叫「完全放开」，弹窗就会变成「确认启用完全放开？」。恢复默认时同样按这条
派生式写回原名，因此重复执行是幂等的。

### 注意事项

- `dicts` 不是公开 API，属于内部结构；DSH 升级换了实现就失效 —— 所以全程
  try/catch + 存在性判断，拿不到就安静跳过，不影响插件其余功能。
- 字典可能比本插件**注册得晚**（`conversation` / `settings.permission` 的 apply
  顺序不保证），所以插件订阅了 locale 变化，字典一出现就补上。
- 自定义名会**同时写进 zh 与 en 两份字典**（你给的是自己的叫法，不做翻译）。
- 图标不在此列：三个预设的图标写死在 `dsh-client-ui-conversation` 的
  `permissionGlyphs` 里，host 配置只有 `sandbox/approval/name/description`，
  没有图标位；要换只能做 DOM 替换。

## G 的实现方式

这串文字来自 `chat` 命名空间的两条模板（`stats.counts = "{turns} 轮 {steps} 步"`、
`stats.cacheHit = "缓存命中 {percent}%"`），分别渲染在两个 pill 的
`<span class="…_label">` 里。

- **只改文本节点**（`node.data`），不写 `textContent`：那个 label 里还有
  `_sep`（分隔点）等子元素，整段重写会把它们抹掉；
- 英文接在中文词后面 → 渲染成「3 轮 Rounds 5 步 Steps」；
- **幂等**：已经带这截英文就不再叠加；改设置时先用
  `statsTailApplied` 记下的上一版把它撤掉，再写新的；
- 数字 / 百分比是 React 直接改文本节点更新的（childList 不变），所以观察者
  加了 `characterData: true` —— 我们的写入本身幂等，多跑一次不会有改动，不构成自激。

## F 的实现方式

两个标签都是别人渲染的：

| 标签 | 出处 | 认领方式 |
| --- | --- | --- |
| 设置 | `SettingsRoot` 的 trigger（`settings.trigger` 槽位的默认内容） | `[class*="_settingsArea"] [class*="_triggerLabel"]`；找不到就退化成所有 `_triggerLabel` 再按原文「设置」筛 |
| 美化 | `dsh-ui-boost` 自己写的按钮 | `[class*="dshub-footbtn"]`（它会在「🎨 美化 / ✕ 美化」之间切） |

策略和 Hero 标题一致：只在**认得出原文**时接管，把「原文 / 我们写进去的值」记在
节点上（`data-dsha-sidebar-base` / `-applied`）。于是：

- 反复补丁不会重复叠加（写之前先比对自己上次写的值）；
- 改了设置跟着改；
- ui-boost 把按钮文案在 🎨 / ✕ 之间切换（React 重渲染成新文本）→ 重新认领并补上后缀；
- 认不出的文案（比如英文界面下的 `Settings`）一律不碰。

## DOM 补丁的通用要点

- 选择器尽量用**稳定的 data 属性或类名后缀子串**（`<hash>_<本地名>`），构建换 hash 也命中；
- 徽标用 `display: none` 而不是 `remove()`：React 只 diff 自己的 vdom，
  手动改的 `textContent` 和它不管理的 `style` 都不会被回滚；
- 用 MutationObserver（rAF 合帧）兜住 React 整棵重建的情况；
- 只有文本真的不同才写 DOM，且只观察 `childList` —— 避免「改写触发观察者再改写」的自激循环；
- 判断「这个节点归不归我管」要用**自己写进去的值**，不要用「不匹配默认值」这种反向推断。

## C4. 模式滑块（工作模式 / 纯文本对话模式）

Hero（新会话页）标题正下方那个两档滑块，把这一档选择直接交给 DSH 自己的预设 RPC：

- 左档 = `standard`（工作模式，DSH 出厂那套编码 Agent 提示词，一字未动）；
- 右档 = `chat`（纯文本对话模式，本机 `~/.dsh/.agent-presets/chat` 那套昔涟陪聊人设）。

实现要点：

- 服务必须写在 `ctx.inject` 里（`['sessions', 'remote', 'remote.agentPresets']`）才能访问；
  用 `ctx.get('remote')` 会抛 `cannot get property "remote.agentPresets" without inject`，
  而且异常会被 Promise 静默吞掉 —— 表现就是「滑块点了没反应」。
- 只有**空白会话**切得动：一旦发过消息，Host 拒绝给运行中的会话换预设，Hero 消失、滑块也跟着摘掉。
  想换档就在新会话页先滑，再发第一句话。
- 选择先 `stage` 再交给当前会话（和原生 seat 一样）：没有会话时先记着，等 `sessions.list` 变化再应用。

配套的 `chat` 预设里不能出现 DSH 不认识的提示词变量（`{{...}}`）——
`dsh-system-prompt` 只注册了 `provider` / `model` / `cwd` 三个，
原文里那个 `{{user_nickname}}` 不处理的话一发文就整轮报
`unknown prompt variable "{{user_nickname}}"`。现在这个变量由本插件的主机半边注册
（见下一节），所以预设里可以放心用它。

## C5. 聊天模式里的称呼（主机半边 + 设置行）

设置 → 通用 最后一行「聊天模式里的称呼」，改的是 **系统提示词**，不是浏览器表面：

- 主机半边 `index.js` 用 `ctx.systemPrompt.variable('user_nickname', () => nickname)`
  把昵称注册成提示词变量。provider 是函数，**每轮装配时现取**，所以改完下一轮就是新值。
- 变量必须由主机插件注册：`{{...}}` 的插值发生在 `dsh-system-prompt` 里，
  出厂只有 `provider` / `model` / `cwd` 三个。所以 `index.js` 里
  `export const inject = ['systemPrompt']` 不能少 —— 少了就是
  `cannot get property "systemPrompt" without inject`。
- 浏览器半边碰不到主机文件系统，所以昵称走一个小接口读写：
  `GET/POST /dsh-brand-rename-api`，落盘 `<DSH_HOME>/dsh-brand-rename.json`。
- 昵称会被拼进提示词，所以写入前清洗：换行 / 花括号 / 控制字符一律去掉，最长 24 字。
  空输入 = 恢复默认「伙伴」。
- 接口 404 时那一行会显示「主机接口没回应：新版主机半边要重启一次 DSH 才会加载」
  —— **主机半边改动需要重启**（profile 的 `patchReload: startup`），浏览器半边才是热更新。
- 接口顺带回 `presetUsesVariable`：预设里还写着写死的称呼时，设置行会提醒
  「换成 {{user_nickname}} 后这里才管用」，避免出现「已保存但没变」。

首次启用（或预设被重置、重新灌入昔涟原文）时，`chat` 预设里要有**两处**用到这个变量：

```yaml
      用户的昵称是「{{user_nickname}}」——下面说的「用户昵称」就是它，你知道该怎么称呼他，不用问。
      适当主动使用它，让交流更有“正在和这个人说话”的感觉。

      * 在强调重点、回应情绪、提醒、赞同或反驳时，优先自然称呼用户。
      * 不要每条回复都叫，也不要固定用“{{user_nickname}}，……”开头。
```

第一行（定义）是必须的：原文只有下面那条**否定**规则，名字只出现在例句里，
变量一旦被替换成一个代词（比如「你」），提示词里就再也没有名字了 ——
表现就是「她从不主动叫称呼」。改完这两行要**新开会话**才生效：
预设 composition 是挂载时读的快照，正在跑的会话仍用旧的一份
（`standing` 挂载按 composition 文件的时间戳判新旧，只对之后新建的会话换新）。

## 安装 / 卸载

```sh
git clone https://github.com/Cyrene-xl/DSH-Cyrene-UI.git
cd DSH-Cyrene-UI

# 从仓库目录安装（link）
dsh plugin --profile web add link:$PWD/packages/brand-rename

# 卸载
dsh plugin --profile web remove dsh-brand-rename
```

装好后**重启 DSH**（或重开 App）生效。

## 注意

- 依赖官方 `BrandWordmark` 的内部结构、Hero 的 `_titleGroup` / `_previewBadge` 类名后缀，
  以及 `data-composer-placeholder` 属性。DSH 前端大版本改了这些就需要同步更新 `client.js`。
- `primitives` 取不到时降级为「只有文字、没有徽标」，不会导致插件整体失效。
- 文案走本插件自己的 locale 命名空间 `dsh-brand-rename`（中/英）。
- 删除图标对**展开的品牌行**和**折叠态的窄轨图标**同时生效（同一个槽位）。

### 设置存在哪

标题、输入框提示、侧栏英文、底栏单位、权限名称这些设置**优先存宿主机**
（`<DSH_HOME>/dsh-brand-rename.json` 的 `view` 字段），`localStorage` 只当缓存。
DSH 换端口 / 换包名 / 升级都会换 origin，localStorage 会整体丢；宿主文件跟着
`~/.dsh` 一起备份，不会再因为换版本把文案清空。
