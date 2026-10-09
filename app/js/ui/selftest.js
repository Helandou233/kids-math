/* ============================================================
   selftest.js —— 隐藏自测页
   入口：URL 加 ?selftest=1，或首页吉祥物连点 5 次。
   包含：R4 属性测试 / R4-7 反向用例 / 组质量 / 内容校验 / 积分不变量。
   ============================================================ */
(function (root) {
  'use strict';

  var KM = root.KM = root.KM || {};

  var SAMPLE_PER_COMBO = 2000;   // 每个 年级×运算×难度 的抽样题量
  var SETS_PER_COMBO = 20;       // 每个 年级×模式×难度 的组数

  var BOUNDARY_CASES = [
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

  var COVERAGE_TARGETS = [
    { grade: 1, mode: 'mix', test: function (q) { return q.op === 'add' && q.b === 0; }, name: '一年级 a+0' },
    { grade: 1, mode: 'mix', test: function (q) { return q.op === 'sub' && q.b === 0; }, name: '一年级 a−0' },
    { grade: 1, mode: 'mix', test: function (q) { return q.op === 'sub' && q.answer === 0; }, name: '一年级 a−a=0' },
    { grade: 2, mode: 'div', test: function (q) { return q.a === q.b && q.answer === 1; }, name: '二年级 9÷9=1' },
    // 0÷b=0 已推迟到三年级（二年级按教材口径不出现「有关 0 的除法」）
    { grade: 3, mode: 'div', star: 1, test: function (q) { return q.answer === 0; }, name: '三年级 0÷5=0' },
    { grade: 2, mode: 'mul', test: function (q) { return q.b === 1; }, name: '二年级 a×1' },
    { grade: 3, mode: 'mul', test: function (q) { return q.b === 0; }, name: '三年级 a×0=0' },
    { grade: 3, mode: 'div', test: function (q) { return q.b === 1; }, name: '三年级 a÷1' },
    { grade: 3, mode: 'rem', test: function (q) { return q.a === 14 && q.b === 4; }, name: '三年级 14÷4=3…2' }
  ];

  /**
   * 运行全部自测。
   * @returns {Array<{name:string, ok:boolean, meta:string}>}
   */
  function runAll() {
    var Rules = KM.Rules;
    var Gen = KM.Generator;
    var out = [];

    /* —— 1. R4 属性测试 —— */
    for (var gi = 0; gi < Rules.GRADES.length; gi++) {
      var grade = Rules.GRADES[gi];
      var ops = Rules.OPS_BY_GRADE[grade];
      for (var oi = 0; oi < ops.length; oi++) {
        var op = ops[oi];
        for (var si = 0; si < Rules.STARS.length; si++) {
          var star = Rules.STARS[si];
          var bad = 0;
          var lastReason = '';
          var nullCount = 0;
          for (var n = 0; n < SAMPLE_PER_COMBO; n++) {
            var q = Gen.randomQuestion({ grade: grade, op: op, star: star });
            if (!q) { nullCount++; continue; }
            var r = Rules.assertR4(q, { grade: grade, star: star });
            if (!r.ok) { bad++; lastReason = r.reason; }
          }
          out.push({
            name: 'R4 属性 ' + grade + '年级/' + Rules.OP_NAME[op] + '/' + star + '星（' + SAMPLE_PER_COMBO + ' 题）',
            ok: bad === 0 && nullCount === 0,
            meta: (bad === 0 && nullCount === 0) ? '全部通过' : ('违规 ' + bad + '，空题 ' + nullCount + '，例：' + lastReason)
          });
        }
      }
    }

    /* —— 2. R4-7 反向用例 —— */
    for (var bi = 0; bi < BOUNDARY_CASES.length; bi++) {
      var c = BOUNDARY_CASES[bi];
      var bq = Gen.buildQuestion(1, 1, c.op, c.a, c.b, c.answer, c.remainder);
      var allowed = 0;
      var sample = '';
      for (var g2 = 1; g2 <= 3; g2++) {
        if (Rules.OPS_BY_GRADE[g2].indexOf(c.op) < 0) continue;
        for (var s2 = 1; s2 <= 3; s2++) {
          var rb = Rules.assertR4(bq, { grade: g2, star: s2 });
          if (rb.ok) {
            allowed++;
            if (!sample) sample = g2 + '年级/' + s2 + '星';
          }
        }
      }
      out.push({
        name: 'R4-7 合法边界 ' + c.name + ' 未被误杀',
        ok: allowed > 0,
        meta: allowed > 0 ? ('允许出现于 ' + allowed + ' 个范围，例：' + sample) : '没有任何范围允许'
      });
    }

    /* —— 3. 边界题覆盖率 —— */
    for (var ci = 0; ci < COVERAGE_TARGETS.length; ci++) {
      var t = COVERAGE_TARGETS[ci];
      var hit = 0;
      for (var setIdx = 0; setIdx < 120; setIdx++) {
        var res = Gen.generateSet({ grade: t.grade, mode: t.mode, star: (t.star || 2), size: 10 });
        for (var qi = 0; qi < res.questions.length; qi++) {
          if (t.test(res.questions[qi])) hit++;
        }
      }
      out.push({
        name: '覆盖率 ' + t.name + ' 实际能出到',
        ok: hit > 0,
        meta: '120 组中命中 ' + hit + ' 次'
      });
    }

    /* —— 4. 整组生成 + 组内质量 —— */
    var modes = ['add', 'sub', 'mul', 'div', 'rem', 'mix'];
    for (var gi2 = 0; gi2 < Rules.GRADES.length; gi2++) {
      var gr = Rules.GRADES[gi2];
      for (var mi = 0; mi < modes.length; mi++) {
        var mode = modes[mi];
        for (var si2 = 1; si2 <= 3; si2++) {
          var groupBad = 0;
          var singleBad = 0;
          var reason = '';
          for (var k = 0; k < SETS_PER_COMBO; k++) {
            var gs = Gen.generateSet({ grade: gr, mode: mode, star: si2, size: 10 });
            var list = gs.questions;
            if (!list || list.length !== 10) { groupBad++; continue; }
            var gag = Rules.assertGroup(list, { grade: gr, star: si2, size: 10 });
            if (!gag.ok) { groupBad++; reason = reason || gag.reason; }
            for (var z = 0; z < list.length; z++) {
              var rs = Rules.assertR4(list[z], { grade: gr, star: si2 });
              if (!rs.ok) { singleBad++; reason = reason || rs.reason; }
            }
          }
          out.push({
            name: '整组 ' + gr + '年级/' + Rules.MODE_NAME[mode] + '/' + si2 + '星（' + SETS_PER_COMBO + ' 组）',
            ok: groupBad === 0 && singleBad === 0,
            meta: (groupBad === 0 && singleBad === 0) ? '全部通过' : ('组 ' + groupBad + ' / 题 ' + singleBad + '：' + reason)
          });
        }
      }
    }

    /* —— 5. 内容校验 —— */
    var missing = KM.Knowledge.validate();
    out.push({
      name: '知识点 / 特例卡均带 sourceRef',
      ok: missing.length === 0,
      meta: missing.length === 0 ? '6 知识点 + 9 特例卡' : ('缺失 ' + JSON.stringify(missing))
    });
    var hintMissing = KM.Hints.validate();
    out.push({
      name: '提示模板均带 sourceRef',
      ok: hintMissing.length === 0,
      meta: hintMissing.length === 0 ? '全部通过' : ('缺失 ' + JSON.stringify(hintMissing))
    });
    var residue = 0;
    for (var hg = 1; hg <= 3; hg++) {
      var hops = Rules.OPS_BY_GRADE[hg];
      for (var ho = 0; ho < hops.length; ho++) {
        var hq = Gen.randomQuestion({ grade: hg, op: hops[ho], star: 2 });
        if (!hq) continue;
        var hh = KM.Hints.build(hq.hintKind, hq);
        [hh.l1, hh.l2, hh.l3].forEach(function (tx) {
          if (/\{\w+\}/.test(tx)) residue++;
        });
      }
    }
    out.push({
      name: '提示模板渲染无残留占位符',
      ok: residue === 0,
      meta: residue === 0 ? '全部通过' : ('残留 ' + residue + ' 处')
    });

    /* —— 6. 积分不变量 —— */
    var st = KM.Points.state();
    var seen = Object.create(null);
    var dupKey = 0;
    for (var li = 0; li < st.ledger.length; li++) {
      var k = st.ledger[li].key;
      if (seen[k]) dupKey++;
      seen[k] = true;
    }
    out.push({
      name: '积分流水无重复 idempotencyKey',
      ok: dupKey === 0,
      meta: dupKey === 0 ? ('共 ' + st.ledger.length + ' 条') : ('重复 ' + dupKey + ' 条')
    });
    out.push({
      name: '每日上限为 200 分',
      ok: KM.Points.DAILY_CAP === 200 && KM.Points.todayEarned() <= 200,
      meta: '今日已获得 ' + KM.Points.todayEarned() + ' 分'
    });
    out.push({
      name: '徽章 8 枚且全部可达',
      ok: KM.Points.BADGES.length === 8,
      meta: '共 ' + KM.Points.BADGES.length + ' 枚，已点亮 ' + st.badges.length + ' 枚'
    });
    out.push({
      name: '每日任务 3 个且均可在当天完成',
      ok: KM.Points.DAILY_TASKS.length === 3,
      meta: KM.Points.DAILY_TASKS.map(function (x) { return x.name; }).join(' / ')
    });

    return out;
  }

  /** 渲染自测页 */
  function render(rootEl) {
    var D = KM.Dom;
    D.clear(rootEl);
    var page = D.el('div', 'km-page');
    page.appendChild(D.topbar({ title: '隐藏自测', onBack: function () { KM.App.go('home'); }, right: 'sound' }));

    var box = D.el('div', 'km-card km-center');
    box.innerHTML = '<div style="font-size:20px;font-weight:900;">正在自检…</div>' +
      '<div class="km-text-soft">跑 ' + SAMPLE_PER_COMBO + ' 道/组合 的属性测试，请稍等 1–2 秒</div>';
    page.appendChild(box);
    rootEl.appendChild(page);

    // 让浏览器先把「正在自检」画出来，再跑同步测试
    setTimeout(function () {
      var results = runAll();
      D.clear(page);
      page.appendChild(D.topbar({ title: '隐藏自测', onBack: function () { KM.App.go('home'); }, right: 'sound' }));

      var failCount = 0;
      for (var i = 0; i < results.length; i++) if (!results[i].ok) failCount++;

      var sum = D.el('div', 'km-test__summary km-mb-14',
        failCount === 0 ? ('全部通过 ✅ 共 ' + results.length + ' 项') : (failCount + ' 项未通过 ❌（共 ' + results.length + ' 项）'));
      if (failCount > 0) sum.style.background = '#FFE9D6';
      page.appendChild(sum);

      var list = D.el('div', 'km-test');
      results.forEach(function (r) {
        var row = D.el('div', 'km-test__row' + (r.ok ? '' : ' is-fail'));
        row.innerHTML = '<span class="' + (r.ok ? 'km-test__ok' : 'km-test__no') + '">' + (r.ok ? 'PASS' : 'FAIL') + '</span>' +
          '<span class="km-test__name">' + D.esc(r.name) + '<span class="km-test__meta"> — ' + D.esc(r.meta) + '</span></span>';
        list.appendChild(row);
      });
      page.appendChild(list);

      var btn = D.el('button', 'km-btn km-btn--block km-btn--lg km-mt-14', '再跑一次');
      D.on(btn, 'click', function () { render(rootEl); });
      page.appendChild(btn);

      var back = D.el('button', 'km-btn km-btn--block km-btn--ghost km-mt-14', '回首页');
      D.on(back, 'click', function () { KM.App.go('home'); });
      page.appendChild(back);
    }, 60);
  }

  KM.SelfTest = {
    render: render,
    runAll: runAll
  };
})(typeof window !== 'undefined' ? window : globalThis);
