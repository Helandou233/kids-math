/* ============================================================
   account.js（ui）—— 「账号与云同步」页面
   家长用邮箱 + 密码登录，孩子的积分自动跨设备同步。
   未配置 Supabase 时显示配置指引；未登录时显示登录/注册表单。
   ============================================================ */
(function (root) {
  'use strict';

  var KM = root.KM = root.KM || {};

  var authMode = 'login';   // 'login' | 'signup'

  function makeInput(D, type, placeholder) {
    var el = D.el('input', 'km-input');
    el.type = type || 'text';
    el.setAttribute('placeholder', placeholder || '');
    return el;
  }

  function fmtTime(ms) {
    if (!ms) return '还没有同步过';
    try { return new Date(ms).toLocaleString(); } catch (err) { return '刚刚'; }
  }

  /* ---------------- 未配置 ---------------- */
  function renderUnconfigured(page, D) {
    var card = D.el('div', 'km-card km-auth-card');
    card.innerHTML =
      '<div class="km-auth-title">云端同步还没配置</div>' +
      '<div class="km-auth-desc">现在积分只保存在这台设备的浏览器里，换设备不会丢失本机数据，但还不能跨设备同步。</div>' +
      '<div class="km-auth-desc">想要「一个账号、手机电脑通用」，请免费创建一个 Supabase 项目，然后在 ' +
      '<code>app/js/config.js</code> 里填上下面两项：</div>' +
      '<div class="km-auth-code">SUPABASE_URL: \'https://你的项目.supabase.co\'<br>' +
      'SUPABASE_ANON_KEY: \'你的 anon key\'</div>' +
      '<div class="km-auth-desc">建表和权限 SQL、逐步截图级步骤都在 <code>docs/ACCOUNT_SYNC.md</code>，照着做约 5 分钟。</div>';
    page.appendChild(card);

    var back = D.el('button', 'km-btn km-btn--block km-btn--ghost km-mt-14', '我知道了，先离线玩');
    D.on(back, 'click', function () { KM.App.go('home'); });
    page.appendChild(back);
  }

  /* ---------------- 已登录 ---------------- */
  function renderLoggedIn(page, D, rootEl) {
    var user = KM.Account.user();
    var card = D.el('div', 'km-card km-auth-card');
    card.innerHTML =
      '<div class="km-auth-title">家长账号</div>' +
      '<div class="km-auth-email">' + D.esc(user ? user.displayName : '') +
      (user && user.email ? ' <span class="km-text-faint">· ' + D.esc(user.email) + '</span>' : '') + '</div>';

    var status = D.el('div', 'km-auth-status');
    status.innerHTML = D.icon('cloud', 22) + '<span>' + D.esc(KM.Account.statusLabel()) + '</span>';
    card.appendChild(status);

    var meta = D.el('div', 'km-auth-meta', '上次成功同步：' + D.esc(fmtTime(KM.Account.lastSyncAt())));
    card.appendChild(meta);
    if (KM.Account.lastError()) {
      card.appendChild(D.el('div', 'km-auth-error km-mt-8', '上次失败原因：' + D.esc(KM.Account.lastError())));
    }
    page.appendChild(card);

    var syncBtn = D.el('button', 'km-btn km-btn--block km-btn--green km-mt-14', '立即同步');
    D.on(syncBtn, 'click', function () {
      syncBtn.disabled = true;
      syncBtn.textContent = '正在同步…';
      KM.Account.syncNow().then(function (res) {
        syncBtn.disabled = false;
        if (res.ok) {
          KM.Audio.playReward();
          KM.Dom.toast('同步成功');
        } else {
          KM.Dom.toast(res.code === 'busy' ? '正在同步中' : '同步失败，稍后再试');
        }
        render(rootEl);
      }, function () {
        syncBtn.disabled = false;
        KM.Dom.toast('同步失败，稍后再试');
        render(rootEl);
      });
    });
    page.appendChild(syncBtn);

    var logoutBtn = D.el('button', 'km-btn km-btn--block km-btn--ghost km-mt-14', '退出登录');
    D.on(logoutBtn, 'click', function () {
      KM.Account.logout();
      KM.Dom.toast('已退出，本机积分仍保留');
      render(rootEl);
    });
    page.appendChild(logoutBtn);

    page.appendChild(D.el('div', 'km-center km-muted km-mt-14',
      '同一账号在手机和电脑登录后，积分会自动合并，只增不减。'));
  }

  /* ---------------- 登录 / 注册 ---------------- */
  function renderAuthForm(page, D, rootEl) {
    var isLogin = authMode === 'login';
    var card = D.el('div', 'km-card km-auth-card');

    card.appendChild(D.el('div', 'km-auth-title', isLogin ? '家长登录' : '创建家长账号'));

    var seg = D.el('div', 'km-chiprow km-mt-8');
    var bLogin = D.el('button', 'km-chip' + (isLogin ? ' is-on' : ''), '登录');
    var bSignup = D.el('button', 'km-chip' + (!isLogin ? ' is-on' : ''), '注册');
    D.on(bLogin, 'click', function () {
      authMode = 'login';
      KM.Audio.playTap();
      render(rootEl);
    });
    D.on(bSignup, 'click', function () {
      authMode = 'signup';
      KM.Audio.playTap();
      render(rootEl);
    });
    seg.appendChild(bLogin);
    seg.appendChild(bSignup);
    card.appendChild(seg);

    var emailInput = makeInput(D, 'email', '家长邮箱');
    var pwdInput = makeInput(D, 'password', '密码（至少 6 位）');
    var field1 = D.el('div', 'km-field km-mt-14');
    field1.appendChild(emailInput);
    card.appendChild(field1);
    var field2 = D.el('div', 'km-field km-mt-14');
    field2.appendChild(pwdInput);
    card.appendChild(field2);

    var errorBox = D.el('div', 'km-auth-error km-mt-14');
    errorBox.hidden = true;
    card.appendChild(errorBox);

    var submit = D.el('button', 'km-btn km-btn--block km-btn--lg km-mt-14',
      isLogin ? '登录并同步积分' : '注册并同步积分');
    card.appendChild(submit);

    function fail(msg) {
      errorBox.hidden = false;
      errorBox.textContent = msg;
      submit.disabled = false;
      submit.textContent = isLogin ? '登录并同步积分' : '注册并同步积分';
    }

    function doSubmit() {
      var email = String(emailInput.value || '').trim();
      var password = String(pwdInput.value || '');
      if (email.indexOf('@') < 0) { fail('请填写正确的邮箱地址'); return; }
      if (password.length < 6) { fail('密码至少 6 位'); return; }
      errorBox.hidden = true;
      submit.disabled = true;
      submit.textContent = '正在同步…';
      var action = isLogin ? KM.Account.login : KM.Account.signup;
      action(email, password).then(function (res) {
        if (res.ok) {
          KM.Audio.playReward();
          if (res.sync && res.sync.ok) {
            KM.Dom.toast(isLogin ? '登录成功，积分已同步' : '注册成功，积分已保存');
          } else {
            KM.Dom.toast(isLogin ? '登录成功，云端稍后自动同步' : '注册成功，云端稍后自动同步');
          }
          KM.App.go('home');
        } else {
          fail(res.message || (isLogin ? '登录失败，请检查邮箱和密码' : '注册失败，请稍后再试'));
        }
      }, function (err) {
        fail((err && err.message) ? err.message : '网络异常，请稍后再试');
      });
    }

    D.on(submit, 'click', doSubmit);
    D.on(emailInput, 'keydown', function (e) {
      if (e && (e.key === 'Enter' || e.keyCode === 13)) doSubmit();
    });
    D.on(pwdInput, 'keydown', function (e) {
      if (e && (e.key === 'Enter' || e.keyCode === 13)) doSubmit();
    });

    page.appendChild(card);

    page.appendChild(D.el('div', 'km-center km-muted km-mt-14',
      '一个家长账号 = 一份云端积分。孩子的积分永远只增不减，换设备也不丢。'));
  }

  /* ---------------- 入口 ---------------- */
  function render(rootEl) {
    var D = KM.Dom;
    D.clear(rootEl);
    var page = D.el('div', 'km-page');
    page.appendChild(D.topbar({
      title: '账号与云同步',
      onBack: function () { KM.App.go('home'); },
      right: 'sound'
    }));

    if (!KM.Account.configured()) {
      renderUnconfigured(page, D);
    } else if (KM.Account.isLoggedIn()) {
      renderLoggedIn(page, D, rootEl);
    } else {
      renderAuthForm(page, D, rootEl);
    }

    rootEl.appendChild(page);
  }

  KM.AccountUi = { render: render };
})(typeof window !== 'undefined' ? window : globalThis);