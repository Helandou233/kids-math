/* ============================================================
   storage.js —— localStorage 封装
   key 前缀统一为 "km."；当 localStorage 不可用（隐私模式 / file://
   个别浏览器）时自动降级为内存存储，保证功能不中断。
   ============================================================ */
(function (root) {
  'use strict';

  var KM = root.KM = root.KM || {};

  /** 统一 key 前缀 */
  var PREFIX = 'km.';

  /** 内存兜底存储 */
  var memoryStore = Object.create(null);

  /** 探测 localStorage 是否真的可写 */
  var backend = (function detect() {
    try {
      var ls = root.localStorage;
      if (!ls) return null;
      var probe = PREFIX + '__probe__';
      ls.setItem(probe, '1');
      ls.removeItem(probe);
      return ls;
    } catch (err) {
      if (root.console && root.console.warn) {
        root.console.warn('[KM.Storage] localStorage 不可用，已降级为内存存储：', err && err.message);
      }
      return null;
    }
  })();

  /**
   * 读取一个键。
   * @param {string} key 不带前缀的键名
   * @param {*} defaultValue 解析失败或不存在时的默认值
   * @returns {*} 解析后的值
   */
  function get(key, defaultValue) {
    var full = PREFIX + key;
    var raw = null;
    try {
      raw = backend ? backend.getItem(full) : memoryStore[full];
    } catch (err) {
      raw = null;
    }
    if (raw === null || raw === undefined) {
      return defaultValue;
    }
    try {
      var parsed = JSON.parse(raw);
      return (parsed === null || parsed === undefined) ? defaultValue : parsed;
    } catch (err2) {
      return defaultValue;
    }
  }

  /**
   * 写入一个键。
   * @param {string} key 不带前缀的键名
   * @param {*} value 会被 JSON 序列化的值
   * @returns {boolean} 是否写入成功
   */
  function set(key, value) {
    var full = PREFIX + key;
    var raw = '';
    try {
      raw = JSON.stringify(value);
    } catch (err) {
      if (root.console && root.console.error) {
        root.console.error('[KM.Storage] 序列化失败，跳过写入：', key, err && err.message);
      }
      return false;
    }
    try {
      if (backend) {
        backend.setItem(full, raw);
      } else {
        memoryStore[full] = raw;
      }
      return true;
    } catch (err2) {
      // 配额不足等情况：降级到内存，保证本次会话仍可用
      memoryStore[full] = raw;
      if (root.console && root.console.warn) {
        root.console.warn('[KM.Storage] 写入 localStorage 失败，已写入内存：', err2 && err2.message);
      }
      return false;
    }
  }

  /** 删除一个键 */
  function remove(key) {
    var full = PREFIX + key;
    delete memoryStore[full];
    if (backend) {
      try { backend.removeItem(full); } catch (err) { /* 忽略：已删除内存副本 */ }
    }
  }

  /** 清空所有 km.* 键（自测 / 调试用） */
  function clearAll() {
    memoryStore = Object.create(null);
    if (!backend) return 0;
    var n = 0;
    try {
      var keys = [];
      for (var i = 0; i < backend.length; i++) {
        var k = backend.key(i);
        if (k && k.indexOf(PREFIX) === 0) keys.push(k);
      }
      for (var j = 0; j < keys.length; j++) {
        backend.removeItem(keys[j]);
        n++;
      }
    } catch (err) { /* 忽略 */ }
    return n;
  }

  /** 是否使用真实 localStorage（false 表示内存兜底） */
  function isPersistent() {
    return backend !== null;
  }

  KM.Storage = {
    PREFIX: PREFIX,
    get: get,
    set: set,
    remove: remove,
    clearAll: clearAll,
    isPersistent: isPersistent
  };
})(typeof window !== 'undefined' ? window : globalThis);
