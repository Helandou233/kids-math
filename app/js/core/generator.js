/* ============================================================
   generator.js —— 出题引擎
   纯逻辑、无 DOM 依赖，可在浏览器与 Node（vm）中同时加载。
   所有题目在「候选入组前」与「整组生成后」双重调用 KM.Rules.assertR4，
   不做 try/catch 静默吞错。
   ============================================================ */
(function (root) {
  'use strict';

  var KM = root.KM = root.KM || {};
  var Rules = KM.Rules;

  var OPS_BY_GRADE = Rules.OPS_BY_GRADE;
  var OP_SYMBOL = Rules.OP_SYMBOL;

  var seq = 0;

  function rnd(min, max) {
    if (max < min) return min;
    return min + Math.floor(Math.random() * (max - min + 1));
  }

  function pickOne(arr) {
    return arr[Math.floor(Math.random() * arr.length)];
  }

  /** 打乱数组（Fisher–Yates），返回新数组 */
  function shuffle(arr) {
    var out = arr.slice();
    for (var i = out.length - 1; i > 0; i--) {
      var j = Math.floor(Math.random() * (i + 1));
      var t = out[i];
      out[i] = out[j];
      out[j] = t;
    }
    return out;
  }

  /* ------------------------------------------------------------
     提示类型判定（供 js/data/hints.js 使用）
     ------------------------------------------------------------ */
  function pickHintKind(q) {
    var a = q.a;
    var b = q.b;
    switch (q.op) {
      case 'add': {
        var need = 10 - (a % 10);
        if ((a % 10) + (b % 10) >= 10 && b >= need && need > 0) return 'addCarry';
        return 'addPlain';
      }
      case 'sub': {
        if ((a % 10) < (b % 10)) return 'subBorrow';
        return 'subPlain';
      }
      case 'mul': {
        if (a <= 9 && b <= 9) return 'mulTable';
        return 'mul2x1';
      }
      case 'div': {
        if (a <= 81 && q.answer <= 9) return 'divTable';
        return 'div2x1';
      }
      case 'rem':
        return 'rem';
      default:
        return 'addPlain';
    }
  }

  /* ------------------------------------------------------------
     题目对象构造
     ------------------------------------------------------------ */
  /**
   * 构造题目对象（不校验，由调用方调用 assertR4）。
   * @param {number} grade 年级
   * @param {number} star 难度
   * @param {string} op 运算
   * @param {number} a 第一个操作数（div/rem 为被除数）
   * @param {number} b 第二个操作数（div/rem 为除数）
   * @param {number} quotient 商（仅 rem 使用）
   * @param {number} remainder 余数（仅 rem 使用）
   * @returns {Object} 题目
   */
  function buildQuestion(grade, star, op, a, b, quotient, remainder) {
    var q = {
      id: 'q' + (++seq),
      op: op,
      grade: grade,
      star: star,
      a: a,
      b: b,
      answer: 0,
      remainder: undefined,
      symbol: OP_SYMBOL[op],
      expr: '',
      display: '',
      hintKind: '',
      isGift: false,
      isZero: false,
      isBoundary: false
    };

    if (op === 'add') {
      q.answer = a + b;
      q.expr = a + ' + ' + b;
      q.display = a + ' + ' + b + ' = ?';
    } else if (op === 'sub') {
      q.answer = a - b;
      q.expr = a + ' − ' + b;
      q.display = a + ' − ' + b + ' = ?';
    } else if (op === 'mul') {
      q.answer = a * b;
      q.expr = a + ' × ' + b;
      q.display = a + ' × ' + b + ' = ?';
    } else if (op === 'div') {
      q.answer = Math.floor(a / b);
      q.expr = a + ' ÷ ' + b;
      q.display = a + ' ÷ ' + b + ' = ?';
    } else if (op === 'rem') {
      q.answer = quotient;
      q.remainder = remainder;
      q.expr = a + ' ÷ ' + b;
      q.display = a + ' ÷ ' + b + ' = ? …… ?';
    }

    q.hintKind = pickHintKind(q);
    q.isZero = Rules.isZeroResult(q);
    q.isGift = Rules.isGift(q);
    return q;
  }

  /**
   * 在给定 a 的情况下，求合法的 b 区间。
   * @returns {Array<number>} [lo, hi]，lo>hi 表示无解
   */
  function bIntervalFor(op, a, rng) {
    var lo, hi;
    if (op === 'add') {
      lo = Math.max(rng.b[0], rng.res[0] - a);
      hi = Math.min(rng.b[1], rng.res[1] - a);
    } else if (op === 'sub') {
      lo = Math.max(rng.b[0], a - rng.res[1]);
      hi = Math.min(rng.b[1], a - rng.res[0], a);
    } else if (op === 'mul') {
      if (a === 0) {
        lo = rng.b[0];
        hi = rng.b[1];
      } else {
        lo = Math.max(rng.b[0], Math.ceil(rng.res[0] / a));
        hi = Math.min(rng.b[1], Math.floor(rng.res[1] / a));
      }
    } else {
      lo = rng.b[0];
      hi = rng.b[1];
    }
    return [lo, hi];
  }

  /**
   * 生成一道普通题（含约束采样 + 兜底）。
   * @param {number} grade 年级
   * @param {string} op 运算
   * @param {number} star 难度
   * @returns {Object|null} 题目（已通过 assertR4），失败返回 null
   */
  function makeNormal(grade, op, star) {
    var rng = Rules.getRange(grade, op, star);
    if (!rng) return null;
    var ctx = { grade: grade, star: star };

    for (var t = 0; t < 80; t++) {
      var q = null;
      if (op === 'add' || op === 'sub' || op === 'mul') {
        var a = rnd(rng.a[0], rng.a[1]);
        var iv = bIntervalFor(op, a, rng);
        if (iv[0] > iv[1]) continue;
        var b = rnd(iv[0], iv[1]);
        q = buildQuestion(grade, star, op, a, b, 0, 0);
      } else if (op === 'div') {
        var dv = rnd(rng.b[0], rng.b[1]);
        if (dv === 0) continue;                       // R4-1
        var qLo = Math.max(rng.res[0], Math.ceil(rng.a[0] / dv));
        var qHi = Math.min(rng.res[1], Math.floor(rng.a[1] / dv));
        if (qLo > qHi) continue;
        var quo = rnd(qLo, qHi);
        q = buildQuestion(grade, star, op, dv * quo, dv, quo, 0);
      } else if (op === 'rem') {
        var dr = rnd(rng.b[0], rng.b[1]);
        if (dr < 2) continue;                          // 余数 ≥1 必须除数 ≥2
        var rLo = Math.max(rng.rem[0], 1);
        var rHi = Math.min(rng.rem[1], dr - 1);        // R4-4：余数 < 除数
        if (rLo > rHi) continue;
        var rem = rnd(rLo, rHi);
        var cLo = Math.max(rng.res[0], Math.ceil((rng.a[0] - rem) / dr));
        var cHi = Math.min(rng.res[1], Math.floor((rng.a[1] - rem) / dr));
        if (cLo > cHi) continue;
        var cq = rnd(cLo, cHi);
        q = buildQuestion(grade, star, op, dr * cq + rem, dr, cq, rem);
      }
      if (!q) continue;
      if (Rules.assertR4(q, ctx).ok) return q;
    }

    return fallbackQuestion(grade, op, star);
  }

  /**
   * 兜底：用范围边界直接构造一道一定合法的题（再经 assertR4 验证）。
   * @returns {Object|null}
   */
  function fallbackQuestion(grade, op, star) {
    var rng = Rules.getRange(grade, op, star);
    if (!rng) return null;
    var ctx = { grade: grade, star: star };
    var candidates = [];
    var a, b, dv, quo, rem, dr;

    if (op === 'add' || op === 'sub' || op === 'mul') {
      var aList = [rng.a[0], rng.a[1], Math.floor((rng.a[0] + rng.a[1]) / 2)];
      for (var i = 0; i < aList.length; i++) {
        a = aList[i];
        var iv = bIntervalFor(op, a, rng);
        if (iv[0] > iv[1]) continue;
        var bList = [iv[0], iv[1], Math.floor((iv[0] + iv[1]) / 2)];
        for (var j = 0; j < bList.length; j++) {
          candidates.push(buildQuestion(grade, star, op, a, bList[j], 0, 0));
        }
      }
    } else if (op === 'div') {
      for (dv = Math.max(1, rng.b[0]); dv <= rng.b[1]; dv++) {
        for (quo = rng.res[0]; quo <= rng.res[1]; quo++) {
          var dd = dv * quo;
          if (dd < rng.a[0] || dd > rng.a[1]) continue;
          candidates.push(buildQuestion(grade, star, op, dd, dv, quo, 0));
          break;
        }
      }
    } else if (op === 'rem') {
      for (dr = Math.max(2, rng.b[0]); dr <= rng.b[1]; dr++) {
        for (rem = Math.max(rng.rem[0], 1); rem <= Math.min(rng.rem[1], dr - 1); rem++) {
          for (quo = rng.res[0]; quo <= rng.res[1]; quo++) {
            var da = dr * quo + rem;
            if (da < rng.a[0] || da > rng.a[1]) continue;
            candidates.push(buildQuestion(grade, star, op, da, dr, quo, rem));
            break;
          }
        }
      }
    }

    for (var k = 0; k < candidates.length; k++) {
      if (Rules.assertR4(candidates[k], ctx).ok) return candidates[k];
    }
    if (root.console && root.console.error) {
      root.console.error('[KM.Generator] 兜底构造仍无解：', grade, op, star);
    }
    return null;
  }

  /* ------------------------------------------------------------
     送分题（首题强制）：answer 必须 > 0
     ------------------------------------------------------------ */
  function makeGift(grade, op, star) {
    var rng = Rules.getRange(grade, op, star);
    if (!rng) return null;
    var ctx = { grade: grade, star: star };
    var candidates = [];
    var i, a, b, dv, quo;

    if (op === 'add') {
      var bAdd = (rng.b[0] <= 1 && rng.b[1] >= 1) ? 1 : rng.b[0];
      var loAdd = Math.max(rng.a[0], 1);
      var hiAdd = Math.min(rng.a[1], loAdd + 12);
      for (i = loAdd; i <= hiAdd; i++) {
        candidates.push(buildQuestion(grade, star, op, i, bAdd, 0, 0));
      }
    } else if (op === 'sub') {
      b = (rng.b[0] <= 0 && rng.b[1] >= 0) ? 0 : rng.b[0];
      var loSub = Math.max(rng.a[0], b + 1);
      var hiSub = Math.min(rng.a[1], loSub + 13);
      for (i = loSub; i <= hiSub; i++) {
        candidates.push(buildQuestion(grade, star, op, i, b, 0, 0));
      }
    } else if (op === 'mul') {
      b = (rng.b[0] <= 1 && rng.b[1] >= 1) ? 1 : rng.b[0];
      a = Math.max(rng.a[0], 1);
      candidates.push(buildQuestion(grade, star, op, a, b, 0, 0));
      candidates.push(buildQuestion(grade, star, op, rng.a[1], b, 0, 0));
    } else if (op === 'div') {
      dv = (rng.b[0] <= 1 && rng.b[1] >= 1) ? 1 : rng.b[0];
      for (quo = Math.max(rng.res[0], 1); quo <= rng.res[1]; quo++) {
        candidates.push(buildQuestion(grade, star, op, dv * quo, dv, quo, 0));
      }
    } else if (op === 'rem') {
      for (var drg = Math.max(2, rng.b[0]); drg <= Math.min(rng.b[1], Math.max(2, rng.b[0]) + 2); drg++) {
        for (var cqg = Math.max(rng.res[0], 1); cqg <= Math.min(rng.res[1], 2); cqg++) {
          candidates.push(buildQuestion(grade, star, op, drg * cqg + 1, drg, cqg, 1));
        }
      }
    }

    var usable = [];
    for (var k = 0; k < candidates.length; k++) {
      var q = candidates[k];
      if (!Rules.assertR4(q, ctx).ok) continue;
      if (Rules.isZeroResult(q)) continue;      // 送分题不允许 0 结果（0 结果题不能在前 3 题）
      if (!Rules.isGift(q)) continue;
      usable.push(q);
    }
    if (!usable.length) return null;
    return pickOne(usable);
  }

  /* ------------------------------------------------------------
     合法边界题（R4-7 反向覆盖：必须能生成，不能被误杀）
     ------------------------------------------------------------ */
  /** 一组经典有余数除法边界题（被除数, 除数） */
  var CLASSIC_REM_PAIRS = [
    [14, 4], [17, 5], [11, 3], [23, 5], [19, 6], [10, 3], [26, 8], [13, 2]
  ];

  function makeBoundary(grade, op, star) {
    var rng = Rules.getRange(grade, op, star);
    if (!rng) return null;
    var ctx = { grade: grade, star: star };
    var candidates = [];
    var i, x, dv, quo;

    // 极值候选：保证边界槽位一定有“非送分题”可选（例如 5×5、99÷9）
    if (op === 'add' || op === 'sub' || op === 'mul') {
      var extremeA = [rng.a[0], rng.a[1], Math.floor((rng.a[0] + rng.a[1]) / 2)];
      for (var e = 0; e < extremeA.length; e++) {
        var ivx = bIntervalFor(op, extremeA[e], rng);
        if (ivx[0] > ivx[1]) continue;
        candidates.push(buildQuestion(grade, star, op, extremeA[e], ivx[0], 0, 0));
        candidates.push(buildQuestion(grade, star, op, extremeA[e], ivx[1], 0, 0));
      }
    } else if (op === 'div') {
      for (var dvx = rng.b[1]; dvx >= Math.max(1, rng.b[0]); dvx--) {
        var qxMax = Math.min(rng.res[1], Math.floor(rng.a[1] / dvx));
        var qxMin = Math.max(rng.res[0], Math.ceil(rng.a[0] / dvx));
        if (qxMin > qxMax) continue;
        candidates.push(buildQuestion(grade, star, op, dvx * qxMax, dvx, qxMax, 0));
        break;
      }
    }

    if (op === 'add') {
      // 0 + b / a + 0
      if (rng.a[0] <= 0) {
        for (i = rng.b[0]; i <= rng.b[1]; i++) {
          candidates.push(buildQuestion(grade, star, op, 0, i, 0, 0));
        }
      }
      if (rng.b[0] <= 0) {
        for (i = rng.a[0]; i <= rng.a[1]; i++) {
          candidates.push(buildQuestion(grade, star, op, i, 0, 0, 0));
        }
      }
    } else if (op === 'sub') {
      // a − 0
      if (rng.b[0] <= 0) {
        for (i = rng.a[0]; i <= rng.a[1]; i++) {
          candidates.push(buildQuestion(grade, star, op, i, 0, 0, 0));
        }
      }
      // a − a = 0
      var loA = Math.max(rng.a[0], rng.b[0]);
      var hiA = Math.min(rng.a[1], rng.b[1]);
      for (x = loA; x <= hiA; x++) {
        candidates.push(buildQuestion(grade, star, op, x, x, 0, 0));
      }
    } else if (op === 'mul') {
      // a × 1
      if (rng.b[0] <= 1 && rng.b[1] >= 1) {
        for (i = rng.a[0]; i <= rng.a[1]; i++) {
          candidates.push(buildQuestion(grade, star, op, i, 1, 0, 0));
        }
      }
      // a × 0 = 0
      if (rng.b[0] <= 0 && rng.res[0] <= 0) {
        for (i = rng.a[0]; i <= rng.a[1]; i++) {
          candidates.push(buildQuestion(grade, star, op, i, 0, 0, 0));
        }
      }
    } else if (op === 'div') {
      // a ÷ 1
      if (rng.b[0] <= 1 && rng.b[1] >= 1) {
        for (quo = rng.res[0]; quo <= rng.res[1]; quo++) {
          candidates.push(buildQuestion(grade, star, op, 1 * quo, 1, quo, 0));
        }
      }
      // a ÷ a = 1（例如 9 ÷ 9 = 1）
      if (rng.res[0] <= 1 && rng.res[1] >= 1) {
        for (dv = rng.b[0]; dv <= rng.b[1]; dv++) {
          if (dv < rng.a[0] || dv > rng.a[1]) continue;
          candidates.push(buildQuestion(grade, star, op, dv, dv, 1, 0));
        }
      }
      // 0 ÷ b = 0
      if (rng.a[0] <= 0 && rng.res[0] <= 0) {
        for (dv = Math.max(1, rng.b[0]); dv <= rng.b[1]; dv++) {
          candidates.push(buildQuestion(grade, star, op, 0, dv, 0, 0));
        }
      }
    } else if (op === 'rem') {
      for (i = 0; i < CLASSIC_REM_PAIRS.length; i++) {
        var pair = CLASSIC_REM_PAIRS[i];
        var da = pair[0];
        var db = pair[1];
        candidates.push(buildQuestion(grade, star, op, da, db, Math.floor(da / db), da % db));
      }
      // 余数为 1 的情形
      for (dv = rng.b[0]; dv <= rng.b[1]; dv++) {
        if (dv < 2) continue;
        for (quo = rng.res[0]; quo <= rng.res[1]; quo++) {
          candidates.push(buildQuestion(grade, star, op, dv * quo + 1, dv, quo, 1));
        }
      }
    }

    var usable = [];
    for (var k = 0; k < candidates.length; k++) {
      if (Rules.assertR4(candidates[k], ctx).ok) usable.push(candidates[k]);
    }
    if (!usable.length) return null;
    var chosen = pickOne(usable);
    chosen.isBoundary = true;
    return chosen;
  }

  /* ------------------------------------------------------------
     1 星模式的三个大选项
     ------------------------------------------------------------ */
  /**
   * 生成 3 个选项（含正确答案），已打乱顺序。
   * @param {Object} q 题目
   * @returns {Array<{value:number, r:number, display:string, correct:boolean}>}
   */
  function makeOptions(q) {
    var opts = [];
    var i;
    if (q.op === 'rem') {
      var correct = { value: q.answer, r: q.remainder, display: q.answer + ' …… ' + q.remainder, correct: true };
      opts.push(correct);
      var guard = 0;
      while (opts.length < 3 && guard++ < 100) {
        var dv = pickOne([q.answer - 1, q.answer + 1, q.answer + 2, q.answer - 2]);
        var rr = rnd(1, Math.max(1, q.b - 1));
        if (dv < 1) dv = 1;
        var key = dv + '|' + rr;
        var dup = false;
        for (i = 0; i < opts.length; i++) {
          if (opts[i].value === dv && opts[i].r === rr) dup = true;
        }
        if (dup) continue;
        opts.push({ value: dv, r: rr, display: dv + ' …… ' + rr, correct: false });
      }
      while (opts.length < 3) {
        var filler = q.answer + opts.length;
        opts.push({ value: filler, r: q.remainder, display: filler + ' …… ' + q.remainder, correct: false });
      }
      return shuffle(opts);
    }

    opts.push({ value: q.answer, r: 0, display: String(q.answer), correct: true });
    var offsets = shuffle([1, -1, 2, -2, 3, -3, 4, -4, 5, -5, 10, -10]);
    for (i = 0; i < offsets.length && opts.length < 3; i++) {
      var v = q.answer + offsets[i];
      if (v < 0) continue;
      var dup2 = false;
      for (var j = 0; j < opts.length; j++) {
        if (opts[j].value === v) dup2 = true;
      }
      if (dup2) continue;
      opts.push({ value: v, r: 0, display: String(v), correct: false });
    }
    var guard2 = 0;
    while (opts.length < 3 && guard2++ < 50) {
      var v2 = q.answer + 1 + guard2;
      var dup3 = false;
      for (var m = 0; m < opts.length; m++) {
        if (opts[m].value === v2) dup3 = true;
      }
      if (!dup3) opts.push({ value: v2, r: 0, display: String(v2), correct: false });
    }
    return shuffle(opts);
  }

  /* ------------------------------------------------------------
     合法题目空间穷举（兜底 + 容量计算用）
     只在随机采样失败时才走到这里，且结果按 (年级,运算,难度) 缓存。
     ------------------------------------------------------------ */
  /** 缓存：key = "grade|op|star" → 合法题目参数数组 */
  var specCache = Object.create(null);

  /**
   * 穷举某 (年级, 运算, 难度) 下所有通过 assertR4 的题目参数。
   * @param {number} grade 年级
   * @param {string} op 运算
   * @param {number} star 难度
   * @returns {Array<{a:number,b:number,qq:number,r:number}>}
   */
  function enumerateSpecs(grade, op, star) {
    var key = grade + '|' + op + '|' + star;
    if (specCache[key]) return specCache[key];

    var rng = Rules.getRange(grade, op, star);
    var specs = [];
    if (!rng) {
      specCache[key] = specs;
      return specs;
    }
    var ctx = { grade: grade, star: star };
    var a, b, dv, quo, rem, q;

    if (op === 'add' || op === 'sub' || op === 'mul') {
      for (a = rng.a[0]; a <= rng.a[1]; a++) {
        var iv = bIntervalFor(op, a, rng);
        for (b = iv[0]; b <= iv[1]; b++) {
          q = buildQuestion(grade, star, op, a, b, 0, 0);
          if (Rules.assertR4(q, ctx).ok) specs.push({ a: a, b: b, qq: 0, r: 0 });
        }
      }
    } else if (op === 'div') {
      for (dv = Math.max(1, rng.b[0]); dv <= rng.b[1]; dv++) {
        for (quo = rng.res[0]; quo <= rng.res[1]; quo++) {
          var dd = dv * quo;
          if (dd < rng.a[0] || dd > rng.a[1]) continue;
          q = buildQuestion(grade, star, op, dd, dv, quo, 0);
          if (Rules.assertR4(q, ctx).ok) specs.push({ a: dd, b: dv, qq: quo, r: 0 });
        }
      }
    } else if (op === 'rem') {
      for (dv = rng.b[0]; dv <= rng.b[1]; dv++) {
        if (dv < 2) continue;
        var rLo = Math.max(rng.rem[0], 1);
        var rHi = Math.min(rng.rem[1], dv - 1);
        for (rem = rLo; rem <= rHi; rem++) {
          for (quo = rng.res[0]; quo <= rng.res[1]; quo++) {
            var da = dv * quo + rem;
            if (da < rng.a[0] || da > rng.a[1]) continue;
            q = buildQuestion(grade, star, op, da, dv, quo, rem);
            if (Rules.assertR4(q, ctx).ok) specs.push({ a: da, b: dv, qq: quo, r: rem });
          }
        }
      }
    }

    specCache[key] = specs;
    return specs;
  }

  /**
   * 把候选参数顺序打乱（大数组用随机起点环形遍历，避免频繁复制）。
   * @param {Array} specs 候选参数
   * @returns {Array}
   */
  function orderedSpecs(specs) {
    var n = specs.length;
    if (n <= 300) return shuffle(specs);
    var start = Math.floor(Math.random() * n);
    var out = [];
    for (var i = 0; i < n; i++) out.push(specs[(start + i) % n]);
    return out;
  }

  /**
   * 统计某组合下每个「(运算,答案)」可用的题目数（区分送分题 / 非送分题）。
   * @returns {Object} key = "op#answer" → {nonGift, gift, total}
   */
  function collectStats(grade, ops, star) {
    var stats = Object.create(null);
    for (var i = 0; i < ops.length; i++) {
      var op = ops[i];
      var specs = enumerateSpecs(grade, op, star);
      for (var j = 0; j < specs.length; j++) {
        var sp = specs[j];
        var q = buildQuestion(grade, star, op, sp.a, sp.b, sp.qq, sp.r);
        var k = op + '#' + q.answer;
        var st = stats[k];
        if (!st) st = stats[k] = { nonGift: 0, gift: 0, total: 0, zero: q.answer === 0 };
        st.total++;
        if (Rules.isGift(q)) st.gift++;
        else st.nonGift++;
      }
    }
    return stats;
  }

  /**
   * 估算在给定 (送分题额度, 相同答案上限) 下最多能出多少道题。
   * @returns {number}
   */
  function estimateCapacity(stats, giftLimit, cap) {
    var keys = Object.keys(stats);
    var total = 0;
    var extras = [];
    for (var i = 0; i < keys.length; i++) {
      var st = stats[keys[i]];
      // 结果为 0 的题整组最多 1 道，所以该答案的容量上限是 1 而不是 cap
      var effCap = st.zero ? Math.min(cap, 1) : cap;
      var ng = Math.min(st.nonGift, effCap);
      total += ng;
      extras.push(Math.min(Math.max(0, effCap - ng), st.gift));
    }
    extras.sort(function (x, y) { return x - y; });
    var room = giftLimit;
    for (var j = 0; j < extras.length && room > 0; j++) {
      var take = Math.min(extras[j], room);
      total += take;
      room -= take;
    }
    return total;
  }

  /** 出题方案缓存 */
  var planCache = Object.create(null);

  /**
   * 为 (年级, 运算组合, 难度, 题量) 计算可行方案。
   * 优先保持默认规则（送分 ≤10%、相同答案 ≤3）；
   * 只有当数学上凑不出时才放宽「相同答案上限」，再不行才减少题量。
   * @returns {{size:number, giftLimit:number, maxSame:number, truncated:boolean}|null}
   */
  function planFor(grade, ops, star, size) {
    var cacheKey = grade + '|' + ops.join('/') + '|' + star + '|' + size;
    if (planCache[cacheKey]) return planCache[cacheKey];

    var stats = collectStats(grade, ops, star);
    var plan = null;
    for (var n = size; n >= 1 && !plan; n--) {
      var g = Math.max(1, Math.floor(n * 0.1));
      for (var c = 3; c <= 24; c++) {
        if (estimateCapacity(stats, g, c) >= n) {
          plan = { size: n, giftLimit: g, maxSame: c, truncated: n !== size };
          break;
        }
      }
    }
    planCache[cacheKey] = plan;
    return plan;
  }

  /* ------------------------------------------------------------
     整组生成
     ------------------------------------------------------------ */
  /**
   * 生成一组题目。
   * @param {Object} opts {grade:1|2|3, mode:'add'|'sub'|'mul'|'div'|'rem'|'mix', star:1|2|3, size?:number}
   * @returns {{ok:boolean, reason:string, questions:Array}}
   */
  function generateSet(opts) {
    var grade = opts.grade;
    var mode = opts.mode || 'mix';
    var star = opts.star || 1;
    var size = opts.size || 10;

    var allowed = OPS_BY_GRADE[grade] || OPS_BY_GRADE[1];
    var ops;
    if (mode === 'mix') {
      ops = allowed.slice();
    } else if (allowed.indexOf(mode) >= 0) {
      ops = [mode];
    } else {
      ops = [allowed[0]];   // 该年级不出现此运算时回落，不产生超前概念
    }

    var ctx = { grade: grade, star: star, size: size };
    var giftLimit = Math.max(1, Math.floor(size * 0.1));   // 送分题 ≤10%
    var reason = '';

    for (var attempt = 0; attempt < 8; attempt++) {
      var list = buildOnce(grade, ops, star, size, giftLimit, 3);
      var res = Rules.assertGroup(list, ctx);
      if (res.ok) {
        return { ok: true, reason: '', questions: list };
      }
      reason = res.reason;
      if (root.console && root.console.warn) {
        root.console.warn('[KM.Generator] 整组校验未通过，重试(' + (attempt + 1) + ')：' + res.reason);
      }
    }

    // 默认规则下确实凑不出：按可行性方案放宽「相同答案上限」，
    // 仍凑不出则按方案减少题量（宁可少出几道，也不返回不合法题目）。
    var plan = planFor(grade, ops, star, size);
    var step = 0;
    while (plan && step++ < 6) {
      var pn = plan.size;
      var gl = Math.max(1, Math.floor(pn * 0.1));
      var ctx2 = {
        grade: grade,
        star: star,
        size: pn,
        maxSameAnswer: plan.maxSame,
        maxGift: gl
      };
      for (var a2 = 0; a2 < 8; a2++) {
        var list2 = buildOnce(grade, ops, star, pn, gl, plan.maxSame);
        var res2 = Rules.assertGroup(list2, ctx2);
        if (res2.ok) {
          return {
            ok: true,
            reason: plan.truncated ? ('该组合题目空间不足，实际出题 ' + pn + ' 道') : '',
            questions: list2,
            requested: size,
            truncated: plan.truncated
          };
        }
        reason = res2.reason;
      }
      if (pn <= 1) break;
      // 方案仍兑现不了：题量再减 1 重算方案（兜底，正常不会走到）
      plan = planFor(grade, ops, star, pn - 1);
    }

    // 多次重试仍失败：明确报错并返回空组，绝不静默返回已知不合法的题目
    if (root.console && root.console.error) {
      root.console.error('[KM.Generator] 生成合法题组失败：' + reason +
        '（grade=' + grade + ' mode=' + mode + ' star=' + star + ' size=' + size + '）');
    }
    return { ok: false, reason: reason, questions: [] };
  }

  /**
   * 单次构建题目组（内部函数）。
   * @returns {Array} 题目数组
   */
  function buildOnce(grade, ops, star, size, giftLimit, maxSame) {
    var ctx = { grade: grade, star: star };
    var maxSameAnswer = maxSame || 3;
    var list = [];
    var usedKey = Object.create(null);
    var answerCount = Object.create(null);
    var giftCount = 0;
    var zeroUsed = false;
    var i, q, key, ansKey;

    function accept(candidate, index) {
      if (!candidate) return false;
      var r = Rules.assertR4(candidate, ctx);       // 候选入组前断言
      if (!r.ok) return false;
      key = candidate.op + '|' + candidate.a + '|' + candidate.b;
      if (usedKey[key]) return false;               // 同组去重
      ansKey = String(candidate.op) + '#' + String(candidate.answer);
      if ((answerCount[ansKey] || 0) >= maxSame) return false;   // 相同答案 ≤maxSame 题
      var gift = Rules.isGift(candidate);
      if (gift && giftCount >= giftLimit) return false;
      var zero = Rules.isZeroResult(candidate);
      if (zero && (zeroUsed || index < 3)) return false;   // 0 结果 ≤1 且不出现在前 3 题
      usedKey[key] = true;
      answerCount[ansKey] = (answerCount[ansKey] || 0) + 1;
      if (gift) giftCount++;
      if (zero) zeroUsed = true;
      list.push(candidate);
      return true;
    }

    // 第 1 题：强制送分题
    var gift = null;
    var giftOps = shuffle(ops);
    for (i = 0; i < giftOps.length && !gift; i++) {
      gift = makeGift(grade, giftOps[i], star);
    }
    if (!gift) gift = makeNormal(grade, ops[0], star);
    if (gift) {
      gift.isGift = true;
      accept(gift, 0);
    }
    if (!list.length) {
      // 极端情况：用兜底题补首题（仍必须通过 R4）
      var fb0 = fallbackQuestion(grade, ops[0], star);
      if (fb0 && Rules.assertR4(fb0, ctx).ok) {
        usedKey[fb0.op + '|' + fb0.a + '|' + fb0.b] = true;
        list.push(fb0);
      }
    }

    // 随机挑一个位置放合法边界题（保证 R4-7 覆盖，且不落在前 3 题）
    var boundaryIndex = size > 3 ? rnd(3, size - 1) : -1;

    for (i = list.length; i < size; i++) {
      var accepted = false;
      var tries = 0;
      while (!accepted && tries++ < 120) {
        var op = pickOne(ops);
        // 前 60 次尝试边界题，之后回落到普通题，避免边界槽位死循环
        var wantBoundary = (i === boundaryIndex) && (tries <= 60);
        var candidate;
        if (wantBoundary) {
          candidate = makeBoundary(grade, op, star);
        } else {
          candidate = makeNormal(grade, op, star);
        }
        accepted = accept(candidate, i);
      }
      if (!accepted) {
        // 兜底：遍历各运算的兜底候选，仍按软约束接受
        var fbOps = shuffle(ops);
        for (var oi = 0; oi < fbOps.length && !accepted; oi++) {
          var fb = fallbackQuestion(grade, fbOps[oi], star);
          accepted = accept(fb, i);
        }
      }
      if (!accepted) {
        // 兜底 2：穷举该组合下所有合法题目，找第一个满足软约束的（保证大题量也能凑齐）
        var enumOps = shuffle(ops);
        for (var ei = 0; ei < enumOps.length && !accepted; ei++) {
          var specs = orderedSpecs(enumerateSpecs(grade, enumOps[ei], star));
          for (var pi = 0; pi < specs.length && !accepted; pi++) {
            var sp = specs[pi];
            accepted = accept(buildQuestion(grade, star, enumOps[ei], sp.a, sp.b, sp.qq, sp.r), i);
          }
        }
      }
      if (!accepted) {
        // 确实无解：明确告警，绝不塞入已知不合法的题目
        if (root.console && root.console.error) {
          root.console.error('[KM.Generator] 无法为第 ' + (i + 1) + ' 题生成合法题目：',
            'grade=' + grade, 'ops=' + ops.join('/'), 'star=' + star, 'size=' + size);
        }
      }
    }
    return list;
  }

  /**
   * 随机生成一道题（自测 / 属性测试使用）。
   * @param {Object} ctx {grade, op, star}
   * @returns {Object|null}
   */
  function randomQuestion(ctx) {
    return makeNormal(ctx.grade, ctx.op, ctx.star);
  }

  KM.Generator = {
    generateSet: generateSet,
    randomQuestion: randomQuestion,
    makeNormal: makeNormal,
    makeGift: makeGift,
    makeBoundary: makeBoundary,
    makeOptions: makeOptions,
    buildQuestion: buildQuestion,
    pickHintKind: pickHintKind,
    shuffle: shuffle,
    rnd: rnd
  };
})(typeof window !== 'undefined' ? window : globalThis);
