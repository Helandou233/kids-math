/* ============================================================
   knowledge.js —— 内置结构化知识数据
   6 个知识点 + 9 张特例卡。
   所有条目必须带 sourceRef（人教版 / 北师大版小学教材口径）；
   启动时由 validate() 校验，缺失 sourceRef 的条目不允许渲染。
   ============================================================ */
(function (root) {
  'use strict';

  var KM = root.KM = root.KM || {};

  /* ------------------------------------------------------------
     一、知识点（6 个）
     anim 字段对应 js/ui/animations.js 中的动画 key。
     ------------------------------------------------------------ */
  var KNOWLEDGE_POINTS = [
    {
      id: 'KP-ADD',
      order: 1,
      title: '加法的意义',
      subtitle: '把两部分合起来，用加法',
      sourceRef: '人教版一上·10以内加减法',
      story: '左边有 3 个小球，右边有 2 个小球。把它们合在一起，就是 3 + 2 = 5。',
      formula: '3 + 2 = 5',
      keyPoint: '把两部分合起来，求一共是多少，用加法计算。',
      anim: 'add',
      animParam: { left: 3, right: 2 },
      readAloud: '三加二等于五'
    },
    {
      id: 'KP-SUB',
      order: 2,
      title: '减法的意义',
      subtitle: '从整体里去掉一部分',
      sourceRef: '人教版一上·10以内加减法',
      story: '一共有 6 个小球，去掉 2 个，还剩下 4 个。也就是 6 − 2 = 4。',
      formula: '6 − 2 = 4',
      keyPoint: '从总数里去掉一部分，求剩下多少，用减法计算。',
      anim: 'sub',
      animParam: { total: 6, take: 2 },
      readAloud: '六减二等于四'
    },
    {
      id: 'KP-MUL',
      order: 3,
      title: '乘法的意义',
      subtitle: '几个几相加，用乘法',
      sourceRef: '人教版二上·表内乘法（一）',
      story: '每行有 4 个圆点，一共有 3 行，就是 3 个 4：4 + 4 + 4 = 12，写成 3 × 4 = 12。',
      formula: '3 × 4 = 12',
      keyPoint: '求几个相同加数的和，用乘法算更简便；3 个 4 可以写成 3 × 4，也可以写成 4 × 3。',
      anim: 'mul',
      animParam: { rows: 3, cols: 4 },
      readAloud: '三乘四等于十二'
    },
    {
      id: 'KP-DIV',
      order: 4,
      title: '除法的意义',
      subtitle: '平均分，每份一样多',
      sourceRef: '人教版二下·表内除法（一）',
      story: '把 12 个苹果平均分到 3 个盘子里，一个一个地分，每盘最后都是 4 个：12 ÷ 3 = 4。',
      formula: '12 ÷ 3 = 4',
      keyPoint: '把一些东西平均分成几份，求每份是多少，用除法计算；平均分就是每份一样多。',
      anim: 'div',
      animParam: { total: 12, plates: 3 },
      readAloud: '十二除以三等于四'
    },
    {
      id: 'KP-REM',
      order: 5,
      title: '有余数的除法',
      subtitle: '分不完，剩下的叫余数',
      sourceRef: '人教版二下·有余数的除法',
      story: '把 14 个苹果平均分到 4 个盘子里，每盘放 3 个，还剩 2 个不够再分一份，这 2 个就是余数：14 ÷ 4 = 3 …… 2。',
      formula: '14 ÷ 4 = 3 …… 2',
      keyPoint: '平均分后有剩余，剩下的部分叫余数。余数一定要比除数小，否则还可以再分一份。',
      anim: 'rem',
      animParam: { total: 14, plates: 4 },
      readAloud: '十四除以四等于三余二'
    },
    {
      id: 'KP-CARRY',
      order: 6,
      title: '凑十法',
      subtitle: '20 以内进位加法',
      sourceRef: '人教版一上·20以内的进位加法',
      story: '算 9 + 5：9 再添 1 就凑成 10，所以从 5 里面分出 1 个给 9，10 号房子装满啦，外面还剩 4 个，10 + 4 = 14。',
      formula: '9 + 5 = 14',
      keyPoint: '凑十法：把小的数分开，先把大的数补成 10，再加上剩下的部分。',
      anim: 'carry',
      animParam: { big: 9, small: 5 },
      readAloud: '九加五等于十四'
    }
  ];

  /* ------------------------------------------------------------
     二、特例卡（9 张）
     每张：❌错误说法 → ✅正确说法 → 一句话解释 → 一句记忆口诀
     ------------------------------------------------------------ */
  var SPECIAL_CASES = [
    {
      id: 'SC-01',
      order: 1,
      title: '除数不能是 0',
      sourceRef: '人教版二下·表内除法（一）',
      wrong: '5 ÷ 0 = 0',
      right: '5 ÷ 0 没有意义，不能这样算',
      explain: '除法是“平均分”。要分成 0 份，这件事本身没法做，所以除数不能是 0。',
      chant: '除数不能是零蛋，看到零除数要躲开！'
    },
    {
      id: 'SC-02',
      order: 2,
      title: '0 除以任何不是 0 的数',
      sourceRef: '人教版二下·表内除法（二）',
      wrong: '0 ÷ 5 = 5',
      right: '0 ÷ 5 = 0',
      explain: '一个东西都没有，不管平均分成几份，每份还是 0 个。',
      chant: '零来平均分，每份还是零；只要除数不是零，答案就写零。'
    },
    {
      id: 'SC-03',
      order: 3,
      title: '任何数乘 0',
      sourceRef: '人教版二上·表内乘法（一）',
      wrong: '7 × 0 = 7',
      right: '7 × 0 = 0',
      explain: '7 × 0 表示 0 个 7，什么都没有，结果就是 0。',
      chant: '乘零就像变魔术，再大的数也变零。'
    },
    {
      id: 'SC-04',
      order: 4,
      title: '加 0、减 0 都不变',
      sourceRef: '人教版一上·10以内加减法',
      wrong: '8 + 0 = 0，8 − 0 = 0',
      right: '8 + 0 = 8，8 − 0 = 8',
      explain: '加上 0 就是什么也没加，减去 0 就是什么也没减，原数不变。',
      chant: '加减遇到零，原数不变形。'
    },
    {
      id: 'SC-05',
      order: 5,
      title: '乘 1、除以 1 都不变',
      sourceRef: '人教版二上·表内乘法（一）',
      wrong: '6 × 1 = 1，6 ÷ 1 = 1',
      right: '6 × 1 = 6，6 ÷ 1 = 6',
      explain: '1 个 6 还是 6；平均分成 1 份，还是原来那一整份。',
      chant: '乘一除一是镜子，照出来的还是自己。'
    },
    {
      id: 'SC-06',
      order: 6,
      title: '减法里不能减更大的数',
      sourceRef: '人教版一下·20以内的退位减法',
      wrong: '3 − 5 = 2',
      right: '3 − 5 现在还算不了（低年级不学负数）',
      explain: '总共只有 3 个，不可能去掉 5 个。减法里减掉的数不能比原来的数大。',
      chant: '小的减大的，暂时算不了；先看看谁更大。'
    },
    {
      id: 'SC-07',
      order: 7,
      title: '余数一定要比除数小',
      sourceRef: '人教版二下·有余数的除法',
      wrong: '14 ÷ 4 = 2 …… 6',
      right: '14 ÷ 4 = 3 …… 2（余数 2 < 除数 4）',
      explain: '如果余数还比除数大，说明还能再分一份，那就不是最后的余数啦。',
      chant: '余数比除数小，不然还能再分到！'
    },
    {
      id: 'SC-08',
      order: 8,
      title: '加法乘法能交换，减法除法不能',
      sourceRef: '人教版二上·表内乘法（一）',
      wrong: '5 − 3 = 3 − 5，6 ÷ 3 = 3 ÷ 6',
      right: '3 + 5 = 5 + 3，3 × 5 = 5 × 3；但 5 − 3 ≠ 3 − 5，6 ÷ 3 ≠ 3 ÷ 6',
      explain: '加法和乘法交换两个数的位置，结果不变；减法和除法交换位置，意思就变了。',
      chant: '加减乘除四兄弟，只有加乘能换位；减除换位要出事。'
    },
    {
      id: 'SC-09',
      order: 9,
      title: '加法减法互为逆运算，乘法除法互为逆运算',
      sourceRef: '人教版二下·表内除法（一）',
      wrong: '算 12 ÷ 3 就跟 3 + 12 一样',
      right: '想 12 ÷ 3 等于几，就想“3 乘几等于 12”',
      explain: '加法可以用减法检查，乘法可以用除法检查，它们是互相“倒着来”的一对。',
      chant: '加减一对好朋友，乘除一对好搭档；算完还能倒着查。'
    }
  ];

  /**
   * 校验所有内容条目是否带 sourceRef。
   * 返回缺失 sourceRef 的条目列表（正常情况下应为空数组）。
   * @returns {Array<{kind:string,id:string}>}
   */
  function validate() {
    var missing = [];
    var i;
    for (i = 0; i < KNOWLEDGE_POINTS.length; i++) {
      var kp = KNOWLEDGE_POINTS[i];
      if (!kp.sourceRef || typeof kp.sourceRef !== 'string' || !kp.sourceRef.length) {
        missing.push({ kind: 'knowledge', id: kp.id });
      }
    }
    for (i = 0; i < SPECIAL_CASES.length; i++) {
      var sc = SPECIAL_CASES[i];
      if (!sc.sourceRef || typeof sc.sourceRef !== 'string' || !sc.sourceRef.length) {
        missing.push({ kind: 'specialCase', id: sc.id });
      }
    }
    return missing;
  }

  /**
   * 返回允许渲染的条目（自动过滤掉无 sourceRef 的条目）。
   * @param {string} kind 'knowledge' | 'specialCase'
   * @returns {Array}
   */
  function renderable(kind) {
    var source = kind === 'specialCase' ? SPECIAL_CASES : KNOWLEDGE_POINTS;
    var out = [];
    for (var i = 0; i < source.length; i++) {
      var item = source[i];
      if (item.sourceRef && typeof item.sourceRef === 'string' && item.sourceRef.length) {
        out.push(item);
      } else if (root.console && root.console.error) {
        root.console.error('[KM.Knowledge] 条目缺少 sourceRef，已跳过渲染：', kind, item.id);
      }
    }
    return out;
  }

  function findKnowledge(id) {
    for (var i = 0; i < KNOWLEDGE_POINTS.length; i++) {
      if (KNOWLEDGE_POINTS[i].id === id) return KNOWLEDGE_POINTS[i];
    }
    return null;
  }

  function findSpecialCase(id) {
    for (var i = 0; i < SPECIAL_CASES.length; i++) {
      if (SPECIAL_CASES[i].id === id) return SPECIAL_CASES[i];
    }
    return null;
  }

  KM.Knowledge = {
    KNOWLEDGE_POINTS: KNOWLEDGE_POINTS,
    SPECIAL_CASES: SPECIAL_CASES,
    validate: validate,
    renderable: renderable,
    findKnowledge: findKnowledge,
    findSpecialCase: findSpecialCase
  };
})(typeof window !== 'undefined' ? window : globalThis);
