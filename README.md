# 数数的数学乐园 · KidsMath

> 🚀 **立即在线使用（无需下载任何文件）：<https://helandou233.github.io/kids-math/>**
> 用手机或电脑浏览器直接打开即可开始「学一学 / 练一练 / 我的星星」，积分默认保存在浏览器本地。

一款面向 **6–9 岁儿童**（小学一至三年级）的数学启蒙网页应用：看动画学概念、随机题练四则运算、攒积分长成长树。纯原生 HTML / CSS / JavaScript，**零 npm 依赖、零构建**，手机端与 PC 端通用，可直接部署到 GitHub Pages。

- 📱🖥️ 响应式：移动端为第一设计尺寸，PC / 平板自动切换多列布局
- ☁️ 登录与积分云同步：Supabase 家长账号，换设备积分不丢（只增不减合并）
- 🐼 吉祥物「数数」+ 卡通动画讲解 + 三级「帮帮我」提示
- 🌱 积分 / 等级成长树 / 徽章 / 每日任务 / 连续签到
- 👀 防沉迷休息蒙层（20 分钟提醒休息 5 分钟）
- 🔒 儿童隐私友好：无广告、无社交、无陌生人排行

## 快速开始

无需安装任何依赖。二选一：

```bash
# 方式 1：直接双击 app/index.html（file:// 即可运行）

# 方式 2：本地静态服务器（推荐，便于测试云同步）
cd app
python -m http.server 8000
# 浏览器打开 http://localhost:8000
```

打开后即可开始「学一学 / 练一练 / 我的星星」。积分默认保存在浏览器 localStorage。

## 登录与积分云同步

首页右上角 👤 按钮进入「账号与云同步」。

- **默认（纯本地）**：不登录也能完整使用，积分保存在本机，卸载前不会丢。
- **开启云同步**：免费创建一个 Supabase 项目，填写 `app/js/config.js` 中的两个值即可。家长用邮箱 + 密码登录，积分自动跨手机 / 电脑同步。

> 分步配置、建表 SQL、RLS 权限说明见 **[docs/ACCOUNT_SYNC.md](docs/ACCOUNT_SYNC.md)**（约 5 分钟，免费额度即可）。
> 部署到 GitHub Pages 见 **[docs/DEPLOYMENT.md](docs/DEPLOYMENT.md)**。

## 积分规则（每日上限 200 分）

| 行为 | 分值 |
| --- | --- |
| 答对一题 | +1 |
| 完成一组 10 题 | +10 |
| 一组全对 | 再 +10 |
| 连对 3 / 5 / 10 题 | +2 / +5 / +15 |
| 学完一个知识点 | +5 |
| 看完一张特例卡 | +1 |
| 看完一次完整讲解 | +1（每日上限 10） |
| 今日签到 | +5 |
| 连续签到 3 / 7 / 30 天 | +10 / +30 / +100 |

## 响应式设计

- 手机竖屏（390×844）为第一设计尺寸：单列、大按钮、最小热区 64×64。
- 平板（≥768px）：字号、间距、画布同步放大。
- PC（≥900px）：画布放宽至 1040px，首页三大入口 / 知识点 / 特例卡 / 徽章墙改为多列网格，答题页变为「左题右键盘」双栏。

## 项目结构

```text
kids-math/
├── app/
│   ├── index.html              # 应用外壳与脚本加载顺序
│   ├── css/
│   │   ├── tokens.css          # 设计变量（配色 / 字号 / 圆角）
│   │   ├── base.css            # 重置与移动端优先布局
│   │   ├── components.css      # 组件样式
│   │   ├── account.css         # 登录 / 云同步页面
│   │   └── responsive.css      # 手机 / 平板 / PC 通用适配
│   ├── js/
│   │   ├── config.js           # Supabase 配置（留空 = 纯本地模式）
│   │   ├── core/               # storage / rules / audio / generator / points / account
│   │   ├── data/               # knowledge（知识点） / hints（三级提示）
│   │   ├── ui/                 # dom / mascot / animations / home / learn / practice / rewards / selftest / account
│   │   └── main.js             # 路由与启动
│   └── tools/                  # Node 零依赖冒烟测试
├── docs/
│   ├── PRD.md                  # 产品需求文档
│   ├── DESIGN.md               # 架构设计文档
│   ├── IMPLEMENTATION.md       # MVP 实现说明
│   ├── ACCOUNT_SYNC.md         # Supabase 登录与云同步配置
│   └── DEPLOYMENT.md           # GitHub Pages 部署指南
└── .github/workflows/deploy-pages.yml
```

## 测试

项目自带零依赖的 Node 冒烟测试（无需 npm install）：

```bash
cd app
node tools/smoke.js     # 323 项逻辑冒烟：出题规则 / 边界 / 积分不变量 / 内容校验
node tools/uismoke.js   # UI 冒烟：猴子点击 400 次 + 25 个定向场景
```

## 文档索引

- 产品需求：[docs/PRD.md](docs/PRD.md)
- 架构设计：[docs/DESIGN.md](docs/DESIGN.md)
- 实现说明：[docs/IMPLEMENTATION.md](docs/IMPLEMENTATION.md)
- 云同步：[docs/ACCOUNT_SYNC.md](docs/ACCOUNT_SYNC.md)
- 部署：[docs/DEPLOYMENT.md](docs/DEPLOYMENT.md)
- 更新日志：[docs/CHANGELOG.md](docs/CHANGELOG.md)

## 隐私说明

- 不采集任何超出登录所需的最小信息（邮箱 + 密码哈希由 Supabase 托管）。
- 积分数据仅对账号本人可见（数据库行级安全 RLS）。
- 未配置 / 未登录时，应用不发任何网络请求。
- `SUPABASE_ANON_KEY` 是公开密钥，可放心提交仓库；切勿填写 `service_role` 密钥。