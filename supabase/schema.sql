-- =========================================================
-- Bobs 博客数据库：文章 + 评论
-- 用法：Supabase 控制台 → SQL Editor → New query →
--       把整份文件粘贴进去 → 把下面的邮箱改成你的 → Run
-- =========================================================

-- ⚠️ 只改这一行：换成你的管理员邮箱（和 js/config.js 里的 adminEmail 一样）
create or replace function public.is_admin() returns boolean
language sql stable as $$
  select coalesce(auth.jwt() ->> 'email', '') = 'your-admin@example.com';
$$;

-- ---------- 文章 ----------
create table if not exists public.posts (
  id          uuid primary key default gen_random_uuid(),
  title       text not null check (char_length(title) between 1 and 120),
  summary     text default '' check (char_length(summary) <= 300),
  content     text not null default '',
  cover       text default '',
  tags        text[] not null default '{}',
  published   boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- ---------- 评论 ----------
create table if not exists public.comments (
  id          uuid primary key default gen_random_uuid(),
  post_id     uuid not null references public.posts(id) on delete cascade,
  author      text not null check (char_length(btrim(author)) between 1 and 24),
  content     text not null check (char_length(btrim(content)) between 1 and 1000),
  is_admin    boolean not null default false,
  created_at  timestamptz not null default now()
);
create index if not exists comments_post_idx on public.comments(post_id, created_at);

-- 修改文章时自动更新 updated_at
create or replace function public.touch_updated_at() returns trigger
language plpgsql as $$ begin new.updated_at = now(); return new; end $$;
drop trigger if exists posts_touch on public.posts;
create trigger posts_touch before update on public.posts
  for each row execute function public.touch_updated_at();

-- 评论防刷：同一篇文章 20 秒内最多 3 条；只有管理员的评论能带「博主」标记
create or replace function public.guard_comment() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  new.is_admin := public.is_admin();
  if (select count(*) from public.comments
      where post_id = new.post_id and created_at > now() - interval '20 seconds') >= 3 then
    raise exception '评论太频繁了，请稍等一会儿再试';
  end if;
  return new;
end $$;
drop trigger if exists comments_guard on public.comments;
create trigger comments_guard before insert on public.comments
  for each row execute function public.guard_comment();

-- ---------- 权限规则（RLS） ----------
alter table public.posts    enable row level security;
alter table public.comments enable row level security;

-- 文章：所有人能看已发布的；管理员能看全部、能写能改能删
drop policy if exists "posts read"   on public.posts;
drop policy if exists "posts admin"  on public.posts;
create policy "posts read"  on public.posts for select using (published or public.is_admin());
create policy "posts admin" on public.posts for all    using (public.is_admin()) with check (public.is_admin());

-- 评论：所有人能看、能在已发布文章下发表；只有管理员能删
drop policy if exists "comments read"   on public.comments;
drop policy if exists "comments insert" on public.comments;
drop policy if exists "comments delete" on public.comments;
create policy "comments read"   on public.comments for select using (true);
create policy "comments insert" on public.comments for insert
  with check (exists (select 1 from public.posts p where p.id = post_id and p.published));
create policy "comments delete" on public.comments for delete using (public.is_admin());

grant select on public.posts, public.comments to anon, authenticated;
grant insert on public.comments to anon, authenticated;
grant insert, update, delete on public.posts to authenticated;
grant delete on public.comments to authenticated;

-- 第一篇欢迎文章（不想要可以在后台删掉）
insert into public.posts (title, summary, content, tags)
select '博客开张啦', '我的个人博客正式上线，以后开发日志和碎碎念都会写在这里。',
'你好，我是 Bobs！

这是博客的第一篇文章。我是一个**会写代码的新手开发者**，平时喜欢用 Codex 和 Claude Code 一起写代码。

以后这里会更新：

- 纸间 Paperroom 的开发日志
- 用 AI 编程踩过的坑
- 去旺角闲逛的见闻

欢迎在下面留言 👇',
array['公告']
where not exists (select 1 from public.posts);
