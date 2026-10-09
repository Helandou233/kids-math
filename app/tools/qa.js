/* ============================================================
   tools/qa.js —— QA 独立验收测试（零 npm 依赖）
   与 tools/smoke.js / tools/uismoke.js 互补，重点攻击已有测试没覆盖的方向：
     1. 出题引擎边界与越界（错一道题 = 直接教错孩子，一律 P0）
     2. 积分与持久化（累计积分只增不减、跨会话保留、每日上限、幂等）
     3. 内容数据数学表述正确性
     4. UI 健壮性（连点 / 结算页永不打击 / 全组合答题判定）
   特点：内置「可控假时钟」，可以精确模拟真实使用中的 500ms 防连点锁与
        1200ms 自动翻页，无需真的 sleep。
   运行：node tools/qa.js
   ============================================================ */
'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const APP_DIR = path.join(__dirname, '..');

/* ============================================================
   0. 统计器
   ============================================================ */
let PASS = 0;
let FAIL = 0;
const FAILURES = [];

function check(name, ok, detail) {
  if (ok) {
    PASS++;
  } else {
    FAIL++;
    FAILURES.push(name + (detail ? '  ->  ' + detail : ''));
    console.log('  FAIL  ' + name + (detail ? '  [' + detail + ']' : ''));
  }
}
function section(title) { console.log('\n' + title); }

/* ============================================================
   1. 可控假时钟（模拟真实时间推进，避免真的 sleep）
   ============================================================ */
let CLOCK = 0;
const TIMERS = [];
globalThis.setTimeout = function (fn, ms) {
  const t = { fn: fn, at: CLOCK + (Number(ms) || 0), dead: false };
  TIMERS.push(t);
  return t;
};
globalThis.clearTimeout = function (t) { if (t) t.dead = true; };
globalThis.setInterval = function () { return { fake: true }; };
globalThis.clearInterval = function () { /* noop */ };
/** 推进虚拟时间并执行到期回调 */
function advance(ms) {
  CLOCK += ms;
  const due = TIMERS.filter((t) => !t.dead && t.at <= CLOCK).sort((a, b) => a.at - b.at);
  for (const t of due) {
    if (t.dead) continue;
    t.dead = true;
    t.fn();
  }
}

/* ============================================================
   2. 极简 DOM 桩
   ============================================================ */
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
  node.classList = { add() {}, remove() {}, contains() { return false; } };
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

function makeFakeLS() {
  const m = Object.create(null);
  return {
    getItem: (k) => (Object.prototype.hasOwnProperty.call(m, k) ? m[k] : null),
    setItem: (k, v) => { m[k] = String(v); },
    removeItem: (k) => { delete m[k]; },
    get length() { return Object.keys(m).length; },
    key: (i) => Object.keys(m)[i]
  };
}

/* ============================================================
   3. 加载被测代码
   ============================================================ */
const CONSOLE_MSGS = [];
console.warn = function (...a) { CONSOLE_MSGS.push('warn: ' + a.join(' ')); };
console.error = function (...a) { CONSOLE_MSGS.push('error: ' + a.join(' ')); };

const htmlRaw = fs.readFileSync(path.join(APP_DIR, 'index.html'), 'utf8');
const SCRIPTS = [];
{
  const re = /<script\s+src="([^"]+)"/g;
  let m;
  while ((m = re.exec(htmlRaw)) !== null) SCRIPTS.push(m[1]);
}
const CORE_ONLY = ['js/core/storage.js', 'js/core/rules.js', 'js/core/generator.js',
  'js/core/points.js', 'js/data/knowledge.js', 'js/data/hints.js'];

globalThis.localStorage = makeFakeLS();
globalThis.document = {
  readyState: 'complete',
  createElement: (tag) => makeNode(tag),
  createElementNS: (ns, tag) => makeNode(tag),
  getElementById: (id) => byId[id] || null,
  addEventListener: () => {},
  removeEventListener: () => {},
  body: makeNode('body'),
  documentElement: makeNode('html')
};
globalThis.window = globalThis;
globalThis.location = { search: '' };
globalThis.scrollTo = () => {};
globalThis.KM = globalThis.KM || {};

/** 加载（或重新加载）全部脚本 = 「打开 / 重新打开页面」 */
function bootAll() {
  for (const rel of SCRIPTS) {
    vm.runInThisContext(fs.readFileSync(path.join(APP_DIR, rel), 'utf8'), { filename: rel });
  }
}

bootAll();
let KM = globalThis.KM;
let Rules = KM.Rules;
let Gen = KM.Generator;

const GRADES = [1, 2, 3];
const STARS = [1, 2, 3];
const ALL_MODES = ['add', 'sub', 'mul', 'div', 'rem', 'mix'];
const GRADE_NAMES = { 1: '一年级', 2: '二年级', 3: '三年级' };
const MODE_LABELS = { add: '加法', sub: '减法', mul: '乘法', div: '除法', rem: '有余数', mix: '混合' };
function allowedModes(g) { return Rules.OPS_BY_GRADE[g].concat(['mix']); }

/* ============================================================
   4. 通用工具
   ============================================================ */
function walk(root, fn) {
  if (!root || typeof root !== 'object') return;
  fn(root);
  (root.children || []).forEach((c) => walk(c, fn));
}
function findExactHtml(root, text) {
  let f = null;
  walk(root, (n) => { if (!f && n._html === text) f = n; });
  return f;
}
function findContainsHtml(root, sub) {
  let f = null;
  walk(root, (n) => { if (!f && n._html && n._html.indexOf(sub) >= 0) f = n; });
  return f;
}
function findByClass(root, cls) {
  let f = null;
  walk(root, (n) => { if (!f && String(n.className || '').split(' ').indexOf(cls) >= 0) f = n; });
  return f;
}
function findByTextContent(root, text) {
  let f = null;
  walk(root, (n) => { if (!f && n.textContent === text) f = n; });
  return f;
}
function findFirstSvg(root) {
  let f = null;
  walk(root, (n) => { if (!f && String(n.tagName) === 'svg') f = n; });
  return f;
}
function click(node, label) {
  if (!node) throw new Error('找不到可点击元素：' + label);
  const fns = (node.handlers && node.handlers.click) || [];
  if (!fns.length) throw new Error('元素没有 click 处理函数：' + label);
  fns[0]({ preventDefault() {} });
}
function hasHandler(node) {
  return !!(node && node.handlers && node.handlers.click && node.handlers.click.length);
}
function allText(root) {
  const buf = [];
  walk(root, (n) => { buf.push(n._html || '', n.textContent || ''); });
  return buf.join('\n');
}
function appRoot() { return byId['km-app']; }

/** 从题面独立反算答案（不信任被测实现） */
function solveFromDisplay(display) {
  const mm = String(display).match(/(\d+)\s*([+\u2212\u00d7\u00f7])\s*(\d+)/);
  if (!mm) throw new Error('无法解析题面：' + display);
  const a = Number(mm[1]);
  const b = Number(mm[3]);
  const sym = mm[2];
  const isRem = String(display).indexOf('\u2026') >= 0;
  let ans, rem = null;
  if (sym === '+') ans = a + b;
  else if (sym === '\u2212') ans = a - b;
  else if (sym === '\u00d7') ans = a * b;
  else { ans = Math.floor(a / b); rem = a % b; }
  return { a, b, sym, isRem, ans, rem };
}

/**
 * 判定一个算术等式的真假。支持：
 *   多步连加（4 + 4 + 4 = 12）、两侧都是算式（3 + 5 = 5 + 3）、
 *   带余除法（14 ÷ 4 = 3 …… 2）。
 * @returns {boolean|null} null = 无法解析
 */
function evalExpr(str) {
  const re = /(\d+(?:\s*[+\u2212\u00d7\u00f7]\s*\d+)+)\s*=\s*(\d+(?:\s*[+\u2212\u00d7\u00f7]\s*\d+)*)(?:\s*\u2026+\s*(\d+))?/;
  const m = String(str).match(re);
  if (!m) return null;
  /** 按「先乘除后加减」求值；÷0 返回 NaN */
  const side = (exprText) => {
    const nums = exprText.split(/[+\u2212\u00d7\u00f7]/).map((x) => Number(x.trim()));
    const ops = exprText.match(/[+\u2212\u00d7\u00f7]/g) || [];
    // 先处理乘除
    const stackN = [nums[0]];
    const stackO = [];
    for (let i = 0; i < ops.length; i++) {
      const o = ops[i];
      const b = nums[i + 1];
      if (o === '\u00d7' || o === '\u00f7') {
        if (o === '\u00f7' && b === 0) return NaN;
        const a = stackN.pop();
        stackN.push(o === '\u00d7' ? a * b : Math.floor(a / b));
      } else {
        stackO.push(o);
        stackN.push(b);
      }
    }
    let v = stackN[0];
    for (let i = 0; i < stackO.length; i++) {
      v = stackO[i] === '+' ? v + stackN[i + 1] : v - stackN[i + 1];
    }
    return v;
  };
  const left = side(m[1]);
  const rightText = m[2];
  const rem = m[3] === undefined ? null : Number(m[3]);
  if (rem !== null) {
    // 带余除法：a ÷ b = q …… r，要求 q = ⌊a/b⌋、r = a mod b、r < b
    const lm = m[1].match(/^(\d+)\s*\u00f7\s*(\d+)$/);
    if (!lm) return false;
    const a = Number(lm[1]);
    const b = Number(lm[2]);
    if (b === 0) return false;
    return Math.floor(a / b) === Number(rightText) &&
      a % b === rem && rem < b;
  }
  const right = side(rightText);
  if (Number.isNaN(left) || Number.isNaN(right)) return false;
  return left === right;
}

/* ============================================================
   模块 A：出题引擎边界与越界（P0 防线）
   ============================================================ */
section('[A] 出题引擎：边界 / 越界 / 答案正确性');

{
  // A1+A2
  let combos = 0;
  const failCombos = [];
  for (const grade of GRADES) {
    for (const mode of ALL_MODES) {
      for (const star of STARS) {
        combos++;
        let ok = 0, r4bad = 0, sizeBad = 0, modeBad = 0, firstReason = '';
        for (let s = 0; s < 60; s++) {
          const res = Gen.generateSet({ grade, mode, star, size: 10 });
          const list = res.questions || [];
          if (list.length !== 10) sizeBad++;
          if (res.ok) ok++;
          for (const q of list) {
            const r = Rules.assertR4(q, { grade, star });
            if (!r.ok) { r4bad++; firstReason = firstReason || r.reason; }
            if (mode === 'mix') {
              if (Rules.OPS_BY_GRADE[grade].indexOf(q.op) < 0) modeBad++;
            } else if (Rules.OPS_BY_GRADE[grade].indexOf(mode) >= 0 && q.op !== mode) {
              modeBad++;
            }
          }
        }
        if (ok !== 60 || r4bad || sizeBad || modeBad) {
          failCombos.push(`${grade}年级/${Rules.MODE_NAME[mode] || mode}/${star}星: ok=${ok}/60 r4bad=${r4bad} sizeBad=${sizeBad} modeBad=${modeBad} ${firstReason}`);
        }
      }
    }
  }
  check(`A1+A2 全 ${combos} 个 (年级×模式×难度) 组合稳定生成且模式被遵守`,
    failCombos.length === 0, failCombos.slice(0, 4).join(' ; '));

  // A3 一年级
  let g1Bad = 0; const g1Ex = [];
  for (const star of STARS) {
    for (let i = 0; i < 3000; i++) {
      for (const op of ['add', 'sub']) {
        const q = Gen.randomQuestion({ grade: 1, op, star });
        if (!q) continue;
        if (q.a > 20 || q.b > 20 || q.answer > 20) { g1Bad++; g1Ex.push('>20: ' + q.display); }
      }
    }
    for (let s = 0; s < 200; s++) {
      for (const q of Gen.generateSet({ grade: 1, mode: 'mix', star, size: 10 }).questions) {
        if (q.op !== 'add' && q.op !== 'sub') { g1Bad++; g1Ex.push('一年级出现 ' + q.op); }
        if (q.a > 20 || q.b > 20 || q.answer > 20) { g1Bad++; g1Ex.push('一年级 >20: ' + q.display); }
      }
    }
  }
  check('A3 一年级不出乘除且所有数值 ≤ 20', g1Bad === 0, `${g1Bad} 处，例：${g1Ex.slice(0, 3).join(' , ')}`);

  // A4 二年级乘法表内 / 无余数除法
  let g2MulBad = 0, g2RemBad = 0; const g2Ex = [];
  for (const star of STARS) {
    for (let i = 0; i < 4000; i++) {
      const q = Gen.randomQuestion({ grade: 2, op: 'mul', star });
      if (!q) continue;
      if (!(q.a >= 1 && q.a <= 9 && q.b >= 1 && q.b <= 9)) { g2MulBad++; g2Ex.push(`非表内 ${q.a}×${q.b}`); }
    }
    for (let s = 0; s < 200; s++) {
      for (const q of Gen.generateSet({ grade: 2, mode: 'mix', star, size: 10 }).questions) {
        if (q.op === 'rem') { g2RemBad++; g2Ex.push('二年级出现余数除法'); }
        if (q.op === 'mul' && !(q.a >= 1 && q.a <= 9 && q.b >= 1 && q.b <= 9)) {
          g2MulBad++; g2Ex.push(`组内非表内 ${q.a}×${q.b}`);
        }
      }
    }
  }
  check('A4 二年级乘法全部表内 1–9×1–9', g2MulBad === 0, `${g2MulBad} 处：${g2Ex.slice(0, 3).join(' , ')}`);
  check('A4b 二年级绝不出现余数除法', g2RemBad === 0, `${g2RemBad} 处`);

  // A5 二年级除法
  let g2DivBad = 0; const g2DivEx = [];
  for (const star of STARS) {
    for (let i = 0; i < 4000; i++) {
      const q = Gen.randomQuestion({ grade: 2, op: 'div', star });
      if (!q) continue;
      if (q.a % q.b !== 0) { g2DivBad++; g2DivEx.push('不整除 ' + q.display); }
      if (q.b < 1 || q.b > 9) { g2DivBad++; g2DivEx.push('除数越界 ' + q.display); }
      if (q.answer > 9) { g2DivBad++; g2DivEx.push(`商超表内 ${q.display}=${q.answer}`); }
      if (q.a > 81) { g2DivBad++; g2DivEx.push('被除数 >81: ' + q.display); }
    }
  }
  check('A5 二年级除法整除、除数 1–9、商 ≤9、被除数 ≤81', g2DivBad === 0,
    `${g2DivBad} 处：${g2DivEx.slice(0, 3).join(' , ')}`);

  // A6 三年级余数
  let remBad = 0; const remEx = [];
  for (const star of STARS) {
    for (let i = 0; i < 4000; i++) {
      const q = Gen.randomQuestion({ grade: 3, op: 'rem', star });
      if (!q) continue;
      if (!Number.isInteger(q.remainder)) { remBad++; remEx.push('余数非整数'); }
      else if (q.remainder < 1) { remBad++; remEx.push('余数 <1: ' + q.display); }
      else if (q.remainder >= q.b) { remBad++; remEx.push(`余数 ≥ 除数: ${q.display}=${q.answer}…${q.remainder}`); }
      if (q.b < 2) { remBad++; remEx.push('除数 <2: ' + q.display); }
      if (q.b * q.answer + q.remainder !== q.a) { remBad++; remEx.push('不自洽: ' + q.display); }
    }
  }
  check('A6 三年级余数恒满足 1 ≤ 余数 < 除数 且算式自洽', remBad === 0,
    `${remBad} 处：${remEx.slice(0, 3).join(' , ')}`);

  // A7 全局数值合法性
  const gBad = { div0: 0, zeroDivZero: 0, neg: 0, notInt: 0, subNeg: 0, nan: 0 };
  const gEx = [];
  for (const grade of GRADES) {
    for (const op of Rules.OPS_BY_GRADE[grade]) {
      for (const star of STARS) {
        for (let i = 0; i < 1500; i++) {
          const q = Gen.randomQuestion({ grade, op, star });
          if (!q) continue;
          const vals = [q.a, q.b, q.answer].concat(op === 'rem' ? [q.remainder] : []);
          for (const v of vals) {
            if (typeof v !== 'number' || Number.isNaN(v)) gBad.nan++;
            else if (!Number.isInteger(v)) gBad.notInt++;
            else if (v < 0) gBad.neg++;
          }
          if (op === 'div' || op === 'rem') {
            if (q.b === 0) { gBad.div0++; gEx.push(`除数为 0: ${q.a}÷0`); }
            if (q.a === 0 && q.b === 0) gBad.zeroDivZero++;
          }
          if (op === 'sub' && q.a - q.b < 0) { gBad.subNeg++; gEx.push('减法负值 ' + q.display); }
        }
      }
    }
  }
  check('A7a 除数永不为 0（且无 0÷0）',
    gBad.div0 === 0 && gBad.zeroDivZero === 0,
    `div0=${gBad.div0} 0÷0=${gBad.zeroDivZero} ${gEx.slice(0, 2).join(',')}`);
  check('A7b 不出现负数 / 小数 / NaN，减法结果恒非负',
    gBad.neg === 0 && gBad.notInt === 0 && gBad.subNeg === 0 && gBad.nan === 0,
    JSON.stringify(gBad) + ' ' + gEx.slice(0, 2).join(','));

  // A8 单步运算
  let multiStep = 0; const multiEx = [];
  for (const grade of GRADES) {
    for (const star of STARS) {
      for (let s = 0; s < 120; s++) {
        for (const q of Gen.generateSet({ grade, mode: 'mix', star, size: 10 }).questions) {
          const ops = String(q.expr).match(/[+\u2212\u00d7\u00f7]/g) || [];
          if (ops.length !== 1) { multiStep++; multiEx.push(q.expr); }
        }
      }
    }
  }
  check('A8 每题都是单步运算（表达式只含 1 个运算符）', multiStep === 0,
    `${multiStep} 处：${multiEx.slice(0, 3).join(' , ')}`);

  // A9 题面与答案自洽
  let ansBad = 0; const ansEx = [];
  for (const grade of GRADES) {
    for (const mode of ALL_MODES) {
      for (const star of STARS) {
        for (let s = 0; s < 40; s++) {
          for (const q of Gen.generateSet({ grade, mode, star, size: 10 }).questions) {
            const p = solveFromDisplay(q.display);
            if (p.a !== q.a || p.b !== q.b) { ansBad++; ansEx.push(`操作数不符 ${q.display} vs a=${q.a} b=${q.b}`); continue; }
            if (p.isRem !== (q.op === 'rem')) { ansBad++; ansEx.push(`题型标记不符 ${q.display} op=${q.op}`); continue; }
            if (q.op === 'rem') {
              if (p.ans !== q.answer || p.rem !== q.remainder) {
                ansBad++; ansEx.push(`余数题答案错 ${q.display} 应 ${p.ans}…${p.rem} 实 ${q.answer}…${q.remainder}`);
              }
            } else if (p.ans !== q.answer) {
              ansBad++; ansEx.push(`答案错 ${q.display} 应 ${p.ans} 实 ${q.answer}`);
            }
          }
        }
      }
    }
  }
  check('A9 题面与答案 100% 自洽（独立反算，覆盖全组合）', ansBad === 0,
    `${ansBad} 处：${ansEx.slice(0, 3).join(' , ')}`);

  // A10 线上实际使用的 size（1–12）必须稳定
  const sizeProblems = [];
  for (const size of [1, 2, 3, 5, 8, 10, 12]) {
    for (const grade of GRADES) {
      for (const mode of ALL_MODES) {
        for (const star of STARS) {
          for (let s = 0; s < 8; s++) {
            const res = Gen.generateSet({ grade, mode, star, size });
            if (!res.ok || !res.questions || res.questions.length !== size) {
              sizeProblems.push(`size=${size} ${grade}/${mode}/${star}: ${res.reason || ('数量 ' + ((res.questions || []).length))}`);
            }
          }
        }
      }
    }
  }
  check('A10 size=1/2/3/5/8/10/12 均能稳定生成合法题组',
    sizeProblems.length === 0, sizeProblems.slice(0, 4).join(' ; '));

  // A10b 更大 size 的健壮性（已知问题：≥15 时部分组合失败）
  const bigProblems = [];
  for (const size of [15, 20, 30]) {
    for (const grade of GRADES) {
      for (const mode of ALL_MODES) {
        for (const star of STARS) {
          let f = 0, reason = '';
          for (let s = 0; s < 10; s++) {
            const res = Gen.generateSet({ grade, mode, star, size });
            if (!res.ok) { f++; reason = reason || res.reason; }
          }
          if (f) bigProblems.push(`size=${size} ${grade}/${mode}/${star} 失败 ${f}/10：${reason}`);
        }
      }
    }
  }
  check('A10b 大题量（size=15/20/30）也应能生成合法题组（当前为已知缺陷）',
    bigProblems.length === 0, bigProblems.slice(0, 3).join(' ; '));

  // A11 组内质量独立复核
  let grpBad = 0; const grpEx = [];
  for (const grade of GRADES) {
    for (const mode of ALL_MODES) {
      for (const star of STARS) {
        for (let s = 0; s < 40; s++) {
          const list = Gen.generateSet({ grade, mode, star, size: 10 }).questions;
          if (list.length !== 10) { grpBad++; continue; }
          const keys = new Set();
          let zeros = 0;
          list.forEach((q, idx) => {
            const k = q.op + '|' + q.a + '|' + q.b;
            if (keys.has(k)) { grpBad++; grpEx.push('组内重复 ' + k); }
            keys.add(k);
            if (Rules.isZeroResult(q)) {
              zeros++;
              if (idx < 3) { grpBad++; grpEx.push('0 结果题出现在前 3 题'); }
            }
          });
          if (zeros > 1) { grpBad++; grpEx.push('0 结果题超过 1 道'); }
          if (!Rules.isGift(list[0])) { grpBad++; grpEx.push('首题非送分题 ' + list[0].display); }
          if (new Set(list.map((q) => q.answer)).size < 2) { grpBad++; grpEx.push('整组答案单一'); }
        }
      }
    }
  }
  check('A11 组内质量独立复核（去重 / 0 结果约束 / 首题送分 / 答案多样性）',
    grpBad === 0, `${grpBad} 处：${grpEx.slice(0, 3).join(' , ')}`);

  // A12 makeGift / makeBoundary
  let gbBad = 0; const gbEx = [];
  for (const grade of GRADES) {
    for (const op of Rules.OPS_BY_GRADE[grade]) {
      for (const star of STARS) {
        for (let i = 0; i < 200; i++) {
          const g = Gen.makeGift(grade, op, star);
          if (!g) { gbBad++; gbEx.push(`makeGift 返回 null ${grade}/${op}/${star}`); }
          else if (!Rules.assertR4(g, { grade, star }).ok) { gbBad++; gbEx.push('makeGift 非法 ' + g.display); }
          else if (Rules.isZeroResult(g)) { gbBad++; gbEx.push('送分题结果为 0 ' + g.display); }
          const b = Gen.makeBoundary(grade, op, star);
          if (!b) { gbBad++; gbEx.push(`makeBoundary 返回 null ${grade}/${op}/${star}`); }
          else if (!Rules.assertR4(b, { grade, star }).ok) { gbBad++; gbEx.push('makeBoundary 非法 ' + b.display); }
        }
      }
    }
  }
  check('A12 送分题 / 边界题单独生成也 100% 合法', gbBad === 0, `${gbBad} 处：${gbEx.slice(0, 3).join(' , ')}`);

  // A13 选项
  let optBad = 0; const optEx = [];
  for (const grade of GRADES) {
    for (const mode of ALL_MODES) {
      for (let s = 0; s < 60; s++) {
        for (const q of Gen.generateSet({ grade, mode, star: 1, size: 10 }).questions) {
          const opts = Gen.makeOptions(q);
          if (opts.length !== 3) { optBad++; optEx.push('选项数 ' + opts.length); }
          const right = opts.filter((o) => o.correct);
          if (right.length !== 1) { optBad++; optEx.push('正确项数 ' + right.length + ' @' + q.display); }
          else {
            if (right[0].value !== q.answer) { optBad++; optEx.push('正确项值不符 ' + q.display); }
            if (q.op === 'rem' && right[0].r !== q.remainder) { optBad++; optEx.push('正确项余数不符 ' + q.display); }
          }
          if (new Set(opts.map((o) => o.display)).size !== 3) { optBad++; optEx.push('选项重复 @' + q.display); }
          for (const o of opts) {
            if (!Number.isInteger(o.value) || o.value < 0) { optBad++; optEx.push('非法选项 ' + o.display); }
            if (q.op === 'rem' && typeof o.r === 'number' && o.r >= q.b) {
              optBad++; optEx.push('选项余数 ≥ 除数 ' + o.display + ' @' + q.display);
            }
          }
        }
      }
    }
  }
  check('A13 1 星三选项：唯一正确答案、互不重复、无负值、余数 < 除数',
    optBad === 0, `${optBad} 处：${optEx.slice(0, 3).join(' , ')}`);
}

/* ============================================================
   模块 B：积分与持久化
   ============================================================ */
section('[B] 积分引擎与持久化');

{
  const P = KM.Points;

  // B1 跨会话保留
  P.reset();
  P.add('学习', 30, null);
  P.add('练习', 45, null);
  P.learnKp('KP-ADD');
  P.readCard('SC-01');
  P.signIn();
  const snap = {
    total: P.state().totalPoints,
    avail: P.state().availablePoints,
    ledger: P.state().ledger.length,
    badges: P.state().badges.length,
    learned: P.state().learnedKp.length
  };
  bootAll();
  KM = globalThis.KM; Rules = KM.Rules; Gen = KM.Generator;
  const onOpen = KM.Points.state().totalPoints;
  KM.Points.load();
  const after = KM.Points.state();
  check('B1 重新打开页面后累计积分自动保留（P0）',
    onOpen === snap.total && after.totalPoints === snap.total,
    `关掉前 ${snap.total}，重开后 ${onOpen}，再 load 后 ${after.totalPoints}`);
  check('B1b 可用积分 / 流水 / 徽章 / 学习记录一并保留',
    after.availablePoints === snap.avail && after.ledger.length === snap.ledger &&
    after.badges.length === snap.badges && after.learnedKp.length === snap.learned,
    `avail ${after.availablePoints}/${snap.avail} ledger ${after.ledger.length}/${snap.ledger}`);

  // B2 totalPoints 只增不减
  KM.Points.reset();
  let last = 0, decreased = 0;
  const decEx = [];
  const ops = [
    () => KM.Points.recordCorrect(),
    () => KM.Points.recordCombo(3),
    () => KM.Points.finishSet({ correct: 7, total: 10 }),
    () => KM.Points.learnKp('KP-SUB'),
    () => KM.Points.readCard('SC-02'),
    () => KM.Points.readL3('q' + Math.floor(Math.random() * 50)),
    () => KM.Points.signIn(),
    () => KM.Points.addWrong({ op: 'add', a: 1, b: 2, answer: 3, display: '1 + 2 = ?' }),
    () => KM.Points.updateBestCombo(Math.floor(Math.random() * 12)),
    () => KM.Points.taskList(),
    () => KM.Points.badgeList(),
    () => KM.Points.levelInfo()
  ];
  for (let i = 0; i < 4000; i++) {
    ops[Math.floor(Math.random() * ops.length)]();
    const now = KM.Points.state().totalPoints;
    if (now < last) { decreased++; decEx.push(`${last} -> ${now} @op${i}`); }
    last = now;
  }
  check('B2 累计积分 totalPoints 只增不减（4000 次随机操作）',
    decreased === 0, `${decreased} 次下降：${decEx.slice(0, 3).join(' , ')}`);

  // B3 每日上限 200
  KM.Points.reset();
  let gained = 0;
  for (let i = 0; i < 100; i++) gained += KM.Points.add('刷分', 10, null).applied;
  check('B3 每日积分上限 200 生效', gained === 200 && KM.Points.todayEarned() === 200,
    `实得 ${gained}，todayEarned ${KM.Points.todayEarned()}`);
  const over = KM.Points.add('再刷', 10, null);
  check('B3b 达到上限后继续加分返回 applied=0 且 capped=true',
    over.applied === 0 && over.capped === true, JSON.stringify(over));

  // B4 L3 每日上限
  KM.Points.reset();
  let l3 = 0;
  for (let i = 0; i < 30; i++) l3 += KM.Points.readL3('q' + i).applied;
  check('B4 L3 讲解鼓励分每日上限 10 生效', l3 === 10, `实得 ${l3}`);
  const l3Over = KM.Points.readL3('qZ');
  check('B4b 超出上限后 readL3 返回 capped=true 且不再加分',
    l3Over.applied === 0 && l3Over.capped === true, JSON.stringify(l3Over));

  // B5 签到
  KM.Points.reset();
  const s1 = KM.Points.signIn();
  const s2 = KM.Points.signIn();
  const s3 = KM.Points.signIn();
  check('B5 签到当天只算一次（连点 3 次只加一次）',
    s1.ok === true && s2.already === true && s3.already === true &&
    KM.Points.state().sign.totalDays === 1,
    `totalDays=${KM.Points.state().sign.totalDays}`);
  const ptsAfterSign = KM.Points.state().totalPoints;
  KM.Points.signIn();
  check('B5b 重复签到不再重复加分', KM.Points.state().totalPoints === ptsAfterSign,
    `${ptsAfterSign} -> ${KM.Points.state().totalPoints}`);

  const keyOf = (offset) => {
    const t = new Date(Date.now() + offset * 86400000);
    return t.getFullYear() + '-' + String(t.getMonth() + 1).padStart(2, '0') +
      '-' + String(t.getDate()).padStart(2, '0');
  };
  KM.Points.reset();
  KM.Points.state().sign.lastDate = keyOf(-1);
  KM.Points.state().sign.streak = 4;
  KM.Points.state().sign.totalDays = 4;
  const cont = KM.Points.signIn();
  check('B5c 昨天签过 → 今天签到 streak 连续 +1', cont.ok && cont.streak === 5, JSON.stringify(cont));
  KM.Points.reset();
  KM.Points.state().sign.lastDate = keyOf(-3);
  KM.Points.state().sign.streak = 9;
  const brk = KM.Points.signIn();
  check('B5d 断签 3 天 → streak 重置为 1', brk.ok && brk.streak === 1, JSON.stringify(brk));

  // B6 幂等
  KM.Points.reset();
  const a1 = KM.Points.add('x', 8, 'idem-1');
  const a2 = KM.Points.add('x', 8, 'idem-1');
  const a3 = KM.Points.add('x', 8, 'idem-1');
  check('B6 相同幂等键只计一次分',
    a1.applied === 8 && a2.applied === 0 && a2.duplicated === true && a3.applied === 0 &&
    KM.Points.state().totalPoints === 8, `${a1.applied}/${a2.applied}/${a3.applied}`);
  const keys = KM.Points.state().ledger.map((x) => x.key);
  check('B6b 流水中不存在重复 idempotencyKey', new Set(keys).size === keys.length);

  // B7 等级
  KM.Points.reset();
  KM.Points.add('累计', 1000, null);
  const lv1 = KM.Points.levelInfo();
  KM.Points.state().availablePoints = 0;
  const lv2 = KM.Points.levelInfo();
  check('B7 可用积分归零后等级不倒退',
    lv2.index === lv1.index && lv2.level === lv1.level && lv2.total === lv1.total,
    `${JSON.stringify(lv1)} vs ${JSON.stringify(lv2)}`);
  check('B7b 等级门槛与名称一一对应（8 级）',
    KM.Points.LEVEL_THRESHOLDS.length === 8 && KM.Points.LEVEL_NAMES.length === 8 &&
    KM.Points.levelIndex(0) === 0 && KM.Points.levelIndex(2999) === 6 && KM.Points.levelIndex(3000) === 7);

  // B8 徽章
  KM.Points.reset();
  const n1 = KM.Points.checkBadges().length;
  const n2 = KM.Points.checkBadges().length;
  check('B8 已达成的徽章不会重复颁发', n2 === 0, `第一次 ${n1}，第二次 ${n2}`);

  KM.Points.reset();
  for (let i = 0; i < 12; i++) KM.Points.recordCorrect();
  KM.Points.updateBestCombo(5);
  KM.Points.state().sign.lastDate = keyOf(-1);
  KM.Points.state().sign.streak = 2;
  KM.Points.signIn();
  KM.Knowledge.KNOWLEDGE_POINTS.forEach((kp) => KM.Points.learnKp(kp.id));
  KM.Knowledge.SPECIAL_CASES.forEach((sc) => KM.Points.readCard(sc.id));
  for (let i = 0; i < 10; i++) KM.Points.finishSet({ correct: 10, total: 10 });
  KM.Points.add('补齐', 200, null);
  KM.Points.checkBadges();
  const unlocked = KM.Points.badgeList().filter((b) => b.unlocked).map((b) => b.id);
  check('B8b 8 枚徽章经真实行为路径全部可达',
    unlocked.length === 8, '已点亮 ' + unlocked.length + ' 枚：' + unlocked.join(','));

  KM.Points.reset();
  check('B9 reset 后清零', KM.Points.state().totalPoints === 0 && KM.Points.state().ledger.length === 0);

  // B10 难度自适应
  KM.Points.reset();
  let star = KM.Points.suggestStar(1, 'add');
  for (let i = 0; i < 3; i++) star = KM.Points.adaptStar(1, 'add', 1);
  const top = star;
  for (let i = 0; i < 4; i++) star = KM.Points.adaptStar(1, 'add', 0);
  check('B10 难度星级恒在 [1,3] 区间', top === 3 && star === 1, `升顶 ${top}，降底 ${star}`);
  KM.Points.setStar(2, 'mix', 99);
  check('B10b setStar 上界夹紧为 3', KM.Points.suggestStar(2, 'mix') === 3,
    String(KM.Points.suggestStar(2, 'mix')));
  KM.Points.setStar(2, 'mix', -5);
  check('B10c setStar 下界夹紧为 1', KM.Points.suggestStar(2, 'mix') === 1,
    String(KM.Points.suggestStar(2, 'mix')));
}

/* ============================================================
   模块 C：存储降级
   ============================================================ */
section('[C] 存储降级（localStorage 不可用 / 配额异常 / 数据损坏）');

{
  function runInIsolated(lsValue) {
    const ctx = vm.createContext({
      console: { log() {}, warn() {}, error() {}, info() {} },
      JSON, Date, Math, Object, String, Number, Array, RegExp, Error, Boolean,
      isFinite, parseInt, parseFloat,
      setTimeout: () => ({}), clearTimeout: () => {},
      setInterval: () => ({}), clearInterval: () => {}
    });
    vm.runInContext('var globalThis = this; var window = this;', ctx);
    ctx.localStorage = lsValue;
    ctx.document = {
      readyState: 'complete',
      createElement: () => ({ style: {}, appendChild() {}, setAttribute() {}, addEventListener() {} }),
      createElementNS: () => ({ style: {}, appendChild() {}, setAttribute() {} }),
      getElementById: () => null,
      addEventListener() {}, removeEventListener() {}, body: {}, documentElement: {}
    };
    for (const rel of CORE_ONLY) {
      vm.runInContext(fs.readFileSync(path.join(APP_DIR, rel), 'utf8'), ctx, { filename: rel });
    }
    return ctx;
  }

  {
    const ctx = runInIsolated({
      getItem() { throw new Error('SecurityError'); },
      setItem() { throw new Error('SecurityError'); },
      removeItem() { throw new Error('SecurityError'); },
      length: 0, key: () => null
    });
    const P = ctx.KM.Points;
    let crashed = false;
    try { P.reset(); P.add('降级测试', 15, null); P.recordCorrect(); P.load(); } catch (e) { crashed = true; }
    check('C1 localStorage 抛异常时不崩溃且降级为内存存储',
      !crashed && ctx.KM.Storage.isPersistent() === false && P.state().totalPoints === 16,
      `crash=${crashed} persistent=${ctx.KM.Storage.isPersistent()} total=${P.state().totalPoints}`);
  }

  {
    const ctx = runInIsolated(null);
    const P = ctx.KM.Points;
    let crashed = false;
    try { P.reset(); P.add('x', 7, null); P.load(); } catch (e) { crashed = true; }
    check('C2 window.localStorage 为 null 时不崩溃',
      !crashed && P.state().totalPoints === 7, `crash=${crashed} total=${P.state().totalPoints}`);
  }

  {
    let allow = true;
    const m = Object.create(null);
    const ctx = runInIsolated({
      getItem(k) { return Object.prototype.hasOwnProperty.call(m, k) ? m[k] : null; },
      setItem(k, v) { if (!allow) throw new Error('QuotaExceededError'); m[k] = String(v); },
      removeItem(k) { delete m[k]; },
      length: 0, key: () => null
    });
    const P = ctx.KM.Points;
    let crashed = false;
    try {
      P.reset();
      P.add('第一次', 20, null);
      allow = false;
      P.add('第二次', 20, null);
      P.load();
    } catch (e) { crashed = true; }
    check('C3 写入配额超限时不崩溃（降级内存，本次会话仍可用）',
      !crashed && P.state().totalPoints >= 20, `crash=${crashed} total=${P.state().totalPoints}`);
  }

  {
    const m = Object.create(null);
    const ctx = runInIsolated({
      getItem(k) { return Object.prototype.hasOwnProperty.call(m, k) ? m[k] : null; },
      setItem(k, v) { m[k] = String(v); },
      removeItem(k) { delete m[k]; },
      length: 0, key: () => null
    });
    m['km.state.v1'] = '{坏掉的 JSON';
    let crashed = false;
    let total = -1;
    try {
      ctx.KM.Points.load();
      total = ctx.KM.Points.state().totalPoints;
      ctx.KM.Points.add('恢复', 5, null);
    } catch (e) { crashed = true; }
    check('C4 存储内容为非法 JSON 时回退默认值且不崩溃',
      !crashed && total === 0, `crash=${crashed} total=${total}`);
    m['km.state.v1'] = JSON.stringify({ totalPoints: -999, sign: { lastDate: '2020-01-01' } });
    let crashed2 = false;
    try {
      ctx.KM.Points.load();
      ctx.KM.Points.signIn();
      ctx.KM.Points.badgeList();
      ctx.KM.Points.taskList();
      ctx.KM.Points.levelInfo();
    } catch (e) { crashed2 = true; }
    check('C4b 存储内容结构残缺时（sign 缺字段）不崩溃', !crashed2);
  }
}

/* ============================================================
   模块 D：内容数据正确性
   ============================================================ */
section('[D] 内容数据：数学表述与教材口径');

{
  const K = KM.Knowledge;
  const H = KM.Hints;

  check('D1 知识点 6 个 / 特例卡 9 张且全部带 sourceRef',
    K.KNOWLEDGE_POINTS.length === 6 && K.SPECIAL_CASES.length === 9 &&
    K.validate().length === 0 && H.validate().length === 0,
    JSON.stringify(K.validate()) + JSON.stringify(H.validate()));
  const noRef = K.KNOWLEDGE_POINTS.concat(K.SPECIAL_CASES)
    .filter((it) => !it.sourceRef || !String(it.sourceRef).trim()).map((it) => it.id);
  check('D1b 逐条核对 sourceRef 非空', noRef.length === 0, noRef.join(','));
  const badRef = K.KNOWLEDGE_POINTS.concat(K.SPECIAL_CASES)
    .filter((it) => !/^(人教版|北师大版|苏教版)/.test(String(it.sourceRef)))
    .map((it) => it.id + ':' + it.sourceRef);
  check('D1c sourceRef 均指向明确的教材版本口径', badRef.length === 0, badRef.join(' , '));

  const kpBad = [];
  for (const kp of K.KNOWLEDGE_POINTS) {
    for (const field of ['formula', 'story', 'keyPoint']) {
      const v = evalExpr(kp[field]);
      if (v === false) kpBad.push(`${kp.id}.${field} 算式不成立：${kp[field]}`);
    }
    if (!kp.keyPoint || !kp.readAloud || !kp.anim) kpBad.push(kp.id + ' 缺字段');
  }
  check('D2 6 个知识点的公式 / 故事 / 要点内算式全部成立', kpBad.length === 0, kpBad.join(' ; '));

  const animBad = [];
  for (const kp of K.KNOWLEDGE_POINTS) {
    const p = kp.animParam || {};
    if (kp.id === 'KP-ADD' && p.left + p.right !== 5) animBad.push('KP-ADD 动画参数与 3+2=5 不符');
    if (kp.id === 'KP-SUB' && (p.total - p.take) !== 4) animBad.push('KP-SUB 动画参数与 6−2=4 不符');
    if (kp.id === 'KP-MUL' && p.rows * p.cols !== 12) animBad.push('KP-MUL 动画参数与 3×4=12 不符');
    if (kp.id === 'KP-DIV' && p.total / p.plates !== 4) animBad.push('KP-DIV 动画参数与 12÷3=4 不符');
    if (kp.id === 'KP-REM' && (Math.floor(p.total / p.plates) !== 3 || p.total % p.plates !== 2)) {
      animBad.push('KP-REM 动画参数与 14÷4=3…2 不符');
    }
    if (kp.id === 'KP-CARRY' && p.big + p.small !== 14) animBad.push('KP-CARRY 动画参数与 9+5=14 不符');
  }
  check('D2b 知识点动画参数与公式一致', animBad.length === 0, animBad.join(' ; '));

  const scBad = [];
  for (const sc of K.SPECIAL_CASES) {
    if (!sc.wrong || !sc.right || !sc.explain || !sc.chant) scBad.push(sc.id + ' 缺字段');
    if (sc.wrong === sc.right) scBad.push(sc.id + ' ❌✅说法相同');
    const w = evalExpr(sc.wrong);
    if (w === true) scBad.push(sc.id + ' ❌说法竟然成立：' + sc.wrong);
    const r = evalExpr(sc.right);
    if (r === false) scBad.push(sc.id + ' ✅说法不成立：' + sc.right);
    const rm = String(sc.right).match(/(\d+)\s*\u00f7\s*(\d+)\s*=\s*(\d+)\s*\u2026+\s*(\d+)/);
    if (rm && !(Number(rm[4]) < Number(rm[2]))) scBad.push(sc.id + ' 余数 ≥ 除数：' + rm[0]);
  }
  check('D3 9 张特例卡：❌说法均不成立、✅说法均成立', scBad.length === 0, scBad.join(' ; '));

  let hBad = 0; const hEx = [];
  for (const grade of GRADES) {
    for (const op of Rules.OPS_BY_GRADE[grade]) {
      for (const star of STARS) {
        for (let i = 0; i < 1500; i++) {
          const q = Gen.randomQuestion({ grade, op, star });
          if (!q) continue;
          const h = H.build(q.hintKind, q);
          const p = H.paramsFor(q.hintKind, q);
          const bad = [];
          if (h.kind === 'addCarry') {
            if (p.split + p.rest !== q.b) bad.push('split+rest≠b');
            if (q.a + p.split !== p.ten) bad.push('a+split≠ten');
            if (p.ten + p.rest !== q.answer) bad.push('ten+rest≠ans');
            if (p.split < 1 || p.rest < 0) bad.push('split/rest 非法');
          }
          if (h.kind === 'subBorrow') {
            if (p.b1 + p.b2 !== q.b) bad.push('b1+b2≠b');
            if (q.a - p.b1 !== p.a0) bad.push('a−b1≠a0');
            if (p.a0 - p.b2 !== q.answer) bad.push('a0−b2≠ans');
            if (p.b2 <= 0) bad.push('b2≤0');
          }
          if (h.kind === 'mul2x1') {
            if (p.tens + p.units !== q.a) bad.push('tens+units≠a');
            if (p.p1 + p.p2 !== q.answer) bad.push('p1+p2≠ans');
          }
          if (h.kind === 'divTable' || h.kind === 'div2x1') {
            if (q.b * q.answer !== q.a) bad.push('b×ans≠a');
          }
          if (h.kind === 'rem') {
            if (p.prod !== q.b * q.answer) bad.push('prod≠b×q');
            if (q.a - p.prod !== p.r) bad.push('a−prod≠r');
            if (!(p.r < q.b)) bad.push('r≥b');
          }
          for (const txt of [h.l1, h.l2, h.l3]) {
            // 「b + b + …（一共 a 个 b）」这类省略号模板不做等式判定
            if (/\u2026\s*[（(]/.test(txt)) continue;
            if (evalExpr(txt) === false) bad.push('文案等式不成立：' + txt);
          }
          if (!h.sourceRef) bad.push('缺 sourceRef');
          if (/\{\w+\}/.test(h.l1 + h.l2 + h.l3)) bad.push('残留占位符');
          if (bad.length) {
            hBad++;
            if (hEx.length < 5) hEx.push(`${q.hintKind} ${q.display} -> ${bad.join(';')}`);
          }
        }
      }
    }
  }
  check('D4 三级提示文案的数学恒等式全部成立且无残留占位符',
    hBad === 0, `${hBad} 处：${hEx.join(' | ')}`);

  // D5「几个几相加」模板在乘数为 1 时不能画出 2 个加数
  {
    const tmplBad = [];
    for (let i = 0; i < 4000; i++) {
      const q = Gen.randomQuestion({ grade: 2, op: 'mul', star: 2 });
      if (!q || q.hintKind !== 'mulTable') continue;
      const h = H.build(q.hintKind, q);
      // L2 形如「a × b = b + b + …（一共 a 个 b 相加）」：显式加数恒为 2 个
      const m = h.l2.match(/^(\d+)\s*\u00d7\s*(\d+)\s*=\s*(\d+)\s*\+\s*(\d+)\s*\+\s*\u2026/);
      if (m && Number(m[1]) < 2) {
        tmplBad.push(`a=${m[1]} 时 L2 写成两个加数却说「一共 ${m[1]} 个」：${h.l2}`);
        break;
      }
    }
    check('D5 乘法「几个几相加」模板在乘数为 1 时不自相矛盾',
      tmplBad.length === 0, tmplBad[0] || '');
  }
}

/* ============================================================
   模块 E：UI 健壮性
   ============================================================ */
section('[E] UI 健壮性（全流程 / 连点 / 结算页）');

{
  function gotoPracticeSetup(grade, mode, star) {
    KM.Points.reset();
    KM.Practice.reset();
    KM.App.go('practice');
    click(findExactHtml(appRoot(), GRADE_NAMES[grade]), '年级芯片');
    click(findExactHtml(appRoot(), MODE_LABELS[mode]), '模式芯片 ' + mode);
    click(findExactHtml(appRoot(), star === 0 ? '自动' : star + ' 星'), '难度芯片');
  }
  function startPractice() { click(findContainsHtml(appRoot(), '开始练习'), '开始练习'); }
  function currentQuestionNode() { return findByClass(appRoot(), 'km-question__expr'); }
  /** 只点键盘上的按键（class 以 km-key 开头），避免误点到答案框（二者文本可能相同） */
  function pressKey(text) {
    let k = null;
    walk(appRoot(), (n) => {
      if (k) return;
      if (String(n.className || '').split(' ').indexOf('km-key') >= 0 && n._html === text) k = n;
    });
    if (!k) throw new Error('找不到按键 ' + text);
    click(k, '按键 ' + text);
  }
  /** 只点大选项（class 以 km-option 开头） */
  function clickOption(display) {
    let opt = null;
    walk(appRoot(), (n) => {
      if (opt) return;
      if (String(n.className || '').split(' ').indexOf('km-option') >= 0 && n._html === display) opt = n;
    });
    if (!opt) throw new Error('选项中找不到：' + display);
    click(opt, '选项');
  }
  function answerCurrentCorrect(star) {
    const node = currentQuestionNode();
    if (!node) throw new Error('题目未渲染');
    const p = solveFromDisplay(node._html);
    if (star === 1) {
      const display = p.isRem ? (p.ans + ' \u2026\u2026 ' + p.rem) : String(p.ans);
      clickOption(display);
    } else {
      String(p.ans).split('').forEach((d) => pressKey(d));
      if (p.isRem) String(p.rem).split('').forEach((d) => pressKey(d));
      pressKey('确定');
    }
  }
  function answerCurrentWrong(star) {
    const node = currentQuestionNode();
    if (!node) throw new Error('题目未渲染');
    const p = solveFromDisplay(node._html);
    if (star === 1) {
      const displays = [];
      walk(appRoot(), (n) => {
        if (String(n.className || '').split(' ').indexOf('km-option') >= 0) displays.push(n._html);
      });
      const target = p.isRem ? (p.ans + ' \u2026\u2026 ' + p.rem) : String(p.ans);
      const other = displays.filter((d) => d !== target);
      if (!other.length) throw new Error('没有可点的错误选项');
      clickOption(other[0]);
    } else {
      String(p.ans + 1).split('').forEach((d) => pressKey(d));
      if (p.isRem) String(p.rem).split('').forEach((d) => pressKey(d));
      pressKey('确定');
    }
  }
  function hasResult() { return !!findContainsHtml(appRoot(), '答对 '); }
  function clickNext() {
    const next = findExactHtml(appRoot(), '下一题 →') || findExactHtml(appRoot(), '看看结果 →');
    if (!next) throw new Error('没有下一题/看结果按钮');
    click(next, '下一题');
  }
  /** 统计结算页实心星数量 */
  function countSolidStars() {
    let n = 0;
    walk(appRoot(), (x) => {
      if (String(x.className || '').split(' ').indexOf('km-star-pop') >= 0 &&
          String(x._html).indexOf('#FFD166') >= 0) n++;
    });
    return n;
  }

  // E1 全组合
  {
    let err = null;
    let done = 0;
    outer:
    for (const grade of GRADES) {
      for (const mode of allowedModes(grade)) {
        for (const star of STARS) {
          try {
            gotoPracticeSetup(grade, mode, star);
            startPractice();
            for (let i = 0; i < 10; i++) {
              const before = KM.Points.state().totalPoints;
              answerCurrentCorrect(star);
              if (!findContainsHtml(appRoot(), '答对啦')) {
                throw new Error(`${GRADE_NAMES[grade]}/${MODE_LABELS[mode]}/${star}星 第 ${i + 1} 题正确答案未被判为答对：${currentQuestionNode() && currentQuestionNode()._html}`);
              }
              if (KM.Points.state().totalPoints < before) throw new Error('答对后积分反而减少');
              if (hasResult()) break;
              advance(600);              // 真实等待过防连点锁
              clickNext();
              done++;
            }
            if (!hasResult()) throw new Error(`${grade}/${mode}/${star} 未进入结算页`);
            if (!findContainsHtml(appRoot(), '答对 10 / 10')) {
              throw new Error(`${grade}/${mode}/${star} 全对应显示 10/10，实际：${(findContainsHtml(appRoot(), '答对 ') || {})._html}`);
            }
          } catch (e) {
            err = e.message;
            break outer;
          }
        }
      }
    }
    check('E1 全部 (年级×允许模式×难度) 组合下正确答案均判「答对啦」且结算 10/10',
      err === null, err || '');
    console.log('       （共完成 ' + done + ' 次真实翻页作答，42 组练习）');
  }

  // E2 答错
  {
    let err = null;
    try {
      KM.Points.reset(); KM.Practice.reset();
      KM.App.go('practice');
      click(findExactHtml(appRoot(), '三年级'), '年级');
      click(findExactHtml(appRoot(), '加法'), '模式');
      click(findExactHtml(appRoot(), '3 星'), '难度');
      startPractice();
      answerCurrentWrong(3);
      if (!findContainsHtml(appRoot(), '差一点点')) throw new Error('答错未给出柔和提示');
      const t0 = KM.Points.state().totalPoints;
      advance(600);
      answerCurrentWrong(3);
      if (KM.Points.state().totalPoints !== t0) throw new Error('答错不应扣分也不应加分');
    } catch (e) { err = e.message; }
    check('E2 答错给柔和提示（"差一点点"）且不加分不扣分', err === null, err || '');
  }

  // E3 连点「确定」
  {
    let err = null;
    try {
      KM.Points.reset(); KM.Practice.reset();
      KM.App.go('practice');
      click(findExactHtml(appRoot(), '一年级'), '年级');
      click(findExactHtml(appRoot(), '加法'), '模式');
      click(findExactHtml(appRoot(), '2 星'), '难度');
      startPractice();
      const p = solveFromDisplay(currentQuestionNode()._html);
      String(p.ans).split('').forEach((d) => pressKey(d));
      const before = KM.Points.state().totalPoints;
      for (let i = 0; i < 5; i++) {
        const btn = findExactHtml(appRoot(), '确定');
        if (!btn) break;
        click(btn, '确定');
      }
      const after = KM.Points.state().totalPoints;
      if (KM.Points.state().correctTotal !== 1) {
        throw new Error('连点后答对计数异常：' + KM.Points.state().correctTotal);
      }
      if (after - before > KM.Points.REWARD.correct) {
        throw new Error('连点导致重复加分：+' + (after - before));
      }
    } catch (e) { err = e.message; }
    check('E3 连点「确定」5 次只判定一次、不重复加分', err === null, err || '');
  }

  // E4 连点「帮帮我」
  {
    let err = null;
    try {
      KM.Points.reset(); KM.Practice.reset();
      KM.App.go('practice');
      click(findExactHtml(appRoot(), '三年级'), '年级');
      click(findExactHtml(appRoot(), '混合'), '模式');
      click(findExactHtml(appRoot(), '2 星'), '难度');
      startPractice();
      for (let i = 0; i < 10; i++) {
        const btn = findExactHtml(appRoot(), '帮帮我') ||
          findExactHtml(appRoot(), '再帮一下') ||
          findExactHtml(appRoot(), '直接看讲解');
        if (!btn) break;
        click(btn, '帮帮我');
      }
      const st = KM.Points.state();
      if (st.l3.count !== 1) throw new Error('L3 计分次数异常：' + st.l3.count);
      if (st.wrongBook.length !== 1) throw new Error('错题本数量异常：' + st.wrongBook.length);
      if (!findExactHtml(appRoot(), '下一题 →')) throw new Error('看完讲解后没有下一题按钮');
    } catch (e) { err = e.message; }
    check('E4 连点「帮帮我」10 次：提示封顶 3 级、L3 分只发一次、可继续', err === null, err || '');
  }

  // E5 连点「下一题」
  {
    let err = null;
    try {
      KM.Points.reset(); KM.Practice.reset();
      KM.App.go('practice');
      click(findExactHtml(appRoot(), '二年级'), '年级');
      click(findExactHtml(appRoot(), '减法'), '模式');
      click(findExactHtml(appRoot(), '2 星'), '难度');
      startPractice();
      for (let i = 0; i < 10; i++) {
        const qn = currentQuestionNode()._html;
        answerCurrentCorrect(2);
        if (hasResult()) break;
        clickNext();
        const b2 = findExactHtml(appRoot(), '下一题 →') || findExactHtml(appRoot(), '看看结果 →');
        if (b2) click(b2, '下一题2');
        const b3 = findExactHtml(appRoot(), '下一题 →') || findExactHtml(appRoot(), '看看结果 →');
        if (b3) click(b3, '下一题3');
        if (hasResult()) break;
        if (currentQuestionNode() && currentQuestionNode()._html === qn) throw new Error('连点后仍停在原题');
        advance(600);
      }
      const st = KM.Points.state();
      if (st.setsDone !== 1) throw new Error('完成组数异常（应为 1）：' + st.setsDone);
      if (st.correctTotal !== 10) throw new Error('答对题数异常（应为 10）：' + st.correctTotal);
    } catch (e) { err = e.message; }
    check('E5 连点「下一题」不跳题、完成组数只 +1', err === null, err || '');
  }

  // E6 结算页
  {
    const BAN_WORDS = ['失败', '不及格', '错误', '太差', '笨', '差劲', '零分', '没通过', '重做', '答错'];
    const errs = [];
    for (const target of [0, 3, 7, 10]) {
      try {
        KM.Points.reset(); KM.Practice.reset();
        KM.App.go('practice');
        click(findExactHtml(appRoot(), '三年级'), '年级');
        click(findExactHtml(appRoot(), '混合'), '模式');
        click(findExactHtml(appRoot(), '2 星'), '难度');
        startPractice();
        for (let i = 0; i < 10; i++) {
          if (i < target) {
            answerCurrentCorrect(2);
          } else {
            answerCurrentWrong(2);
            advance(600);
            for (let k = 0; k < 4; k++) {
              const b = findExactHtml(appRoot(), '帮帮我') ||
                findExactHtml(appRoot(), '再帮一下') ||
                findExactHtml(appRoot(), '直接看讲解');
              if (!b) break;
              click(b, '帮帮我');
            }
          }
          if (hasResult()) break;
          advance(600);
          clickNext();
        }
        if (!hasResult()) throw new Error('未进入结算页');
        const txt = allText(appRoot());
        if (!findContainsHtml(appRoot(), '答对 ' + target + ' / 10')) {
          throw new Error('结算页分数不对（期望答对 ' + target + '）：' +
            (findContainsHtml(appRoot(), '答对 ') || {})._html);
        }
        const solid = countSolidStars();
        if (solid < 1) throw new Error('结算页星星数 < 1（实际 ' + solid + '）');
        if (solid > 3) throw new Error('结算页星星数 > 3（实际 ' + solid + '）');
        for (const w of BAN_WORDS) {
          if (txt.indexOf(w) >= 0) throw new Error('结算页出现打击式文案：' + w);
        }
      } catch (e) { errs.push('答对 ' + target + ' 题时：' + e.message); }
    }
    check('E6 结算页永远 1–3 颗星且无打击式文案（0/3/7/10 四种情形）',
      errs.length === 0, errs.join(' ; '));
  }

  // E7 学一学
  {
    let err = null;
    try {
      KM.Points.reset();
      KM.Learn.reset();
      KM.App.go('learn');
      for (let i = 0; i < 20; i++) {
        const b1 = findExactHtml(appRoot(), '知识点 6');
        const b2 = findExactHtml(appRoot(), '特例卡 9');
        click(i % 2 === 0 ? b2 : b1, '页签');
      }
      if (!findExactHtml(appRoot(), '知识点 6')) throw new Error('页签切换后页面异常');
      for (const kp of KM.Knowledge.KNOWLEDGE_POINTS) {
        KM.Learn.openKp(kp.id);
        const svg = findFirstSvg(appRoot());
        if (!svg) throw new Error(kp.id + ' 未渲染 SVG');
        const base = svg.children.length;
        for (let i = 0; i < 6; i++) {
          const b = findExactHtml(appRoot(), '再看一遍') || findByTextContent(appRoot(), '再看一遍');
          if (!b) break;
          click(b, '再看一遍');
        }
        const svg2 = findFirstSvg(appRoot());
        if (!svg2 || svg2.children.length !== base) {
          throw new Error(kp.id + ' 连点再看一遍后 SVG 元素数变化：' + base + ' -> ' +
            (svg2 ? svg2.children.length : 'null'));
        }
        if (!findByTextContent(appRoot(), '跳过动画')) throw new Error(kp.id + ' 按钮行被误清空');
        KM.Learn.reset();
      }
    } catch (e) { err = e.message; }
    check('E7 学一学连点页签 / 连点「再看一遍」不崩溃、不叠加、按钮不丢', err === null, err || '');
  }

  // E8 首页连点签到
  {
    let err = null;
    try {
      KM.Points.reset();
      KM.App.go('home');
      for (let i = 0; i < 8; i++) {
        const b = findContainsHtml(appRoot(), '今日签到');
        if (!b) break;
        click(b, '签到');
      }
      const st = KM.Points.state();
      if (st.sign.totalDays !== 1) throw new Error('签到天数异常：' + st.sign.totalDays);
      if (st.totalPoints !== KM.Points.REWARD.sign) {
        throw new Error('签到积分异常：' + st.totalPoints + '（应 ' + KM.Points.REWARD.sign + '）');
      }
    } catch (e) { err = e.message; }
    check('E8 首页连点签到 8 次只签一次、只加一次分', err === null, err || '');
  }

  // E9 中途退出
  {
    let err = null;
    try {
      KM.Points.reset(); KM.Practice.reset();
      KM.App.go('practice');
      click(findExactHtml(appRoot(), '一年级'), '年级');
      click(findExactHtml(appRoot(), '加法'), '模式');
      click(findExactHtml(appRoot(), '2 星'), '难度');
      startPractice();
      answerCurrentCorrect(2);
      const earned = KM.Points.state().totalPoints;
      let exit = null;
      walk(appRoot(), (n) => {
        if (!exit && n.attrs && n.attrs['aria-label'] === '退出练习') exit = n;
      });
      if (!exit) throw new Error('找不到退出按钮');
      click(exit, '退出');
      KM.App.go('practice');
      if (!findContainsHtml(appRoot(), '开始练习')) throw new Error('退出后重进未回到选择页');
      if (KM.Points.state().totalPoints < earned) throw new Error('退出后积分丢失');
    } catch (e) { err = e.message; }
    check('E9 中途退出不丢积分，重进回到选择页', err === null, err || '');
  }

  // E10 连点「我学会啦 / 我记住啦」
  {
    let err = null;
    try {
      KM.Points.reset();
      KM.Learn.reset();
      KM.App.go('learn');
      const kpBtn = findByClass(appRoot(), 'km-kp');
      click(kpBtn, '知识点');
      const learnBtn = findContainsHtml(appRoot(), '我学会啦');
      for (let i = 0; i < 6; i++) click(learnBtn, '我学会啦');   // 同一个按钮连点 6 次
      if (KM.Points.state().learnedKp.length !== 1) {
        throw new Error('知识点重复计数：' + KM.Points.state().learnedKp.length);
      }
      if (KM.Points.state().totalPoints !== KM.Points.REWARD.learnKp) {
        throw new Error('知识点积分异常：' + KM.Points.state().totalPoints);
      }

      KM.Learn.reset();
      KM.App.go('learn');
      click(findExactHtml(appRoot(), '特例卡 9'), '特例卡页签');
      const cardBtn = findContainsHtml(appRoot(), '我记住啦');
      for (let i = 0; i < 6; i++) click(cardBtn, '我记住啦');    // 同一个按钮连点 6 次
      if (KM.Points.state().readCards.length !== 1) {
        throw new Error('特例卡重复计数：' + KM.Points.state().readCards.length);
      }
    } catch (e) { err = e.message; }
    check('E10 连点「我学会啦 / 我记住啦」6 次只加一次分、只记一次', err === null, err || '');
  }

  // E11 路由
  {
    let err = null;
    try {
      const pages = ['home', 'learn', 'practice', 'rewards', 'selftest'];
      for (let i = 0; i < 60; i++) {
        KM.App.go(pages[i % pages.length]);
        if (!appRoot().children.length) throw new Error('页面 ' + pages[i % pages.length] + ' 渲染为空');
      }
      KM.App.go('home');
    } catch (e) { err = e.message; }
    check('E11 五个页面反复切换 60 次均正常渲染', err === null, err || '');
  }

  // E12 内置自测
  {
    let err = null;
    try {
      const res = KM.SelfTest.runAll();
      const bad = res.filter((r) => !r.ok);
      if (bad.length) err = bad.slice(0, 3).map((b) => b.name + ' — ' + b.meta).join(' ; ');
    } catch (e) { err = e.message; }
    check('E12 内置隐藏自测页 runAll() 全项通过', err === null, err || '');
  }

  // E13 防连点锁不得跨题生效（快速作答必须被响应）
  {
    let err = null;
    try {
      KM.Points.reset(); KM.Practice.reset();
      KM.App.go('practice');
      click(findExactHtml(appRoot(), '一年级'), '年级');
      click(findExactHtml(appRoot(), '加法'), '模式');
      click(findExactHtml(appRoot(), '2 星'), '难度');
      startPractice();
      for (let round = 0; round < 3; round++) {
        answerCurrentCorrect(2);
        if (!findContainsHtml(appRoot(), '答对啦')) throw new Error('第 1 题未判答对');
        if (hasResult()) break;
        clickNext();                       // 立刻翻页（不等待 500ms 锁）
        answerCurrentCorrect(2);           // 立刻作答（真实小孩的快速连击）
        if (!findContainsHtml(appRoot(), '答对啦')) {
          throw new Error(`翻页后立刻作答被吞掉：第 ${round * 2 + 2} 题无任何反馈（正确率计数 ${KM.Points.state().correctTotal}）`);
        }
        if (hasResult()) break;
        advance(600);
        clickNext();
      }
      if (KM.Points.state().correctTotal < 4) {
        throw new Error('快速连击导致答对漏记：correctTotal = ' + KM.Points.state().correctTotal);
      }
    } catch (e) { err = e.message; }
    check('E13 答完立刻翻页并立刻作答，点击必须被响应（防连点锁不得跨题）',
      err === null, err || '');
  }

  // E14 自动翻页（1200ms）与手动翻页不冲突、不跳题
  {
    let err = null;
    try {
      KM.Points.reset(); KM.Practice.reset();
      KM.App.go('practice');
      click(findExactHtml(appRoot(), '二年级'), '年级');
      click(findExactHtml(appRoot(), '混合'), '模式');
      click(findExactHtml(appRoot(), '3 星'), '难度');
      startPractice();
      // 前 9 题靠 1200ms 自动翻页；最后一题需要点「看看结果」
      const seen = [];
      for (let i = 0; i < 10; i++) {
        const qn = currentQuestionNode()._html;
        if (seen.indexOf(qn) >= 0) throw new Error('题目重复出现：' + qn);
        seen.push(qn);
        answerCurrentCorrect(3);
        if (!findContainsHtml(appRoot(), '答对啦')) throw new Error('第 ' + (i + 1) + ' 题未判答对');
        if (hasResult()) break;
        if (i === 9) { clickNext(); break; }
        advance(1300);     // 等自动翻页生效
        if (!hasResult() && currentQuestionNode()._html === qn) {
          throw new Error('1200ms 自动翻页未生效（第 ' + (i + 1) + ' 题）');
        }
      }
      if (!hasResult()) throw new Error('自动翻页模式未进入结算页');
      if (KM.Points.state().correctTotal !== 10) {
        throw new Error('自动翻页下答对计数异常：' + KM.Points.state().correctTotal);
      }
    } catch (e) { err = e.message; }
    check('E14 1200ms 自动翻页不跳题、不重复、计数正确', err === null, err || '');
  }
}

/* ============================================================
   模块 F：补齐已有测试没真正断言的东西
   ============================================================ */
section('[F] 补齐已有测试没真正断言的东西');

{
  // F1 静默回落不得产出超前概念
  const fallbackBad = [];
  for (const grade of GRADES) {
    for (const mode of ALL_MODES) {
      if (mode === 'mix') continue;
      if (Rules.OPS_BY_GRADE[grade].indexOf(mode) >= 0) continue;
      const res = Gen.generateSet({ grade, mode, star: 2, size: 10 });
      for (const q of res.questions) {
        if (Rules.OPS_BY_GRADE[grade].indexOf(q.op) < 0) {
          fallbackBad.push(`${grade}年级请求${mode}却生成了${q.op}`);
        }
      }
    }
  }
  check('F1 请求本年级未学的运算时，绝不产出超前概念（静默回落安全）',
    fallbackBad.length === 0, fallbackBad.slice(0, 3).join(' ; '));

  // F2 UI 入口可用性
  {
    const uiBad = [];
    for (const grade of GRADES) {
      KM.Practice.reset();
      KM.App.go('practice');
      click(findExactHtml(appRoot(), GRADE_NAMES[grade]), '年级');
      for (const mode of ALL_MODES) {
        const allowed = Rules.OPS_BY_GRADE[grade].indexOf(mode) >= 0 || mode === 'mix';
        const plain = findExactHtml(appRoot(), MODE_LABELS[mode]);
        const off = findExactHtml(appRoot(), MODE_LABELS[mode] + '（还没学）');
        if (allowed) {
          if (!plain) uiBad.push(`${GRADE_NAMES[grade]} 缺少可点的「${MODE_LABELS[mode]}」入口`);
          else if (!hasHandler(plain)) uiBad.push(`${GRADE_NAMES[grade]}「${MODE_LABELS[mode]}」应可点却无处理函数`);
        } else {
          if (plain && hasHandler(plain)) uiBad.push(`${GRADE_NAMES[grade]}「${MODE_LABELS[mode]}」不该可点却有处理函数`);
          if (!off) uiBad.push(`${GRADE_NAMES[grade]} 缺少禁用态「${MODE_LABELS[mode]}（还没学）」入口`);
        }
      }
    }
    check('F2 运算入口按钮的可用性与该年级教学范围一致', uiBad.length === 0, uiBad.join(' ; '));
  }

  // F3 干扰项
  {
    let bad = 0; const ex = [];
    for (const grade of GRADES) {
      for (let s = 0; s < 60; s++) {
        for (const q of Gen.generateSet({ grade, mode: 'mix', star: 1, size: 10 }).questions) {
          const opts = Gen.makeOptions(q);
          const wrong = opts.filter((o) => !o.correct);
          if (wrong.length !== 2) { bad++; ex.push('干扰项数 ' + wrong.length); continue; }
          for (const w of wrong) {
            const same = q.op === 'rem'
              ? (w.value === q.answer && w.r === q.remainder)
              : (w.value === q.answer);
            if (same) { bad++; ex.push('干扰项与正确答案相同 ' + w.display + ' @' + q.display); }
          }
        }
      }
    }
    check('F3 干扰项恰好 2 个且确实不等于正确答案', bad === 0, `${bad} 处：${ex.slice(0, 3).join(' , ')}`);
  }

  // F4 L3 跨天重置
  {
    KM.Points.reset();
    for (let i = 0; i < 10; i++) KM.Points.readL3('q' + i);
    const sameDay = KM.Points.readL3('qNew').applied;
    KM.Points.state().l3.date = '1970-01-01';
    KM.Points.state().daily.date = '1970-01-01';
    const nextDay = KM.Points.readL3('qNew').applied;
    check('F4 L3 每日上限跨天重置', sameDay === 0 && nextDay === 1, `当天 ${sameDay}，次日 ${nextDay}`);
  }

  // F5 每日 200 跨天重置
  {
    KM.Points.reset();
    let g = 0;
    for (let i = 0; i < 40; i++) g += KM.Points.add('x', 10, null).applied;
    const capped = KM.Points.add('x', 10, null).applied;
    KM.Points.state().daily.date = '1970-01-01';
    const nextDay = KM.Points.add('x', 10, null).applied;
    check('F5 每日 200 分上限跨天重置', g === 200 && capped === 0 && nextDay === 10,
      `当天 ${g}/${capped}，次日 ${nextDay}`);
  }

  // F6 每日任务跨天重置
  {
    KM.Points.reset();
    KM.Points.finishSet({ correct: 10, total: 10 });
    const doneToday = KM.Points.taskList().filter((t) => t.done).length;
    KM.Points.state().tasks.date = '1970-01-01';
    const doneTomorrow = KM.Points.taskList().filter((t) => t.done).length;
    check('F6 每日任务跨天重置', doneToday >= 1 && doneTomorrow === 0,
      `当天 ${doneToday}，次日 ${doneTomorrow}`);
  }
}

/* ============================================================
   汇总
   ============================================================ */
const ENGINE_ALERTS = CONSOLE_MSGS.filter((m) =>
  /生成合法题组失败|无法为第|兜底构造仍无解|缺少 sourceRef|已跳过渲染/.test(m));

console.log('\n========================================');
console.log(`用例总数：${PASS + FAIL}    PASS ${PASS}    FAIL ${FAIL}`);
if (ENGINE_ALERTS.length) {
  console.log(`运行期引擎告警：${ENGINE_ALERTS.length} 条（首条：${ENGINE_ALERTS[0]}）`);
}
if (FAIL > 0) {
  console.log('\n失败明细：');
  FAILURES.forEach((f) => console.log('  - ' + f));
}
process.exit(FAIL > 0 ? 1 : 0);
