# 登录与积分云同步配置（Supabase）

> 目标：一个「家长账号」登录后，孩子的积分在手机、平板、电脑之间自动同步，换设备、卸载重装都不丢。
> 免费层即可满足个人 / 家庭使用，整个过程约 5 分钟。

## 为什么选 Supabase

- 本应用是纯静态站点（GitHub Pages 可直接托管），没有自建后端；
- Supabase 提供「邮箱 + 密码」Auth 和 Postgres 数据库，前后端免密钥托管；
- 通过数据库 **RLS（行级安全）** 保证每个账号只能读写自己的积分；
- 只需浏览器原生 `fetch`，无需引入任何 SDK。

## 1. 创建 Supabase 项目

1. 打开 <https://supabase.com>，注册 / 登录；
2. 点击 **New project**：
   - Name：`kids-math`（随意）；
   - Database Password：设置一个强密码并**保存好**；
   - Region：选离用户最近的区域（国内用户常用 Singapore）；
3. 等待项目初始化完成（约 1–2 分钟）。

## 2. 复制 API 配置

1. 左侧 **Project Settings → API**；
2. 复制 **Project URL**（形如 `https://abcdefgh.supabase.co`）；
3. 复制 **anon / public** 密钥（以 `eyJ...` 开头的一长串）。

> ⚠️ 只复制 `anon public`。`service_role` 是超级密钥，**绝不能**放进前端代码或提交到仓库。

## 3. 填写 app/js/config.js

打开 `app/js/config.js`，把两项填进去：

```js
KM.Config = {
  SUPABASE_URL: 'https://abcdefgh.supabase.co',   // 换成你的 Project URL
  SUPABASE_ANON_KEY: 'eyJhbGciOi...',             // 换成你的 anon key
  SYNC_DEBOUNCE_MS: 1500
};
```

`SUPABASE_ANON_KEY` 本来就是公开的，提交到 GitHub 没有安全问题。

## 4. 建表并开启行级安全

左侧 **SQL Editor → New query**，粘贴并运行：

```sql
-- 每个账号一行：积分整体存 state（jsonb）
create table if not exists public.profiles (
  id          uuid primary key references auth.users (id) on delete cascade,
  email       text,
  display_name text,
  state       jsonb not null default '{}'::jsonb,
  updated_at  timestamptz not null default now()
);

alter table public.profiles enable row level security;

-- 只能看 / 写自己的那一行
drop policy if exists "own profile select" on public.profiles;
create policy "own profile select"
  on public.profiles for select using (auth.uid() = id);

drop policy if exists "own profile insert" on public.profiles;
create policy "own profile insert"
  on public.profiles for insert with check (auth.uid() = id);

drop policy if exists "own profile update" on public.profiles;
create policy "own profile update"
  on public.profiles for update using (auth.uid() = id) with check (auth.uid() = id);

-- （可选，推荐）注册后自动补一行 profile，并把邮箱同步进来
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, email, display_name)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data->>'display_name', split_part(new.email, '@', 1))
  )
  on conflict (id) do update set email = excluded.email;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();
```

## 5. 邮箱确认设置（二选一）

左侧 **Authentication → Providers → Email**：

- **方案 A（家庭自用，最省事）**：关闭 *Confirm email*，注册后即可直接登录；
- **方案 B（更安全）**：保持开启，家长注册后需要先到邮箱点确认链接才能登录。

## 6. 部署并验证

1. 把填好配置的代码重新部署（本地 `file://` 打开也可，推荐用静态服务器避免浏览器限制）；
2. 首页右上角 👤 → 「创建家长账号」→ 注册并登录；
3. 登录后练几道题，用另一台设备（或浏览器无痕窗口）登录同一账号，稍等即可看到积分同步；
4. 也可以在「账号与云同步」页点 **立即同步** 手动触发。

## 同步行为说明

| 场景 | 行为 |
| --- | --- |
| 未配置 / 未登录 | 纯本地模式，零网络请求，积分存 localStorage |
| 每次加分 | 先写本地（保证不丢），1.5 秒防抖后自动上传云端 |
| 登录 / 打开页面 | 拉取云端与本地合并后再写回，双向不丢 |
| 多设备同时使用 | 以 `updatedAt` 较新方为基准合并，**积分 / 徽章 / 签到等只增不减** |
| 退出登录 | 本机积分保留，不再同步 |
| 网络断开 | 自动降级为本地记账；网络恢复后下次同步自动补上 |

合并策略（`app/js/core/account.js` 的 `mergeStates`）：

- `totalPoints`、`availablePoints`、`setsDone`、`bestCombo`、`correctTotal` 取较大值；
- `learnedKp`、`readCards`、`badges` 取并集；
- `ledger` 按幂等键去重后合并，防止重复计分；
- 每日任务 / 每日上限按「日期较新者」处理。

## 常见问题

**登录时提示 401 / Invalid login credentials**
邮箱或密码错误，或邮箱尚未完成确认（见第 5 步）。

**提示 42501 / row-level security 错误**
SQL 没执行成功或策略名不一致；到 Table Editor 确认 `profiles` 表存在且 RLS 开启。

**跨域 / 网络错误**
确认 `SUPABASE_URL` 无多余空格、无末尾斜杠，且浏览器在线。自定义域名下访问时，到 **Authentication → URL Configuration** 把域名加入 Site URL / Redirect URLs。

**更换 Supabase 项目**
改 `config.js` 后重新部署即可。旧账号在旧项目里，无法迁移；如需迁移可导出 `km.state.v1`（浏览器 localStorage）后在新账号登录时自动合并上传。

**积分会不会被恶意改高？**
前端可被修改，这属于家庭娱乐场景可接受范围；需要更严格时，可在 Supabase 增加校验触发器（如每次增量 ≤ 日上限），本仓库暂不内置。