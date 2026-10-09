# 更新日志

## v1.1（2026-10-09）· 手机/PC 通用 + 登录云同步

本次更新在「纯前端离线 MVP（v1.0）」基础上补齐两条产品能力：

### 1. 手机端 / PC 端通用响应式

- 新增 `app/css/responsive.css`：手机竖屏为第一设计尺寸，平板放大，PC 切换多列布局。
- 首页三大入口：PC 一行三列；知识点 / 特例卡：PC 两列；徽章墙：PC 一行四枚。
- 答题页：PC 变为「左题右键盘」双栏（`km-quiz-shell`），手机端仍是单列。
- 放宽 viewport 的缩放限制，桌面浏览器可正常缩放。

### 2. 登录与积分云同步（Supabase）

- 新增 `app/js/config.js`：Supabase 配置，留空即「纯本地模式」，不发任何网络请求。
- 新增 `app/js/core/account.js`：邮箱 + 密码登录、会话持久化、多端积分合并（只增不减）、防抖自动同步。
- 新增 `app/js/ui/account.js`：账号与云同步页面；首页右上角新增 👤 入口与同步状态胶囊。
- `app/js/core/points.js`：状态增加 `updatedAt`，新增 `replace()`，每次本地记账后触发防抖上传（不影响本地持久化）。
- 建表 SQL、RLS 权限、逐步配置见 `docs/ACCOUNT_SYNC.md`。

### 3. 上传文档与部署

- 新增 `README.md`、`.gitignore`。
- 新增 `docs/DEPLOYMENT.md`（GitHub Pages 部署）与 `docs/ACCOUNT_SYNC.md`（云同步配置）。
- 新增 `.github/workflows/deploy-pages.yml`：推送即自动发布 `app/` 到 GitHub Pages。

### 兼容性

- 仍可 `file://` 双击 `app/index.html` 运行，零 npm 依赖、零构建。
- 原有 323 项逻辑冒烟与 UI 冒烟测试全部通过。

## v1.0（2026-10-07）· 纯前端离线 MVP

见 `docs/IMPLEMENTATION.md`。