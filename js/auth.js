/* =========================================================
   普通用户的登录 / 注册 / 找回密码 / 改昵称
   用法：页面先引入 supabase、config.js、blog.js，再引入本文件。
   - 会在顶栏右边自动放一个「登录 / 注册」按钮
   - Auth.open('login' | 'signup') 打开弹窗
   - Auth.onChange(me => ...) 登录状态变化时回调，me 为 null 表示没登录
   ========================================================= */
(function () {
  const db = Blog.db;
  const listeners = [];
  const Auth = { me: null, onChange(cb) { listeners.push(cb); if (Auth._ready) cb(Auth.me); } };
  window.Auth = Auth;
  if (!Blog.ready) return;

  // 把 Supabase 的英文报错翻成人话
  Auth.human = function (err) {
    const m = err?.message || String(err);
    if (/Invalid login credentials/i.test(m)) return '邮箱或密码不对，再检查一下。';
    if (/Email not confirmed/i.test(m)) return '邮箱还没验证，去邮箱点一下确认链接。';
    if (/already registered|already been registered/i.test(m)) return '这个邮箱已经注册过了，直接登录就行。';
    if (/Signups not allowed|signup.*disabled/i.test(m)) return '注册功能还没开放（博主需要在 Supabase 里打开 Allow new users to sign up）。';
    if (/Password should be at least/i.test(m)) return '密码太短了。';
    if (/error sending|confirmation email/i.test(m)) return '验证邮件发送失败，请稍后再试，或者联系博主。';
    if (/rate limit|too many/i.test(m)) return '操作太频繁，过一会儿再试。';
    if (/row-level security/i.test(m)) return '没有权限，请重新登录后再试。';
    if (/duplicate key.*nickname/i.test(m)) return '这个昵称已经有人用了，换一个吧。';
    if (/profiles.*(does not exist|schema cache)|(does not exist|schema cache).*profiles|column .*status.* does not exist/i.test(m)) return '评论系统还没升级完成（博主需要运行 002 升级脚本）。';
    return m;
  };
  const say = (el, msg, kind = '') => { el.className = 'status ' + kind; el.textContent = msg; };

  /* ---------- 弹窗 ---------- */
  const dlg = document.createElement('dialog');
  dlg.className = 'auth-dlg';
  dlg.innerHTML = `
  <form class="dlg" data-view="auth" autocomplete="on">
    <div class="dlg-hd">
      <div class="dlg-tabs"><button type="button" data-mode="login" class="on">登录</button><button type="button" data-mode="signup">注册</button></div>
      <button class="x" type="button" data-close aria-label="关闭">×</button>
    </div>
    <p class="tip" data-tip></p>
    <div class="field" data-f="nick" hidden><label for="aNick">昵称 <small>2～16 个字，会显示在评论旁边</small></label><input class="input" id="aNick" maxlength="16" autocomplete="nickname"></div>
    <div class="field"><label for="aEmail">邮箱</label><input class="input" id="aEmail" type="email" autocomplete="email" required></div>
    <div class="field" data-f="pwd"><label for="aPwd">密码 <small data-f="pwdHint" hidden>至少 8 位</small></label><input class="input" id="aPwd" type="password" autocomplete="current-password" required></div>
    <label class="agree" data-f="agree" hidden><input type="checkbox" id="aAgree">我已阅读评论规范，不发广告、引流、色情、赌博、辱骂等内容，违规会被删除或禁言。</label>
    <button class="btn btn-neon" data-submit type="submit">登录</button>
    <button class="link" type="button" data-forgot>忘记密码？</button>
    <p class="status" data-st role="status"></p>
  </form>
  <form class="dlg" data-view="reset" hidden>
    <div class="dlg-hd"><h3>设置新密码</h3><button class="x" type="button" data-close aria-label="关闭">×</button></div>
    <div class="field"><label for="newPwd">新密码 <small>至少 8 位</small></label><input class="input" id="newPwd" type="password" minlength="8" autocomplete="new-password" required></div>
    <button class="btn btn-neon" type="submit">保存新密码</button>
    <p class="status" data-st role="status"></p>
  </form>
  <form class="dlg" data-view="account" hidden>
    <div class="dlg-hd"><h3>我的账号</h3><button class="x" type="button" data-close aria-label="关闭">×</button></div>
    <p class="tip" data-email></p>
    <div class="field"><label for="nickInput">昵称 <small>2～16 个字</small></label><input class="input" id="nickInput" maxlength="16" required></div>
    <div class="acct-btns"><button class="btn btn-neon" type="submit">保存昵称</button><button class="btn btn-ghost" type="button" data-logout>退出登录</button></div>
    <p class="status" data-st role="status"></p>
  </form>`;
  document.body.appendChild(dlg);
  const V = n => dlg.querySelector(`[data-view="${n}"]`);
  const q = (v, s) => V(v).querySelector(s);
  function show(view) { ['auth', 'reset', 'account'].forEach(n => V(n).hidden = n !== view); dlg.querySelectorAll('[data-st]').forEach(s => say(s, '')); if (!dlg.open) dlg.showModal(); }
  dlg.addEventListener('click', e => { if (e.target.closest('[data-close]') || e.target === dlg) dlg.close(); });

  let mode = 'login';
  function setMode(m, tip = '') {
    mode = m;
    const su = m === 'signup', fg = m === 'forgot', f = s => q('auth', `[data-f="${s}"]`);
    q('auth', '.dlg-tabs').hidden = fg;
    q('auth', '.dlg-tabs').querySelectorAll('button').forEach(b => b.classList.toggle('on', b.dataset.mode === m));
    f('nick').hidden = f('agree').hidden = f('pwdHint').hidden = !su;
    f('pwd').hidden = fg; dlg.querySelector('#aPwd').required = !fg;
    dlg.querySelector('#aPwd').autocomplete = su ? 'new-password' : 'current-password';
    q('auth', '[data-submit]').textContent = su ? '注册' : fg ? '发送重设密码邮件' : '登录';
    q('auth', '[data-forgot]').textContent = fg ? '← 返回登录' : '忘记密码？';
    q('auth', '[data-forgot]').hidden = su;
    const t = q('auth', '[data-tip]'); t.textContent = tip; t.hidden = !tip;
    say(q('auth', '[data-st]'), '');
  }
  Auth.open = (m = 'login', tip = '') => { if (Auth.me) return Auth.account(); setMode(m, tip); show('auth'); };
  Auth.account = () => { q('account', '[data-email]').textContent = '登录邮箱：' + (Auth.me?.email || ''); dlg.querySelector('#nickInput').value = Auth.me?.nickname || ''; show('account'); };
  Auth.signOut = () => db.auth.signOut();
  q('auth', '.dlg-tabs').addEventListener('click', e => { const b = e.target.closest('button'); if (b) setMode(b.dataset.mode); });
  q('auth', '[data-forgot]').onclick = () => setMode(mode === 'forgot' ? 'login' : 'forgot');
  q('account', '[data-logout]').onclick = async () => { await db.auth.signOut(); dlg.close(); };

  const backUrl = () => location.origin + location.pathname + location.search;

  V('auth').addEventListener('submit', async e => {
    e.preventDefault();
    const st = q('auth', '[data-st]'), btn = q('auth', '[data-submit]');
    const email = dlg.querySelector('#aEmail').value.trim(), pwd = dlg.querySelector('#aPwd').value;
    if (mode === 'signup') {
      const nick = dlg.querySelector('#aNick').value.trim();
      if (nick.length < 2 || nick.length > 16) return say(st, '昵称要 2～16 个字。', 'err');
      if (pwd.length < 8) return say(st, '密码至少 8 位。', 'err');
      if (!dlg.querySelector('#aAgree').checked) return say(st, '请先勾选同意评论规范。', 'err');
      const { data: taken, error: e1 } = await db.from('profiles').select('id').eq('nickname', nick).maybeSingle();
      if (e1) return say(st, Auth.human(e1), 'err');
      if (taken) return say(st, '这个昵称已经有人用了，换一个吧。', 'err');
      btn.disabled = true; say(st, '注册中…');
      const { data, error } = await db.auth.signUp({ email, password: pwd, options: { data: { nickname: nick }, emailRedirectTo: backUrl() } });
      btn.disabled = false;
      if (error) return say(st, Auth.human(error), 'err');
      // 开了邮箱验证时，重复注册不会报错，只会返回一个空身份的用户
      if (data.user && Array.isArray(data.user.identities) && !data.user.identities.length) return say(st, '这个邮箱已经注册过了，直接登录就行。', 'err');
      if (data.session) { say(st, '注册成功，已经帮你登录了！', 'ok'); setTimeout(() => dlg.close(), 900); }
      else say(st, '注册成功！我们给你发了一封确认邮件，点邮件里的链接就能登录。没收到的话看看垃圾邮件箱。', 'ok');
    } else if (mode === 'forgot') {
      if (!email) return say(st, '先填邮箱。', 'err');
      btn.disabled = true; say(st, '发送中…');
      const { error } = await db.auth.resetPasswordForEmail(email, { redirectTo: backUrl() });
      btn.disabled = false;
      say(st, error ? Auth.human(error) : '重设密码的邮件已发出，去邮箱点链接就行。', error ? 'err' : 'ok');
    } else {
      btn.disabled = true; say(st, '登录中…');
      const { error } = await db.auth.signInWithPassword({ email, password: pwd });
      btn.disabled = false;
      if (error) return say(st, Auth.human(error), 'err');
      say(st, '登录成功！', 'ok'); dlg.querySelector('#aPwd').value = ''; setTimeout(() => dlg.close(), 500);
    }
  });

  V('reset').addEventListener('submit', async e => {
    e.preventDefault(); const st = q('reset', '[data-st]'), pwd = dlg.querySelector('#newPwd').value;
    if (pwd.length < 8) return say(st, '密码至少 8 位。', 'err');
    const { error } = await db.auth.updateUser({ password: pwd });
    if (error) return say(st, Auth.human(error), 'err');
    say(st, '新密码已保存，你已经登录了。', 'ok'); setTimeout(() => dlg.close(), 900);
  });

  V('account').addEventListener('submit', async e => {
    e.preventDefault(); const st = q('account', '[data-st]'), nick = dlg.querySelector('#nickInput').value.trim();
    if (nick.length < 2 || nick.length > 16) return say(st, '昵称要 2～16 个字。', 'err');
    const { error } = await db.from('profiles').update({ nickname: nick }).eq('id', Auth.me.id);
    if (error) return say(st, Auth.human(error), 'err');
    say(st, '改好了！之前的评论会保留原来的名字。', 'ok');
    Auth.me.nickname = nick; emit();
  });

  /* ---------- 顶栏按钮 ---------- */
  const navBtn = document.createElement('button');
  navBtn.type = 'button'; navBtn.className = 'lk auth-btn';
  navBtn.onclick = () => Auth.me ? Auth.account() : Auth.open('login');
  document.querySelector('.nav-in')?.appendChild(navBtn);

  function emit() {
    navBtn.textContent = Auth.me ? '👤 ' + Auth.me.nickname : '登录 / 注册';
    navBtn.classList.toggle('in', !!Auth.me);
    listeners.forEach(cb => cb(Auth.me));
  }

  async function refresh(session) {
    Auth.me = null;
    if (session?.user) {
      const { data } = await db.from('profiles').select('nickname,banned').eq('id', session.user.id).maybeSingle();
      Auth.me = { id: session.user.id, email: session.user.email, nickname: data?.nickname || session.user.email.split('@')[0], banned: !!data?.banned };
    }
    Auth._ready = true; emit();
  }
  emit();
  db.auth.onAuthStateChange((event, session) => {
    if (event === 'PASSWORD_RECOVERY') show('reset');
    // 回调里不能直接再调数据库（supabase-js 会卡住），放到下一轮执行
    if (['SIGNED_IN', 'SIGNED_OUT', 'INITIAL_SESSION', 'USER_UPDATED'].includes(event)) setTimeout(() => refresh(session), 0);
  });
})();
