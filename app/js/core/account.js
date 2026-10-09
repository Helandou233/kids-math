/* ============================================================
   account.js —— 账号登录 + 积分云同步（Supabase）
   ------------------------------------------------------------
   · 使用 Supabase Auth（邮箱 + 密码）做家长账号登录。
   · 积分状态整体存到 profiles.state（jsonb），开启 RLS，
     每个账号只能读写自己的那一行。
   · 通过原生 fetch 调用 Supabase REST 接口，零 npm 依赖，
     配置为空或网络不可用时自动降级为「纯本地模式」。

   同步策略（对儿童友好的“只增不减”合并）：
   · totalPoints / 徽章 / 学完的知识点 / 签到天数等取较大值；
   · 账本 ledger 按幂等键去重后合并，防止重复计分；
   · 以 updatedAt 较新的一方为基础，双方都有的字段取最大值。
   ============================================================ */
(function (root) {
  'use strict';

  var KM = root.KM = root.KM || {};

  var SESSION_KEY = 'auth.v1';
  var META_KEY = 'meta.sync';
  var TABLE = 'profiles';
  var TIMEOUT_MS = 12000;

  var session = null;
  var lastSyncAt = 0;
  var lastError = '';
  var syncTimer = null;
  var syncing = false;
  var listeners = [];

  /* ---------------- 配置 ---------------- */
  function cfg() { return KM.Config || {}; }

  function configured() {
    var url = String(cfg().SUPABASE_URL || '').trim();
    var key = String(cfg().SUPABASE_ANON_KEY || '').trim();
    if (!url || !key) return false;
    if (url.indexOf('YOUR-PROJECT') >= 0) return false;
    if (key.indexOf('YOUR-') >= 0) return false;
    return true;
  }

  function baseUrl() {
    return String(cfg().SUPABASE_URL || '').replace(/\/+$/, '');
  }

  function anonKey() { return cfg().SUPABASE_ANON_KEY; }

  /* ---------------- 小工具 ---------------- */
  function num(v) { return (typeof v === 'number' && isFinite(v)) ? v : 0; }

  function maxNum(a, b) { return Math.max(num(a), num(b)); }

  function maxStr(a, b) {
    var sa = (typeof a === 'string') ? a : '';
    var sb = (typeof b === 'string') ? b : '';
    return sa > sb ? sa : sb;
  }

  function clone(v) {
    if (v === undefined || v === null) return null;
    try { return JSON.parse(JSON.stringify(v)); } catch (err) { return null; }
  }

  function unionStringLists(a, b) {
    var seen = Object.create(null);
    var out = [];
    [].concat(a || [], b || []).forEach(function (item) {
      if (typeof item !== 'string') return;
      if (seen[item]) return;
      seen[item] = true;
      out.push(item);
    });
    return out;
  }

  function errText(err, fallback) {
    return (err && err.message) ? err.message : (fallback || '同步失败');
  }

  function emit() {
    listeners.forEach(function (fn) {
      try { fn(); } catch (err) { /* 忽略监听器异常 */ }
    });
  }

  /* ---------------- 网络封装（原生 fetch + 超时） ---------------- */
  function request(url, opts) {
    if (!root.fetch || typeof root.fetch !== 'function') {
      return Promise.reject(new Error('当前环境不支持网络请求'));
    }
    opts = opts || {};
    var ctl = (typeof root.AbortController !== 'undefined') ? new root.AbortController() : null;
    var timer = null;
    if (ctl) {
      timer = setTimeout(function () { ctl.abort(); }, TIMEOUT_MS);
      opts.signal = ctl.signal;
    }
    return root.fetch(url, opts).then(function (res) {
      if (timer) clearTimeout(timer);
      return res;
    }, function (err) {
      if (timer) clearTimeout(timer);
      throw err;
    });
  }

  function jsonError(res, data, fallback) {
    var msg = data && (data.error_description || data.msg || data.message);
    if (msg) return msg;
    return fallback + '（' + res.status + '）';
  }

  /* ---------------- Auth（邮箱 + 密码） ---------------- */
  function authHeaders(token) {
    var h = {
      'apikey': anonKey(),
      'Authorization': 'Bearer ' + token,
      'Content-Type': 'application/json'
    };
    return h;
  }

  function parseAuth(res, fallback) {
    return res.json().then(function (data) {
      if (!res.ok) throw new Error(jsonError(res, data, fallback));
      if (!data || !data.access_token) throw new Error('未返回登录令牌');
      return data;
    });
  }

  function authSignup(email, password) {
    return request(baseUrl() + '/auth/v1/signup', {
      method: 'POST',
      headers: { 'apikey': anonKey(), 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: email, password: password })
    }).then(function (res) { return parseAuth(res, '注册失败'); });
  }

  function authLogin(email, password) {
    return request(baseUrl() + '/auth/v1/token?grant_type=password', {
      method: 'POST',
      headers: { 'apikey': anonKey(), 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: email, password: password })
    }).then(function (res) { return parseAuth(res, '登录失败'); });
  }

  function refreshToken(refreshToken) {
    return request(baseUrl() + '/auth/v1/token?grant_type=refresh_token', {
      method: 'POST',
      headers: { 'apikey': anonKey(), 'Content-Type': 'application/json' },
      body: JSON.stringify({ refresh_token: refreshToken })
    }).then(function (res) { return parseAuth(res, '登录已过期'); });
  }

  /* ---------------- profiles 表读写 ---------------- */
  function fetchProfile(token, uid) {
    var url = baseUrl() + '/rest/v1/' + TABLE +
      '?select=id,email,display_name,state,updated_at&id=eq.' + encodeURIComponent(uid);
    return request(url, { headers: authHeaders(token) }).then(function (res) {
      return res.json().then(function (rows) {
        if (!res.ok) throw new Error(jsonError(res, (rows && rows.message) ? { message: rows.message } : null, '读取云端失败'));
        return (Array.isArray(rows) && rows[0]) ? rows[0] : null;
      });
    });
  }

  function upsertProfile(token, uid, email, displayName, state) {
    var url = baseUrl() + '/rest/v1/' + TABLE + '?on_conflict=id';
    var h = authHeaders(token);
    h['Prefer'] = 'resolution=merge-duplicates,return=representation';
    return request(url, {
      method: 'POST',
      headers: h,
      body: JSON.stringify({
        id: uid,
        email: email,
        display_name: displayName,
        state: state,
        updated_at: new Date().toISOString()
      })
    }).then(function (res) {
      return res.json().then(function (rows) {
        if (!res.ok) throw new Error(jsonError(res, (rows && rows.message) ? { message: rows.message } : null, '写入云端失败'));
        return rows && rows[0];
      });
    });
  }

  /* ---------------- 会话本地持久化 ---------------- */
  function displayNameOf(email) {
    var e = String(email || '');
    var at = e.indexOf('@');
    return at > 0 ? e.slice(0, at) : (e || '小朋友的家长');
  }

  function applySession(data) {
    session = {
      uid: (data.user && data.user.id) ? data.user.id : (data.userId || ''),
      email: (data.user && data.user.email) ? data.user.email : '',
      displayName: (data.user && data.user.user_metadata && data.user.user_metadata.display_name) ||
        displayNameOf(data.user && data.user.email),
      accessToken: data.access_token,
      refreshToken: data.refresh_token || (session ? session.refreshToken : ''),
      expiresAt: Date.now() + (num(data.expires_in) || 3600) * 1000
    };
    persistSession();
    emit();
    return session;
  }

  function persistSession() {
    if (KM.Storage) KM.Storage.set(SESSION_KEY, session);
  }

  function clearSession() {
    session = null;
    if (KM.Storage) KM.Storage.remove(SESSION_KEY);
    emit();
  }

  function restoreSession() {
    var saved = KM.Storage ? KM.Storage.get(SESSION_KEY, null) : null;
    session = (saved && saved.accessToken) ? saved : null;
  }

  /** 会话有效即返回 true；过期则尝试刷新，刷新失败则退出登录 */
  function ensureSessionValid() {
    if (!session) return Promise.resolve(false);
    if (session.expiresAt && Date.now() < session.expiresAt - 30000) return Promise.resolve(true);
    return refreshToken(session.refreshToken).then(function (data) {
      applySession(data);
      return true;
    }, function () {
      clearSession();
      return false;
    });
  }

  /* ---------------- 多端状态合并 ---------------- */
  function pickLater(a, b) {
    a = (a && typeof a === 'object') ? a : { date: '', set: false, card: false, correctCount: 0 };
    b = (b && typeof b === 'object') ? b : { date: '', set: false, card: false, correctCount: 0 };
    if (String(a.date || '') === String(b.date || '')) {
      return {
        date: a.date || b.date || '',
        set: !!a.set || !!b.set,
        card: !!a.card || !!b.card,
        correctCount: maxNum(a.correctCount, b.correctCount)
      };
    }
    return String(a.date || '') > String(b.date || '') ? clone(a) : clone(b);
  }

  function pickLaterDaily(a, b) {
    a = (a && typeof a === 'object') ? a : { date: '', earned: 0 };
    b = (b && typeof b === 'object') ? b : { date: '', earned: 0 };
    if (String(a.date || '') === String(b.date || '')) {
      return { date: a.date || b.date || '', earned: maxNum(a.earned, b.earned) };
    }
    return String(a.date || '') > String(b.date || '') ? clone(a) : clone(b);
  }

  function pickLaterCount(a, b) {
    a = (a && typeof a === 'object') ? a : { date: '', count: 0 };
    b = (b && typeof b === 'object') ? b : { date: '', count: 0 };
    if (String(a.date || '') === String(b.date || '')) {
      return { date: a.date || b.date || '', count: maxNum(a.count, b.count) };
    }
    return String(a.date || '') > String(b.date || '') ? clone(a) : clone(b);
  }

  function mergeWrongBook(a, b) {
    var seen = Object.create(null);
    var out = [];
    [].concat(a || [], b || []).forEach(function (w) {
      if (!w || typeof w !== 'object') return;
      var key = String(w.t || '') + ':' + String(w.display || '');
      if (seen[key]) return;
      seen[key] = true;
      out.push(w);
    });
    out.sort(function (x, y) { return num(x.t) - num(y.t); });
    return out.slice(-100);
  }

  function mergeDifficulty(base, other) {
    base = (base && typeof base === 'object') ? base : {};
    other = (other && typeof other === 'object') ? other : {};
    var out = {};
    Object.keys(other).forEach(function (k) { out[k] = other[k]; });
    Object.keys(base).forEach(function (k) { out[k] = base[k]; });  // 冲突时以较新方为准
    return out;
  }

  function mergeLedger(a, b) {
    var seen = Object.create(null);
    var out = [];
    [].concat(a || [], b || []).forEach(function (item) {
      if (!item || typeof item !== 'object') return;
      var key = String(item.key || '') || (String(item.t || '') + ':' + String(item.reason || ''));
      if (seen[key]) return;
      seen[key] = true;
      out.push(item);
    });
    out.sort(function (x, y) { return num(x.t) - num(y.t); });
    return out.slice(-300);
  }

  function mergeStates(localState, remoteState) {
    var a = (localState && typeof localState === 'object') ? localState : null;
    var b = (remoteState && typeof remoteState === 'object') ? remoteState : null;
    if (!a && !b) return null;
    if (!a) return clone(b);
    if (!b) return clone(a);

    var bNewer = num(b.updatedAt) >= num(a.updatedAt);
    var base = bNewer ? clone(b) : clone(a);
    var other = bNewer ? a : b;
    if (!base) return clone(a);

    base.updatedAt = Date.now();
    base.version = 1;
    base.totalPoints = maxNum(base.totalPoints, other.totalPoints);
    base.availablePoints = maxNum(base.availablePoints, other.availablePoints);
    base.setsDone = maxNum(base.setsDone, other.setsDone);
    base.perfectSets = maxNum(base.perfectSets, other.perfectSets);
    base.bestCombo = maxNum(base.bestCombo, other.bestCombo);
    base.correctTotal = maxNum(base.correctTotal, other.correctTotal);
    base.learnedKp = unionStringLists(base.learnedKp, other.learnedKp);
    base.readCards = unionStringLists(base.readCards, other.readCards);
    base.badges = unionStringLists(base.badges, other.badges);
    base.sign = {
      lastDate: maxStr(base.sign && base.sign.lastDate, other.sign && other.sign.lastDate),
      streak: maxNum(base.sign && base.sign.streak, other.sign && other.sign.streak),
      totalDays: maxNum(base.sign && base.sign.totalDays, other.sign && other.sign.totalDays)
    };
    base.tasks = pickLater(base.tasks, other.tasks);
    base.daily = pickLaterDaily(base.daily, other.daily);
    base.l3 = pickLaterCount(base.l3, other.l3);
    base.wrongBook = mergeWrongBook(base.wrongBook, other.wrongBook);
    base.difficulty = mergeDifficulty(base.difficulty, other.difficulty);
    base.ledger = mergeLedger(base.ledger, other.ledger);
    return base;
  }

  /* ---------------- 同步流程 ---------------- */
  function markDone(err) {
    syncing = false;
    if (err) {
      lastError = errText(err);
      if (root.console && root.console.warn) {
        root.console.warn('[KM.Account] 同步失败：' + lastError);
      }
    } else {
      lastError = '';
    }
    emit();
  }

  /** 把本地合并后的状态写入云端 */
  function pushState() {
    if (!configured() || !session) return Promise.resolve({ ok: false, code: 'no-session' });
    var state = KM.Points ? KM.Points.state() : null;
    var payload = state ? clone(state) : {};
    if (!payload) payload = {};
    payload.updatedAt = Date.now();
    return upsertProfile(session.accessToken, session.uid, session.email, session.displayName, payload)
      .then(function () {
        lastSyncAt = Date.now();
        lastError = '';
        if (KM.Storage) KM.Storage.set(META_KEY, lastSyncAt);
        emit();
        return { ok: true, code: 'pushed' };
      });
  }

  /** 拉取云端 → 与本地合并 → 写回云端（登录 / 手动同步 / 防抖同步共用） */
  function syncFromCloud() {
    if (!configured()) return Promise.resolve({ ok: false, code: 'unconfigured' });
    if (!session) return Promise.resolve({ ok: false, code: 'logged-out' });
    if (syncing) return Promise.resolve({ ok: false, code: 'busy' });

    syncing = true;
    emit();

    var job = fetchProfile(session.accessToken, session.uid).then(function (profile) {
      if (!profile || !profile.state) {
        return pushState();
      }
      var local = KM.Points ? KM.Points.state() : null;
      var merged = mergeStates(local, profile.state);
      if (merged && KM.Points && KM.Points.replace) {
        KM.Points.replace(merged);   // replace 会触发 save，syncing=true 时不会二次同步
      }
      return pushState();
    });

    return job.then(function (res) {
      markDone(null);
      return res;
    }, function (err) {
      markDone(err);
      return { ok: false, code: 'error', message: errText(err) };
    });
  }

  function syncSoon() {
    if (!configured() || !session || syncing) return;
    if (syncTimer) clearTimeout(syncTimer);
    var delay = num(cfg().SYNC_DEBOUNCE_MS);
    if (delay < 0) delay = 0;
    syncTimer = setTimeout(function () {
      syncTimer = null;
      syncFromCloud();
    }, delay || 1500);
  }

  /* ---------------- 对外 API ---------------- */
  function init() {
    restoreSession();
    lastSyncAt = num(KM.Storage ? KM.Storage.get(META_KEY, 0) : 0);
    emit();
    if (!configured()) return;
    ensureSessionValid().then(function (ok) {
      emit();
      if (ok) return syncFromCloud();
      return null;
    }, function () {
      emit();
    });
  }

  function login(email, password) {
    if (!configured()) return Promise.resolve({ ok: false, code: 'unconfigured', message: '请先填写云端配置' });
    return loginRaw(email, password);
  }

  function loginRaw(email, password) {
    return authLogin(email, password).then(function (data) {
      applySession(data);
      // 登录成功即算成功；首次同步失败不拦人，防抖同步稍后自动重试。
      return syncFromCloud().then(function (syncRes) {
        emit();
        return { ok: true, code: 'authed', sync: syncRes };
      }, function (syncErr) {
        markDone(syncErr);
        return { ok: true, code: 'authed', sync: { ok: false, code: 'error', message: errText(syncErr) } };
      });
    }, function (err) {
      markDone(err);
      return { ok: false, code: 'error', message: errText(err, '登录失败') };
    });
  }

  function signup(email, password) {
    if (!configured()) return Promise.resolve({ ok: false, code: 'unconfigured', message: '请先填写云端配置' });
    return signupRaw(email, password);
  }

  function signupRaw(email, password) {
    return authSignup(email, password).then(function (data) {
      applySession(data);
      // 注册成功即算成功；首次同步失败不拦人，防抖同步稍后自动重试。
      return syncFromCloud().then(function (syncRes) {
        emit();
        return { ok: true, code: 'authed', sync: syncRes };
      }, function (syncErr) {
        markDone(syncErr);
        return { ok: true, code: 'authed', sync: { ok: false, code: 'error', message: errText(syncErr) } };
      });
    }, function (err) {
      markDone(err);
      return { ok: false, code: 'error', message: errText(err, '注册失败') };
    });
  }

  function logout() {
    if (syncTimer) {
      clearTimeout(syncTimer);
      syncTimer = null;
    }
    clearSession();
  }

  function statusLabel() {
    if (!configured()) return '未配置云账号 · 积分保存在本机';
    if (!session) return '未登录 · 积分保存在本机';
    var who = session.displayName || session.email || '已登录';
    if (syncing) return who + ' · 正在同步…';
    if (lastError) return who + ' · 上次同步失败，可手动重试';
    if (lastSyncAt) return who + ' · 云端已同步';
    return who + ' · 首次同步中…';
  }

  KM.Account = {
    configured: configured,
    isLoggedIn: function () { return !!session; },
    user: function () {
      return session ? { uid: session.uid, email: session.email, displayName: session.displayName } : null;
    },
    init: init,
    login: login,
    signup: signup,
    logout: logout,
    syncNow: function () {
      if (!configured()) return Promise.resolve({ ok: false, code: 'unconfigured' });
      if (!session) return Promise.resolve({ ok: false, code: 'logged-out' });
      return syncFromCloud();
    },
    syncSoon: syncSoon,
    lastSyncAt: function () { return lastSyncAt; },
    lastError: function () { return lastError; },
    statusLabel: statusLabel,
    onChange: function (fn) {
      if (typeof fn === 'function') listeners.push(fn);
    }
  };
})(typeof window !== 'undefined' ? window : globalThis);