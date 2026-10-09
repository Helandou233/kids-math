/* ============================================================
   home.js —— 首页
   吉祥物 + 问候语 + 累计积分/等级 + 三个大入口 + 今日签到
   吉祥物连点 5 次进入隐藏自测页。
   ============================================================ */
(function (root) {
  'use strict';

  var KM = root.KM = root.KM || {};

  var TAP_TARGET = 5;          // 连点次数
  var TAP_WINDOW = 2500;       // 连点有效间隔（毫秒）

  var tapTimes = [];

  /** 根据当前时间给出问候语 */
  function greeting() {
    var h = new Date().getHours();
    if (h < 6) return '还早呢，要注意休息哦～';
    if (h < 11) return '早上好，今天也要加油！';
    if (h < 14) return '中午好，吃好饭再来玩～';
    if (h < 18) return '下午好，我们来数一数！';
    return '晚上好，来玩一会儿数学吧～';
  }

  /** 渲染首页 */
  function render(rootEl) {
    var D = KM.Dom;
    D.clear(rootEl);
    var page = D.el('div', 'km-page');

    // 顶部：标题 + 静音
    var bar = D.el('div', 'km-topbar');
    var title = D.el('div', 'km-topbar__title', '数数的数学乐园');
    bar.appendChild(title);
    bar.appendChild(D.soundButton());
    var accountBtn = D.el('button', 'km-iconbtn');
    accountBtn.setAttribute('aria-label', '账号与云同步');
    accountBtn.innerHTML = D.icon('user');
    D.on(accountBtn, 'click', function () { KM.Audio.playTap(); KM.App.go('account'); });
    bar.appendChild(accountBtn);
    page.appendChild(bar);

    // 吉祥物 + 问候 + 积分
    var info = KM.Points.levelInfo();
    var mascotBox = D.el('div', 'km-mascot-wrap km-mt-8');
    var mascotHolder = D.el('div', 'km-mascot-bounce');
    KM.Mascot.renderInto(mascotHolder, { mood: 'happy', size: 168, leftDigit: '3', rightDigit: '5' });
    mascotBox.appendChild(mascotHolder);
    page.appendChild(mascotBox);

    page.appendChild(D.el('div', 'km-center km-bold km-mt-8', D.esc(greeting())));

    var statWrap = D.el('div', 'km-row km-mt-14');
    statWrap.style.justifyContent = 'center';
    var stat = D.el('div', 'km-statbar');
    stat.innerHTML = D.icon('coin', 30) +
      '<span><span class="km-statbar__value">' + info.total + '</span> ' +
      '<span class="km-statbar__label">积分</span></span>';
    var stat2 = D.el('div', 'km-statbar');
    stat2.innerHTML = D.icon('tree', 30) +
      '<span><span class="km-statbar__value">' + info.level + ' 级</span> ' +
      '<span class="km-statbar__label">' + D.esc(info.name) + '</span></span>';
    statWrap.appendChild(stat);
    statWrap.appendChild(stat2);
    page.appendChild(statWrap);

    // 云同步状态入口（未配置 / 未登录 / 已同步）
    var syncWrap = D.el('div', 'km-center km-mt-8');
    var syncBtn = D.el('button', 'km-syncline', KM.Account ? KM.Account.statusLabel() : '');
    D.on(syncBtn, 'click', function () { KM.Audio.playTap(); KM.App.go('account'); });
    syncWrap.appendChild(syncBtn);
    page.appendChild(syncWrap);

    // 三个大入口
    var entries = D.el('div', 'km-stack km-mt-22 km-home-entries');
    entries.appendChild(makeEntry('learn', '学一学', '看动画，弄明白', D.icon('book', 42), function () {
      KM.App.go('learn');
    }));
    entries.appendChild(makeEntry('practice', '练一练', '做 10 道小题，攒星星', D.icon('target', 42), function () {
      KM.App.go('practice');
    }));
    entries.appendChild(makeEntry('rewards', '我的星星', '看我的成长树和徽章', D.icon('gift', 42), function () {
      KM.App.go('rewards');
    }));
    page.appendChild(entries);

    // 今日签到
    var signWrap = D.el('div', 'km-mt-22');
    var signed = KM.Points.isSignedToday();
    var streak = KM.Points.state().sign.streak;
    if (signed) {
      var done = D.el('div', 'km-card km-center');
      done.innerHTML = '<div style="font-size:22px;font-weight:900;">今天已经签到啦 ✅</div>' +
        '<div class="km-text-soft km-mt-8">已经连续签到 ' + streak + ' 天，明天再来哦～</div>';
      signWrap.appendChild(done);
    } else {
      var btn = D.el('button', 'km-btn km-btn--block km-btn--lg km-btn--green', '今日签到 ＋5 分');
      D.on(btn, 'click', function () {
        var res = KM.Points.signIn();
        if (res.already) return;
        KM.Audio.playReward();
        KM.Dom.toast('＋' + res.applied + ' 分');
        if (res.streak >= 3) KM.Dom.combo('连续 ' + res.streak + ' 天！');
        render(rootEl);
      });
      signWrap.appendChild(btn);
    }
    page.appendChild(signWrap);

    page.appendChild(D.el('div', 'km-center km-muted km-mt-14',
      '每天学一点点，星星就会越来越多～'));

    rootEl.appendChild(page);

    // 吉祥物连点 5 次 → 自测
    D.on(mascotHolder, 'click', function () {
      var now = Date.now();
      tapTimes.push(now);
      tapTimes = tapTimes.filter(function (t) { return now - t <= TAP_WINDOW; });
      if (tapTimes.length >= TAP_TARGET) {
        tapTimes = [];
        KM.Audio.playReward();
        KM.App.go('selftest');
      }
    });
  }

  /** 构造一个大入口卡片 */
  function makeEntry(kind, name, sub, iconHtml, onClick) {
    var D = KM.Dom;
    var b = D.el('button', 'km-entry km-entry--' + kind);
    var ic = D.el('div', 'km-entry__icon', iconHtml);
    var txt = D.el('div');
    txt.innerHTML = '<div class="km-entry__title">' + D.esc(name) + '</div>' +
      '<div class="km-entry__sub">' + D.esc(sub) + '</div>';
    b.appendChild(ic);
    b.appendChild(txt);
    b.appendChild(D.el('div', '', D.icon('arrow', 30)));
    D.on(b, 'click', function () {
      KM.Audio.playTap();
      onClick();
    });
    return b;
  }

  KM.Home = { render: render };
})(typeof window !== 'undefined' ? window : globalThis);
