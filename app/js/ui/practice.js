/* ============================================================
   practice.js —— 练一练
   选择（运算 / 年级 / 难度）→ 10 题 → 结算
   答对 ≤300ms 反馈 + 上行三音；答错给柔和提示 + 三级「帮帮我」。
   ============================================================ */
(function (root) {
  'use strict';

  var KM = root.KM = root.KM || {};

  var SET_SIZE = 10;
  var AUTO_STAR = 0;          // 0 表示“自动难度”

  /** 选择状态（持久化在内存中，重新进入保留上次选择） */
  var setup = {
    grade: 1,
    mode: 'add',
    star: AUTO_STAR
  };

  /** 当前一组练习 */
  var session = null;

  /**
   * 提交后的防连点锁定时器句柄。
   * 必须保存句柄：翻页时要立刻释放，否则锁会跨题生效，
   * 孩子「答完立刻点下一题再立刻作答」时整题点击会被吞掉。
   */
  var guardTimer = null;

  /** 释放防连点锁（翻页 / 结算 / 开新一组时调用） */
  function releaseGuard(s) {
    if (guardTimer) {
      clearTimeout(guardTimer);
      guardTimer = null;
    }
    if (s) s.locked = false;
  }

  /** 开启 500ms 防连点锁 */
  function armGuard(s) {
    if (guardTimer) {
      clearTimeout(guardTimer);
      guardTimer = null;
    }
    s.locked = true;
    guardTimer = setTimeout(function () {
      guardTimer = null;
      if (session) session.locked = false;
    }, 500);
  }

  /** 运算模式按钮定义 */
  var MODES = [
    { key: 'add', name: '加法' },
    { key: 'sub', name: '减法' },
    { key: 'mul', name: '乘法' },
    { key: 'div', name: '除法' },
    { key: 'rem', name: '有余数' },
    { key: 'mix', name: '混合' }
  ];

  function allowedModes(grade) {
    return (KM.Rules.OPS_BY_GRADE[grade] || []).concat(['mix']);
  }

  function resolveStar() {
    if (setup.star !== AUTO_STAR) return setup.star;
    return KM.Points.suggestStar(setup.grade, setup.mode);
  }

  /* ============================================================
     入口
     ============================================================ */
  function render(rootEl) {
    if (!session) return renderSetup(rootEl);
    if (session.finished) return renderResult(rootEl);
    return renderQuiz(rootEl);
  }

  /* ============================================================
     1. 选择页
     ============================================================ */
  function renderSetup(rootEl) {
    var D = KM.Dom;
    D.clear(rootEl);
    var page = D.el('div', 'km-page');
    page.appendChild(D.topbar({ title: '练一练', onBack: function () { KM.App.go('home'); }, right: 'sound' }));

    // —— 年级 ——
    page.appendChild(D.el('div', 'km-section__title', D.icon('book', 24) + ' 选年级'));
    var gradeRow = D.el('div', 'km-chiprow');
    KM.Rules.GRADES.forEach(function (g) {
      var b = D.el('button', 'km-chip' + (setup.grade === g ? ' is-on' : ''), KM.Rules.GRADE_NAME[g]);
      D.on(b, 'click', function () {
        setup.grade = g;
        if (allowedModes(g).indexOf(setup.mode) < 0) setup.mode = 'add';
        KM.Audio.playTap();
        renderSetup(rootEl);
      });
      gradeRow.appendChild(b);
    });
    page.appendChild(gradeRow);

    // —— 运算类型 ——
    page.appendChild(D.el('div', 'km-section__title km-mt-22', D.icon('target', 24) + ' 选运算'));
    var modeRow = D.el('div', 'km-chiprow');
    var allowed = allowedModes(setup.grade);
    MODES.forEach(function (m) {
      var ok = allowed.indexOf(m.key) >= 0;
      var b = D.el('button', 'km-chip' + (setup.mode === m.key ? ' is-on' : '') + (ok ? '' : ' is-off'),
        m.name + (ok ? '' : '（还没学）'));
      if (ok) {
        D.on(b, 'click', function () {
          setup.mode = m.key;
          KM.Audio.playTap();
          renderSetup(rootEl);
        });
      }
      modeRow.appendChild(b);
    });
    page.appendChild(modeRow);

    // —— 难度 ——
    page.appendChild(D.el('div', 'km-section__title km-mt-22', D.icon('star', 24) + ' 选难度'));
    var starRow = D.el('div', 'km-chiprow');
    var starOpts = [
      { v: AUTO_STAR, t: '自动' },
      { v: 1, t: '1 星' },
      { v: 2, t: '2 星' },
      { v: 3, t: '3 星' }
    ];
    starOpts.forEach(function (o) {
      var b = D.el('button', 'km-chip' + (setup.star === o.v ? ' is-on' : ''), o.t);
      D.on(b, 'click', function () {
        setup.star = o.v;
        KM.Audio.playTap();
        renderSetup(rootEl);
      });
      starRow.appendChild(b);
    });
    page.appendChild(starRow);

    // —— 难度说明 ——
    var star = resolveStar();
    var infoCard = D.el('div', 'km-card km-mt-14');
    var ranges = KM.Rules.describeRanges(setup.grade, star);
    var lines = ranges.map(function (r) {
      return '<div style="font-size:16px;">· ' + D.esc(r.name) + '：' + D.esc(r.text) + '</div>';
    }).join('');
    infoCard.innerHTML =
      '<div style="font-size:18px;font-weight:900;margin-bottom:6px;">' +
      KM.Rules.GRADE_NAME[setup.grade] + ' · ' + KM.Rules.MODE_NAME[setup.mode] + ' · ' +
      (setup.star === AUTO_STAR ? ('自动 ' + star + ' 星') : (star + ' 星')) + '</div>' + lines +
      '<div class="km-muted km-mt-8">每组 ' + SET_SIZE + ' 道题，做完得 10 分；全对再得 10 分。</div>';
    page.appendChild(infoCard);

    // —— 开始 ——
    var start = D.el('button', 'km-btn km-btn--block km-btn--lg km-mt-22', '开始练习 →');
    D.on(start, 'click', function () { startSet(rootEl); });
    page.appendChild(start);

    rootEl.appendChild(page);
  }

  /** 出题失败时的降级题量顺序 */
  var SIZE_FALLBACKS = [10, 8, 6, 5];

  /**
   * 安全生成题目组：依次尝试 [10, 8, 6, 5]，只接受 ok:true 的结果。
   * 全部失败时返回 {ok:false}，调用方必须提示用户，绝不使用不合法题目。
   * @returns {{ok:boolean, reason:string, questions:Array, size:number}}
   */
  function generateSetSafely(grade, mode, star) {
    var lastReason = '';
    var i, res;
    for (i = 0; i < SIZE_FALLBACKS.length; i++) {
      var want = SIZE_FALLBACKS[i];
      res = KM.Generator.generateSet({ grade: grade, mode: mode, star: star, size: want });
      if (res.ok && res.questions && res.questions.length === want) {
        return { ok: true, reason: '', questions: res.questions, size: want };
      }
      lastReason = res.reason || ('题量 ' + ((res.questions || []).length));
    }
    return { ok: false, reason: lastReason, questions: [], size: 0 };
  }

  /** 出题失败时的儿童友好提示页 */
  function showGenerateFail(rootEl, reason) {
    var D = KM.Dom;
    if (reason && root.console && root.console.error) {
      root.console.error('[KM.Practice] 无法生成合法题目组：' + reason);
    }
    session = null;
    D.clear(rootEl);
    var page = D.el('div', 'km-page');
    page.appendChild(D.topbar({ title: '练一练', onBack: function () { KM.App.go('home'); }, right: 'sound' }));

    var card = D.el('div', 'km-card km-center');
    card.innerHTML = '<div style="font-size:24px;font-weight:900;">这组题有点难生成～</div>' +
      '<div class="km-mt-14" style="font-size:18px;line-height:1.7;">' +
      '别着急，我们换一个难度或者换一种运算再试试吧！</div>';
    var mascotBox = D.el('div', 'km-mascot-wrap km-mt-14');
    KM.Mascot.renderInto(mascotBox, { mood: 'think', size: 120 });
    card.appendChild(mascotBox);
    page.appendChild(card);

    var back = D.el('button', 'km-btn km-btn--block km-btn--lg km-mt-22', '换一组试试 →');
    D.on(back, 'click', function () { renderSetup(rootEl); });
    page.appendChild(back);

    var home = D.el('button', 'km-btn km-btn--block km-btn--ghost km-mt-14', '回首页');
    D.on(home, 'click', function () { KM.App.go('home'); });
    page.appendChild(home);

    rootEl.appendChild(page);
  }

  function startSet(rootEl) {
    var star = resolveStar();
    releaseGuard(session);     // 开新一组前清掉上一组可能残留的锁

    var res = generateSetSafely(setup.grade, setup.mode, star);
    if (!res.ok) {
      // 生成器确实凑不出合法题组：给儿童友好提示，回到选择页，绝不使用不合法题目
      showGenerateFail(rootEl, res.reason);
      return;
    }
    var qs = res.questions;
    qs.forEach(function (q) {
      q._hint = 0;
      q._done = false;
      q._options = (star === 1) ? KM.Generator.makeOptions(q) : null;
    });
    session = {
      grade: setup.grade,
      mode: setup.mode,
      star: star,
      questions: qs,
      index: 0,
      correct: 0,
      combo: 0,
      bestCombo: 0,
      finished: false,
      locked: false,
      inputQ: '',
      inputR: '',
      activeField: 'q',
      feedback: null
    };
    KM.Audio.playPage();
    renderQuiz(rootEl);
  }

  /* ============================================================
     2. 答题页
     ============================================================ */
  function renderQuiz(rootEl) {
    var D = KM.Dom;
    var s = session;
    var q = s.questions[s.index];
    D.clear(rootEl);
    var page = D.el('div', 'km-page');

    // 顶部：退出 + 进度 + 声音
    var bar = D.el('div', 'km-topbar');
    var exit = D.el('button', 'km-iconbtn');
    exit.setAttribute('aria-label', '退出练习');
    exit.innerHTML = D.icon('close');
    D.on(exit, 'click', function () {
      session = null;
      KM.App.go('home');
    });
    bar.appendChild(exit);
    bar.appendChild(D.el('div', 'km-topbar__title km-center',
      '第 ' + (s.index + 1) + ' / ' + s.questions.length + ' 题'));
    bar.appendChild(D.soundButton());
    page.appendChild(bar);

    var prog = D.el('div', 'km-progress');
    var fill = D.el('div', 'km-progress__fill');
    fill.style.width = Math.round((s.index / s.questions.length) * 100) + '%';
    prog.appendChild(fill);
    page.appendChild(prog);

    // 双栏容器：主区（题目 / 反馈 / 讲解）+ 侧区（键盘 / 操作）
    var shell = D.el('div', 'km-quiz-shell');
    var main = D.el('div', 'km-quiz-shell__main');
    var side = D.el('div', 'km-quiz-shell__side');

    // 题目卡片
    var card = D.el('div', 'km-card');
    var qw = D.el('div', 'km-question');
    qw.appendChild(D.el('div', 'km-question__expr km-num', D.esc(q.display)));
    if (q.op === 'rem') {
      qw.appendChild(D.el('div', 'km-question__tip', '要填两个数：商 和 余数'));
    }
    card.appendChild(qw);

    // 作答区
    if (s.star === 1 && q._options) {
      var opts = D.el('div', 'km-options');
      q._options.forEach(function (o) {
        var b = D.el('button', 'km-option km-num', D.esc(o.display));
        if (q._done) {
          if (o.correct) b.classList.add('is-right');
        }
        D.on(b, 'click', function () {
          if (q._done || s.locked) return;
          submitAnswer(o.value, o.r, b);
        });
        opts.appendChild(b);
      });
      card.appendChild(opts);
    } else {
      var ansRow = D.el('div', 'km-answer');
      var boxQ = D.el('div', 'km-answer__box km-num' + (q._done ? ' is-right' : (s.activeField === 'q' ? ' is-active' : '')),
        s.inputQ === '' ? '?' : D.esc(s.inputQ));
      ansRow.appendChild(boxQ);
      if (q.op === 'rem') {
        ansRow.appendChild(D.el('div', 'km-answer__label', '余'));
        var boxR = D.el('div', 'km-answer__box km-num' + (q._done ? ' is-right' : (s.activeField === 'r' ? ' is-active' : '')),
          s.inputR === '' ? '?' : D.esc(s.inputR));
        D.on(boxR, 'click', function () { s.activeField = 'r'; renderQuiz(rootEl); });
        ansRow.appendChild(boxR);
      }
      D.on(boxQ, 'click', function () { s.activeField = 'q'; renderQuiz(rootEl); });
      card.appendChild(ansRow);
    }
    main.appendChild(card);

    // 反馈区
    if (s.feedback) {
      var fb = D.el('div', 'km-feedback km-feedback--' + s.feedback.type);
      fb.innerHTML = '<span class="km-feedback__icon">' + D.icon(s.feedback.icon) + '</span>' +
        '<span>' + D.esc(s.feedback.text) + '</span>';
      main.appendChild(fb);
    }

    // 提示区（三级）
    if (q._hint > 0 && !q._done) {
      var hb = D.el('div', 'km-feedback km-feedback--hint');
      hb.innerHTML = '<span class="km-feedback__icon">' + D.icon('bulb') + '</span>' +
        '<span>' + D.esc(currentHintText(q)) + '</span>';
      main.appendChild(hb);
    }

    // 操作区
    var actRow = D.el('div', 'km-stack');

    if (q._done) {
      var nextBtn = D.el('button', 'km-btn km-btn--block km-btn--lg km-btn--green',
        s.index + 1 >= s.questions.length ? '看看结果 →' : '下一题 →');
      D.on(nextBtn, 'click', function () { nextQuestion(rootEl); });
      actRow.appendChild(nextBtn);
    } else {
      if (s.star !== 1 || !q._options) {
        side.appendChild(buildKeypad(rootEl));
      }
      var helpBtn = D.el('button', 'km-btn km-btn--block km-btn--yellow',
        q._hint === 0 ? '帮帮我' : (q._hint === 1 ? '再帮一下' : '直接看讲解'));
      if (q._hint >= 3) helpBtn.classList.add('is-disabled');
      D.on(helpBtn, 'click', function () { showHint(rootEl); });
      actRow.appendChild(helpBtn);
    }
    side.appendChild(actRow);

    shell.appendChild(main);
    shell.appendChild(side);
    page.appendChild(shell);

    // L3 讲解后的引导
    if (q._hint >= 3) {
      var guide = D.el('div', 'km-card km-mt-14');
      var hint = KM.Hints.build(q.hintKind, q);
      var kp = KM.Knowledge.findKnowledge(hint.relatedKp);
      guide.innerHTML = '<div style="font-size:18px;font-weight:800;">' + D.esc(hint.l3) + '</div>' +
        '<div class="km-muted km-mt-8">教材口径：' + D.esc(hint.sourceRef) + '</div>';
      var goKp = D.el('button', 'km-btn km-btn--block km-btn--sky km-mt-14',
        '去看「' + (kp ? kp.title : '知识点') + '」动画');
      D.on(goKp, 'click', function () {
        KM.Audio.playTap();
        KM.Learn.openKp(hint.relatedKp);
      });
      guide.appendChild(goKp);
      page.appendChild(guide);
    }

    rootEl.appendChild(page);
  }

  /** 自定义大号数字键盘 */
  function buildKeypad(rootEl) {
    var D = KM.Dom;
    var s = session;
    var q = s.questions[s.index];
    var pad = D.el('div', 'km-keypad');

    function addKey(text, cls, handler) {
      var b = D.el('button', 'km-key' + (cls ? ' ' + cls : ''), D.esc(text));
      b.style.gridColumn = (text === '确定' || text === '清空') ? 'span 1' : 'span 1';
      D.on(b, 'click', function () {
        KM.Audio.playTap();
        handler();
      });
      pad.appendChild(b);
      return b;
    }

    for (var i = 1; i <= 9; i++) {
      (function (n) {
        addKey(String(n), '', function () { typeDigit(String(n)); renderQuiz(rootEl); });
      })(i);
    }
    addKey('0', '', function () { typeDigit('0'); renderQuiz(rootEl); });
    addKey('清空', 'km-key--fn', function () { s.inputQ = ''; s.inputR = ''; renderQuiz(rootEl); });
    addKey('退格', 'km-key--del', function () { backspace(); renderQuiz(rootEl); });
    var ok = addKey('确定', 'km-key--ok', function () { doSubmit(rootEl); });
    ok.style.gridColumn = 'span 3';
    return pad;
  }

  function typeDigit(d) {
    var s = session;
    var q = s.questions[s.index];
    if (s.activeField === 'r') {
      // 余数一定是一位数
      if (s.inputR.length >= 1) return;
      s.inputR += d;
      return;
    }
    if (s.inputQ.length >= 3) return;
    s.inputQ += d;
    // 有余数除法的商一定是 1 位数，填完自动跳到余数框
    if (q.op === 'rem') s.activeField = 'r';
  }

  function backspace() {
    var s = session;
    if (s.activeField === 'r') s.inputR = s.inputR.slice(0, -1);
    else s.inputQ = s.inputQ.slice(0, -1);
  }

  function doSubmit(rootEl) {
    var s = session;
    var q = s.questions[s.index];
    if (s.locked || q._done) return;
    if (s.inputQ === '') {
      s.feedback = { type: 'hint', icon: 'question', text: '先填一个数字试试看～' };
      renderQuiz(rootEl);
      return;
    }
    if (q.op === 'rem' && s.inputR === '') {
      s.feedback = { type: 'hint', icon: 'question', text: '余数也要填哦～' };
      renderQuiz(rootEl);
      return;
    }
    submitAnswer(Number(s.inputQ), q.op === 'rem' ? Number(s.inputR) : 0, null);
  }

  /* ============================================================
     判题
     ============================================================ */
  function submitAnswer(value, remainder, optBtn) {
    var s = session;
    var q = s.questions[s.index];
    var right = (value === q.answer) && (q.op !== 'rem' || remainder === q.remainder);

    armGuard(s);

    if (right) {
      q._done = true;
      s.correct += 1;
      // L1 提示不打断连对；L2 归零
      if (q._hint <= 1) {
        s.combo += 1;
        if (s.combo > s.bestCombo) s.bestCombo = s.combo;
      } else {
        s.combo = 0;
      }
      var r = KM.Points.recordCorrect();
      KM.Points.updateBestCombo(s.bestCombo);
      var comboRes = KM.Points.recordCombo(s.combo);
      s.feedback = { type: 'right', icon: 'check', text: '答对啦！真棒～' };
      if (optBtn) optBtn.classList.add('is-right');
      KM.Audio.playCorrect();
      KM.Dom.toast('＋1');
      if (r.applied > 0 && r.capped) KM.Dom.toast('今天的分数已经领满啦');
      if (comboRes.applied > 0) {
        KM.Dom.combo('连对 ' + comboRes.combo + ' 题 ＋' + comboRes.applied);
        KM.Audio.playCombo(comboRes.combo);
      }
      var newly = KM.Points.checkBadges();
      if (newly.length) KM.Dom.combo('获得徽章：' + newly[0].name);
      if (s.index + 1 < s.questions.length) {
        setTimeout(function () {
          if (session && session.questions[session.index] === q && q._done) nextQuestion(null);
        }, 1200);
      }
      KM.App.refresh();
      return;
    }

    // 答错：柔和提示
    s.combo = 0;
    s.feedback = { type: 'soft', icon: 'question', text: '差一点点！再看看这里～' };
    if (optBtn) optBtn.classList.add('is-soft');
    KM.Audio.playSoft();
    KM.App.refresh();
  }

  /* ============================================================
     三级提示
     ============================================================ */
  function currentHintText(q) {
    var h = KM.Hints.build(q.hintKind, q);
    if (q._hint === 1) return h.l1;
    if (q._hint === 2) return h.l2;
    return h.l3;
  }

  function showHint(rootEl) {
    var s = session;
    var q = s.questions[s.index];
    if (q._done) return;
    if (q._hint >= 3) return;
    q._hint += 1;

    if (q._hint === 3) {
      // L3：揭晓答案 + 讲解 + 引导看知识点；计为未答对，给 1 分鼓励
      var r = KM.Points.readL3(q.id);
      KM.Points.addWrong(q);
      q._done = true;
      s.combo = 0;
      s.feedback = { type: 'hint', icon: 'bulb', text: '看看讲解，下次就会啦～' };
      if (r.applied > 0) {
        KM.Dom.toast('＋' + r.applied + ' 鼓励分');
      } else {
        KM.Dom.toast('今天的讲解分领完啦，明天再来～');
      }
      KM.Audio.playSoft();
      KM.App.refresh();
      return;
    }

    s.feedback = { type: 'hint', icon: 'bulb', text: currentHintText(q) };
    KM.Audio.playTap();
    KM.App.refresh();
  }

  /* ============================================================
     翻页 / 结算
     ============================================================ */
  function nextQuestion(rootEl) {
    var s = session;
    if (!s) return;
    if (s.index + 1 >= s.questions.length) {
      finish();
      return;
    }
    s.index += 1;
    s.inputQ = '';
    s.inputR = '';
    s.activeField = 'q';
    s.feedback = null;
    releaseGuard(s);          // 翻页即解锁，防连点锁不得跨题
    KM.App.refresh();
  }

  function finish() {
    var s = session;
    releaseGuard(s);
    s.finished = true;
    var total = s.questions.length;
    var acc = total ? s.correct / total : 0;
    var res = KM.Points.finishSet({ correct: s.correct, total: total });
    KM.Audio.playReward();
    KM.Dom.toast('完成一组 ＋' + res.setApplied);
    if (res.perfectApplied > 0) KM.Dom.combo('全对！＋' + res.perfectApplied);
    var newly = KM.Points.checkBadges();
    if (newly.length) KM.Dom.combo('获得徽章：' + newly[0].name);
    KM.Points.adaptStar(s.grade, s.mode, acc);
    s.accuracy = acc;
    s.nextStar = KM.Points.suggestStar(s.grade, s.mode);
    KM.App.refresh();
  }

  function renderResult(rootEl) {
    var D = KM.Dom;
    var s = session;
    var total = s.questions.length;
    var acc = s.accuracy || 0;
    var starCount = acc >= 0.9 ? 3 : (acc >= 0.7 ? 2 : 1);   // 永远至少 1 颗星
    D.clear(rootEl);
    var page = D.el('div', 'km-page');
    page.appendChild(D.topbar({ title: '这一组做完啦', onBack: function () { session = null; KM.App.go('home'); }, right: 'sound' }));

    var box = D.el('div', 'km-card km-result');
    box.appendChild(D.stars(starCount, 3, true));
    box.appendChild(D.el('div', 'km-result__score km-num', '答对 ' + s.correct + ' / ' + total));
    var word = acc >= 0.9 ? '太厉害啦，几乎全对！'
      : (acc >= 0.7 ? '做得不错，继续加油～'
        : '别着急，慢慢想～先去看看知识点动画，再来试试！');
    box.appendChild(D.el('div', 'km-result__word', D.esc(word)));
    box.appendChild(D.el('div', 'km-muted km-mt-8',
      '连对最多 ' + s.bestCombo + ' 题 · 下一次难度：' + s.nextStar + ' 星'));
    page.appendChild(box);

    if (acc < 0.6) {
      var tip = D.el('div', 'km-card km-mt-14');
      tip.innerHTML = '<div style="font-size:19px;font-weight:800;">小建议</div>' +
        '<div style="font-size:17px;margin-top:6px;">先去「学一学」看一遍动画，再回来试试，会顺手很多～</div>';
      var goLearn = D.el('button', 'km-btn km-btn--block km-btn--sky km-mt-14', '去学一学');
      D.on(goLearn, 'click', function () {
        session = null;
        KM.App.go('learn');
      });
      tip.appendChild(goLearn);
      page.appendChild(tip);
    }

    var again = D.el('button', 'km-btn km-btn--block km-btn--lg km-mt-22', '再来一组 →');
    D.on(again, 'click', function () { startSet(rootEl); });
    page.appendChild(again);

    var home = D.el('button', 'km-btn km-btn--block km-btn--ghost km-mt-14', '回首页');
    D.on(home, 'click', function () { session = null; KM.App.go('home'); });
    page.appendChild(home);

    rootEl.appendChild(page);
  }

  KM.Practice = {
    render: render,
    reset: function () {
      releaseGuard(session);
      session = null;
    },
    generateSetSafely: generateSetSafely
  };
})(typeof window !== 'undefined' ? window : globalThis);
