-- =========================================================
-- 第二次升级：评论必须注册登录 + 内容审核
-- 用法：Supabase 控制台 → SQL Editor → New query → 整份粘贴 → Run
-- （要先运行过 schema.sql。这份文件可以重复运行，不会出错。）
--
-- 做了什么：
--   1. 用户资料表 profiles：注册时自动建，记录昵称、是否被禁言
--   2. 屏蔽词表 blocked_words：命中「拦截」词直接发不出去，命中「审核」词进待审核
--   3. 评论必须登录；作者名由数据库按昵称自动填写，没法冒充别人
--   4. 带链接、长串数字（QQ / 手机号 / 微信号）的评论自动进入待审核
--   5. 防刷：30 秒一条、每天最多 20 条、不能重复发同样的内容
--   所有检查都在数据库里执行，改网页代码也绕不过去。
-- =========================================================

-- ---------- 文本归一化：去掉空格、标点、符号、零宽字符，全角转半角 ----------
-- 这样「加 微·信」「加★v★x」「ｖｘ」都会被还原成「加微信」「加vx」「vx」
create or replace function public.moderation_normalize(t text) returns text
language sql immutable as $$
  select regexp_replace(
    translate(lower(coalesce(t, '')),
      '０１２３４５６７８９ａｂｃｄｅｆｇｈｉｊｋｌｍｎｏｐｑｒｓｔｕｖｗｘｙｚ',
      '0123456789abcdefghijklmnopqrstuvwxyz'),
    '[[:space:][:punct:]' || E'​‌‍⁠﻿' ||
    '，。！？、；：“”‘’（）【】《》〈〉…—～·「」『』〔〕＿＋＝｜＼／＊＆％＄＃＠！★☆♥❤♡✿❀●○◆◇■□▲△▼▽※♪♫→←↑↓√×〜︿﹏]',
    '', 'g');
$$;

-- ---------- 屏蔽词表（只有管理员能看、能改） ----------
create table if not exists public.blocked_words (
  word      text primary key check (char_length(btrim(word)) between 1 and 40),
  category  text not null default '其他',
  action    text not null default 'block' check (action in ('block', 'review')),
  created_at timestamptz not null default now()
);
alter table public.blocked_words enable row level security;
drop policy if exists "blocked admin" on public.blocked_words;
create policy "blocked admin" on public.blocked_words for all using (public.is_admin()) with check (public.is_admin());
grant select, insert, update, delete on public.blocked_words to authenticated;

-- 返回命中的词，格式「block:词」或「review:词」；没命中返回 null
create or replace function public.moderation_hit(t text) returns text
language sql stable security definer set search_path = public as $$
  select action || ':' || word from public.blocked_words
  where char_length(public.moderation_normalize(word)) > 0
    and position(public.moderation_normalize(word) in public.moderation_normalize(t)) > 0
  order by (action = 'block') desc, char_length(word) desc
  limit 1;
$$;
-- 不让访客直接调用它来试探屏蔽词
revoke execute on function public.moderation_hit(text) from public, anon, authenticated;

-- ---------- 用户资料 ----------
create table if not exists public.profiles (
  id         uuid primary key references auth.users(id) on delete cascade,
  nickname   text not null unique check (char_length(btrim(nickname)) between 2 and 16),
  banned     boolean not null default false,
  created_at timestamptz not null default now()
);
alter table public.profiles enable row level security;
drop policy if exists "profiles read"   on public.profiles;
drop policy if exists "profiles update" on public.profiles;
create policy "profiles read"   on public.profiles for select using (true);
create policy "profiles update" on public.profiles for update
  using (id = auth.uid() or public.is_admin()) with check (id = auth.uid() or public.is_admin());
revoke update on public.profiles from anon, authenticated;
grant select on public.profiles to anon, authenticated;
grant update (nickname, banned) on public.profiles to authenticated;

-- 改昵称要过审核；禁言只有管理员能改
create or replace function public.guard_profile() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.banned is distinct from old.banned and not public.is_admin() then
    raise exception '没有权限修改禁言状态';
  end if;
  if new.nickname is distinct from old.nickname then
    new.nickname := btrim(new.nickname);
    if public.moderation_hit(new.nickname) is not null then
      raise exception '昵称包含不当内容，换一个吧';
    end if;
    if not public.is_admin() and public.moderation_normalize(new.nickname) ~ '(博主|管理员|官方|bobs|admin)' then
      raise exception '这个昵称容易被误认成博主，换一个吧';
    end if;
  end if;
  return new;
end $$;
drop trigger if exists profiles_guard on public.profiles;
create trigger profiles_guard before update on public.profiles
  for each row execute function public.guard_profile();

-- 注册时自动建资料：昵称不合规或重名就自动换一个
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
declare base text; nick text; n int := 0;
begin
  base := btrim(coalesce(new.raw_user_meta_data ->> 'nickname', ''));
  if char_length(base) < 2 or char_length(base) > 16 or public.moderation_hit(base) is not null
     or public.moderation_normalize(base) ~ '(博主|管理员|官方|bobs|admin)' then
    base := '路人' || substr(replace(new.id::text, '-', ''), 1, 6);
  end if;
  nick := base;
  while exists (select 1 from public.profiles where nickname = nick) loop
    n := n + 1; nick := left(base, 13) || n::text;
  end loop;
  insert into public.profiles (id, nickname) values (new.id, nick) on conflict (id) do nothing;
  return new;
end $$;
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

-- 给已经存在的账号补上资料（管理员邮箱的账号昵称设为「博主Bobs」，以后可以在后台改）
insert into public.profiles (id, nickname)
select u.id, case when lower(u.email) = 'haha362636@icloud.com' then '博主Bobs'
                  else '路人' || substr(replace(u.id::text, '-', ''), 1, 6) end
from auth.users u
on conflict do nothing;

-- ---------- 评论表升级 ----------
alter table public.comments add column if not exists user_id uuid references public.profiles(id) on delete cascade;
alter table public.comments add column if not exists status  text not null default 'approved';
alter table public.comments add column if not exists reason  text not null default '';
do $$ begin
  alter table public.comments add constraint comments_status_chk check (status in ('approved', 'pending', 'rejected'));
exception when duplicate_object then null; end $$;
create index if not exists comments_user_idx on public.comments(user_id, created_at);

-- 评论的总检查：登录、禁言、防刷、屏蔽词、链接和联系方式
create or replace function public.guard_comment() returns trigger
language plpgsql security definer set search_path = public as $$
declare uid uuid := auth.uid(); nick text; ban boolean; hit text; norm text;
begin
  if uid is null then raise exception '请先登录再评论'; end if;
  select nickname, banned into nick, ban from public.profiles where id = uid;
  if nick is null then raise exception '账号资料不完整，请退出后重新登录'; end if;
  if ban then raise exception '你的账号已被禁止评论'; end if;

  new.user_id  := uid;
  new.author   := nick;
  new.is_admin := public.is_admin();
  new.content  := btrim(new.content);
  new.reason   := '';
  if new.is_admin then new.status := 'approved'; return new; end if;

  if char_length(new.content) > 500 then raise exception '评论最多 500 字'; end if;
  if exists (select 1 from public.comments where user_id = uid and created_at > now() - interval '30 seconds') then
    raise exception '发得太快了，30 秒后再试';
  end if;
  if (select count(*) from public.comments where user_id = uid and created_at > now() - interval '1 day') >= 20 then
    raise exception '今天的评论次数用完了，明天再来吧';
  end if;
  if exists (select 1 from public.comments where user_id = uid and content = new.content and created_at > now() - interval '1 day') then
    raise exception '不要重复发送相同的内容';
  end if;

  hit := public.moderation_hit(new.content);
  if hit like 'block:%' then
    raise exception '评论包含不当内容，没有发出去。请文明发言～';
  end if;

  norm := public.moderation_normalize(new.content);
  if hit like 'review:%' then
    new.status := 'pending'; new.reason := '命中审核词：' || substr(hit, 8);
  elsif new.content ~* '(https?://|www\.|[a-z0-9-]+\.(com|cn|net|org|top|xyz|cc|vip|io|me|info|club|site|shop|link|tk|ly)\y)' then
    new.status := 'pending'; new.reason := '包含链接';
  elsif norm ~ '[0-9]{6,}' then
    new.status := 'pending'; new.reason := '包含长串数字（可能是联系方式）';
  else
    new.status := 'approved';
  end if;
  return new;
end $$;
drop trigger if exists comments_guard on public.comments;
create trigger comments_guard before insert on public.comments
  for each row execute function public.guard_comment();

-- 评论权限：
--   看：已通过的所有人能看；自己的（含待审核）自己能看；管理员看全部
--   发：必须登录，只能发在已发布的文章下
--   改：只有管理员能改审核状态
--   删：管理员，或者评论作者本人
drop policy if exists "comments read"   on public.comments;
drop policy if exists "comments insert" on public.comments;
drop policy if exists "comments update" on public.comments;
drop policy if exists "comments delete" on public.comments;
create policy "comments read" on public.comments for select
  using (status = 'approved' or user_id = auth.uid() or public.is_admin());
create policy "comments insert" on public.comments for insert to authenticated
  with check (auth.uid() is not null
              and exists (select 1 from public.posts p where p.id = post_id and p.published));
create policy "comments update" on public.comments for update using (public.is_admin()) with check (public.is_admin());
create policy "comments delete" on public.comments for delete using (public.is_admin() or user_id = auth.uid());

revoke insert on public.comments from anon;
revoke update on public.comments from anon, authenticated;
grant insert on public.comments to authenticated;
grant update (status, reason) on public.comments to authenticated;
grant delete on public.comments to authenticated;

-- ---------- 默认屏蔽词（可以在后台「屏蔽词」里增删） ----------
-- block = 直接拦截；review = 先进待审核，你点通过才会显示
insert into public.blocked_words (word, category, action) values
  -- 广告引流
  ('加微信','广告','block'),('加我微信','广告','block'),('加v','广告','review'),('加vx','广告','block'),('vx号','广告','block'),
  ('薇信','广告','block'),('威信','广告','review'),('微信号','广告','block'),('weixin','广告','review'),('wechat','广告','review'),
  ('加qq','广告','block'),('qq群','广告','block'),('扣扣','广告','review'),('私聊我','广告','review'),('私信我','广告','review'),
  ('代刷','广告','block'),('刷单','广告','block'),('刷粉','广告','block'),('涨粉','广告','review'),('兼职日结','广告','block'),
  ('日赚','广告','block'),('躺赚','广告','block'),('月入过万','广告','block'),('免费领取','广告','review'),('优惠券','广告','review'),
  ('招代理','广告','block'),('代理加盟','广告','block'),('网赚','广告','block'),('副业推荐','广告','review'),('点击链接','广告','review'),
  ('代开发票','广告','block'),('办信用卡','广告','block'),('网贷','广告','block'),('套现','广告','block'),('黑卡','广告','block'),
  ('低价出售','广告','review'),('代写','广告','review'),('代考','广告','block'),('引流','广告','review'),('推广合作','广告','review'),
  -- 赌博
  ('博彩','赌博','block'),('赌场','赌博','block'),('网赌','赌博','block'),('百家乐','赌博','block'),('时时彩','赌博','block'),
  ('六合彩','赌博','block'),('彩票预测','赌博','block'),('真人荷官','赌博','block'),('棋牌平台','赌博','block'),('下注','赌博','review'),
  -- 色情低俗
  ('色情','色情','block'),('黄色网站','色情','block'),('黄片','色情','block'),('成人视频','色情','block'),('裸聊','色情','block'),
  ('约炮','色情','block'),('一夜情','色情','block'),('援交','色情','block'),('上门服务','色情','review'),('小姐上门','色情','block'),
  ('楼凤','色情','block'),('卖淫','色情','block'),('嫖娼','色情','block'),('福利姬','色情','block'),('看片','色情','review'),
  ('av女优','色情','block'),('情色','色情','block'),('裸照','色情','block'),('私房照','色情','review'),('磁力链接','色情','review'),
  -- 违法
  ('冰毒','违法','block'),('卖大麻','违法','block'),('迷药','违法','block'),('枪支','违法','block'),('代孕','违法','block'),
  ('办证','违法','review'),('假证','违法','block'),('身份证出售','违法','block'),('洗钱','违法','review'),('翻墙节点','违法','review'),
  -- 辱骂
  ('傻逼','辱骂','block'),('傻b','辱骂','block'),('煞笔','辱骂','block'),('沙比','辱骂','block'),('sb玩意','辱骂','block'),
  ('脑残','辱骂','block'),('智障','辱骂','block'),('去死吧','辱骂','block'),('操你','辱骂','block'),('草泥马','辱骂','block'),
  ('cnm','辱骂','block'),('nmsl','辱骂','block'),('你妈死','辱骂','block'),('他妈的','辱骂','review'),('婊子','辱骂','block'),
  ('贱人','辱骂','block'),('垃圾东西','辱骂','review'),('滚蛋','辱骂','review'),('废物','辱骂','review'),('杂种','辱骂','block')
on conflict (word) do nothing;
