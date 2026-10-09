# 部署到 GitHub Pages

本仓库是纯静态站点，应用入口在 `app/index.html`。仓库自带 GitHub Actions 工作流，推送后自动把 `app/` 发布为站点，无需任何构建步骤。

## 一键部署步骤

### 1. 上传到 GitHub

```bash
git init
git add .
git commit -m "kids-math: 响应式 + 云同步 + 文档"
git branch -M main
git remote add origin https://github.com/<你的用户名>/kids-math.git
git push -u origin main
```

（也可以用 `gh repo create kids-math --public --source=. --push`。）

### 2. 开启 Pages

1. 打开仓库 **Settings → Pages**；
2. **Build and deployment → Source** 选择 **GitHub Actions**；
3. 回到 **Actions** 页，等 `Deploy to GitHub Pages` 工作流运行完成（首次约 1 分钟）。

完成后站点地址为：

```text
https://<你的用户名>.github.io/kids-math/
```

`.github/workflows/deploy-pages.yml` 已随仓库提交，无需手工创建。

### 3. 开启登录云同步（可选）

按 [docs/ACCOUNT_SYNC.md](ACCOUNT_SYNC.md) 配置 Supabase，把 `app/js/config.js` 填好后重新提交。anon key 是公开密钥，可安全入库。

## 本地预览

```bash
# Python（Windows / macOS / Linux 通用）
cd app
python -m http.server 8000
# 打开 http://localhost:8000

# 或任意静态服务器，例如 npx serve app
```

> 直接双击 `app/index.html` 也能运行（应用特意不使用 ES module，兼容 `file://`）。
> 但建议用静态服务器验证云同步与完整环境。

## 自定义域名

1. 域名 DNS 增加 `CNAME` 记录指向 `<用户名>.github.io`；
2. 仓库 **Settings → Pages → Custom domain** 填入域名；
3. 启用 HTTPS（GitHub 自动签发证书）；
4. 在 `.github/workflows/deploy-pages.yml` 的 `path: app` 目录里加一个 `CNAME` 文件（内容为你的域名），或让 GitHub 代为生成。

## 更新部署

任何推送到 `main` 的提交都会自动触发重新部署；也可以到 **Actions → Deploy to GitHub Pages → Run workflow** 手动触发。

## 说明

- 工作流使用 `upload-pages-artifact` + `deploy-pages`，把 `app/` 原样发布；
- 站点在无配置时自动运行「纯本地模式」，仍可完整体验，不依赖 Supabase；
- 仓库公开时请确认：`app/js/config.js` 只含 anon key（公开密钥），不要提交 `service_role` 密钥。