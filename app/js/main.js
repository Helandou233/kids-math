/* ============================================================
   main.js —— 路由与初始化
   传统 script 顺序加载，全部挂在 window.KM 命名空间下，
   不使用 ES module，因此 file:// 直接打开即可运行。
   ============================================================ */
(function (root) {
  'use strict';

  var KM = root.KM = root.KM || {};
  var doc = root.document;

  /** 连续使用多久弹出休息蒙层（毫秒） */
  var REST_AFTER = 20 * 60 * 1000;
  /** 休息时长（毫秒） */
  var REST_COUNTDOWN = 5 * 60 * 1000;

  var rootEl = null;
  var restLayer = null;
  var currentPage = 'home';
  var restTimer = null;
  var countdownTimer = null;

  /* ---------------- 路由 ---------------- */
  /**
   * 跳转到某个页面。
   * @param {string} name 'home'|'learn'|'practice'|'rewards'|'selftest'
   * @param {boolean} preserve 为 true 时不清空其它页面的内部状态
   */
  function go(name, preserve) {
    var prev = currentPage;
    currentPage = name;
    if (!preserve) {
      // 进入练习页（从别的页面来）时重置到选择页；离开练习页时清空会话
      if (name !== 'practice' || prev !== 'practice') {
        if (KM.Practice) KM.Practice.reset();
      }
      if (name !== 'learn' && KM.Learn) KM.Learn.reset();
    }
    KM.Audio.playPage();
    render();
    if (root.scrollTo) root.scrollTo(0, 0);
    if (rootEl) rootEl.scrollTop = 0;
  }

  /** 重绘当前页（答题过程中状态变化时调用） */
  function refresh() {
    render();
  }

  function render() {
    if (!rootEl) return;
    KM.Dom.clear(rootEl);
    switch (currentPage) {
      case 'learn':
        KM.Learn.render(rootEl);
        break;
      case 'practice':
        KM.Practice.render(rootEl);
        break;
      case 'rewards':
        KM.Rewards.render(rootEl);
        break;
      case 'selftest':
        KM.SelfTest.render(rootEl);
        break;
      case 'account':
        if (KM.AccountUi) KM.AccountUi.render(rootEl);
        break;
      case 'home':
      default:
        currentPage = 'home';
        KM.Home.render(rootEl);
        break;
    }
  }

  /* ---------------- 防沉迷休息蒙层 ---------------- */
  function showRest() {
    if (!restLayer) return;
    var D = KM.Dom;
    restLayer.hidden = false;
    D.clear(restLayer);

    var mascot = D.el('div', 'km-mascot-wrap');
    var holder = D.el('div');
    KM.Mascot.renderInto(holder, { mood: 'sleep', size: 150 });
    mascot.appendChild(holder);
    restLayer.appendChild(mascot);

    restLayer.appendChild(D.el('div', 'km-rest__title', '眼睛要休息一下啦'));
    restLayer.appendChild(D.el('div', 'km-rest__desc',
      '已经玩了 20 分钟啦～站起来动一动，看看窗外的远处，5 分钟后再回来，数数在这儿等你。'));

    var count = D.el('div', 'km-rest__count km-num', '5:00');
    restLayer.appendChild(count);

    var btn = D.el('button', 'km-btn km-btn--lg', '我知道了，先休息');
    D.on(btn, 'click', function () {
      closeRest();
    });
    restLayer.appendChild(btn);

    var left = REST_COUNTDOWN;
    function paint() {
      var m = Math.floor(left / 60000);
      var s = Math.floor((left % 60000) / 1000);
      count.textContent = m + ':' + (s < 10 ? '0' + s : s);
    }
    paint();
    if (countdownTimer) clearInterval(countdownTimer);
    countdownTimer = setInterval(function () {
      left -= 1000;
      if (left <= 0) {
        clearInterval(countdownTimer);
        countdownTimer = null;
        count.textContent = '休息好啦！';
        btn.textContent = '我休息好啦，继续玩';
        return;
      }
      paint();
    }, 1000);
  }

  function closeRest() {
    if (restLayer) restLayer.hidden = true;
    if (countdownTimer) {
      clearInterval(countdownTimer);
      countdownTimer = null;
    }
    scheduleRest();
  }

  function scheduleRest() {
    if (restTimer) clearTimeout(restTimer);
    restTimer = setTimeout(showRest, REST_AFTER);
  }

  /* ---------------- 启动 ---------------- */
  function boot() {
    rootEl = doc.getElementById('km-app');
    restLayer = doc.getElementById('km-rest');
    if (!rootEl) return;

    // 1. 内容校验：没有 sourceRef 的内容不允许渲染
    var missing = KM.Knowledge.validate();
    if (missing.length && root.console && root.console.error) {
      root.console.error('[KM] 以下内容缺少 sourceRef，已跳过渲染：', missing);
    }
    var hintMissing = KM.Hints.validate();
    if (hintMissing.length && root.console && root.console.error) {
      root.console.error('[KM] 以下提示模板缺少 sourceRef：', hintMissing);
    }

    // 2. 载入持久化状态（累计积分每次打开都保留）
    KM.Points.load();

    // 2.1 恢复登录会话并在后台合并云端积分（未配置时自动跳过）
    if (KM.Account) KM.Account.init();

    // 3. 首次手势解锁 WebAudio
    function unlockOnce() {
      KM.Audio.unlock();
      doc.removeEventListener('touchstart', unlockOnce);
      doc.removeEventListener('mousedown', unlockOnce);
      doc.removeEventListener('keydown', unlockOnce);
    }
    doc.addEventListener('touchstart', unlockOnce, false);
    doc.addEventListener('mousedown', unlockOnce, false);
    doc.addEventListener('keydown', unlockOnce, false);

    // 4. 隐藏自测入口：?selftest=1
    var query = root.location && root.location.search ? root.location.search : '';
    var isSelfTest = /(^|[?&])selftest=1(&|$)/.test(query);
    currentPage = isSelfTest ? 'selftest' : 'home';

    render();
    scheduleRest();

    if (root.console && root.console.info) {
      root.console.info('[KM] 数数的数学乐园已就绪。隐藏自测：首页吉祥物连点 5 次，或 URL 加 ?selftest=1');
    }
  }

  KM.App = {
    go: go,
    refresh: refresh,
    render: render,
    showRest: showRest,
    closeRest: closeRest,
    current: function () { return currentPage; }
  };

  if (doc.readyState === 'loading') {
    doc.addEventListener('DOMContentLoaded', boot, false);
  } else {
    boot();
  }
})(typeof window !== 'undefined' ? window : globalThis);
