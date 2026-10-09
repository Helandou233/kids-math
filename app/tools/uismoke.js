/* ============================================================
   tools/uismoke.js —— Node UI 冒烟（零 npm 依赖）
   用一个极简 DOM 桩加载全部浏览器端脚本，然后「猴子式」随机点击，
   目的是抓出运行时异常（未定义引用 / 空指针 / 拼写错误），
   不做视觉校验。
   运行：node tools/uismoke.js
   ============================================================ */
'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const APP_DIR = path.join(__dirname, '..');

/* ---------------- 极简 DOM 桩 ---------------- */
function makeNode(tag) {
  const node = {
    tagName: String(tag || 'div'),
    children: [],
    parentNode: null,
    style: {},
    attrs: {},
    handlers: {},
    textContent: '',
    disabled: false,
    hidden: false,
    scrollTop: 0,
    _html: '',
    _class: ''
  };

  node.appendChild = function (child) {
    node.children.push(child);
    child.parentNode = node;
    return child;
  };
  node.removeChild = function (child) {
    const i = node.children.indexOf(child);
    if (i >= 0) node.children.splice(i, 1);
    child.parentNode = null;
    return child;
  };
  node.setAttribute = function (k, v) { node.attrs[k] = String(v); };
  node.getAttribute = function (k) { return node.attrs[k]; };
  node.addEventListener = function (t, fn) {
    (node.handlers[t] = node.handlers[t] || []).push(fn);
  };
  node.removeEventListener = function () { /* noop */ };
  node.querySelector = function () { return null; };
  node.querySelectorAll = function () { return []; };
  node.focus = function () { /* noop */ };
  node.classList = {
    add: function () { /* noop */ },
    remove: function () { /* noop */ },
    contains: function () { return false; }
  };

  Object.defineProperty(node, 'innerHTML', {
    get() { return node._html; },
    set(v) { node._html = String(v); node.children = []; }
  });
  Object.defineProperty(node, 'className', {
    get() { return node._class; },
    set(v) { node._class = String(v); }
  });
  Object.defineProperty(node, 'firstChild', {
    get() { return node.children.length ? node.children[0] : null; }
  });
  return node;
}

const byId = Object.create(null);
['km-app', 'km-toast', 'km-rest'].forEach((id) => { byId[id] = makeNode('div'); });

const documentStub = {
  readyState: 'complete',
  createElement: (tag) => makeNode(tag),
  createElementNS: (ns, tag) => makeNode(tag),
  getElementById: (id) => byId[id] || null,
  addEventListener: () => { /* noop */ },
  removeEventListener: () => { /* noop */ },
  body: makeNode('body'),
  documentElement: makeNode('html')
};

const errors = [];
const origError = console.error;
const origWarn = console.warn;
console.error = function (...args) { errors.push('console.error: ' + args.join(' ')); origError.apply(console, args); };
console.warn = function (...args) { errors.push('console.warn: ' + args.join(' ')); origWarn.apply(console, args); };

globalThis.document = documentStub;
globalThis.window = globalThis;
globalThis.location = { search: '' };
globalThis.scrollTo = () => { /* noop */ };
globalThis.localStorage = undefined;   // 触发 storage.js 的内存兜底分支
globalThis.KM = globalThis.KM || {};

/* ---------------- 按 index.html 的顺序加载脚本 ---------------- */
const html = fs.readFileSync(path.join(APP_DIR, 'index.html'), 'utf8');
const srcs = [];
const re = /<script\s+src="([^"]+)"/g;
let m;
while ((m = re.exec(html)) !== null) srcs.push(m[1]);
if (!srcs.length) {
  console.error('未能从 index.html 解析出脚本列表');
  process.exit(1);
}

for (const rel of srcs) {
  const file = path.join(APP_DIR, rel);
  if (!fs.existsSync(file)) {
    console.error('缺少脚本文件：' + rel);
    process.exit(1);
  }
  vm.runInThisContext(fs.readFileSync(file, 'utf8'), { filename: rel });
}

const KM = globalThis.KM;

/* ---------------- 检查命名空间挂载完整性 ---------------- */
const required = [
  'KM.Storage', 'KM.Rules', 'KM.Audio', 'KM.Knowledge', 'KM.Hints',
  'KM.Generator', 'KM.Points', 'KM.Dom', 'KM.Mascot', 'KM.Anim',
  'KM.Home', 'KM.Learn', 'KM.Practice', 'KM.Rewards', 'KM.SelfTest', 'KM.App'
];
let namespaceOk = true;
for (const p of required) {
  const val = p.split('.').reduce((o, k) => (o ? o[k] : undefined), globalThis);
  if (!val) { console.log('  FAIL  命名空间缺失 ' + p); namespaceOk = false; }
}
console.log(namespaceOk ? '  PASS  命名空间挂载完整（' + required.length + ' 项）' : '  FAIL  命名空间不完整');

/* ---------------- 收集可点击节点 ---------------- */
function collectClickables(node, out) {
  if (!node || typeof node !== 'object') return out;
  if (node.handlers && node.handlers.click && node.handlers.click.length) out.push(node);
  (node.children || []).forEach((c) => collectClickables(c, out));
  return out;
}

function clickables() {
  let out = [];
  out = collectClickables(byId['km-app'], out);
  out = collectClickables(byId['km-rest'], out);
  return out;
}

/* ---------------- 猴子式点击 ---------------- */
const pages = ['home', 'learn', 'practice', 'rewards'];
const TOTAL_CLICKS = 400;
let clicks = 0;
let runtimeErrors = 0;

function safeClick(node) {
  const fns = (node.handlers && node.handlers.click) || [];
  for (const fn of fns.slice(0, 1)) {
    try {
      fn({ preventDefault() { /* noop */ } });
      clicks++;
    } catch (err) {
      runtimeErrors++;
      console.log('  FAIL  点击时抛异常：' + (err && err.stack ? err.stack.split('\n')[0] : err));
    }
  }
}

for (const page of pages) {
  try {
    KM.App.go(page);
  } catch (err) {
    runtimeErrors++;
    console.log('  FAIL  渲染 ' + page + ' 抛异常：' + (err && err.stack ? err.stack.split('\n')[0] : err));
    continue;
  }
  for (let i = 0; i < TOTAL_CLICKS / pages.length; i++) {
    const list = clickables();
    if (!list.length) break;
    // 加权：优先点后面的按钮（一般是主操作），偶尔点前面的
    const idx = Math.random() < 0.35
      ? Math.floor(Math.random() * list.length)
      : Math.floor(list.length * (0.55 + Math.random() * 0.45));
    safeClick(list[Math.min(idx, list.length - 1)]);
  }
  console.log('  PASS  页面 ' + page + ' 完成 ' + clicks + ' 次点击累计');
}

/* ---------------- 覆盖几个关键流程 ---------------- */
function findByHtml(node, sub) {
  if (!node || typeof node !== 'object') return null;
  if (node._html && node._html.indexOf(sub) >= 0) return node;
  const kids = node.children || [];
  for (let i = 0; i < kids.length; i++) {
    const r = findByHtml(kids[i], sub);
    if (r) return r;
  }
  return null;
}

function findByText(node, text) {
  if (!node || typeof node !== 'object') return null;
  if (node.textContent === text) return node;
  const kids = node.children || [];
  for (let i = 0; i < kids.length; i++) {
    const r = findByText(kids[i], text);
    if (r) return r;
  }
  return null;
}

function findByClass(node, clsSub) {
  if (!node || typeof node !== 'object') return null;
  if (String(node.className || '').indexOf(clsSub) >= 0) return node;
  const kids = node.children || [];
  for (let i = 0; i < kids.length; i++) {
    const r = findByClass(kids[i], clsSub);
    if (r) return r;
  }
  return null;
}

function findKey(root, text) {
  let found = null;
  (function walk(n) {
    if (found || !n || typeof n !== 'object') return;
    if (String(n.className || '').indexOf('km-key') === 0 && n._html === text) { found = n; return; }
    (n.children || []).forEach(walk);
  })(root);
  return found;
}

function click(node) {
  if (!node) throw new Error('找不到要点击的元素');
  const fns = (node.handlers && node.handlers.click) || [];
  if (!fns.length) throw new Error('元素没有点击处理函数');
  fns[0]({ preventDefault() { /* noop */ } });
}

/** 解析题面，返回 {a, op, b, isRem, answers:[商, 余数]} */
function parseExpr(text) {
  const mm = String(text).match(/(\d+)\s*([+−×÷])\s*(\d+)/);
  if (!mm) throw new Error('无法解析题面：' + text);
  const a = Number(mm[1]);
  const b = Number(mm[3]);
  const sym = mm[2];
  const isRem = String(text).indexOf('……') >= 0;
  let answers;
  if (sym === '+') answers = [a + b, 0];
  else if (sym === '−') answers = [a - b, 0];
  else if (sym === '×') answers = [a * b, 0];
  else if (isRem) answers = [Math.floor(a / b), a % b];
  else answers = [Math.floor(a / b), 0];
  return { a, b, sym, isRem, answers };
}

function appRoot() { return byId['km-app']; }

const scenarioQueue = [];
function scenario(name, fn) {
  scenarioQueue.push({ name, fn });
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

scenario('完整走完一组 10 题（键盘输入，全部答对）', async () => {
  KM.Points.reset();
  KM.Practice.reset();
  KM.App.go('practice');
  click(findByHtml(appRoot(), '2 星'));           // 选 2 星（键盘输入模式）
  click(findByHtml(appRoot(), '开始练习'));

  for (let i = 0; i < 10; i++) {
    const qNode = findByClass(appRoot(), 'km-question__expr');
    if (!qNode) throw new Error('第 ' + (i + 1) + ' 题未渲染');
    const p = parseExpr(qNode._html);
    const digits = String(p.answers[0]).split('');
    digits.forEach((d) => click(findKey(appRoot(), d)));
    if (p.isRem) {
      String(p.answers[1]).split('').forEach((d) => click(findKey(appRoot(), d)));
    }
    click(findKey(appRoot(), '确定'));
    const fb = findByHtml(appRoot(), '答对啦');
    if (!fb) throw new Error('第 ' + (i + 1) + ' 题未判定为答对：' + qNode._html);
    await sleep(560);   // 等待 500ms 防连点锁释放（<1200ms 的自动翻页）
    const next = findByHtml(appRoot(), '下一题') || findByHtml(appRoot(), '看看结果');
    if (!next) throw new Error('第 ' + (i + 1) + ' 题没有下一题按钮');
    click(next);
  }
  const result = findByHtml(appRoot(), '答对 10 / 10');
  if (!result) throw new Error('结算页未显示 10/10');
  const st = KM.Points.state();
  if (st.correctTotal < 10) throw new Error('答对计数异常：' + st.correctTotal);
  if (st.setsDone !== 1) throw new Error('完成组数异常：' + st.setsDone);
  if (st.perfectSets !== 1) throw new Error('全对组数异常：' + st.perfectSets);
  if (st.badges.indexOf('B-PERFECT') < 0) throw new Error('未点亮「全对小能手」徽章');
});

scenario('答错 → 三级「帮帮我」→ L3 讲解', async () => {
  KM.Points.reset();
  KM.Practice.reset();
  KM.App.go('practice');
  click(findByHtml(appRoot(), '2 星'));
  click(findByHtml(appRoot(), '开始练习'));

  const qNode = findByClass(appRoot(), 'km-question__expr');
  const p = parseExpr(qNode._html);
  // 故意填一个不同的答案
  const wrongDigits = String(p.answers[0] + 1).split('');
  wrongDigits.forEach((d) => click(findKey(appRoot(), d)));
  if (p.isRem) click(findKey(appRoot(), String(p.answers[1])));
  click(findKey(appRoot(), '确定'));

  if (!findByHtml(appRoot(), '差一点点')) throw new Error('答错后没有出现柔和提示');
  if (!findByHtml(appRoot(), '帮帮我')) throw new Error('没有出现「帮帮我」按钮');
  await sleep(560);

  click(findByHtml(appRoot(), '帮帮我'));
  if (!findByClass(appRoot(), 'km-feedback--hint')) throw new Error('L1 提示没有出现');
  click(findByHtml(appRoot(), '再帮一下'));
  if (!findByClass(appRoot(), 'km-feedback--hint')) throw new Error('L2 提示没有出现');
  click(findByHtml(appRoot(), '直接看讲解'));
  if (!findByHtml(appRoot(), '看看讲解')) throw new Error('L3 讲解没有出现');

  const st = KM.Points.state();
  if (st.wrongBook.length !== 1) throw new Error('错题本数量异常：' + st.wrongBook.length);
  if (st.l3.count !== 1) throw new Error('L3 计数异常：' + st.l3.count);
});

scenario('1 星模式用三个大选项作答', async () => {
  KM.Points.reset();
  KM.Practice.reset();
  KM.App.go('practice');
  click(findByHtml(appRoot(), '1 星'));
  click(findByHtml(appRoot(), '开始练习'));

  for (let i = 0; i < 10; i++) {
    const qNode = findByClass(appRoot(), 'km-question__expr');
    if (!qNode) throw new Error('第 ' + (i + 1) + ' 题未渲染');
    const p = parseExpr(qNode._html);
    const display = p.isRem ? (p.answers[0] + ' …… ' + p.answers[1]) : String(p.answers[0]);
    let opt = null;
    (function walk(n) {
      if (opt || !n || typeof n !== 'object') return;
      if (String(n.className || '').indexOf('km-option') === 0 && n._html === display) { opt = n; return; }
      (n.children || []).forEach(walk);
    })(appRoot());
    if (!opt) throw new Error('选项中找不到正确答案 ' + display);
    click(opt);
    await sleep(560);
    const next = findByHtml(appRoot(), '下一题') || findByHtml(appRoot(), '看看结果');
    if (!next) throw new Error('第 ' + (i + 1) + ' 题点选后没有下一题');
    click(next);
  }
  if (!findByHtml(appRoot(), '答对 10 / 10')) throw new Error('1 星模式结算异常');
});

scenario('动画「再看一遍」不叠加 SVG 元素（6 个知识点全覆盖）', async () => {
  KM.Knowledge.KNOWLEDGE_POINTS.forEach((kp) => {
    const host = makeNode('div');
    const inst = KM.Anim.mount(host, kp.anim, kp.animParam);
    const svg = inst.root.children[0];
    if (!svg || String(svg.tagName) !== 'svg') throw new Error(kp.id + ' 舞台 SVG 未创建');
    const base = svg.children.length;
    if (base === 0) throw new Error(kp.id + ' 首次挂载没有生成任何元素');

    const assertStable = (stageName) => {
      if (svg.children.length !== base) {
        throw new Error(kp.id + ' ' + stageName + ' 后元素数量变化：' +
          base + ' -> ' + svg.children.length + '（疑似叠加）');
      }
    };

    // 1) 播到终态（skip）后「再看一遍」
    inst.skip();
    assertStable('skip');
    click(findByText(inst.root, '再看一遍'));
    assertStable('skip→再看一遍');

    // 2) 交叉：跳过 → 再看 → 跳过 → 再看
    click(findByText(inst.root, '跳过动画'));
    assertStable('跳过动画');
    click(findByText(inst.root, '再看一遍'));
    assertStable('再看一遍');
    click(findByText(inst.root, '跳过动画'));
    click(findByText(inst.root, '再看一遍'));
    assertStable('第二轮交叉');

    // 3) 连点「再看一遍」
    click(findByText(inst.root, '再看一遍'));
    click(findByText(inst.root, '再看一遍'));
    assertStable('连点再看一遍');

    // 4) 按钮行必须还在（不能误伤 stage.wrap 的其他子节点）
    if (!findByText(inst.root, '再看一遍') || !findByText(inst.root, '跳过动画')) {
      throw new Error(kp.id + ' 按钮行被误清空');
    }
    inst.destroy();
  });
});

scenario('连点两次「跳过动画」终态与一次跳过完全一致（6 个知识点全覆盖）', async () => {
  // 收集 SVG 内全部 <text> 的文字（按顺序），作为"终态指纹"
  const collectTexts = (node, out) => {
    out = out || [];
    for (const c of node.children || []) {
      if (String(c.tagName) === 'text') out.push(String(c.textContent));
      collectTexts(c, out);
    }
    return out;
  };
  const sameArr = (a, b) => a.length === b.length && a.every((v, i) => v === b[i]);

  KM.Knowledge.KNOWLEDGE_POINTS.forEach((kp) => {
    // 基准：挂载后跳过一次
    const host1 = makeNode('div');
    const inst1 = KM.Anim.mount(host1, kp.anim, kp.animParam);
    inst1.skip();
    const once = collectTexts(inst1.root.children[0]);
    inst1.destroy();

    // 对照：挂载后连点两次「跳过动画」
    const host2 = makeNode('div');
    const inst2 = KM.Anim.mount(host2, kp.anim, kp.animParam);
    click(findByText(inst2.root, '跳过动画'));
    click(findByText(inst2.root, '跳过动画'));
    const twice = collectTexts(inst2.root.children[0]);
    inst2.destroy();

    if (!sameArr(once, twice)) {
      throw new Error(kp.id + ' 两次跳过后的终态与一次跳过不一致：' +
        JSON.stringify(once) + ' vs ' + JSON.stringify(twice));
    }
    // 减法动画额外断言：计数文字必须等于 total - take（不允许被重复执行扣到 0）
    if (kp.anim === 'sub') {
      const { total, take } = kp.animParam;
      if (!twice.includes(String(total - take))) {
        throw new Error(kp.id + ' 计数终态应为 ' + (total - take) + '，实际：' + JSON.stringify(twice));
      }
    }
  });
});

scenario('出题失败时练习页给出儿童友好提示且不使用不合法题组', async () => {
  const orig = KM.Generator.generateSet;
  const origErr = console.error;
  KM.Generator.generateSet = function () {
    return { ok: false, reason: '测试用：强制生成失败', questions: [] };
  };
  // 这次失败是测试故意制造的，其中的 console.error 不计入「意外输出」
  console.error = function () { /* noop */ };
  try {
    KM.Points.reset();
    KM.Practice.reset();
    KM.App.go('practice');
    click(findByHtml(appRoot(), '开始练习'));
    if (!findByHtml(appRoot(), '这组题有点难生成')) throw new Error('未显示儿童友好提示');
    if (!findByHtml(appRoot(), '换一组试试')) throw new Error('缺少「换一组试试」按钮');
    if (findByClass(appRoot(), 'km-question__expr')) throw new Error('生成失败却仍渲染了题目');
  } finally {
    KM.Generator.generateSet = orig;
    console.error = origErr;
    KM.Practice.reset();
  }
});

scenario('真实使用的 (年级×模式×难度) 全部能生成 10 题合法题组', () => {
  const modes = ['add', 'sub', 'mul', 'div', 'rem', 'mix'];
  for (const grade of KM.Rules.GRADES) {
    for (const mode of modes) {
      for (const star of [1, 2, 3]) {
        const r = KM.Practice.generateSetSafely(grade, mode, star);
        if (!r.ok) throw new Error(`generateSetSafely 失败：${grade}/${mode}/${star} -> ${r.reason}`);
        if (r.questions.length !== 10) throw new Error(`${grade}/${mode}/${star} 只出了 ${r.questions.length} 道`);
        const g = KM.Rules.assertGroup(r.questions, { grade, star, size: r.questions.length });
        if (!g.ok) throw new Error(`${grade}/${mode}/${star} 题组不合法：${g.reason}`);
      }
    }
  }
});

scenario('六个知识点动画均可挂载', () => {
  KM.Knowledge.KNOWLEDGE_POINTS.forEach((kp) => {
    const host = makeNode('div');
    const inst = KM.Anim.mount(host, kp.anim, kp.animParam);
    if (!inst || typeof inst.play !== 'function' || typeof inst.skip !== 'function') {
      throw new Error('动画 ' + kp.id + ' 挂载失败');
    }
    inst.skip();
    inst.destroy();
  });
});

scenario('九张特例卡均可渲染并标记已读', () => {
  KM.Knowledge.SPECIAL_CASES.forEach((sc) => {
    KM.Points.readCard(sc.id);
  });
  const st = KM.Points.state();
  if (st.readCards.length !== 9) throw new Error('已读特例卡数量 ' + st.readCards.length);
});

scenario('六个知识点学完后点亮徽章', () => {
  KM.Knowledge.KNOWLEDGE_POINTS.forEach((kp) => KM.Points.learnKp(kp.id));
  const st = KM.Points.state();
  if (st.learnedKp.length !== 6) throw new Error('已学知识点 ' + st.learnedKp.length);
  if (st.badges.indexOf('B-KP-ALL') < 0) throw new Error('未点亮「知识点全学会」徽章');
});

scenario('三种难度的题目组都能生成并通过 R4', () => {
  for (const grade of [1, 2, 3]) {
    for (const mode of ['add', 'sub', 'mul', 'div', 'rem', 'mix']) {
      for (const star of [1, 2, 3]) {
        const res = KM.Generator.generateSet({ grade, mode, star, size: 10 });
        const g = KM.Rules.assertGroup(res.questions, { grade, star, size: 10 });
        if (!g.ok) throw new Error(grade + '/' + mode + '/' + star + ' -> ' + g.reason);
      }
    }
  }
});

scenario('1 星难度的大选项包含正确答案', () => {
  for (const grade of [1, 2, 3]) {
    const res = KM.Generator.generateSet({ grade, mode: 'mix', star: 1, size: 10 });
    res.questions.forEach((q) => {
      const opts = KM.Generator.makeOptions(q);
      if (!opts.some((o) => o.correct)) throw new Error('选项缺少正确答案：' + q.display);
      if (opts.length !== 3) throw new Error('选项数量不为 3');
      const uniq = new Set(opts.map((o) => o.display));
      if (uniq.size !== 3) throw new Error('选项重复：' + opts.map((o) => o.display).join(','));
    });
  }
});

scenario('成长树 8 级均可绘制', () => {
  for (let lv = 0; lv <= 7; lv++) {
    const svg = KM.Rewards.treeSvg(lv);
    if (typeof svg !== 'string' || svg.indexOf('<svg') !== 0) throw new Error('第 ' + lv + ' 级树绘制失败');
  }
});

scenario('吉祥物四种表情均可生成', () => {
  ['happy', 'think', 'cheer', 'sleep'].forEach((mood) => {
    const s = KM.Mascot.svg({ mood, size: 120 });
    if (s.indexOf('<svg') !== 0) throw new Error('表情 ' + mood + ' 生成失败');
  });
});

scenario('提示三级文案均可生成且带 sourceRef', () => {
  Object.keys(KM.Hints.HINT_SETS).forEach((kind) => {
    const q = KM.Generator.buildQuestion(2, 2, 'add', 8, 5, 0, 0);
    const h = KM.Hints.build(kind, q);
    if (!h.l1 || !h.l2 || !h.l3 || !h.sourceRef) throw new Error('提示集 ' + kind + ' 不完整');
  });
});

/* ---------------- QA 补充断言 ----------------
   下面几条是 QA 验收时补齐的：已有断言只检查了「数量」和「有没有」，
   没有检查「对不对」。                                                */

scenario('[QA] 题组生成必须返回 ok=true，且真正遵守请求的运算模式', () => {
  for (const grade of [1, 2, 3]) {
    const allowed = KM.Rules.OPS_BY_GRADE[grade];
    for (const mode of ['add', 'sub', 'mul', 'div', 'rem', 'mix']) {
      for (const star of [1, 2, 3]) {
        for (let i = 0; i < 5; i++) {
          const res = KM.Generator.generateSet({ grade, mode, star, size: 10 });
          if (!res.ok) throw new Error(`${grade}/${mode}/${star} 生成失败：${res.reason}`);
          if (!res.questions || res.questions.length !== 10) {
            throw new Error(`${grade}/${mode}/${star} 题量不足：${(res.questions || []).length}`);
          }
          for (const q of res.questions) {
            if (mode === 'mix') {
              if (allowed.indexOf(q.op) < 0) {
                throw new Error(`${grade} 混合模式出现超前概念 ${q.op}`);
              }
            } else if (allowed.indexOf(mode) >= 0 && q.op !== mode) {
              throw new Error(`${grade}/${mode}/${star} 生成了 ${q.op}（题面 ${q.display}）`);
            }
          }
        }
      }
    }
  }
});

scenario('[QA] 题面与答案自洽（从显示文本独立反算）', () => {
  for (const grade of [1, 2, 3]) {
    for (const mode of ['add', 'sub', 'mul', 'div', 'rem', 'mix']) {
      for (const star of [1, 2, 3]) {
        for (const q of KM.Generator.generateSet({ grade, mode, star, size: 10 }).questions) {
          const p = parseExpr(q.display);
          if (p.a !== q.a || p.b !== q.b) {
            throw new Error(`操作数不符：${q.display} vs a=${q.a} b=${q.b}`);
          }
          if (p.isRem !== (q.op === 'rem')) {
            throw new Error(`题型标记不符：${q.display} op=${q.op}`);
          }
          if (q.op === 'rem') {
            if (p.answers[0] !== q.answer || p.answers[1] !== q.remainder) {
              throw new Error(`余数题答案错：${q.display} 应 ${p.answers[0]}…${p.answers[1]} 实 ${q.answer}…${q.remainder}`);
            }
          } else if (p.answers[0] !== q.answer) {
            throw new Error(`答案错：${q.display} 应 ${p.answers[0]} 实 ${q.answer}`);
          }
        }
      }
    }
  }
});

scenario('[QA] L3 讲解鼓励分每日上限为 10', () => {
  KM.Points.reset();
  let got = 0;
  for (let i = 0; i < 20; i++) got += KM.Points.readL3('q' + i).applied;
  if (got !== 10) throw new Error('L3 每日上限失效，实得 ' + got);
  const over = KM.Points.readL3('qX');
  if (over.applied !== 0 || over.capped !== true) throw new Error('超上限后仍加分');
});

scenario('[QA] 累计积分跨会话保留（load 后仍在）', () => {
  KM.Points.reset();
  KM.Points.add('学习', 30, null);
  KM.Points.add('练习', 45, null);
  const before = KM.Points.state().totalPoints;
  KM.Points.load();                       // 等价于「重新打开页面」
  const after = KM.Points.state().totalPoints;
  if (after !== before) throw new Error(`积分丢失：${before} -> ${after}`);
  if (KM.Points.state().ledger.length !== 2) throw new Error('流水未保留');
});

scenario('[QA] 全部答错时结算页仍至少 1 颗星且无打击式文案', async () => {
  KM.Points.reset();
  KM.Practice.reset();
  KM.App.go('practice');
  click(findByHtml(appRoot(), '1 星'));
  click(findByHtml(appRoot(), '开始练习'));

  for (let i = 0; i < 10; i++) {
    const qNode = findByClass(appRoot(), 'km-question__expr');
    if (!qNode) throw new Error('第 ' + (i + 1) + ' 题未渲染');
    const p = parseExpr(qNode._html);
    const right = p.isRem ? (p.answers[0] + ' …… ' + p.answers[1]) : String(p.answers[0]);
    // 故意点一个错误选项
    let wrongOpt = null;
    (function walk(n) {
      if (wrongOpt || !n || typeof n !== 'object') return;
      // 注意用 class 全等匹配，否则会先命中容器 div.km-options（它没有处理函数）
      if (String(n.className || '').split(' ').indexOf('km-option') >= 0 && n._html !== right) {
        wrongOpt = n;
        return;
      }
      (n.children || []).forEach(walk);
    })(appRoot());
    if (!wrongOpt) throw new Error('找不到错误选项');
    click(wrongOpt);
    // 用三级提示把题目结束掉（不需要等待防连点锁）
    for (let k = 0; k < 4; k++) {
      const b = findByHtml(appRoot(), '帮帮我') ||
        findByHtml(appRoot(), '再帮一下') ||
        findByHtml(appRoot(), '直接看讲解');
      if (!b) break;
      click(b);
    }
    if (findByHtml(appRoot(), '答对 ')) break;
    const next = findByHtml(appRoot(), '下一题 →') || findByHtml(appRoot(), '看看结果 →');
    if (!next) throw new Error('第 ' + (i + 1) + ' 题看完讲解后没有下一题');
    click(next);
  }
  if (!findByHtml(appRoot(), '答对 0 / 10')) throw new Error('结算页分数不是 0/10');

  // 星星必须 ≥1
  let solid = 0;
  (function walk(n) {
    if (!n || typeof n !== 'object') return;
    if (String(n.className || '').indexOf('km-star-pop') === 0 && n._html.indexOf('#FFD166') >= 0) solid++;
    (n.children || []).forEach(walk);
  })(appRoot());
  if (solid < 1) throw new Error('结算页星星数 ' + solid + '（应 ≥1）');

  // 不得出现打击式文案
  const BAN = ['失败', '不及格', '太差', '笨', '差劲', '零分', '没通过', '重做', '答错'];
  let all = '';
  (function walk(n) {
    if (!n || typeof n !== 'object') return;
    all += (n._html || '') + '\n' + (n.textContent || '') + '\n';
    (n.children || []).forEach(walk);
  })(appRoot());
  for (const w of BAN) {
    if (all.indexOf(w) >= 0) throw new Error('结算页出现打击式文案：' + w);
  }
});

/* ---------------- 结果 ---------------- */
async function runScenarios() {
  for (const s of scenarioQueue) {
    try {
      await s.fn();
      console.log('  PASS  ' + s.name);
    } catch (err) {
      runtimeErrors++;
      console.log('  FAIL  ' + s.name + ' -> ' +
        (err && err.stack ? err.stack.split('\n').slice(0, 2).join(' | ') : err));
    }
  }
}

runScenarios().then(() => {
  // QA 修订：原先把「生成合法题组失败 / 无法为第 N 题生成合法题目」也过滤掉了，
  // 这会让出题引擎的真实故障在冒烟里隐身。现在只保留「重试过程中的告警」白名单。
  const realErrors = errors.filter((e) =>
    !/已跳过渲染|缺少 sourceRef|整组校验未通过/.test(e));

  console.log('\n========================================');
  console.log('点击次数：' + clicks + '，场景异常：' + runtimeErrors + '，意外 console 输出：' + realErrors.length);
  if (realErrors.length) realErrors.slice(0, 10).forEach((e) => console.log('  - ' + e));
  const ok = runtimeErrors === 0 && realErrors.length === 0 && namespaceOk;
  console.log(ok ? 'UI 冒烟全部通过 ✅' : 'UI 冒烟存在问题 ❌');
  process.exit(ok ? 0 : 1);
});
