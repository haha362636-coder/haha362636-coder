-- =========================================================
-- 第三次升级：必须真正验证过邮箱才能评论 + 一个邮箱只能注册一个账号
-- 用法：Supabase 控制台 → SQL Editor → New query → 整份粘贴 → Run
-- （要先运行过 schema.sql 和 002。这份文件可以重复运行。）
--
-- 解决的问题：
--   1. 以前只看 Supabase 的「Confirm email」开关。开关一旦关过，
--      新账号就会被自动标记为“已验证”，不收验证码也能登录评论。
--      现在改成：只有真的在网页上输入过邮箱验证码，账号才算验证过，
--      数据库会拒绝没验证账号的评论。跟开关怎么设无关。
--   2. 同一个邮箱换着写法注册多个号：
--      abc+1@icloud.com、abc+2@icloud.com、a.b.c@gmail.com 都会被当成同一个邮箱。
--   3. 拒绝常见的临时邮箱（十分钟邮箱之类）。
-- =========================================================

-- ---------- 1. 自己的「已验证」标记 ----------
alter table public.profiles add column if not exists email_verified boolean not null default false;

-- 管理员账号直接算已验证
update public.profiles p set email_verified = true
from auth.users u
where u.id = p.id and lower(u.email) = 'haha362636@icloud.com';

-- 输入验证码登录后，网页会调用这个函数。
-- 它会检查这次登录是不是「用邮箱验证码」完成的（不是只用密码），是才打上标记。
create or replace function public.mark_email_verified() returns boolean
language plpgsql security definer set search_path = public as $$
declare ok boolean;
begin
  if auth.uid() is null then return false; end if;
  select exists (
    select 1 from jsonb_array_elements(coalesce(auth.jwt() -> 'amr', '[]'::jsonb)) a
    where a ->> 'method' in ('otp', 'magiclink', 'email/signup', 'recovery', 'email_change')
  ) into ok;
  if ok then update public.profiles set email_verified = true where id = auth.uid(); end if;
  return ok;
end $$;
revoke execute on function public.mark_email_verified() from public, anon;
grant execute on function public.mark_email_verified() to authenticated;

-- ---------- 2. 邮箱归一化：去掉 +后缀，Gmail 再去掉点 ----------
create or replace function public.normalize_email(e text) returns text
language sql immutable as $$
  select case
    when position('@' in x) = 0 then x
    when split_part(x, '@', 2) in ('gmail.com', 'googlemail.com')
      then replace(split_part(split_part(x, '@', 1), '+', 1), '.', '') || '@gmail.com'
    else split_part(split_part(x, '@', 1), '+', 1) || '@' || split_part(x, '@', 2)
  end
  from (select lower(btrim(coalesce(e, ''))) as x) s;
$$;

-- 常见临时邮箱域名（可以自己往里加）
create table if not exists public.blocked_email_domains (domain text primary key);
alter table public.blocked_email_domains enable row level security;
drop policy if exists "domains admin" on public.blocked_email_domains;
create policy "domains admin" on public.blocked_email_domains for all using (public.is_admin()) with check (public.is_admin());
insert into public.blocked_email_domains (domain) values
  ('mailinator.com'),('10minutemail.com'),('10minutemail.net'),('guerrillamail.com'),('guerrillamail.net'),
  ('sharklasers.com'),('grr.la'),('yopmail.com'),('yopmail.net'),('temp-mail.org'),('tempmail.com'),
  ('tempmail.net'),('tempmailo.com'),('trashmail.com'),('getnada.com'),('nada.email'),('maildrop.cc'),
  ('dispostable.com'),('mohmal.com'),('moakt.com'),('emailondeck.com'),('fakeinbox.com'),('throwawaymail.com'),
  ('mintemail.com'),('mailnesia.com'),('spamgourmet.com'),('linshiyouxiang.net'),('bccto.me'),('chacuo.net'),
  ('027168.com'),('mail.tm'),('tmpmail.org'),('tmpmail.net'),('emailfake.com'),('crazymailing.com')
on conflict do nothing;

-- 注册前检查邮箱：返回 ok / taken / disposable / invalid
create or replace function public.check_signup_email(e text) returns text
language plpgsql stable security definer set search_path = public as $$
declare n text := public.normalize_email(e);
begin
  if n !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then return 'invalid'; end if;
  if exists (select 1 from public.blocked_email_domains where domain = split_part(n, '@', 2)) then return 'disposable'; end if;
  if exists (select 1 from auth.users u where public.normalize_email(u.email) = n) then return 'taken'; end if;
  return 'ok';
end $$;
grant execute on function public.check_signup_email(text) to anon, authenticated;

-- 数据库层面再拦一次（就算有人绕过网页直接调接口也没用）
create or replace function public.guard_new_user_email() returns trigger
language plpgsql security definer set search_path = public as $$
declare n text := public.normalize_email(new.email);
begin
  if new.email is null then return new; end if;
  if exists (select 1 from public.blocked_email_domains where domain = split_part(n, '@', 2)) then
    raise exception 'EMAIL_DISPOSABLE';
  end if;
  if exists (select 1 from auth.users u where u.id <> new.id and public.normalize_email(u.email) = n) then
    raise exception 'EMAIL_ALIAS_TAKEN';
  end if;
  return new;
end $$;
drop trigger if exists guard_new_user_email on auth.users;
create trigger guard_new_user_email before insert on auth.users
  for each row execute function public.guard_new_user_email();

-- ---------- 3. 评论必须是验证过邮箱的账号 ----------
create or replace function public.guard_comment() returns trigger
language plpgsql security definer set search_path = public as $$
declare uid uuid := auth.uid(); nick text; ban boolean; verified boolean; hit text; norm text;
begin
  if uid is null then raise exception '请先登录再评论'; end if;
  select nickname, banned, email_verified into nick, ban, verified from public.profiles where id = uid;
  if nick is null then raise exception '账号资料不完整，请退出后重新登录'; end if;
  if ban then raise exception '你的账号已被禁止评论'; end if;

  new.user_id  := uid;
  new.author   := nick;
  new.is_admin := public.is_admin();
  new.content  := btrim(new.content);
  new.reason   := '';
  if new.is_admin then new.status := 'approved'; return new; end if;

  if not verified then raise exception '请先验证邮箱再评论'; end if;
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

-- ---------- 4. 后台用：查看账号邮箱和验证状态、删除账号 ----------
create or replace function public.admin_list_users()
returns table (id uuid, email text, nickname text, banned boolean, email_verified boolean,
               created_at timestamptz, last_sign_in_at timestamptz, comment_count bigint)
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception '没有权限'; end if;
  return query
    select u.id, u.email::text, p.nickname, coalesce(p.banned, false), coalesce(p.email_verified, false),
           u.created_at, u.last_sign_in_at,
           (select count(*) from public.comments c where c.user_id = u.id)
    from auth.users u left join public.profiles p on p.id = u.id
    order by u.created_at desc;
end $$;
revoke execute on function public.admin_list_users() from public, anon;
grant execute on function public.admin_list_users() to authenticated;

create or replace function public.admin_delete_user(uid uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception '没有权限'; end if;
  if uid = auth.uid() then raise exception '不能删除自己的账号'; end if;
  delete from auth.users where id = uid;   -- 资料和评论会跟着一起删掉
end $$;
revoke execute on function public.admin_delete_user(uuid) from public, anon;
grant execute on function public.admin_delete_user(uuid) to authenticated;
