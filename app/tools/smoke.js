/* ============================================================
   tools/smoke.js —— Node 逻辑冒烟（零 npm 依赖）
   用 vm.runInThisContext 加载浏览器端的纯逻辑文件（rules.js /
   generator.js / points.js），跑 R4 属性测试 + R4-7 反向用例 + 组质量。
   运行：node tools/smoke.js
   ============================================================ */
'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const APP_DIR = path.join(__dirname, '..');

/** 按顺序加载纯逻辑文件（它们均以 IIFE 挂到全局 KM 上） */
const FILES = [
  'js/core/storage.js',
  'js/core/rules.js',
  'js/core/generator.js',
  'js/core/points.js'
];

globalThis.KM = globalThis.KM || {};
for (const rel of FILES) {
  const code = fs.readFileSync(path.join(APP_DIR, rel), 'utf8');
  vm.runInThisContext(code, { filename: rel });
}

const KM = globalThis.KM;
const Rules = KM.Rules;
const Gen = KM.Generator;

let pass = 0;
let fail = 0;
const failures = [];

function check(name, ok, detail) {
  if (ok) {
    pass++;
    console.log('  PASS  ' + name);
  } else {
    fail++;
    failures.push(name + (detail ? ' -> ' + detail : ''));
    console.log('  FAIL  ' + name + (detail ? '  [' + detail + ']' : ''));
  }
}

/* ------------------------------------------------------------
   1. R4 属性测试：每个年级 × 每种运算 × 每个难度，各生成 N 道题
   ------------------------------------------------------------ */
const SAMPLE_PER_COMBO = 2000;

function propertyTest() {
  console.log('\n[1] R4 属性测试（每组合 ' + SAMPLE_PER_COMBO + ' 道题）');
  for (const grade of Rules.GRADES) {
    const ops = Rules.OPS_BY_GRADE[grade];
    for (const op of ops) {
      for (const star of Rules.STARS) {
        let bad = 0;
        let firstReason = '';
        let generated = 0;
        for (let i = 0; i < SAMPLE_PER_COMBO; i++) {
          const q = Gen.randomQuestion({ grade, op, star });
          if (!q) { bad++; firstReason = firstReason || '生成器返回 null'; continue; }
          generated++;
          const r = Rules.assertR4(q, { grade, star });
          if (!r.ok) { bad++; firstReason = firstReason || r.reason; }
        }
        const name = `${grade}年级/${Rules.OP_NAME[op]}/${star}星`;
        check(name + ' R4 命中数=0', bad === 0,
          bad === 0 ? '' : `违规 ${bad} 条，例如：${firstReason}`);
        check(name + ' 生成成功', generated === SAMPLE_PER_COMBO,
          `仅生成 ${generated}`);
      }
    }
  }
}

/* ------------------------------------------------------------
   2. R4-7 反向用例：合法边界必须能被生成（不被误杀）
   ------------------------------------------------------------ */
const BOUNDARY_CASES = [
  { name: 'a−a=0', op: 'sub', a: 7, b: 7, answer: 0 },
  { name: '0÷5=0', op: 'div', a: 0, b: 5, answer: 0 },
  { name: '14÷4=3…2', op: 'rem', a: 14, b: 4, answer: 3, remainder: 2 },
  { name: '9÷9=1', op: 'div', a: 9, b: 9, answer: 1 },
  { name: 'a+0', op: 'add', a: 8, b: 0, answer: 8 },
  { name: 'a×0=0', op: 'mul', a: 23, b: 0, answer: 0 },
  { name: 'a×1', op: 'mul', a: 23, b: 1, answer: 23 },
  { name: 'a−0', op: 'sub', a: 15, b: 0, answer: 15 },
  { name: 'a÷1', op: 'div', a: 24, b: 1, answer: 24 },
  { name: '0+b', op: 'add', a: 0, b: 6, answer: 6 }
];

function boundaryTest() {
  console.log('\n[2] R4-7 反向用例（合法边界不得被误杀）');
  for (const c of BOUNDARY_CASES) {
    const q = Gen.buildQuestion(1, 1, c.op, c.a, c.b, c.answer, c.remainder);
    let okCtx = null;
    let allowed = 0;
    for (const grade of Rules.GRADES) {
      if (Rules.OPS_BY_GRADE[grade].indexOf(c.op) < 0) continue;
      for (const star of Rules.STARS) {
        const r = Rules.assertR4(q, { grade, star });
        if (r.ok) {
          allowed++;
          if (!okCtx) okCtx = { grade, star };
        }
      }
    }
    check(`${c.name} 至少存在一个合法 (年级,难度)`, allowed > 0,
      okCtx ? '' : '没有任何范围允许该题目');
    if (okCtx) {
      const rr = Rules.assertR4(q, okCtx);
      check(`${c.name} assertR4 通过（${okCtx.grade}年级/${okCtx.star}星）`, rr.ok, rr.reason);
    }
  }
}

/* ------------------------------------------------------------
   3. 整组生成 + R4-8 组内质量
   ------------------------------------------------------------ */
function groupTest() {
  console.log('\n[3] 整组生成 + R4-8 组内质量（每组 10 题）');
  const modes = ['add', 'sub', 'mul', 'div', 'rem', 'mix'];
  for (const grade of Rules.GRADES) {
    for (const mode of modes) {
      for (const star of Rules.STARS) {
        let groupBad = 0;
        let singleBad = 0;
        let zeroBad = 0;
        let giftBad = 0;
        let reason = '';
        for (let s = 0; s < 60; s++) {
          const res = Gen.generateSet({ grade, mode, star, size: 10 });
          const list = res.questions;
          if (!list || list.length !== 10) { groupBad++; reason = reason || '数量不足'; continue; }
          const g = Rules.assertGroup(list, { grade, star, size: 10 });
          if (!g.ok) { groupBad++; reason = reason || g.reason; }
          // 单题再断言一次（整组生成后双重调用）
          for (const q of list) {
            const r = Rules.assertR4(q, { grade, star });
            if (!r.ok) { singleBad++; reason = reason || r.reason; }
          }
          // 统计 0 结果题数量与位置
          let z = 0;
          list.forEach((q, idx) => {
            if (Rules.isZeroResult(q)) { z++; if (idx < 3) zeroBad++; }
          });
          if (z > 1) zeroBad++;
          if (!Rules.isGift(list[0])) giftBad++;
        }
        const name = `${grade}年级/${Rules.MODE_NAME[mode]}/${star}星`;
        check(name + ' 整组合法', groupBad === 0, reason);
        check(name + ' 单题合法', singleBad === 0, reason);
        check(name + ' 0 结果题约束', zeroBad === 0, reason);
        check(name + ' 首题送分题', giftBad === 0, reason);
      }
    }
  }
}

/* ------------------------------------------------------------
   4. 生成覆盖率：合法边界题确实能出现在题目组里
   ------------------------------------------------------------ */
function coverageTest() {
  console.log('\n[4] 边界题覆盖率（实际出题中出现）');
  const targets = [
    { grade: 1, mode: 'mix', test: (q) => q.op === 'add' && q.b === 0, name: '一年级 a+0' },
    { grade: 1, mode: 'mix', test: (q) => q.op === 'sub' && q.b === 0, name: '一年级 a−0' },
    { grade: 1, mode: 'mix', test: (q) => q.op === 'sub' && q.answer === 0, name: '一年级 a−a=0' },
    { grade: 2, mode: 'div', test: (q) => q.a === q.b && q.answer === 1, name: '二年级 9÷9=1' },
    { grade: 2, mode: 'mul', test: (q) => q.b === 1, name: '二年级 a×1' },
    // 0÷b=0 已推迟到三年级（二年级按教材不出现「有关 0 的除法」）
    { grade: 3, mode: 'div', star: 1, test: (q) => q.answer === 0, name: '三年级 0÷5=0' },
    { grade: 3, mode: 'mul', test: (q) => q.b === 0, name: '三年级 a×0=0' },
    { grade: 3, mode: 'div', test: (q) => q.b === 1, name: '三年级 a÷1' },
    { grade: 3, mode: 'rem', test: (q) => q.a === 14 && q.b === 4, name: '三年级 14÷4=3…2' }
  ];
  for (const t of targets) {
    let hit = 0;
    for (let s = 0; s < 300; s++) {
      const res = Gen.generateSet({ grade: t.grade, mode: t.mode, star: (t.star || 2), size: 10 });
      for (const q of res.questions) {
        if (t.test(q)) hit++;
      }
    }
    check(t.name + ' 能被生成（300 组命中 ' + hit + ' 次）', hit > 0, '一次都没出现');
  }
}

/* ------------------------------------------------------------
   5. 积分引擎：每日上限 / 幂等 / 等级
   ------------------------------------------------------------ */
function pointsTest() {
  console.log('\n[5] 积分引擎');
  KM.Points.reset();

  const r1 = KM.Points.add('测试', 5, 'key-1');
  const r2 = KM.Points.add('测试', 5, 'key-1');
  check('幂等键防重复计分', r1.applied === 5 && r2.applied === 0 && r2.duplicated === true,
    `r1=${r1.applied} r2=${r2.applied}`);

  KM.Points.reset();
  let total = 0;
  for (let i = 0; i < 60; i++) {
    total += KM.Points.add('刷分', 10, null).applied;
  }
  check('每日上限 200 生效', total === KM.Points.DAILY_CAP, `实际 ${total}`);

  KM.Points.reset();
  KM.Points.add('累计测试', 150, null);
  check('等级门槛计算', KM.Points.levelIndex(150) === 1 && KM.Points.levelIndex(300) === 2,
    `150->${KM.Points.levelIndex(150)} 300->${KM.Points.levelIndex(300)}`);

  KM.Points.reset();
  const s1 = KM.Points.signIn();
  const s2 = KM.Points.signIn();
  check('签到当天只可一次', s1.ok === true && s1.streak === 1 && s2.already === true,
    `s1=${JSON.stringify(s1)} s2=${JSON.stringify(s2)}`);

  KM.Points.reset();
  const before = KM.Points.todayEarned();
  KM.Points.readL3('q1');
  const after = KM.Points.todayEarned();
  check('L3 讲解加分', after === before + 1, `${before} -> ${after}`);

  KM.Points.reset();
  const badges = KM.Points.badgeList();
  check('徽章共 8 枚', badges.length === 8, `实际 ${badges.length}`);

  KM.Points.reset();
  let star = KM.Points.suggestStar(1, 'add');
  star = KM.Points.adaptStar(1, 'add', 0.9);
  const star2 = KM.Points.adaptStar(1, 'add', 0.9);
  const starDown = KM.Points.adaptStar(1, 'add', 0.4);
  check('难度自适应升降', star === 2 && star2 === 3 && starDown === 2,
    `${star}/${star2}/${starDown}`);
}

/* ------------------------------------------------------------
   6. 内容数据校验（sourceRef）
   ------------------------------------------------------------ */
function contentTest() {
  console.log('\n[6] 内容数据校验');
  // knowledge.js / hints.js 依赖 window 之外无 DOM，可直接加载
  const extra = ['js/data/knowledge.js', 'js/data/hints.js'];
  for (const rel of extra) {
    vm.runInThisContext(fs.readFileSync(path.join(APP_DIR, rel), 'utf8'), { filename: rel });
  }
  const missing = KM.Knowledge.validate();
  check('知识点 / 特例卡均有 sourceRef', missing.length === 0, JSON.stringify(missing));
  check('知识点数量 = 6', KM.Knowledge.KNOWLEDGE_POINTS.length === 6,
    String(KM.Knowledge.KNOWLEDGE_POINTS.length));
  check('特例卡数量 = 9', KM.Knowledge.SPECIAL_CASES.length === 9,
    String(KM.Knowledge.SPECIAL_CASES.length));
  const hintMissing = KM.Hints.validate();
  check('提示模板均有 sourceRef', hintMissing.length === 0, JSON.stringify(hintMissing));

  // 提示模板渲染不残留占位符
  let residue = 0;
  for (const grade of Rules.GRADES) {
    for (const op of Rules.OPS_BY_GRADE[grade]) {
      const q = Gen.randomQuestion({ grade, op, star: 2 });
      if (!q) continue;
      const h = KM.Hints.build(q.hintKind, q);
      for (const txt of [h.l1, h.l2, h.l3]) {
        if (/\{\w+\}/.test(txt)) residue++;
      }
    }
  }
  check('提示模板无残留占位符', residue === 0, `残留 ${residue} 处`);
}

/* ------------------------------------------------------------ */
console.log('=== KM 逻辑冒烟（Node, 零依赖） ===');
propertyTest();
boundaryTest();
groupTest();
coverageTest();
pointsTest();
contentTest();

console.log('\n========================================');
console.log(`总计：${pass + fail} 项，PASS ${pass}，FAIL ${fail}`);
if (fail > 0) {
  console.log('失败明细：');
  failures.forEach((f) => console.log('  - ' + f));
  process.exitCode = 1;
} else {
  console.log('全部通过 ✅');
}
