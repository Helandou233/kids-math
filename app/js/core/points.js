/* ============================================================
   points.js —— 积分引擎 / 成长树 / 徽章 / 每日任务
   区分：totalPoints（累计，只增不减，决定等级）与 availablePoints（可用）。
   所有加分都写一条 ledger（含 idempotencyKey）用于防重复计分。
   ============================================================ */
(function (root) {
  'use strict';

  var KM = root.KM = root.KM || {};

  var STATE_KEY = 'state.v1';

  /** 每日获取总上限 */
  var DAILY_CAP = 200;
  /** 看完 L3 讲解的每日加分上限 */
  var L3_DAILY_CAP = 10;

  /** 积分规则表 */
  var REWARD = {
    correct: 1,        // 单题答对
    finishSet: 10,     // 完成一组
    perfectSet: 10,    // 全对额外
    combo3: 2,         // 连对 3
    combo5: 5,         // 连对 5
    combo10: 15,       // 连对 10
    learnKp: 5,        // 学完一个知识点
    readCard: 1,       // 看完一张特例卡
    l3: 1,             // 看完 L3 讲解（每日上限 10）
    sign: 5,           // 签到
    sign3: 10,         // 连续签到 3 天
    sign7: 30,         // 连续签到 7 天
    sign30: 100        // 连续签到 30 天
  };

  /** 成长树 8 级门槛 */
  var LEVEL_THRESHOLDS = [0, 100, 300, 600, 1000, 1500, 2200, 3000];
  var LEVEL_NAMES = [
    '小种子', '发芽啦', '小树苗', '长出叶子', '枝繁叶茂', '开花啦', '结出小果', '大树爷爷'
  ];

  /** 8 枚徽章（全部必须可达） */
  var BADGES = [
    {
      id: 'B-FIRST', name: '第一颗小星星', icon: 'star',
      cond: '答对第 1 道题',
      check: function (s) { return s.correctTotal >= 1; }
    },
    {
      id: 'B-COMBO5', name: '连对 5 连击', icon: 'combo',
      cond: '连着答对 5 道题',
      check: function (s) { return s.bestCombo >= 5; }
    },
    {
      id: 'B-SIGN3', name: '三天小坚持', icon: 'calendar',
      cond: '连续签到 3 天',
      check: function (s) { return s.sign.streak >= 3; }
    },
    {
      id: 'B-KP-ALL', name: '知识点全学会', icon: 'book',
      cond: '学完全部 6 个知识点',
      check: function (s) { return s.learnedKp.length >= 6; }
    },
    {
      id: 'B-CARD-ALL', name: '特例卡收藏家', icon: 'card',
      cond: '看完 9 张特例卡',
      check: function (s) { return s.readCards.length >= 9; }
    },
    {
      id: 'B-P100', name: '百分小达人', icon: 'coin',
      cond: '累计积分达到 100',
      check: function (s) { return s.totalPoints >= 100; }
    },
    {
      id: 'B-SET10', name: '十组小勇士', icon: 'flag',
      cond: '完成 10 组练习',
      check: function (s) { return s.setsDone >= 10; }
    },
    {
      id: 'B-PERFECT', name: '全对小能手', icon: 'crown',
      cond: '一组练习全部答对',
      check: function (s) { return s.perfectSets >= 1; }
    }
  ];

  /** 每日任务（3 个，全部可在当天完成） */
  var DAILY_TASKS = [
    { id: 'T-SET', name: '完成 1 组练习' },
    { id: 'T-CARD', name: '看 1 张特例卡' },
    { id: 'T-CORRECT10', name: '答对 10 道题' }
  ];

  function defaultState() {
    return {
      version: 1,
      updatedAt: 0,
      totalPoints: 0,
      availablePoints: 0,
      ledger: [],
      sign: { lastDate: '', streak: 0, totalDays: 0 },
      learnedKp: [],
      readCards: [],
      setsDone: 0,
      perfectSets: 0,
      bestCombo: 0,
      correctTotal: 0,
      badges: [],
      tasks: { date: '', set: false, card: false, correctCount: 0 },
      daily: { date: '', earned: 0 },
      l3: { date: '', count: 0 },
      wrongBook: [],
      difficulty: {}
    };
  }

  var state = defaultState();

  /* ---------------- 日期工具 ---------------- */
  function pad2(n) { return n < 10 ? '0' + n : String(n); }

  function dateKey(d) {
    var dt = d || new Date();
    return dt.getFullYear() + '-' + pad2(dt.getMonth() + 1) + '-' + pad2(dt.getDate());
  }

  function daysBetween(aKey, bKey) {
    var pa = aKey.split('-');
    var pb = bKey.split('-');
    var da = new Date(Number(pa[0]), Number(pa[1]) - 1, Number(pa[2])).getTime();
    var db = new Date(Number(pb[0]), Number(pb[1]) - 1, Number(pb[2])).getTime();
    return Math.round((db - da) / 86400000);
  }

  /** 跨天时重置每日字段 */
  function ensureToday() {
    var today = dateKey();
    if (state.daily.date !== today) {
      state.daily = { date: today, earned: 0 };
    }
    if (state.tasks.date !== today) {
      state.tasks = { date: today, set: false, card: false, correctCount: 0 };
    }
    if (state.l3.date !== today) {
      state.l3 = { date: today, count: 0 };
    }
  }

  /* ---------------- 持久化 ---------------- */
  function load() {
    var saved = KM.Storage ? KM.Storage.get(STATE_KEY, null) : null;
    state = defaultState();
    if (saved && typeof saved === 'object') {
      for (var k in state) {
        if (Object.prototype.hasOwnProperty.call(state, k) && saved[k] !== undefined && saved[k] !== null) {
          state[k] = saved[k];
        }
      }
    }
    if (typeof state.updatedAt !== 'number' || !(state.updatedAt > 0)) {
      state.updatedAt = Date.now();
    }
    ensureToday();
    return state;
  }

  function save() {
    state.updatedAt = Date.now();
    if (KM.Storage) KM.Storage.set(STATE_KEY, state);
    // 已登录且已配置云端时，防抖上传（account.js）。本地记账永远先行。
    if (KM.Account && KM.Account.syncSoon) {
      try { KM.Account.syncSoon(); } catch (err) { /* 同步失败不影响本地记账 */ }
    }
  }

  function reset() {
    state = defaultState();
    save();
    return state;
  }

  /* ---------------- 加分 ---------------- */
  /**
   * 加积分。
   * @param {string} reason 原因（用于流水展示）
   * @param {number} amount 分值
   * @param {string} idempotencyKey 幂等键（相同 key 只计一次）
   * @returns {{applied:number, capped:boolean, duplicated:boolean, total:number}}
   */
  function add(reason, amount, idempotencyKey) {
    ensureToday();
    amount = Math.max(0, Math.floor(amount || 0));

    // 幂等：同一 key 只计一次
    if (idempotencyKey) {
      for (var i = 0; i < state.ledger.length; i++) {
        if (state.ledger[i].key === idempotencyKey) {
          return { applied: 0, capped: false, duplicated: true, total: state.totalPoints };
        }
      }
    }

    // 每日上限
    var room = DAILY_CAP - state.daily.earned;
    var capped = false;
    if (amount > room) {
      amount = Math.max(0, room);
      capped = true;
    }
    if (amount <= 0) {
      return { applied: 0, capped: true, duplicated: false, total: state.totalPoints };
    }

    state.totalPoints += amount;
    state.availablePoints += amount;
    state.daily.earned += amount;

    state.ledger.push({
      t: Date.now(),
      date: state.daily.date,
      reason: reason,
      amount: amount,
      key: idempotencyKey || ('auto:' + Date.now() + ':' + state.ledger.length)
    });
    if (state.ledger.length > 300) {
      state.ledger = state.ledger.slice(state.ledger.length - 300);
    }

    checkBadges();
    save();
    return { applied: amount, capped: capped, duplicated: false, total: state.totalPoints };
  }

  /** 今日已获得积分 */
  function todayEarned() {
    ensureToday();
    return state.daily.earned;
  }

  /** 每日上限剩余额度 */
  function todayRoom() {
    return Math.max(0, DAILY_CAP - todayEarned());
  }

  /* ---------------- 等级 / 成长树 ---------------- */
  function levelIndex(total) {
    var t = (total === undefined || total === null) ? state.totalPoints : total;
    var lv = 0;
    for (var i = 0; i < LEVEL_THRESHOLDS.length; i++) {
      if (t >= LEVEL_THRESHOLDS[i]) lv = i;
    }
    return lv;
  }

  function levelInfo() {
    var lv = levelIndex();
    var cur = LEVEL_THRESHOLDS[lv];
    var next = (lv + 1 < LEVEL_THRESHOLDS.length) ? LEVEL_THRESHOLDS[lv + 1] : null;
    var progress = 1;
    if (next !== null && next > cur) {
      progress = Math.max(0, Math.min(1, (state.totalPoints - cur) / (next - cur)));
    }
    return {
      level: lv + 1,
      index: lv,
      name: LEVEL_NAMES[lv],
      current: cur,
      next: next,
      progress: progress,
      total: state.totalPoints
    };
  }

  /* ---------------- 徽章 ---------------- */
  /**
   * 检查并颁发徽章。
   * @returns {Array} 本次新颁发的徽章对象
   */
  function checkBadges() {
    var newly = [];
    for (var i = 0; i < BADGES.length; i++) {
      var b = BADGES[i];
      if (state.badges.indexOf(b.id) >= 0) continue;
      var ok = false;
      try {
        ok = !!b.check(state);
      } catch (err) {
        ok = false;
        if (root.console && root.console.error) {
          root.console.error('[KM.Points] 徽章判定出错：', b.id, err && err.message);
        }
      }
      if (ok) {
        state.badges.push(b.id);
        newly.push(b);
      }
    }
    return newly;
  }

  /**
   * 返回全部 8 枚徽章（含达成状态）。
   * @returns {Array<{id,name,icon,cond,unlocked:boolean}>}
   */
  function badgeList() {
    checkBadges();
    var out = [];
    for (var i = 0; i < BADGES.length; i++) {
      var b = BADGES[i];
      out.push({
        id: b.id,
        name: b.name,
        icon: b.icon,
        cond: b.cond,
        unlocked: state.badges.indexOf(b.id) >= 0
      });
    }
    return out;
  }

  /* ---------------- 每日任务 ---------------- */
  function taskList() {
    ensureToday();
    var t = state.tasks;
    return [
      { id: 'T-SET', name: DAILY_TASKS[0].name, done: !!t.set, progress: t.set ? '已完成' : '还没开始' },
      { id: 'T-CARD', name: DAILY_TASKS[1].name, done: !!t.card, progress: t.card ? '已完成' : '还没开始' },
      {
        id: 'T-CORRECT10',
        name: DAILY_TASKS[2].name,
        done: t.correctCount >= 10,
        progress: Math.min(t.correctCount, 10) + ' / 10'
      }
    ];
  }

  /* ---------------- 行为记录 ---------------- */
  /** 答对一道题 */
  function recordCorrect() {
    ensureToday();
    state.correctTotal += 1;
    state.tasks.correctCount += 1;
    var r = add('答对 1 道题', REWARD.correct, null);
    checkBadges();
    save();
    return r;
  }

  /** 记录连对（在达到 3 / 5 / 10 时给奖励） */
  function recordCombo(combo) {
    var gained = 0;
    if (combo === 3) gained = REWARD.combo3;
    else if (combo === 5) gained = REWARD.combo5;
    else if (combo === 10) gained = REWARD.combo10;
    if (!gained) return { applied: 0, combo: combo };
    var r = add('连对 ' + combo + ' 题', gained, null);
    return { applied: r.applied, combo: combo };
  }

  /** 更新最佳连对记录 */
  function updateBestCombo(combo) {
    if (combo > state.bestCombo) {
      state.bestCombo = combo;
      save();
    }
    return state.bestCombo;
  }

  /**
   * 完成一组练习。
   * @param {Object} info {correct:number, total:number}
   * @returns {{setApplied:number, perfectApplied:number, newStar:number}}
   */
  function finishSet(info) {
    ensureToday();
    var correct = info.correct || 0;
    var total = info.total || 10;
    state.setsDone += 1;
    state.tasks.set = true;
    var setRes = add('完成 1 组练习', REWARD.finishSet, null);
    var perfectRes = { applied: 0 };
    if (total > 0 && correct === total) {
      state.perfectSets += 1;
      perfectRes = add('这一组全对啦', REWARD.perfectSet, null);
    }
    checkBadges();
    save();
    return {
      setApplied: setRes.applied,
      perfectApplied: perfectRes.applied,
      newStar: state.setsDone
    };
  }

  /** 学完一个知识点（+5） */
  function learnKp(id) {
    ensureToday();
    var first = state.learnedKp.indexOf(id) < 0;
    if (first) state.learnedKp.push(id);
    var r = { applied: 0 };
    if (first) r = add('学完知识点 ' + id, REWARD.learnKp, 'kp:' + id);
    checkBadges();
    save();
    return r;
  }

  /** 看完一张特例卡（+1） */
  function readCard(id) {
    ensureToday();
    var first = state.readCards.indexOf(id) < 0;
    if (first) state.readCards.push(id);
    state.tasks.card = true;
    var r = { applied: 0 };
    if (first) r = add('看完特例卡 ' + id, REWARD.readCard, 'card:' + id);
    checkBadges();
    save();
    return r;
  }

  /** 看完 L3 讲解（+1，每日上限 10） */
  function readL3(questionId) {
    ensureToday();
    if (state.l3.count >= L3_DAILY_CAP) {
      return { applied: 0, capped: true };
    }
    var r = add('看了一次完整讲解', REWARD.l3, 'l3:' + state.l3.date + ':' + questionId);
    if (r.applied > 0) state.l3.count += 1;
    save();
    return { applied: r.applied, capped: false };
  }

  /** 记录一道错题（本地错题本） */
  function addWrong(q) {
    if (!q) return;
    state.wrongBook.push({
      t: Date.now(),
      op: q.op,
      a: q.a,
      b: q.b,
      answer: q.answer,
      remainder: q.remainder,
      display: q.display,
      grade: q.grade,
      star: q.star
    });
    if (state.wrongBook.length > 100) {
      state.wrongBook = state.wrongBook.slice(state.wrongBook.length - 100);
    }
    save();
  }

  /**
   * 今日签到。
   * @returns {{ok:boolean, already:boolean, streak:number, applied:number}}
   */
  function signIn() {
    ensureToday();
    var today = dateKey();
    if (state.sign.lastDate === today) {
      return { ok: false, already: true, streak: state.sign.streak, applied: 0 };
    }
    var gap = state.sign.lastDate ? daysBetween(state.sign.lastDate, today) : 0;
    state.sign.streak = (gap === 1) ? state.sign.streak + 1 : 1;
    state.sign.lastDate = today;
    state.sign.totalDays += 1;

    var r = add('今日签到', REWARD.sign, 'sign:' + today);
    var total = r.applied;
    if (state.sign.streak % 30 === 0) total += add('连续签到 30 天', REWARD.sign30, 'sign30:' + today).applied;
    else if (state.sign.streak % 7 === 0) total += add('连续签到 7 天', REWARD.sign7, 'sign7:' + today).applied;
    else if (state.sign.streak % 3 === 0) total += add('连续签到 3 天', REWARD.sign3, 'sign3:' + today).applied;

    checkBadges();
    save();
    return { ok: true, already: false, streak: state.sign.streak, applied: total };
  }

  function isSignedToday() {
    ensureToday();
    return state.sign.lastDate === dateKey();
  }

  /* ---------------- 难度自适应 ---------------- */
  function diffKey(grade, mode) {
    return grade + '|' + mode;
  }

  function suggestStar(grade, mode) {
    var v = state.difficulty[diffKey(grade, mode)];
    return (v === 1 || v === 2 || v === 3) ? v : 1;
  }

  function setStar(grade, mode, star) {
    star = Math.max(1, Math.min(3, Math.round(star)));
    state.difficulty[diffKey(grade, mode)] = star;
    save();
    return star;
  }

  /**
   * 根据正确率调整难度：≥85% 升 1 星（≤3），≤50% 降 1 星（≥1）。
   * @returns {number} 调整后的星级
   */
  function adaptStar(grade, mode, accuracy) {
    var cur = suggestStar(grade, mode);
    var next = cur;
    if (accuracy >= 0.85) next = cur + 1;
    else if (accuracy <= 0.5) next = cur - 1;
    next = Math.max(1, Math.min(3, next));
    return setStar(grade, mode, next);
  }

  /**
   * 用云端合并后的状态整体替换当前状态（账号云同步专用）。
   * @param {Object} nextState 完整状态对象
   * @returns {Object} 替换后的状态
   */
  function replace(nextState) {
    if (!nextState || typeof nextState !== 'object') return state;
    var fresh = defaultState();
    for (var k in fresh) {
      if (Object.prototype.hasOwnProperty.call(fresh, k) &&
          nextState[k] !== undefined && nextState[k] !== null) {
        fresh[k] = nextState[k];
      }
    }
    state = fresh;
    ensureToday();
    save();
    return state;
  }

  /* ---------------- 导出 ---------------- */
  KM.Points = {
    DAILY_CAP: DAILY_CAP,
    L3_DAILY_CAP: L3_DAILY_CAP,
    REWARD: REWARD,
    LEVEL_THRESHOLDS: LEVEL_THRESHOLDS,
    LEVEL_NAMES: LEVEL_NAMES,
    BADGES: BADGES,
    DAILY_TASKS: DAILY_TASKS,
    load: load,
    save: save,
    reset: reset,
    replace: replace,
    state: function () { return state; },
    add: add,
    todayEarned: todayEarned,
    todayRoom: todayRoom,
    levelIndex: levelIndex,
    levelInfo: levelInfo,
    checkBadges: checkBadges,
    badgeList: badgeList,
    taskList: taskList,
    recordCorrect: recordCorrect,
    recordCombo: recordCombo,
    updateBestCombo: updateBestCombo,
    finishSet: finishSet,
    learnKp: learnKp,
    readCard: readCard,
    readL3: readL3,
    addWrong: addWrong,
    signIn: signIn,
    isSignedToday: isSignedToday,
    suggestStar: suggestStar,
    setStar: setStar,
    adaptStar: adaptStar,
    dateKey: dateKey
  };
})(typeof window !== 'undefined' ? window : globalThis);
