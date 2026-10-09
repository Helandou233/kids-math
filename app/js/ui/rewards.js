/* ============================================================
   rewards.js —— 我的星星：成长树 / 签到 / 徽章 / 每日任务 / 积分流水
   ============================================================ */
(function (root) {
  'use strict';

  var KM = root.KM = root.KM || {};

  /** 每一级的叶片数 / 果实数（随等级生长） */
  var LEAVES = [0, 2, 5, 9, 14, 20, 27, 34];
  var FRUITS = [0, 0, 0, 0, 1, 2, 4, 6];

  /** 简易确定性伪随机（保证同一等级每次画出来的树一致） */
  function seeded(seed) {
    var s = seed % 233280;
    return function () {
      s = (s * 9301 + 49297) % 233280;
      return s / 233280;
    };
  }

  /**
   * 画一棵随等级生长的小树。
   * @param {number} lvIndex 0–7
   * @returns {string} SVG 代码
   */
  function treeSvg(lvIndex) {
    var rnd = seeded(1234 + lvIndex * 17);
    var parts = [];

    parts.push('<rect x="0" y="0" width="300" height="270" fill="none"/>');
    // 土地
    parts.push('<ellipse cx="150" cy="246" rx="96" ry="16" fill="#EFE0CB"/>');
    parts.push('<ellipse cx="150" cy="242" rx="72" ry="11" fill="#7BD389" opacity="0.55"/>');
    // 树干
    var trunkH = 46 + lvIndex * 8;
    parts.push('<rect x="' + (150 - 11) + '" y="' + (242 - trunkH) + '" width="22" height="' + trunkH + '" rx="8" fill="#B07A45"/>');
    // 树枝
    parts.push('<path d="M150 ' + (250 - trunkH) + ' L118 ' + (224 - trunkH) + '" stroke="#B07A45" stroke-width="7" stroke-linecap="round"/>');
    parts.push('<path d="M150 ' + (252 - trunkH) + ' L182 ' + (226 - trunkH) + '" stroke="#B07A45" stroke-width="7" stroke-linecap="round"/>');

    // 树冠（基础圆）
    var cy = 236 - trunkH - 34;
    parts.push('<circle cx="150" cy="' + cy + '" r="' + (34 + lvIndex * 4) + '" fill="#7BD389"/>');

    // 叶子
    var leafCount = LEAVES[lvIndex];
    var i;
    for (i = 0; i < leafCount; i++) {
      var ang = rnd() * Math.PI * 2;
      var rad = rnd() * (30 + lvIndex * 4);
      var lx = 150 + Math.cos(ang) * rad;
      var ly = cy + Math.sin(ang) * rad;
      var rot = Math.floor(rnd() * 180);
      parts.push('<ellipse class="km-tree__leaf" cx="' + lx.toFixed(1) + '" cy="' + ly.toFixed(1) +
        '" rx="11" ry="7" fill="' + (i % 2 === 0 ? '#55BC67' : '#8FE09A') +
        '" transform="rotate(' + rot + ' ' + lx.toFixed(1) + ' ' + ly.toFixed(1) + ')" ' +
        'style="animation-delay:' + (i * 26) + 'ms"/>');
    }

    // 果实
    var fruitCount = FRUITS[lvIndex];
    for (i = 0; i < fruitCount; i++) {
      var fa = rnd() * Math.PI * 2;
      var fr = rnd() * (24 + lvIndex * 3);
      var fx = 150 + Math.cos(fa) * fr;
      var fy = cy + Math.sin(fa) * fr;
      parts.push('<circle class="km-tree__leaf" cx="' + fx.toFixed(1) + '" cy="' + fy.toFixed(1) +
        '" r="7" fill="#FF6B9D" stroke="#FFFFFF" stroke-width="2" style="animation-delay:' + (300 + i * 60) + 'ms"/>');
    }

    return '<svg class="km-tree" viewBox="0 0 300 270" xmlns="http://www.w3.org/2000/svg" ' +
      'role="img" aria-label="成长树">' + parts.join('') + '</svg>';
  }

  /** 徽章图标 */
  function badgeIcon(name, unlocked) {
    var D = KM.Dom;
    var map = {
      star: 'star', combo: 'combo', calendar: 'calendar', book: 'book',
      card: 'card', coin: 'coin', flag: 'flag', crown: 'crown'
    };
    var svg = D.icon(map[name] || 'star', 54);
    if (!unlocked) {
      svg = svg.replace('<svg ', '<svg opacity="0.35" ');
    }
    return svg;
  }

  /** 渲染「我的星星」 */
  function render(rootEl) {
    var D = KM.Dom;
    D.clear(rootEl);
    var page = D.el('div', 'km-page');
    page.appendChild(D.topbar({ title: '我的星星', onBack: function () { KM.App.go('home'); }, right: 'sound' }));

    var info = KM.Points.levelInfo();
    var st = KM.Points.state();

    /* —— 积分总览 —— */
    var head = D.el('div', 'km-card km-center');
    head.innerHTML =
      '<div style="font-size:22px;font-weight:900;">第 ' + info.level + ' 级 · ' + D.esc(info.name) + '</div>' +
      '<div class="km-result__score km-num">' + info.total + ' 分</div>' +
      '<div class="km-text-soft">可用 ' + st.availablePoints + ' 分 · 今天已获得 ' + KM.Points.todayEarned() +
      ' / ' + KM.Points.DAILY_CAP + ' 分</div>';
    page.appendChild(head);

    /* —— 成长树 —— */
    var treeSec = D.el('div', 'km-mt-14');
    treeSec.appendChild(D.el('div', 'km-section__title', D.icon('tree', 24) + ' 我的成长树'));
    var treeCard = D.el('div', 'km-card');
    var wrap = D.el('div', 'km-tree-wrap');
    wrap.innerHTML = treeSvg(info.index);
    treeCard.appendChild(wrap);
    var nextText = info.next === null
      ? '已经长成最大的树啦，太厉害了！'
      : ('再得 ' + (info.next - info.total) + ' 分就能长到第 ' + (info.level + 1) + ' 级「' +
         KM.Points.LEVEL_NAMES[info.index + 1] + '」');
    treeCard.appendChild(D.el('div', 'km-center km-mt-8', D.esc(nextText)));
    var bar = D.el('div', 'km-progress km-mt-14');
    var fill = D.el('div', 'km-progress__fill');
    fill.style.width = Math.round(info.progress * 100) + '%';
    bar.appendChild(fill);
    treeCard.appendChild(bar);
    treeSec.appendChild(treeCard);
    page.appendChild(treeSec);

    /* —— 签到 —— */
    var signSec = D.el('div', 'km-mt-22');
    signSec.appendChild(D.el('div', 'km-section__title', D.icon('calendar', 24) + ' 每日签到'));
    var signCard = D.el('div', 'km-card');
    var signed = KM.Points.isSignedToday();
    signCard.innerHTML = '<div style="font-size:18px;">连续签到 <b>' + st.sign.streak +
      '</b> 天 · 累计签到 <b>' + st.sign.totalDays + '</b> 天</div>';
    if (signed) {
      var ok = D.el('div', 'km-mt-8', '今天已经签到啦 ✅ 明天再来～');
      signCard.appendChild(ok);
    } else {
      var btn = D.el('button', 'km-btn km-btn--block km-btn--green km-mt-14', '签到 ＋5 分');
      D.on(btn, 'click', function () {
        var res = KM.Points.signIn();
        if (res.already) return;
        KM.Audio.playReward();
        KM.Dom.toast('＋' + res.applied + ' 分');
        if (res.streak >= 3) KM.Dom.combo('连续 ' + res.streak + ' 天！');
        var newly = KM.Points.checkBadges();
        if (newly.length) KM.Dom.combo('获得徽章：' + newly[0].name);
        render(rootEl);
      });
      signCard.appendChild(btn);
    }
    signSec.appendChild(signCard);
    page.appendChild(signSec);

    /* —— 每日任务 —— */
    var taskSec = D.el('div', 'km-mt-22');
    taskSec.appendChild(D.el('div', 'km-section__title', D.icon('flag', 24) + ' 今日任务'));
    var tasks = KM.Points.taskList();
    tasks.forEach(function (t) {
      var row = D.el('div', 'km-task');
      row.innerHTML = '<span class="km-task__mark">' + D.icon(t.done ? 'check' : 'question') + '</span>' +
        '<span class="km-task__name">' + D.esc(t.name) + '</span>' +
        '<span class="km-task__state' + (t.done ? '' : ' km-task__state--todo') + '">' + D.esc(t.progress) + '</span>';
      taskSec.appendChild(row);
    });
    page.appendChild(taskSec);

    /* —— 徽章 —— */
    var badgeSec = D.el('div', 'km-mt-22');
    badgeSec.appendChild(D.el('div', 'km-section__title', D.icon('crown', 24) + ' 我的徽章（' +
      st.badges.length + ' / 8）'));
    var grid = D.el('div', 'km-badges');
    KM.Points.badgeList().forEach(function (b) {
      var cell = D.el('div', 'km-badge' + (b.unlocked ? ' is-on' : ''));
      cell.innerHTML = '<div style="height:62px;">' + badgeIcon(b.icon, b.unlocked) +
        (b.unlocked ? '' : '<div style="margin-top:-46px;">' + D.icon('lock', 26) + '</div>') + '</div>' +
        '<div class="km-badge__name">' + D.esc(b.name) + '</div>' +
        '<div class="km-badge__cond">' + (b.unlocked ? '已获得' : D.esc(b.cond)) + '</div>';
      grid.appendChild(cell);
    });
    badgeSec.appendChild(grid);
    page.appendChild(badgeSec);

    /* —— 积分流水 —— */
    var ledgerSec = D.el('div', 'km-mt-22');
    ledgerSec.appendChild(D.el('div', 'km-section__title', D.icon('coin', 24) + ' 最近的加分'));
    var ledger = st.ledger.slice(-8).reverse();
    if (!ledger.length) {
      ledgerSec.appendChild(D.el('div', 'km-card km-text-soft', '还没有加分记录，去做几道题吧～'));
    } else {
      ledger.forEach(function (item) {
        var row = D.el('div', 'km-task');
        row.innerHTML = '<span class="km-task__mark">' + D.icon('coin') + '</span>' +
          '<span class="km-task__name">' + D.esc(item.reason) + '</span>' +
          '<span class="km-task__state">＋' + item.amount + '</span>';
        ledgerSec.appendChild(row);
      });
    }
    page.appendChild(ledgerSec);

    rootEl.appendChild(page);
  }

  KM.Rewards = {
    render: render,
    treeSvg: treeSvg
  };
})(typeof window !== 'undefined' ? window : globalThis);
