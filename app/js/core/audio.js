/* ============================================================
   audio.js —— WebAudio 合成音效（不使用任何音频文件）
   默认音量 50%，提供全局静音开关并持久化。
   ============================================================ */
(function (root) {
  'use strict';

  var KM = root.KM = root.KM || {};

  var STORE_KEY = 'settings.audio';

  var defaults = { muted: false, volume: 0.5 };

  var state = {
    muted: defaults.muted,
    volume: defaults.volume
  };

  var ctx = null;          // AudioContext（延迟创建）
  var master = null;       // 主增益节点
  var unlocked = false;

  function loadState() {
    var saved = KM.Storage ? KM.Storage.get(STORE_KEY, null) : null;
    if (saved && typeof saved === 'object') {
      state.muted = !!saved.muted;
      state.volume = typeof saved.volume === 'number' ? saved.volume : defaults.volume;
      if (state.volume < 0) state.volume = 0;
      if (state.volume > 1) state.volume = 1;
    }
  }

  function saveState() {
    if (KM.Storage) KM.Storage.set(STORE_KEY, state);
  }

  /** 确保 AudioContext 已创建（必须在用户手势之后调用） */
  function ensureCtx() {
    if (ctx) return ctx;
    var AC = root.AudioContext || root.webkitAudioContext;
    if (!AC) return null;
    try {
      ctx = new AC();
      master = ctx.createGain();
      master.gain.value = state.muted ? 0 : state.volume;
      master.connect(ctx.destination);
    } catch (err) {
      ctx = null;
      return null;
    }
    return ctx;
  }

  /** 首次用户手势时解锁音频（iOS/Safari 需要） */
  function unlock() {
    var c = ensureCtx();
    if (!c) return false;
    if (c.state === 'suspended' && c.resume) {
      c.resume();
    }
    unlocked = true;
    return true;
  }

  /**
   * 播放一个音符。
   * @param {number} freq 频率 Hz
   * @param {number} startOffset 相对当前时间的起始偏移（秒）
   * @param {number} duration 时长（秒）
   * @param {string} type 波形
   * @param {number} peak 峰值增益
   */
  function tone(freq, startOffset, duration, type, peak) {
    if (state.muted || !ensureCtx()) return;
    var now = ctx.currentTime + startOffset;
    var osc = ctx.createOscillator();
    var gain = ctx.createGain();
    osc.type = type || 'sine';
    osc.frequency.setValueAtTime(freq, now);
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(Math.max(0.0001, peak), now + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);
    osc.connect(gain);
    gain.connect(master);
    osc.start(now);
    osc.stop(now + duration + 0.05);
  }

  /** 答对：上行三音 C-E-G（C5 523.25 / E5 659.25 / G5 783.99） */
  function playCorrect() {
    var v = 0.34;
    tone(523.25, 0.00, 0.16, 'sine', v);
    tone(659.25, 0.10, 0.16, 'sine', v);
    tone(783.99, 0.20, 0.30, 'sine', v);
  }

  /** 答错（柔和提示，不用刺耳音）：两个下行柔和音 + 一点圆润尾音 */
  function playSoft() {
    var v = 0.22;
    tone(392.00, 0.00, 0.14, 'triangle', v);
    tone(349.23, 0.12, 0.26, 'triangle', v);
  }

  /** 按键点击 */
  function playTap() {
    tone(880, 0, 0.06, 'square', 0.10);
  }

  /** Combo 特效音：等级越高音越亮 */
  function playCombo(level) {
    var base = 523.25;
    var steps = [0, 4, 7, 12];
    for (var i = 0; i < steps.length; i++) {
      var f = base * Math.pow(2, steps[i] / 12);
      tone(f, i * 0.08, 0.22, 'triangle', 0.26);
    }
    if (level >= 10) {
      tone(1046.50, 0.36, 0.4, 'sine', 0.3);
    }
  }

  /** 获得奖励（积分 / 徽章 / 签到） */
  function playReward() {
    var seq = [659.25, 783.99, 1046.50];
    for (var i = 0; i < seq.length; i++) {
      tone(seq[i], i * 0.09, 0.28, 'sine', 0.3);
    }
  }

  /** 翻页 / 进入页面 */
  function playPage() {
    tone(659.25, 0, 0.08, 'sine', 0.16);
  }

  /** 设置静音 */
  function setMuted(muted) {
    state.muted = !!muted;
    if (master) master.gain.value = state.muted ? 0 : state.volume;
    saveState();
    return state.muted;
  }

  /** 切换静音，返回切换后的状态 */
  function toggleMuted() {
    return setMuted(!state.muted);
  }

  function isMuted() { return state.muted; }
  function getVolume() { return state.volume; }

  function setVolume(v) {
    state.volume = Math.max(0, Math.min(1, v));
    if (master && !state.muted) master.gain.value = state.volume;
    saveState();
    return state.volume;
  }

  loadState();

  KM.Audio = {
    unlock: unlock,
    playCorrect: playCorrect,
    playSoft: playSoft,
    playTap: playTap,
    playCombo: playCombo,
    playReward: playReward,
    playPage: playPage,
    setMuted: setMuted,
    toggleMuted: toggleMuted,
    isMuted: isMuted,
    getVolume: getVolume,
    setVolume: setVolume,
    state: state
  };
})(typeof window !== 'undefined' ? window : globalThis);
