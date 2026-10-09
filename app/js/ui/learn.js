/* ============================================================
   learn.js —— 学一学（6 个知识点 + 9 张特例卡）
   所有内容来自 js/data/knowledge.js，没有 sourceRef 的条目不渲染。
   ============================================================ */
(function (root) {
  'use strict';

  var KM = root.KM = root.KM || {};

  var currentTab = 'kp';      // 'kp' | 'sc'
  var currentKpId = null;     // 正在看的知识点
  var animInstance = null;

  /* ---------------- 列表页 ---------------- */
  function render(rootEl) {
    var D = KM.Dom;
    if (currentKpId) {
      renderKpDetail(rootEl, currentKpId);
      return;
    }
    D.clear(rootEl);
    var page = D.el('div', 'km-page');
    page.appendChild(D.topbar({ title: '学一学', onBack: function () { KM.App.go('home'); }, right: 'sound' }));

    // 分段切换
    var seg = D.el('div', 'km-chiprow');
    var b1 = D.el('button', 'km-chip' + (currentTab === 'kp' ? ' is-on' : ''), '知识点 6');
    var b2 = D.el('button', 'km-chip' + (currentTab === 'sc' ? ' is-on' : ''), '特例卡 9');
    D.on(b1, 'click', function () { currentTab = 'kp'; KM.Audio.playTap(); render(rootEl); });
    D.on(b2, 'click', function () { currentTab = 'sc'; KM.Audio.playTap(); render(rootEl); });
    seg.appendChild(b1);
    seg.appendChild(b2);
    page.appendChild(seg);
    page.appendChild(D.el('div', 'km-divider'));

    if (currentTab === 'kp') {
      renderKpList(page, rootEl);
    } else {
      renderScList(page, rootEl);
    }

    rootEl.appendChild(page);
  }

  /** 知识点列表 */
  function renderKpList(page, rootEl) {
    var D = KM.Dom;
    var list = KM.Knowledge.renderable('knowledge');
    var learned = KM.Points.state().learnedKp;

    page.appendChild(D.el('div', 'km-section__hint', '点开一个知识点，看动画弄明白它～'));

    var wrap = D.el('div', 'km-stack km-kp-list');
    list.forEach(function (kp, idx) {
      var done = learned.indexOf(kp.id) >= 0;
      var b = D.el('button', 'km-kp' + (done ? ' km-kp--done' : ''));
      var no = D.el('div', 'km-kp__no', String(idx + 1));
      b.appendChild(no);
      var body = D.el('div');
      body.innerHTML =
        '<div class="km-kp__title">' + D.esc(kp.title) + (done ? ' ✅' : '') + '</div>' +
        '<div class="km-kp__sub">' + D.esc(kp.subtitle) + '</div>' +
        '<span class="km-kp__ref">' + D.esc(kp.sourceRef) + '</span>';
      b.appendChild(body);
      D.on(b, 'click', function () {
        KM.Audio.playTap();
        currentKpId = kp.id;
        render(rootEl);
      });
      wrap.appendChild(b);
    });
    page.appendChild(wrap);
  }

  /** 特例卡列表 */
  function renderScList(page, rootEl) {
    var D = KM.Dom;
    var list = KM.Knowledge.renderable('specialCase');
    var read = KM.Points.state().readCards;

    page.appendChild(D.el('div', 'km-section__hint', '这些地方最容易弄错，看一遍就记住啦～'));

    var wrap = D.el('div', 'km-stack km-sc-list');
    list.forEach(function (sc) {
      var done = read.indexOf(sc.id) >= 0;
      var card = D.el('div', 'km-sc' + (done ? ' km-sc--done' : ''));
      card.innerHTML =
        '<div class="km-sc__title">' + D.esc(String(sc.order)) + '. ' + D.esc(sc.title) + (done ? ' ✅' : '') + '</div>' +
        '<div class="km-sc__row"><span class="km-sc__mark">' + D.icon('cross') + '</span>' +
        '<span class="km-sc__wrong">' + D.esc(sc.wrong) + '</span></div>' +
        '<div class="km-sc__row"><span class="km-sc__mark">' + D.icon('check') + '</span>' +
        '<span class="km-sc__right">' + D.esc(sc.right) + '</span></div>' +
        '<div style="font-size:17px;">' + D.esc(sc.explain) + '</div>' +
        '<div class="km-sc__chant">口诀：' + D.esc(sc.chant) + '</div>' +
        '<div class="km-sc__ref">教材口径：' + D.esc(sc.sourceRef) + '</div>';

      var btn = D.el('button', 'km-btn km-btn--block km-mt-14' + (done ? ' km-btn--ghost' : ' km-btn--pink'),
        done ? '已经记住啦' : '我记住啦 ＋1');
      btn.disabled = !!done;
      D.on(btn, 'click', function () {
        var r = KM.Points.readCard(sc.id);
        KM.Audio.playReward();
        if (r.applied > 0) KM.Dom.toast('＋' + r.applied + ' 分');
        else KM.Dom.toast('再看一遍也很棒～');
        render(rootEl);
      });
      card.appendChild(btn);
      wrap.appendChild(card);
    });
    page.appendChild(wrap);
  }

  /* ---------------- 知识点详情 ---------------- */
  function renderKpDetail(rootEl, kpId) {
    var D = KM.Dom;
    var kp = KM.Knowledge.findKnowledge(kpId);
    D.clear(rootEl);
    var page = D.el('div', 'km-page');
    page.appendChild(D.topbar({
      title: kp ? kp.title : '知识点',
      onBack: function () {
        currentKpId = null;
        if (animInstance) animInstance.destroy();
        animInstance = null;
        KM.App.go('learn');
      },
      right: 'sound'
    }));

    if (!kp || !kp.sourceRef) {
      page.appendChild(D.el('div', 'km-card', '这个知识点暂时还看不到哦～'));
      rootEl.appendChild(page);
      return;
    }

    page.appendChild(D.el('div', 'km-section__hint', D.esc(kp.sourceRef)));

    // 动画舞台
    var stageHost = D.el('div', 'km-mb-14');
    page.appendChild(stageHost);
    animInstance = KM.Anim.mount(stageHost, kp.anim, kp.animParam);

    // 图文说明
    var card = D.el('div', 'km-card');
    card.innerHTML =
      '<div style="font-size:22px;font-weight:900;margin-bottom:8px;">' + D.esc(kp.title) + '</div>' +
      '<div style="font-size:18px;line-height:1.7;">' + D.esc(kp.story) + '</div>' +
      '<div class="km-center km-mt-14" style="font-size:34px;font-weight:900;color:#F2701C;">' + D.esc(kp.formula) + '</div>' +
      '<div class="km-mt-14" style="font-size:18px;font-weight:800;">' + D.esc(kp.keyPoint) + '</div>' +
      '<div class="km-muted km-mt-8">教材口径：' + D.esc(kp.sourceRef) + '</div>';
    page.appendChild(card);

    // 学习完成
    var learned = KM.Points.state().learnedKp.indexOf(kp.id) >= 0;
    var btn = D.el('button', 'km-btn km-btn--block km-btn--lg km-mt-14' + (learned ? ' km-btn--ghost' : ' km-btn--green'),
      learned ? '已经学会啦 ✅' : '我学会啦 ＋5 分');
    btn.disabled = learned;
    D.on(btn, 'click', function () {
      var r = KM.Points.learnKp(kp.id);
      KM.Audio.playReward();
      if (r.applied > 0) KM.Dom.toast('＋' + r.applied + ' 分');
      var newly = KM.Points.checkBadges();
      if (newly.length) KM.Dom.combo('获得徽章：' + newly[0].name);
      render(rootEl);
    });
    page.appendChild(btn);

    var next = D.el('button', 'km-btn km-btn--block km-btn--ghost km-mt-14', '回到知识点列表');
    D.on(next, 'click', function () {
      currentKpId = null;
      if (animInstance) animInstance.destroy();
      animInstance = null;
      KM.App.go('learn');
    });
    page.appendChild(next);

    rootEl.appendChild(page);
  }

  /** 从练习页跳转到某个知识点（保留当前知识点，不被路由重置） */
  function openKp(kpId) {
    currentTab = 'kp';
    currentKpId = kpId;
    KM.App.go('learn', true);
  }

  KM.Learn = {
    render: render,
    openKp: openKp,
    /** 离开「学一学」时清理状态与动画 */
    reset: function () {
      currentKpId = null;
      currentTab = 'kp';
      if (animInstance) {
        animInstance.destroy();
        animInstance = null;
      }
    }
  };
})(typeof window !== 'undefined' ? window : globalThis);
