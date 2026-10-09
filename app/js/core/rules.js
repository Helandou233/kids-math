/* ============================================================
   rules.js —— 出题硬规则（R4）与数值范围表
   纯逻辑、无 DOM 依赖，可在浏览器与 Node（vm）中同时加载。
   ============================================================ */
(function (root) {
  'use strict';

  var KM = root.KM = root.KM || {};

  /** 运算类型 */
  var OPS = ['add', 'sub', 'mul', 'div', 'rem'];
  /** 年级 */
  var GRADES = [1, 2, 3];
  /** 难度星级 */
  var STARS = [1, 2, 3];

  var OP_SYMBOL = { add: '+', sub: '−', mul: '×', div: '÷', rem: '÷' };
  var OP_NAME = { add: '加法', sub: '减法', mul: '乘法', div: '除法', rem: '有余数的除法' };
  var MODE_NAME = {
    add: '加法', sub: '减法', mul: '乘法', div: '除法', rem: '有余数除法', mix: '混合'
  };
  var GRADE_NAME = { 1: '一年级', 2: '二年级', 3: '三年级' };

  /** 每个年级允许的运算（R4-6：超前概念拦截） */
  var OPS_BY_GRADE = {
    1: ['add', 'sub'],                       // 一年级：只有 20 以内加减，不出乘除
    2: ['add', 'sub', 'mul', 'div'],         // 二年级：不出余数除法、不出两位数乘法
    3: ['add', 'sub', 'mul', 'div', 'rem']
  };

  /* ------------------------------------------------------------
     数值范围表 RANGE_TABLE[grade][op][starIndex]
     统一使用三个键：
       a   —— 第一个操作数（div/rem 时表示“被除数”）
       b   —— 第二个操作数（div/rem 时表示“除数”）
       res —— 结果（div/rem 时表示“商”）
       rem —— 仅 rem：余数范围
     所有区间均为闭区间 [min, max]。
     ------------------------------------------------------------ */
  var RANGE_TABLE = {
    /* 一年级：加减 20 以内（结果 0–20），不出乘除 */
    1: {
      add: [
        { a: [0, 5], b: [0, 5], res: [0, 10] },
        { a: [0, 10], b: [0, 10], res: [0, 20] },
        { a: [0, 20], b: [0, 20], res: [0, 20] }
      ],
      sub: [
        { a: [1, 10], b: [0, 10], res: [0, 10] },
        { a: [5, 20], b: [0, 15], res: [0, 20] },
        { a: [10, 20], b: [0, 20], res: [0, 20] }
      ]
    },
    /* 二年级：加减 100 以内；乘法表内 1–9×1–9；除法表内整除（被除数 ≤81）；不出余数除法 */
    2: {
      add: [
        { a: [0, 20], b: [0, 20], res: [0, 40] },
        { a: [0, 60], b: [0, 40], res: [0, 100] },
        { a: [20, 99], b: [1, 60], res: [30, 100] }
      ],
      sub: [
        { a: [5, 40], b: [0, 20], res: [0, 40] },
        { a: [20, 80], b: [0, 60], res: [0, 80] },
        { a: [50, 100], b: [0, 99], res: [0, 90] }
      ],
      mul: [
        { a: [1, 5], b: [1, 5], res: [1, 25] },
        { a: [1, 9], b: [1, 9], res: [1, 81] },
        { a: [3, 9], b: [1, 9], res: [3, 81] }
      ],
      div: [
        { a: [1, 25], b: [1, 5], res: [0, 5] },
        { a: [1, 81], b: [1, 9], res: [0, 9] },
        { a: [9, 81], b: [1, 9], res: [1, 9] }
      ]
    },
    /* 三年级：加减 100 以内；乘法 两位数×一位数；除法 两位数÷一位数；有余数除法 */
    3: {
      add: [
        { a: [10, 50], b: [1, 40], res: [15, 90] },
        { a: [20, 70], b: [1, 50], res: [30, 100] },
        { a: [40, 99], b: [1, 60], res: [50, 100] }
      ],
      sub: [
        { a: [20, 60], b: [0, 30], res: [0, 55] },
        { a: [40, 90], b: [0, 50], res: [0, 80] },
        { a: [60, 100], b: [0, 99], res: [0, 80] }
      ],
      mul: [
        { a: [10, 30], b: [0, 5], res: [0, 150] },
        { a: [10, 60], b: [0, 9], res: [0, 540] },
        { a: [20, 99], b: [0, 9], res: [0, 891] }
      ],
      div: [
        { a: [0, 99], b: [1, 5], res: [0, 90] },
        { a: [10, 99], b: [1, 7], res: [2, 45] },
        { a: [10, 99], b: [1, 9], res: [2, 33] }
      ],
      rem: [
        { a: [3, 89], b: [2, 5], res: [1, 5], rem: [1, 4] },
        { a: [3, 89], b: [2, 7], res: [1, 7], rem: [1, 6] },
        { a: [3, 89], b: [3, 9], res: [2, 9], rem: [1, 8] }
      ]
    }
  };

  /** 生成失败返回值 */
  function fail(code, reason) {
    return { ok: false, code: code, reason: code + ' ' + reason };
  }
  function pass() {
    return { ok: true, code: 'OK', reason: '' };
  }

  function isInt(v) {
    return typeof v === 'number' && isFinite(v) && Math.floor(v) === v;
  }
  function inRange(v, range) {
    return isInt(v) && v >= range[0] && v <= range[1];
  }
  function clamp(v, lo, hi) {
    if (v < lo) return lo;
    if (v > hi) return hi;
    return v;
  }

  /**
   * 取指定年级 / 运算 / 难度 的范围配置。
   * @param {number} grade 年级 1-3
   * @param {string} op 运算类型
   * @param {number} star 难度 1-3
   * @returns {Object|null} 范围配置
   */
  function getRange(grade, op, star) {
    var byGrade = RANGE_TABLE[grade];
    if (!byGrade) return null;
    var byOp = byGrade[op];
    if (!byOp) return null;
    return byOp[star - 1] || null;
  }

  /**
   * R4 硬规则断言（纯函数）。
   * 出题时在「候选入组前」与「整组生成后」双重调用。
   * 不吞错：任何一条不合法都返回 {ok:false, reason}。
   *
   * @param {Object} q 题目对象 {op, a, b, answer, remainder?}
   * @param {Object} ctx 上下文 {grade: 1|2|3, star: 1|2|3}
   * @returns {{ok: boolean, code: string, reason: string}}
   */
  function assertR4(q, ctx) {
    if (!q || typeof q !== 'object') return fail('R4-0', '题目为空');
    if (!ctx || typeof ctx !== 'object') return fail('R4-0', '上下文为空');

    var grade = ctx.grade;
    var star = ctx.star;
    var op = q.op;

    if (GRADES.indexOf(grade) < 0) return fail('R4-6', '年级非法：' + grade);
    if (STARS.indexOf(star) < 0) return fail('R4-5', '难度星级非法：' + star);
    if (OPS.indexOf(op) < 0) return fail('R4-0', '运算类型非法：' + op);

    // R4-6 超前概念：年级不允许出现的运算类型
    if (OPS_BY_GRADE[grade].indexOf(op) < 0) {
      return fail('R4-6', '超前概念：' + GRADE_NAME[grade] + '不出现' + OP_NAME[op]);
    }

    var rng = getRange(grade, op, star);
    if (!rng) return fail('R4-5', '无对应数值范围表：' + grade + '/' + op + '/' + star);

    // R4-6 禁止负数 / 小数 / 分数：所有数值必须是非负整数
    var values = [
      { k: 'a', v: q.a },
      { k: 'b', v: q.b },
      { k: 'answer', v: q.answer }
    ];
    if (op === 'rem') values.push({ k: 'remainder', v: q.remainder });
    for (var i = 0; i < values.length; i++) {
      var item = values[i];
      if (!isInt(item.v)) {
        return fail('R4-6', item.k + ' 不是整数：' + item.v);
      }
      if (item.v < 0) {
        return fail('R4-6', item.k + ' 出现负数：' + item.v + '（低年级不学负数）');
      }
    }

    // R4-1 / R4-2 除数不能为 0，且 0÷0 无意义
    if (op === 'div' || op === 'rem') {
      if (q.b === 0) return fail('R4-1', '除数为 0：' + q.a + '÷0 没有意义');
      if (q.a === 0 && q.b === 0) return fail('R4-2', '0÷0 没有意义');
    }

    // 运算关系自洽性
    if (op === 'add' && q.a + q.b !== q.answer) {
      return fail('R4-0', '加法结果不自洽：' + q.a + '+' + q.b + '≠' + q.answer);
    }
    if (op === 'sub') {
      // R4-3 禁止减法结果为负
      if (q.a - q.b < 0) return fail('R4-3', '减法结果为负：' + q.a + '−' + q.b + '<0');
      if (q.a - q.b !== q.answer) {
        return fail('R4-0', '减法结果不自洽：' + q.a + '−' + q.b + '≠' + q.answer);
      }
    }
    if (op === 'mul' && q.a * q.b !== q.answer) {
      return fail('R4-0', '乘法结果不自洽：' + q.a + '×' + q.b + '≠' + q.answer);
    }
    if (op === 'div') {
      if (q.a % q.b !== 0) {
        return fail('R4-0', '除法不能整除：' + q.a + '÷' + q.b);
      }
      if (q.a / q.b !== q.answer) {
        return fail('R4-0', '除法结果不自洽：' + q.a + '÷' + q.b + '≠' + q.answer);
      }
    }
    if (op === 'rem') {
      // R4-4 禁止余数 ≥ 除数；同时余数必须 ≥1（整除属于 div，不属于 rem）
      if (q.remainder < 1) return fail('R4-4', '余数小于 1：' + q.remainder);
      if (q.remainder >= q.b) {
        return fail('R4-4', '余数 ' + q.remainder + ' ≥ 除数 ' + q.b);
      }
      if (q.b * q.answer + q.remainder !== q.a) {
        return fail('R4-0', '有余数除法不自洽：' + q.b + '×' + q.answer + '+' + q.remainder + '≠' + q.a);
      }
    }

    // R4-5 数值范围（R4-7 的合法边界必须在范围表内被允许，故此处只做区间判断）
    if (!inRange(q.a, rng.a)) {
      return fail('R4-5', 'a=' + q.a + ' 超出范围 [' + rng.a[0] + ',' + rng.a[1] + ']');
    }
    if (!inRange(q.b, rng.b)) {
      return fail('R4-5', 'b=' + q.b + ' 超出范围 [' + rng.b[0] + ',' + rng.b[1] + ']');
    }
    if (!inRange(q.answer, rng.res)) {
      return fail('R4-5', '结果=' + q.answer + ' 超出范围 [' + rng.res[0] + ',' + rng.res[1] + ']');
    }
    if (op === 'rem' && !inRange(q.remainder, rng.rem)) {
      return fail('R4-5', '余数=' + q.remainder + ' 超出范围 [' + rng.rem[0] + ',' + rng.rem[1] + ']');
    }

    // 结构性约束：单步运算（不允许两步混合运算）
    if (typeof q.expr === 'string' && q.expr.split(/[+−×÷]/).length > 2) {
      return fail('R4-6', '出现两步及以上混合运算：' + q.expr);
    }

    return pass();
  }

  /**
   * 组内质量断言（R4-8）。
   * @param {Array} list 题目数组
   * @param {Object} ctx {grade, star, size}
   * @returns {{ok: boolean, code: string, reason: string}}
   */
  function assertGroup(list, ctx) {
    if (!list || !list.length) return fail('R4-8', '题目组为空');
    var size = (ctx && ctx.size) || list.length;
    if (list.length !== size) return fail('R4-8', '题目数量不等于 ' + size);

    var seenKey = Object.create(null);
    var answerCount = Object.create(null);
    var giftCount = 0;
    var zeroCount = 0;

    for (var i = 0; i < list.length; i++) {
      var q = list[i];
      var single = assertR4(q, { grade: ctx.grade, star: ctx.star });
      if (!single.ok) return single;

      // 同组去重
      var key = q.op + '|' + q.a + '|' + q.b;
      if (seenKey[key]) return fail('R4-8', '同组出现重复题目：' + key);
      seenKey[key] = true;

      // 相同答案 ≤3 题
      var ansKey = String(q.op) + '#' + String(q.answer);
      answerCount[ansKey] = (answerCount[ansKey] || 0) + 1;
      // 相同答案 ≤3 题（可通过 ctx.maxSameAnswer 覆盖：
      // 大题量 + 答案空间本身就小的组合，3 在数学上不可能，此时按比例放宽）
      var maxSame = (ctx && ctx.maxSameAnswer) ? ctx.maxSameAnswer : 3;
      if (answerCount[ansKey] > maxSame) {
        return fail('R4-8', '相同答案超过 ' + maxSame + ' 题：' + ansKey);
      }

      if (isGift(q)) giftCount++;
      if (isZeroResult(q)) {
        zeroCount++;
        // 0 结果题不出现在前 3 题
        if (i < 3) return fail('R4-8', '0 结果题出现在前 3 题（第 ' + (i + 1) + ' 题）');
      }
    }

    // 首题强制送分题
    if (!isGift(list[0])) return fail('R4-8', '首题不是送分题');
    // 送分题占整组 ≤10%（可通过 ctx.maxGift 覆盖：数学上不可行时由生成器放宽到最小可行值）
    var giftLimit = (ctx && ctx.maxGift) ? ctx.maxGift : Math.max(1, Math.floor(size * 0.1));
    if (giftCount > giftLimit) return fail('R4-8', '送分题超过整组 10%：' + giftCount);
    // 整组 0 结果题 ≤1 道
    if (zeroCount > 1) return fail('R4-8', '0 结果题超过 1 道：' + zeroCount);

    return pass();
  }

  /**
   * 是否为“送分题”（a+1 / a×1 / a÷1 / a−0 / rem 最小情形）。
   * 注意：送分题必须 answer > 0（因为 0 结果题不允许出现在前 3 题，而首题是送分题）。
   * @param {Object} q 题目
   * @returns {boolean}
   */
  function isGift(q) {
    if (!q) return false;
    if (isZeroResult(q)) return false;
    switch (q.op) {
      case 'add': return q.b === 0 || q.b === 1;
      case 'sub': return q.b === 0;
      case 'mul': return q.b === 1;
      case 'div': return q.b === 1 || (q.a === q.b && q.answer === 1);
      case 'rem': return q.remainder === 1 && q.answer <= 2;
      default: return false;
    }
  }

  /**
   * 是否为“0 结果题”（结果为 0）。
   * @param {Object} q 题目
   * @returns {boolean}
   */
  function isZeroResult(q) {
    if (!q) return false;
    return q.answer === 0;
  }

  /**
   * 根据年级 / 难度给出各运算的“描述性范围”，用于 UI 展示。
   * @param {number} grade 年级
   * @param {number} star 难度
   * @returns {Array<{op:string,name:string,text:string}>}
   */
  function describeRanges(grade, star) {
    var ops = OPS_BY_GRADE[grade] || [];
    var out = [];
    for (var i = 0; i < ops.length; i++) {
      var op = ops[i];
      var rng = getRange(grade, op, star);
      if (!rng) continue;
      var text;
      if (op === 'div' || op === 'rem') {
        text = '被除数 ' + rng.a[0] + '–' + rng.a[1] + '，除数 ' + rng.b[0] + '–' + rng.b[1];
      } else {
        text = '两个数都在 ' + rng.a[0] + '–' + rng.a[1] + ' 与 ' + rng.b[0] + '–' + rng.b[1] + ' 之间';
      }
      out.push({ op: op, name: OP_NAME[op], text: text });
    }
    return out;
  }

  KM.Rules = {
    OPS: OPS,
    GRADES: GRADES,
    STARS: STARS,
    OP_SYMBOL: OP_SYMBOL,
    OP_NAME: OP_NAME,
    MODE_NAME: MODE_NAME,
    GRADE_NAME: GRADE_NAME,
    OPS_BY_GRADE: OPS_BY_GRADE,
    RANGE_TABLE: RANGE_TABLE,
    assertR4: assertR4,
    assertGroup: assertGroup,
    getRange: getRange,
    isGift: isGift,
    isZeroResult: isZeroResult,
    describeRanges: describeRanges,
    inRange: inRange,
    isInt: isInt,
    clamp: clamp
  };
})(typeof window !== 'undefined' ? window : globalThis);
