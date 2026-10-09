# KidsMath MVP 实现说明（纯前端离线版）

| 项目 | 内容 |
| --- | --- |
| 文档版本 | v1.0 |
| 日期 | 2026-10-07 |
| 作者 | 高见远 · 架构师 |
| 上游文档 | `docs/PRD.md` v1.3、`docs/DESIGN.md` v1.3 |
| 代码位置 | `E:/work1/kids-math/app/`（22 个文件 / 6249 行，零 npm 依赖） |
| 适用读者 | 接手继续开发的工程师、测试、后续做「② 全栈版」的后端 |
| 状态 | 可运行（`file://` 双击 `index.html` 即可） |

> **本文与 DESIGN.md 的关系**：DESIGN.md v1.3 描述的是「② 全栈版」（React + Vite + Dexie + FastAPI + PostgreSQL）的目标架构；本文描述的是用户选定「① 纯前端离线 MVP」后**实际落地**的实现。二者的差异不是偏离，而是路线选择；本文第 1 节给出逐项对照与「做 ② 时如何迁回」的迁移动作，**实现细节以本文为准，目标架构以 DESIGN.md 为准**。
>
> 本文不修改 PRD.md 与 DESIGN.md。

---

## 1. 本期实现 vs 原设计：差异对照与回迁路径

| # | 原设计（DESIGN.md v1.3） | MVP 实际做法 | 差异原因 | 做 ② 时如何迁回 |
| --- | --- | --- | --- | --- |
| 1 | React 18 + TypeScript + Vite，路由 lazy 拆包 | **原生 JS + 手写 DOM**（`KM.Dom` 工具），单页路由 `KM.App.go(name)` | 选 ① 路线：要能 `file://` 直接跑、零构建、零依赖 | 页面改为 React 组件；`KM.Dom.el/clear/on` 的调用点替换为 JSX；路由替换为 React Router（DESIGN §2.1 路由表可直接使用） |
| 2 | TypeScript 严格类型 | **ES5 风格 JS + JSDoc 注释**（为兼容老浏览器与 file://） | 无编译步骤 | 按本文第 4 节的 JSDoc 签名直接补 `.d.ts` 或改 `.ts`，签名不用变 |
| 3 | Zustand + TanStack Query | **模块内闭包变量 + 单一 state 对象**（`KM.Points.state()`） | 无框架；无服务端（Query 无对象） | 闭包状态迁到 Zustand store；服务端请求迁到 Query（DESIGN §2.2 `features/*/api.ts`） |
| 4 | Dexie + IndexedDB（题组 / 快照 / `pending_ledger` 多表） | **`localStorage`，统一 key 前缀 `km.`**，单个 state 大对象（`km.state.v1`） | 选 ①：无服务端、无同步；localStorage 同步 API 更简单，且 `file://` 支持 | 引入 Dexie，按 DESIGN §3.5 建 `snapshots / questionSets / pendingLedger / localLedger` 四张表；`KM.Storage` 的 `get/set/remove` 改为 Dexie 事务版本（接口名可保留） |
| 5 | Web Worker 预生成题组（R12 ≤150ms） | **主线程同步生成**；10 题实际耗时远低于 150ms（未打点，需实测） | 无构建工具时 Worker 在 `file://` 下受限 | 迁回 Worker（`generator.worker.ts`），主线程只做首题兜底（DESIGN §4.2.3） |
| 6 | 确定性 PRNG（`seedrandom`）+ `seed` 可复现 | **`Math.random()`**，题目对象没有 `seed` 字段 | 无服务端、无错题回看需求，暂不需要复现 | 加 `seedrandom`，`generateSet` 接收并返回 `seed`/`generatorVersion`（签名见本文 §4.2） |
| 7 | Lottie JSON（≤150KB）+ SVG/CSS 补充 | **100% 内联 SVG + CSS/JS 时间轴**（`KM.Anim.Timeline`），6 个动画 builder | 选 ①：不引入 lottie 运行时、不需要资源文件 | 教学活动保留 SVG（体积小）；如需长动画再引入 `lottie-react` 动态导入（DESIGN §7.4） |
| 8 | WebAudio 合成音效（无音频文件） | **WebAudio 合成**，完全按原设计实现 | 无差异 | **无需迁移**，直接沿用 `KM.Audio`（接口与 DESIGN §6.5 一致） |
| 9 | PWA / Service Worker / Background Sync / 离线知识包 LRU 200MB | **无**（`index.html` 有 `apple-mobile-web-app-capable` 元信息，但无 SW） | `file://` 无法注册 SW；选 ① 无缓存需求 | 加 `vite-plugin-pwa`；知识包与 `pending_ledger` 补登走 SW（DESIGN §4.5 / §5.4） |
| 10 | 云端账号（家长 OTP + 儿童 PIN + JWT + 离线租约） | **无账号、无登录**，打开即用 | 选 ①：单机离线 | 新增 `features/auth/*`，接入 DESIGN §6.2 鉴权与 §6.3 `POST /auth/*` |
| 11 | 积分云端权威 + pending 补登 + 幂等 + 多端合并 | **本地权威**：`KM.Points` 直接改内存 state 并写 localStorage；幂等键仍保留（`add(reason, amount, key)`） | 无服务端 | `KM.Points.add()` 改为「本地乐观 + 写 `pending_ledger` + 调 `POST /points/ledger:sync`」；服务端按 `idempotencyKey` 去重（DESIGN §5.2/§5.4） |
| 12 | 家长端 3 件事（代建账号 / 时长管控 / 现实奖励确认） | **全部未实现**（无家长入口） | 依赖账号体系 | 新增 `features/parent/*`；接口见 DESIGN §6.3 `/parents/me/children*`、`/parent/settings`、`/parent/rewards/{id}:confirm` |
| 13 | 现实奖励券（唯一消费出口，500 分/张，家长确认） | **未实现**；`js/ui/rewards.js` 只是「我的星星」展示页（成长树 / 签到 / 徽章 / 任务 / 流水），**没有任何消费路径** | 无家长端、无账号 | 新增 `features/rewards/*` 与 `POST /rewards/vouchers/{sku}:apply`、`POST /parent/rewards/{id}:confirm`（DESIGN §5.6） |
| 14 | 错题本与错题重练（V1.1，但数据层先建） | **`state.wrongBook` 只写不读**（`KM.Points.addWrong()` 入内存数组，上限 100 条），**无 UI、无重练** | V1.1 范围 | 接 `wrong_book` 表（DESIGN §3.4），V1.1 再补 UI |
| 15 | 28 个知识点 / 23 条特例卡 / 12 枚徽章 | **6 个知识点 / 9 条特例卡 / 8 枚徽章** | MVP 内容量按可完成度裁剪 | 内容数据文件按结构追加即可（`js/data/knowledge.js`、`hints.js`），`sourceRef` 必填校验已就位 |
| 16 | Service Worker 离线动画缓存（C-10） | 不需要：动画是内联 SVG，天然离线 | 实现方式的自然结果 | 无 |
| 17 | 语音朗读（V1.1 再评估）/ 多语言 / 老师端 / 排行榜 | **全部未实现**，与 PRD §8.4 一致 | 范围红线 | 见本文 §5 |
| 18 | 防沉迷：单次 20 分钟 + 每日累计 40 分钟 + 夜间 21:00–08:00 | **仅单次 20 分钟蒙层**（`main.js` `REST_AFTER`），**刷新页面即重新计时**，无每日累计、无夜间模式、无家长解锁 | 家长端未做，无法持久化管控设置 | 接入 `settings_parent` 表与家长端设置（DESIGN §3.3、§6.3 `PUT /parent/settings/{userId}`）；计时改为服务端累计 + 本地签名快照 |

**结论**：R4 出题规则、积分不变量、`sourceRef` 可追溯、三级提示机制这四条「P0 中的 P0」在 MVP 中**已按 DESIGN.md 的口径完整实现**（含双重卡口与幂等），是全栈版可直接复用的部分；差异集中在**账号 / 云端 / 家长端 / 存储 / 框架**这五类，均属「选 ① 路线」的直接后果。

---

## 2. 实际文件清单与职责

| # | 文件 | 行数 | 职责 | 依赖 |
| --- | --- | --- | --- | --- |
| 1 | `index.html` | 43 | 应用外壳：根节点 `#km-app`、飘字层 `#km-toast`、休息蒙层 `#km-rest`；按顺序引入全部脚本 | — |
| 2 | `css/tokens.css` | 78 | Design Token（CSS 变量：配色、圆角、间距、字号），对应 PRD §6.1 | — |
| 3 | `css/base.css` | 154 | Reset、字体、`km-app/km-page` 布局、无障碍媒体查询（`prefers-reduced-motion`、大字模式） | tokens.css |
| 4 | `css/components.css` | 538 | 组件样式：按钮、卡片、chip、数字键盘、进度点、结算页、成长树、徽章、休息蒙层 | tokens.css |
| 5 | `js/core/storage.js` | 134 | `KM.Storage`：localStorage 封装，key 前缀 `km.`，不可用/配额不足时自动降级为内存存储 | 无 |
| 6 | `js/core/rules.js` | 374 | `KM.Rules`：**R4 硬规则断言** + 数值范围表 `RANGE_TABLE` + 年级允许运算 `OPS_BY_GRADE` + 组质量断言 | 无（纯逻辑，Node 可加载） |
| 7 | `js/core/audio.js` | 175 | `KM.Audio`：WebAudio 合成音效，静音/音量持久化到 `km.settings.audio` | KM.Storage |
| 8 | `js/data/knowledge.js` | 258 | `KM.Knowledge`：6 个知识点 + 9 条特例卡；`validate()`/`renderable()` 强制 `sourceRef` | 无 |
| 9 | `js/data/hints.js` | 188 | `KM.Hints`：按 `hintKind` 的三级提示模板集，`validate()` 强制 `sourceRef`，`build()` 参数化渲染 | 无 |
| 10 | `js/core/generator.js` | 650 | `KM.Generator`：**出题引擎**（普通题 / 送分题 / 边界题 / 兜底题 + 整组生成 + 双重 R4 卡口），1 星题生成 3 个选项 | KM.Rules |
| 11 | `js/core/points.js` | 538 | `KM.Points`：积分引擎（幂等 + 日上限 200）、成长树 8 级、8 枚徽章、每日任务、签到、难度自适应、错题写入 | KM.Storage |
| 12 | `js/ui/dom.js` | 196 | `KM.Dom`：DOM 工具（`el/clear/esc/on`）+ 20 个内联 SVG 图标 + `topbar/soundButton/stars/toast/combo` | KM.Audio（soundButton） |
| 13 | `js/ui/mascot.js` | 110 | `KM.Mascot`：小熊猫「数数」内联 SVG，4 种表情 | KM.Dom |
| 14 | `js/ui/animations.js` | 551 | `KM.Anim`：`Timeline` 时间轴 + 6 个动画 builder（add/sub/mul/div/rem/carry）+ `mount()` | KM.Dom |
| 15 | `js/ui/home.js` | 136 | `KM.Home`：首页（吉祥物、问候、积分、三个入口、今日签到）；**吉祥物连点 5 次进自测页** | KM.Dom/Mascot/Points/App |
| 16 | `js/ui/learn.js` | 200 | `KM.Learn`：学一学（知识点列表 / 特例卡列表 / 详情页），详情页显示 `sourceRef` 并调用 `KM.Anim.mount` | KM.Dom/Anim/Points/Knowledge |
| 17 | `js/ui/practice.js` | 541 | `KM.Practice`：练一练（选年级/运算/难度 → 10 题 → 三级提示 → 结算） | KM.Dom/Generator/Points/Hints/Rules/Audio |
| 18 | `js/ui/rewards.js` | 209 | `KM.Rewards`：**我的星星**（成长树 SVG、签到、每日任务、徽墙、积分流水）—— 注意**不是**奖励券兑换 | KM.Dom/Points |
| 19 | `js/ui/selftest.js` | 258 | `KM.SelfTest`：浏览器内自测页（R4 属性测试 / 边界用例 / 组质量 / 内容校验 / 积分不变量） | 全部核心模块 |
| 20 | `js/main.js` | 192 | `KM.App`：路由（`go/refresh/render`）、启动流程、防沉迷休息蒙层 | 全部模块 |
| 21 | `tools/smoke.js` | 291 | Node 逻辑冒烟（**323 项**），用 `vm.runInThisContext` 加载纯逻辑文件 | Node 内置 fs/path/vm |
| 22 | `tools/uismoke.js` | 502 | Node UI 冒烟（极简 DOM 桩 + 猴子点击 + 17 个定向场景） | Node 内置 fs/path/vm |

### 2.1 script 加载顺序为何不可调换

```text
storage → rules → audio → knowledge → hints → generator → points → dom → mascot → animations → home → learn → practice → rewards → selftest → main
```

| 顺序约束 | 原因 |
| --- | --- |
| `storage` 必须最先 | `audio.js` 在**加载时**就执行 `loadState()` 读 `KM.Storage`；`points.js` 的 `load()` 也依赖它 |
| `rules` 先于 `generator` | `generator.js` 在加载时执行 `var Rules = KM.Rules;` 捕获引用；若反序，`Rules` 为 `undefined`，所有出题调用立即崩 |
| `knowledge/hints` 先于 `generator` | `generator` 的 `pickHintKind()` 产出 `hintKind`，由 `hints.js` 的模板集消费；`main.js` 启动时校验两者 |
| `dom` 先于 `mascot/animations/所有 ui` | 这些文件在**渲染时**调用 `KM.Dom`；虽然不在加载时取引用，但 `dom.js` 内部 `soundButton()` 依赖 `KM.Audio`（已在前面加载） |
| `animations` 先于 `learn` | `learn.js` 渲染知识点详情时调用 `KM.Anim.mount()` |
| `ui/*` 之间 | `home/learn/practice/rewards` 只依赖已加载的核心模块，彼此无加载期依赖，但 **不要**把 `selftest` 提到 rewards 之前之外——`selftest` 会调用 `KM.Rewards` 等，放最后最安全 |
| `main` 必须最后 | `main.js` 在 `DOMContentLoaded`（或立即）执行 `boot()`，此时必须所有 `KM.*` 已挂载；它读取 `location.search` 决定首页还是自测页 |

> 若未来改为 ES Module 或打包器，以上约束由 `import` 依赖自动保证；**迁回 ② 时这段顺序说明即可删除**。

---

## 3. 核心模块真实接口签名（以代码为准）

### 3.1 `KM.Rules`（`js/core/rules.js`）

```js
/**
 * R4 硬规则断言（纯函数，不吞错）。
 * @param {Object} q   {op:'add'|'sub'|'mul'|'div'|'rem', a:number, b:number, answer:number, remainder?:number, expr?:string}
 * @param {Object} ctx {grade:1|2|3, star:1|2|3}
 * @returns {{ok:boolean, code:string, reason:string}}
 */
KM.Rules.assertR4(q, ctx)

/**
 * 整组质量断言（R4-8）：逐题 assertR4 + 组内去重 + 相同答案 ≤3 + 送分题 ≤10%
 * + 0 结果题 ≤1 且不出现在前 3 题 + 首题必须是送分题。
 * @param {Array} list
 * @param {Object} ctx {grade, star, size}
 * @returns {{ok:boolean, code:string, reason:string}}
 */
KM.Rules.assertGroup(list, ctx)

KM.Rules.getRange(grade, op, star)   // → {a:[min,max], b:[min,max], res:[min,max], rem?:[min,max]} | null
KM.Rules.isGift(q)                   // → boolean，送分题判定
KM.Rules.isZeroResult(q)             // → boolean，结果是否为 0
KM.Rules.describeRanges(grade, star) // → [{op,name,text}]，供 UI 展示数值范围
KM.Rules.OPS_BY_GRADE                // {1:['add','sub'], 2:['add','sub','mul','div'], 3:[...,'rem']}（R4-6 超前概念拦截）
KM.Rules.RANGE_TABLE / OPS / GRADES / STARS / OP_SYMBOL / OP_NAME / GRADE_NAME
```

**R4 规则与 `code` 映射**（与 DESIGN T02 的 R4-1~R4-8 一致）：

| code | 含义 | 触发示例 |
| --- | --- | --- |
| `R4-0` | 参数/自洽性错误 | 题目为空、`a+b≠answer`、除法不整除 |
| `R4-1` | 除数为 0 | `a ÷ 0` |
| `R4-2` | `0 ÷ 0` | `0 ÷ 0` |
| `R4-3` | 减法结果为负 | `3 − 5` |
| `R4-4` | 余数 <1 或 ≥ 除数 | `14 ÷ 4 = 2…6` |
| `R4-5` | 超数值范围 / 非法难度 | 一年级 `a+b>20`、三年级四位数 |
| `R4-6` | 超前概念 / 负数 / 两步运算 | 一年级出乘法、`expr` 含两个运算符 |

### 3.2 `KM.Generator`（`js/core/generator.js`）

```js
/**
 * 生成一组题目。
 * @param {Object} opts {grade:1|2|3, mode:'add'|'sub'|'mul'|'div'|'rem'|'mix', star:1|2|3, size?:number(默认10)}
 * @returns {{ok:boolean, reason:string, questions:Array}}
 */
KM.Generator.generateSet(opts)

KM.Generator.randomQuestion({grade, op, star})   // → 单题 | null（属性测试用）
KM.Generator.makeNormal(grade, op, star)         // → 普通题
KM.Generator.makeGift(grade, op, star)           // → 送分题（首题强制）
KM.Generator.makeBoundary(grade, op, star)       // → 合法边界题（保证 R4-7 覆盖）
KM.Generator.makeOptions(q)                      // → 1 星题的 3 个选项（含正确答案，已打乱）
KM.Generator.buildQuestion(grade, star, op, a, b, quotient, remainder)
KM.Generator.pickHintKind(q)                     // → 'addCarry'|'addPlain'|'subBorrow'|'subPlain'|'mulTable'|'mul2x1'|'divTable'|'div2x1'|'rem'
KM.Generator.shuffle(arr) / rnd(min,max)
```

题目对象字段：`{id, op, grade, star, a, b, answer, remainder, symbol, expr, display, hintKind, isGift, isZero, isBoundary}`
（`div`/`rem` 时 `a`=被除数、`b`=除数；`rem` 的 `answer`=商、`remainder`=余数。）

> **与 DESIGN 的差异**：无 `seed`/`generatorVersion` 字段（见 §1 第 6 行），迁回 ② 时需补。

### 3.3 `KM.Anim`（`js/ui/animations.js`）

```js
/**
 * 把动画挂到容器上。
 * @param {HTMLElement} container
 * @param {string} animKey 'add'|'sub'|'mul'|'div'|'rem'|'carry'
 * @param {Object} param 各 builder 的参数：add{left,right} sub{total,take} mul{rows,cols} div{total,groups} rem{total,per} carry{big,small}
 * @returns {{play:function, skip:function, destroy:function, root:HTMLElement}}
 */
KM.Anim.mount(container, animKey, param)

KM.Anim.BUILDERS        // {add, sub, mul, div, rem, carry}
KM.Anim.Timeline        // 时间轴：new Timeline(steps, totalMs)，.start()/.stop()/.skip()
```

实例约定：`root` 是 `div.km-stage`，**`root.children[0]` 是 SVG 舞台**，`root` 末尾还有「再看一遍 / 跳过动画」按钮行（清理时只能清 SVG，不能清 `root`）。

### 3.4 `KM.Points`（`js/core/points.js`）

```js
// —— 持久化 ——
KM.Points.load() / save() / reset()
KM.Points.state()          // → 完整 state 对象（见下）
// 持久化 key：state 存 localStorage 的 "km.state.v1"
//   （points.js 的 STATE_KEY = 'state.v1'，由 KM.Storage 自动加 "km." 前缀）
// 音频设置单独存 "km.settings.audio"（audio.js STORE_KEY='settings.audio' → {muted, volume}）
// 全部 km.* 键可通过 KM.Storage.clearAll() 清空

// —— 加分（唯一入口）——
/**
 * @param {string} reason 展示用原因
 * @param {number} amount 分值
 * @param {string|null} idempotencyKey 幂等键（相同 key 只计一次；传 null 则每次都计）
 * @returns {{applied:number, capped:boolean, duplicated:boolean, total:number}}
 */
KM.Points.add(reason, amount, idempotencyKey)

// —— 行为记录 ——
KM.Points.recordCorrect()               // 答对 +1（无幂等键）
KM.Points.recordCombo(combo)            // 连对 3/5/10 → +2/+5/+15
KM.Points.updateBestCombo(combo)
KM.Points.finishSet({correct, total})   // → {setApplied, perfectApplied, newStar}
KM.Points.learnKp(id)                   // 学完知识点 +5（幂等键 'kp:<id>'）
KM.Points.readCard(id)                  // 看完特例卡 +1（幂等键 'card:<id>'）
KM.Points.readL3(questionId)            // 看完 L3 +1，每日上限 10
KM.Points.addWrong(q)                   // 写入内存错题本（上限 100 条）
KM.Points.signIn()                      // → {ok, already, streak, applied}
KM.Points.isSignedToday()

// —— 查询 ——
KM.Points.todayEarned() / todayRoom()   // 今日已得 / 剩余额度（总上限 200）
KM.Points.levelIndex(total?) / levelInfo()  // → {level, index, name, current, next, progress, total}
KM.Points.badgeList()                   // → [{id,name,icon,cond,unlocked}]（8 枚）
KM.Points.checkBadges()                 // → 新达成的徽章数组
KM.Points.taskList()                    // → [{id,name,done,progress}]（3 个每日任务）

// —— 难度自适应 ——
KM.Points.suggestStar(grade, mode) / setStar(grade, mode, star)
KM.Points.adaptStar(grade, mode, accuracy)   // ≥0.85 升、≤0.5 降
KM.Points.dateKey(d)                    // → 'YYYY-MM-DD'

// —— 常量 ——
KM.Points.DAILY_CAP = 200; KM.Points.L3_DAILY_CAP = 10;
KM.Points.REWARD = {correct:1, finishSet:10, perfectSet:10, combo3:2, combo5:5, combo10:15,
                    learnKp:5, readCard:1, l3:1, sign:5, sign3:10, sign7:30, sign30:100};
KM.Points.LEVEL_THRESHOLDS = [0,100,300,600,1000,1500,2200,3000];
```

`state()` 结构：

```js
{
  version: 1, totalPoints, availablePoints,
  ledger: [{t, date, reason, amount, key}],   // 最多保留 300 条
  sign: {lastDate, streak, totalDays},
  learnedKp: [], readCards: [], setsDone, perfectSets, bestCombo, correctTotal,
  badges: [],                                  // 徽章 id
  tasks: {date, set, card, correctCount},
  daily: {date, earned},
  l3: {date, count},
  wrongBook: [{t, op, a, b, answer, remainder, display, grade, star}],  // 上限 100
  difficulty: { '<grade>|<mode>': star }
}
```

> **注意**：MVP 中 `availablePoints` **只增不减**（没有任何消费路径），与总积分始终相等地增长；消费能力待 ② 接入现实奖励券后才有意义。

### 3.5 内容与辅助模块

```js
KM.Knowledge.validate()      // → [{kind:'knowledge'|'specialCase', id}]，缺失 sourceRef 的条目（正常应为空）
KM.Knowledge.renderable(kind)// → 过滤掉无 sourceRef 后的可渲染数组
KM.Knowledge.findKnowledge(id) / findSpecialCase(id)
KM.Knowledge.KNOWLEDGE_POINTS  // 6 个：{id, title, story, formula, keyPoint, anim, animParam, sourceRef, ...}
KM.Knowledge.SPECIAL_CASES     // 9 条：{id, wrong, right, why, chant, sourceRef, ...}

KM.Hints.validate()          // → 缺失 sourceRef 的 hintKind 列表（正常为空）
KM.Hints.build(kind, q)      // → {l1, l2, l3, sourceRef, relatedKp}

KM.Dom.el(tag, className, html) / clear(node) / esc(str) / on(node, evt, fn)
KM.Dom.icon(name, size) / topbar({title,onBack,right}) / soundButton()
KM.Dom.stars(count,total,big) / toast(text) / combo(text)

KM.Mascot.svg({mood,size,leftDigit,rightDigit}) / renderInto(container, opts) / MOODS

KM.Audio.unlock() / playCorrect() / playSoft() / playTap() / playCombo(level) / playReward() / playPage()
KM.Audio.setMuted(m) / toggleMuted() / isMuted() / getVolume() / setVolume(v)

KM.Storage.PREFIX='km.' / get(key,def) / set(key,val) / remove(key) / clearAll() / isPersistent()

KM.App.go(name, preserve) / refresh() / render() / showRest() / closeRest() / current()
```

---

## 4. 启动流程（`js/main.js` boot）

```text
1. 取 #km-app 与 #km-rest
2. KM.Knowledge.validate() + KM.Hints.validate() → 缺 sourceRef 的内容 console.error 并跳过渲染（不阻断启动）
3. KM.Points.load()  → 从 localStorage 恢复累计积分（每次打开都保留）
4. 注册 touchstart/mousedown/keydown 一次性解锁 WebAudio（iOS 需要手势）
5. 解析 location.search：?selftest=1 → 自测页，否则首页
6. render() + scheduleRest()（20 分钟后弹休息蒙层）
```

---

## 5. MVP 已做到 / 未做到：与 PRD v1.3 §8.4 范围红线逐条对照

### 5.1 ✅ 首版必须做（PRD §8.4）

| PRD 项 | MVP 状态 | 落地位置 |
| --- | --- | --- |
| 儿童账号 + 家长代建 | ❌ 未做（无账号） | 迁回见 DESIGN §6.2/§6.3 `POST /auth/parent/otp*`、`POST /parents/me/children` |
| 28 个知识点讲解（Lottie+SVG） | ⚠️ 部分：6 个知识点，SVG 时间轴动画 | `js/data/knowledge.js` + `js/ui/animations.js` |
| 23 条特例卡 | ⚠️ 部分：9 条，四段式（错误→正确→动画→口诀），带 `sourceRef` | `js/data/knowledge.js` `SPECIAL_CASES` |
| 单一 + 混合运算练习 | ✅ 5 种单一模式 + `mix` 混合 | `js/ui/practice.js` |
| 随机出题 12 规则 | ✅ R1–R12 中的**硬规则与组质量**已实现（R4 双重卡口 + assertGroup） | `js/core/rules.js`、`generator.js` |
| 三级提示 L1/L2/L3 | ✅ 且模板带 `sourceRef`；L2 后答对仍 +1（C-1 口径）、L3 计未答对 | `js/data/hints.js`、`js/ui/practice.js` |
| 积分获取 / 明细 | ✅ 流水最多 300 条，展示最近 8 条 | `js/core/points.js`、`js/ui/rewards.js` |
| **累计积分云端持久化** | ❌ 改为**本地持久化**（localStorage），非云端 | 迁回见 DESIGN §5.4、`POST /points/ledger:sync` |
| **练习完全可离线** | ✅ 天然满足（纯前端、无网络请求） | 全部 |
| 签到 + 每日任务 + 成长树 + 徽章 | ✅ 签到（含 3/7/30 天）、3 个每日任务、成长树 8 级、8 枚徽章 | `js/core/points.js`、`js/ui/rewards.js` |
| 卡通视觉体系 + 儿童友好文案 | ✅ Design Token + 20 个内联图标 + 吉祥物 4 表情；结算永不 0 星 | `css/*`、`js/ui/dom.js`、`mascot.js` |
| 防沉迷 | ⚠️ 仅单次 20 分钟蒙层；无每日累计、无夜间、无家长解锁 | `js/main.js` `REST_AFTER/REST_COUNTDOWN` |
| **家长端 3 件事** | ❌ 全部未做 | DESIGN §6.3 `/parents/me/children*`、`/parent/settings/{userId}`、`/parent/rewards/{id}:confirm` |
| 响应式 Web 三端 | ✅ viewport + CSS 断点（手机/平板/PC） | `css/base.css`、`components.css` |

### 5.2 ❌ 首版不做（PRD §8.4，MVP 同样未做）

| 项 | 状态 | 备注 |
| --- | --- | --- |
| 老师端与班级体系 | 未做 | 与 PRD 一致（P2） |
| 排行榜 / 对比 / 分享 | 未做 | 全站无排名入口 |
| 多语言 | 未做 | 仅中文；文案集中在 `data/*.js`，可后补 i18n key |
| 订阅 / 内购 / 广告 | 未做 | 无支付链路 |
| App 打包 | 未做 | 仅预留能力（代码无原生依赖） |
| MP4 / GIF 动画 | 未做 | 全部为内联 SVG |
| 语音朗读 / 语音答题 | 未做 | 无 TTS、不申请麦克风 |
| 家长学习报告 / 错题分析 / PDF | 未做 | V1.1 |
| 积分商城（装扮/主题/道具） | 未做 | V1.1 |
| 错题本 UI 与重练 | 未做（数据只写不读） | V1.1 |
| 教研审校环节 | 未做 | PRD Q11：改为开发自查 + `sourceRef` 追溯（风险 R-1） |

### 5.3 做 ② 全栈版时的接口接入索引

| 能力 | MVP 现状 | DESIGN.md 对应章节 / 接口 |
| --- | --- | --- |
| 家长/儿童登录 | 无 | §6.2 鉴权方案；§6.3 `POST /auth/parent/otp:request|verify`、`POST /auth/children/login`、`POST /auth/token:refresh` |
| 儿童账号管理 | 无 | §6.3 `GET/POST /parents/me/children`、`PATCH`、`POST .../pin:reset` |
| 知识点与进度 | 本地 `knowledge.js` | §6.3 `GET /knowledge-points`、`GET .../{code}`、`PUT /learning/progress/{kpCode}` |
| 练习结果上报 | 仅本地 | §6.3 `POST /practice/sets`、`.../answers`、`:complete`；表结构 §3.4 `question_sets`/`questions` |
| 提示模板 | 本地 `hints.js` | §4.4.1 `hint_templates` 表 + `GET /knowledge-points/{code}/hint-templates` |
| 积分账户与同步 | 本地权威 | §5.1~§5.4；§6.3 `GET /points/account`、`GET /points/ledger`、`POST /points/ledger:sync` |
| 签到 / 任务 / 徽章 | 本地 | §6.3 `POST /checkins`、`GET /daily-tasks`、`GET /badges` |
| 现实奖励券 | **无** | §5.6 唯一消费路径；§6.3 `GET /rewards/vouchers`、`POST /rewards/vouchers/{sku}:apply`、`POST /parent/rewards/{id}:confirm` |
| 家长管控 | **无** | §3.3 `settings_parent`；§6.3 `GET/PUT /parent/settings/{userId}` |
| H-15 同步状态 | 无（无云端） | §5.5：`lastSyncAt` 服务端权威 + `GET /points/sync-status` |

---

## 6. 已修复的两个 Bug

| # | 现象 | 根因 | 修复位置 | 回归用例 |
| --- | --- | --- | --- | --- |
| **(a)** | 点「再看一遍」后画面元素叠加：数字叠印、小球数量翻倍、越来越乱 | `mount()` 返回的 `instance.play()` 只调用了 `builder(stage.svg, param)` 重建动画，**没有清空上一轮已生成的 SVG 子元素**；`builder` 是「append 式」构造，重复调用就会把新的一整套元素叠在旧元素之上 | `js/ui/animations.js` **第 514–526 行**（`instance.play` 内）：`tl.stop()` 之后加 `while (stage.svg.firstChild) { stage.svg.removeChild(stage.svg.firstChild); }` 再 `tl = builder(...)`。**注释明确写了只能清 `stage.svg`，不能动 `stage.wrap` 里的按钮行**（否则「再看一遍/跳过动画」按钮会被一起清掉） | `tools/uismoke.js` 场景「动画『再看一遍』不叠加 SVG 元素（6 个知识点全覆盖）」：记录首次挂载的 `svg.children.length` 作为基线，在 `skip→再看`、`跳过→再看` 交叉、连点再看 等 4 种操作组合后断言元素数量不变，并断言按钮行仍存在 |
| **(b)** | 加法动画两组小球合并后，中间的「＋」号留在原地，被左移过来的小球压住 | `buildAdd()` 只让右侧数字 `tRight` 淡出，**没有处理「＋」号**；合并完成后「＋」已完成使命，应一起淡出 | `js/ui/animations.js` **第 140–148 行**（`at: 1180` 的合并步骤）：在移动 `rightG` 并隐藏 `tRight` 的同时，增加 `plus.style.opacity = '0'`（注释说明了原因） | 同上的 uismoke 场景（元素数量不变 + 按钮存在）为间接保护；视觉需在浏览器 `index.html?selftest=1` 打开加法动画人工确认 |

> 两个 Bug 都属于「**重建型动画的状态残留**」这一类。后续新增动画 builder 时，务必遵守：`mount()` 只对 `stage.svg` 做清空，builder 内部所有元素都在 `steps` 里显式控制生命周期（显隐/位移/文本更新），不要在 builder 外部保留可变引用。

---

## 7. 验证方式

### 7.1 Node 逻辑冒烟（323 项）

```bash
cd E:/work1/kids-math/app
node tools/smoke.js
```

| 分组 | 内容 |
| --- | --- |
| [1] R4 属性测试 | 每个「年级 × 运算 × 难度」各 2000 道题，断言 `assertR4` 命中数 = 0、生成成功数 = 2000 |
| [2] R4-7 反向用例 | 10 个合法边界（`a−a=0`、`0÷5=0`、`14÷4=3…2`、`9÷9=1`、`a+0`、`a×0=0`、`a×1`、`a−0`、`a÷1`、`0+b`）断言**存在**合法 (年级,难度) 且通过断言 —— 防误杀 |
| [3] 整组生成 + R4-8 | 每组 10 题：整组合法 / 单题合法 / 0 结果题约束 / 首题送分题 |
| [4] 边界题覆盖率 | 9 个目标边界在 300 组实际出题中的命中次数 > 0 |
| [5] 积分引擎 | 幂等键防重、每日上限 200、等级门槛、签到当天一次、L3 加分、徽章 8 枚、难度自适应升降 |
| [6] 内容数据校验 | 知识点/特例卡 `sourceRef` 齐全、数量 6/9、提示模板 `sourceRef` 齐全、渲染无残留占位符 |

输出末尾：`总计：323 项，PASS 323，FAIL 0`；失败时 `process.exitCode = 1` 并打印失败明细。

### 7.2 Node UI 冒烟（17 个场景 + 400 次猴子点击）

```bash
cd E:/work1/kids-math/app
node tools/uismoke.js
```

- 用极简 DOM 桩（`makeNode`）加载**全部**脚本，先校验 16 项 `KM.*` 命名空间挂载完整（`KM.SelfTest` 也在其中，未单独跑自测用例）；
- 然后对 `home/learn/practice/rewards` 四页累计 400 次随机点击，捕获任何运行时异常与意外 `console.error`；
- 定向场景（17 个）包括：完整走完一组 10 题（键盘输入全对）、答错→三级帮帮我→L3 讲解、1 星三选项作答、**动画「再看一遍」不叠加 SVG 元素（6 个知识点全覆盖）**、6 个动画可挂载、9 张特例卡可渲染、6 个知识点学完点亮徽章、三种难度题组通过 R4、1 星选项含正确答案、成长树 8 级可绘制、吉祥物 4 表情、提示三级文案带 `sourceRef`。
- 输出：`点击次数：400，场景异常：0，意外 console 输出：0` + `UI 冒烟全部通过 ✅`。

### 7.3 浏览器自测页

- 打开 `app/index.html?selftest=1`；
- 或在首页**连点吉祥物 5 次**（2.5 秒窗口内）进入；
- 页面内运行与 `smoke.js` 同构的自测（R4 属性 2000 题/组合、R4-7 边界、20 组/组合的组质量、内容校验、积分不变量），逐条列出 PASS/FAIL 与失败原因。

### 7.4 手工冒烟建议路径

1. 首页 → 看积分/等级 → 连点吉祥物 5 次进自测页 → 全绿 → 返回；
2. 学一学 → 打开「加法的意义」→ 看动画 → 点「再看一遍」确认**不叠加**且「＋」淡出 → 点「我学会啦」得 +5；
3. 练一练 → 选一年级/加法/自动 → 做 10 题（故意答错一道走完 L1→L2→L3）→ 结算页看星级与积分；
4. 我的星星 → 签到 → 看成长树与流水。

---

## 8. 已知限制与后续建议

| # | 限制 | 影响 | 建议 |
| --- | --- | --- | --- |
| 1 | **无云端**：积分仅存本机 localStorage | 换设备/清缓存/换浏览器 → 积分丢失；PRD 的 P0「累计积分永不丢失」在 ① 路线下**未达成** | 做 ② 时必须补：云端账户 + `points_ledger` + pending 补登（DESIGN §5.4、§4.5） |
| 2 | **无账号**：谁打开都是同一个「孩子」 | 多子女共用一台设备会混在一起；无法做家长管控 | 补账号体系（DESIGN §6.2） |
| 3 | `availablePoints` 只增不减，**无任何消费出口** | 积分缺少价值闭环 | 按 DESIGN §5.6 先上现实奖励券（家长确认），再上装扮商城（V1.1） |
| 4 | **防沉迷不跨会话 / 不累计**：刷新页面重新计时；无每日累计、无夜间时段、无家长解锁 | 达不到 PRD U-13/U-14 | 计时写入持久化 state + 家长端设置；夜间判定按 `settings_parent` |
| 5 | **未做真实浏览器视觉验证**：两个冒烟都是 Node DOM 桩，只保证「不抛异常」，不保证像素与动画观感 | 视觉/动效问题可能残留 | 至少跑一次真机（手机 + 平板竖屏）人工走查；动画重点看 6 个 builder 的终态 |
| 6 | 题目**无 `seed`/`generatorVersion`**，不可复现 | 错题无法精确回放；无法做「同题再做一次」 | `generateSet` 增加 seed 输入与返回（DESIGN §4.2.2） |
| 7 | `Math.random()` 而非确定性 PRNG | 属性测试无法用固定种子复跑失败用例 | 引入可播种 PRNG，测试用固定 seed |
| 8 | 内容量：6 知识点 / 9 特例卡 / 8 徽章（PRD 为 28/23/12） | 覆盖不足 | 按现有结构追加数据即可；**必须带 `sourceRef`**，否则 `validate()` 会拦截渲染 |
| 9 | `state.ledger` 上限 300 条、`wrongBook` 上限 100 条，且都在同一个 localStorage 值里 | 长期使用后单键体积增长、写入变慢 | ② 中拆分表；本地可先做分片或定期归档 |
| 10 | localStorage 在隐私模式/`file://` 个别浏览器下不可用 → 自动降级为内存 | 关闭页面即丢 | 已 `console.warn` 提示；② 中由云端兜底 |
| 11 | 无障碍只做了基础（`prefers-reduced-motion`、字号、aria-label），**未做**系统级大字号/高对比开关页 | 达不到 PRD G-05 完整项 | 补设置页开关（DESIGN §7.3） |
| 12 | 无埋点、无错误上报 | 线上问题不可观测 | ② 中按 DESIGN §12.4（去标识化日志）接入，注意**儿童合规：不采集身份信息** |

---

## 9. 给接手工程师的三条硬规矩

1. **改出题逻辑前先跑 `node tools/smoke.js`**：R4 是「P0 中的 P0」，`assertR4`/`assertGroup` 不得用 try/catch 吞错，禁止为「先上线」放宽任何一条 R4 分支（DESIGN T02 阻断项 B-1）。
2. **新增内容必须带 `sourceRef`**：知识点、特例卡、提示模板三者都过 `validate()`；缺失的条目会被跳过渲染并在控制台报错（对应 PRD 风险 R-1）。
3. **动画 builder 遵循「清空 + 显式生命周期」**：重建只清 `stage.svg`；新增 builder 后必须在 `tools/uismoke.js` 的「再看一遍不叠加」场景下自动覆盖（该场景遍历 `KNOWLEDGE_POINTS`，新增知识点即自动纳入）。

---

## 修订记录

| 版本 | 日期 | 作者 | 变更 |
| --- | --- | --- | --- |
| v1.0 | 2026-10-07 | 高见远 · 架构师 | 首版：MVP 实现说明、与原设计差异对照与回迁路径、文件清单与加载顺序、真实接口签名、范围对照（PRD §8.4）、两个 Bug 记录、验证方式、已知限制 |

---

*文档结束 · 本文档只描述 `app/` 下的实际实现；目标架构仍以 `docs/DESIGN.md` v1.3 为准，需求口径以 `docs/PRD.md` v1.3 为准。*
