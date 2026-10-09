/* ============================================================
   config.js —— 云端账号配置（Supabase）
   ------------------------------------------------------------
   首次部署前，请填写 SUPABASE_URL 与 SUPABASE_ANON_KEY。
   获取方法见 docs/ACCOUNT_SYNC.md（约 5 分钟，免费额度即可）。

   两项都保持为空时，应用自动运行在「纯本地模式」：
   · 积分照常保存到浏览器 localStorage，不会丢；
   · 登录 / 云同步功能不会发起任何网络请求；
   · 应用仍可 file:// 双击打开或部署到任意静态托管。
   ============================================================ */
(function (root) {
  'use strict';

  var KM = root.KM = root.KM || {};

  KM.Config = {
    /** Supabase 项目地址，例如 https://abcdefgh.supabase.co */
    SUPABASE_URL: '',
    /** Supabase anon/public key（可公开，勿填 service_role key） */
    SUPABASE_ANON_KEY: '',
    /** 本地积分变化后，延迟多久自动同步到云端（毫秒） */
    SYNC_DEBOUNCE_MS: 1500
  };
})(typeof window !== 'undefined' ? window : globalThis);