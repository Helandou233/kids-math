/* ============================================================
   hints.js —— 三级提示模板（结构化数据）
   全部为内置模板 + 占位符替换，禁止在运行时拼装句子。
   每个模板集都必须带 sourceRef（教材口径）。
   ============================================================ */
(function (root) {
  'use strict';

  var KM = root.KM = root.KM || {};

  /**
   * 模板占位符替换：把 "{a}" 这样的占位符替换为 params 中对应的值。
   * @param {string} tpl 模板
   * @param {Object} params 参数表
   * @returns {string}
   */
  function format(tpl, params) {
    return String(tpl).replace(/\{(\w+)\}/g, function (m, name) {
      return Object.prototype.hasOwnProperty.call(params, name) ? String(params[name]) : m;
    });
  }

  /* ------------------------------------------------------------
     提示模板集
     l1：方向提示（不给答案）
     l2：步骤提示（拆开算式）
     l3：完整讲解（揭晓答案 + 一句话讲解 + 引导看知识点动画）
     ------------------------------------------------------------ */
  var HINT_SETS = {
    addPlain: {
      sourceRef: '人教版一上·10以内加减法',
      relatedKp: 'KP-ADD',
      l1: '先记住 {a}，再往后数 {b} 个，看看最后数到几？',
      l2: '{a} + {b} = ? 摆一摆小棒：先摆 {a} 根，再添上 {b} 根，合在一起数一数。',
      l3: '{a} + {b} = {ans}。把两部分合起来，求一共是多少，用加法。'
    },
    addCarry: {
      sourceRef: '人教版一上·20以内的进位加法',
      relatedKp: 'KP-CARRY',
      l1: '{a} + {b}，把 {b} 分出 {split} 给 {a}，先凑成 {ten} 试试～',
      l2: '{a} + {b} = {a} + {split} + {rest} = {ten} + {rest}，{ten} + {rest} 是多少？',
      l3: '{a} + {b} = {ans}。凑十法：{a} 补上 {split} 凑成 {ten}，再加剩下的 {rest}，{ten} + {rest} = {ans}。'
    },
    subPlain: {
      sourceRef: '人教版一上·10以内加减法',
      relatedKp: 'KP-SUB',
      l1: '从 {a} 开始往回数 {b} 个，看看停在几？',
      l2: '{a} − {b} = ? 用小棒摆 {a} 根，拿走 {b} 根，数一数还剩几根。',
      l3: '{a} − {b} = {ans}。从总数里去掉一部分，求剩下多少，用减法。'
    },
    subBorrow: {
      sourceRef: '人教版一下·20以内的退位减法',
      relatedKp: 'KP-SUB',
      l1: '{a} − {b}，个位 {au} 比 {bu} 小，要从十位借 1 当 10 再减哦～',
      l2: '{a} − {b} = {a} − {b1} − {b2} = {a0} − {b2}，{a0} − {b2} 是多少？',
      l3: '{a} − {b} = {ans}。个位不够减，从十位借 1 当 10：{a0} − {b2} = {ans}。'
    },
    mulTable: {
      sourceRef: '人教版二上·表内乘法（一）',
      relatedKp: 'KP-MUL',
      l1: '{a} × {b} 就是 {a} 个 {b}。画 {a} 行、每行 {b} 个的点阵，数一数一共多少？',
      l2: '{a} × {b} = {b} + {b} + …（一共 {a} 个 {b} 相加），合起来是多少？',
      // 乘数为 1 时的分支模板：不能写成「b + b + …」再说是「1 个 b」，
      // 否则画面上两个加数与文字自相矛盾，直接破坏「乘法 = 几个几相加」的概念。
      l2WhenA1: '{a} × {b} 就是 {a} 个 {b} 相加，这里只有 {b} 这一个加数哦。{a} 个 {b} 合起来是多少？',
      l3: '{a} × {b} = {ans}。几个相同的数相加，用乘法算更快。'
    },
    mul2x1: {
      sourceRef: '人教版三上·多位数乘一位数',
      relatedKp: 'KP-MUL',
      l1: '把 {a} 分成整十 {tens} 和个位 {units}，分别去乘 {b}，再把两次的结果合起来～',
      l2: '{a} × {b} = {tens} × {b} + {units} × {b} = {p1} + {p2}，{p1} + {p2} 是多少？',
      l3: '{a} × {b} = {ans}。{tens} × {b} = {p1}，{units} × {b} = {p2}，{p1} + {p2} = {ans}。'
    },
    divTable: {
      sourceRef: '人教版二下·表内除法（一）',
      relatedKp: 'KP-DIV',
      l1: '想乘法：{b} × 几 = {a}？用乘法口诀找一找～',
      l2: '{a} ÷ {b} = ? 就想 {b} × ? = {a}，几乘 {b} 正好等于 {a}？',
      l3: '{a} ÷ {b} = {ans}。因为 {b} × {ans} = {a}。除法和乘法是一对好朋友。'
    },
    div2x1: {
      sourceRef: '人教版三下·除数是一位数的除法',
      relatedKp: 'KP-DIV',
      l1: '想：{b} 乘几最接近 {a}？先从整十的数试一试～',
      l2: '{a} ÷ {b} = ? 把 {a} 平均分成 {b} 份，用 {b} 的乘法口诀试一试，几乘 {b} 最接近 {a}？',
      l3: '{a} ÷ {b} = {ans}。检验：{b} × {ans} = {a}。平均分，每份是 {ans}。'
    },
    rem: {
      sourceRef: '人教版二下·有余数的除法',
      relatedKp: 'KP-REM',
      l1: '把 {a} 个平均分成 {b} 份，每份一样多；看看最后剩下几个不够再分一份～',
      l2: '想 {b} 的乘法口诀，找一个最接近 {a}、又不超过 {a} 的数：{b} × {q} = {prod}；再用 {a} − {prod} 算余数，是多少？',
      l3: '{a} ÷ {b} = {q} …… {r}。因为 {b} × {q} = {prod}，{a} − {prod} = {r}，余数 {r} 比除数 {b} 小。'
    }
  };

  /**
   * 根据题目计算模板参数。
   * @param {string} kind 提示类型
   * @param {Object} q 题目对象
   * @returns {Object} 参数表
   */
  function paramsFor(kind, q) {
    var a = q.a;
    var b = q.b;
    var ans = q.answer;
    var p = { a: a, b: b, ans: ans };
    var split, rest, ten, au, bu, b1, b2, a0;
    switch (kind) {
      case 'addCarry':
        split = 10 - (a % 10);
        rest = b - split;
        ten = a + split;
        p.split = split;
        p.rest = rest;
        p.ten = ten;
        break;
      case 'subBorrow':
        au = a % 10;
        bu = b % 10;
        b1 = au;
        b2 = b - b1;
        a0 = a - b1;
        p.au = au;
        p.bu = bu;
        p.b1 = b1;
        p.b2 = b2;
        p.a0 = a0;
        break;
      case 'mul2x1':
        p.tens = Math.floor(a / 10) * 10;
        p.units = a % 10;
        p.p1 = p.tens * b;
        p.p2 = p.units * b;
        break;
      case 'rem':
        p.q = ans;
        p.r = q.remainder;
        p.prod = b * ans;
        break;
      default:
        break;
    }
    return p;
  }

  /**
   * 取某个提示类型的三级提示文本。
   * @param {string} kind 提示类型
   * @param {Object} q 题目对象
   * @returns {{l1:string,l2:string,l3:string,sourceRef:string,relatedKp:string}}
   */
  function build(kind, q) {
    var validKind = Object.prototype.hasOwnProperty.call(HINT_SETS, kind) ? kind : 'addPlain';
    var set = HINT_SETS[validKind];
    var params = paramsFor(validKind, q);
    // 分支模板：乘数为 1 时「几个几相加」的写法必须换成专用模板，避免自相矛盾
    var l2 = (set.l2WhenA1 && params.a === 1) ? set.l2WhenA1 : set.l2;
    return {
      kind: validKind,
      l1: format(set.l1, params),
      l2: format(l2, params),
      l3: format(set.l3, params),
      sourceRef: set.sourceRef,
      relatedKp: set.relatedKp
    };
  }

  /**
   * 校验：所有提示模板集都必须有 sourceRef。
   * @returns {Array<string>} 缺失 sourceRef 的 kind 列表
   */
  function validate() {
    var missing = [];
    for (var kind in HINT_SETS) {
      if (!Object.prototype.hasOwnProperty.call(HINT_SETS, kind)) continue;
      var set = HINT_SETS[kind];
      if (!set.sourceRef || typeof set.sourceRef !== 'string' || !set.sourceRef.length) {
        missing.push(kind);
      }
    }
    return missing;
  }

  KM.Hints = {
    HINT_SETS: HINT_SETS,
    format: format,
    build: build,
    paramsFor: paramsFor,
    validate: validate
  };
})(typeof window !== 'undefined' ? window : globalThis);
