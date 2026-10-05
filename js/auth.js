/* =========================================================
   普通用户的登录 / 注册 / 找回密码 / 改昵称
   注册、找回密码、补验证邮箱都用「邮箱验证码」：邮件里是一串数字，在网页里输入即可，
   不需要点邮件里的链接。（Supabase 的邮件模板要改成显示 {{ .Token }}，
   见 supabase/邮件模板.md）

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
    if (Blog.isNetErr(err)) return '网络不稳定，连不上服务器，换个网络或者稍后再试。';
    if (/Invalid login credentials/i.test(m)) return '邮箱或密码不对，再检查一下。';
    if (/Email not confirmed/i.test(m)) return '邮箱还没验证。';
    if (/already registered|already been registered/i.test(m)) return '这个邮箱已经注册过了，直接登录就行。';
    if (/Signups not allowed|signup.*disabled/i.test(m)) return '注册功能还没开放（博主需要在 Supabase 里打开 Allow new users to sign up）。';
    if (/Password should be at least/i.test(m)) return '密码太短了。';
    if (/expired|invalid.*(otp|token)|(otp|token).*invalid/i.test(m)) return '验证码不对或者已经过期了，可以点「重新发送」再要一个。';
    if (/error sending|confirmation email|recovery email/i.test(m)) return '验证码邮件发送失败，请稍后再试，或者联系博主。';
    if (/security purposes|only request this after/i.test(m)) return '发得太频繁了，等一分钟再点重新发送。';
    if (/rate limit|too many/i.test(m)) return '操作太频繁，过一会儿再试。';
    if (/same.*password|different from the old/i.test(m)) return '新密码不能和旧密码一样。';
    if (/EMAIL_ALIAS_TAKEN|Database error saving new user/i.test(m)) return '这个邮箱（或者它的别名写法）已经注册过了，一个邮箱只能注册一个账号。';
    if (/EMAIL_DISPOSABLE/i.test(m)) return '不支持临时邮箱，请用常用邮箱注册。';
    if (/Signups not allowed for otp|User not found/i.test(m)) return '找不到这个账号。';
    if (/row-level security/i.test(m)) return '没有权限，请重新登录后再试。';
    if (/duplicate key.*nickname/i.test(m)) return '这个昵称已经有人用了，换一个吧。';
    if (/profiles.*(does not exist|schema cache)|(does not exist|schema cache).*profiles|column .*status.* does not exist/i.test(m)) return '评论系统还没升级完成（博主需要运行 002 升级脚本）。';
    return m;
  };
  const say = (el, msg, kind = '') => { el.className = 'status ' + kind; el.textContent = msg; };
  const codeOk = c => /^\d{6,10}$/.test(c);

  /* ---------- 弹窗 ---------- */
  const dlg = document.createElement('dialog');
  dlg.className = 'auth-dlg';
  dlg.innerHTML = `
  <form class="dlg" data-view="auth" autocomplete="on">
    <div class="dlg-hd">
      <div class="dlg-tabs"><button type="button" data-mode="login" class="on">登录</button><button type="button" data-mode="signup">注册</button></div>
      <button class="x" type="button" data-close aria-label="关闭">×</button>
    </div>
    <p class="tip" data-tip hidden></p>
    <div class="field" data-f="nick" hidden><label for="aNick">昵称 <small>2～16 个字，会显示在评论旁边</small></label><input class="input" id="aNick" maxlength="16" autocomplete="nickname"></div>
    <div class="field"><label for="aEmail">邮箱</label><input class="input" id="aEmail" type="email" autocomplete="email" required></div>
    <div class="field" data-f="pwd"><label for="aPwd">密码 <small data-f="pwdHint" hidden>至少 8 位</small></label><input class="input" id="aPwd" type="password" autocomplete="current-password" required></div>
    <label class="agree" data-f="agree" hidden><input type="checkbox" id="aAgree">我已阅读评论规范，不发广告、引流、色情、赌博、辱骂等内容，违规会被删除或禁言。</label>
    <button class="btn btn-neon" data-submit type="submit">登录</button>
    <button class="link" type="button" data-forgot>忘记密码？</button>
    <p class="status" data-st role="status"></p>
  </form>

  <form class="dlg" data-view="code" hidden autocomplete="off">
    <div class="dlg-hd"><h3 data-title>输入验证码</h3><button class="x" type="button" data-close aria-label="关闭">×</button></div>
    <p class="tip">验证码已发到 <b data-to></b>，10 分钟内有效。没收到的话看看垃圾邮件箱。</p>
    <div class="field"><label for="aCode">邮箱验证码</label><input class="input code-input" id="aCode" inputmode="numeric" autocomplete="one-time-code" maxlength="10" placeholder="6 位数字" required></div>
    <div class="field" data-f="newpwd" hidden><label for="aNewPwd">新密码 <small>至少 8 位</small></label><input class="input" id="aNewPwd" type="password" autocomplete="new-password"></div>
    <button class="btn btn-neon" data-submit type="submit">验证</button>
    <div class="code-links"><button class="link" type="button" data-resend>重新发送</button><button class="link" type="button" data-back>换个邮箱</button></div>
    <p class="status" data-st role="status"></p>
  </form>

  <form class="dlg" data-view="account" hidden>
    <div class="dlg-hd"><h3>我的账号</h3><button class="x" type="button" data-close aria-label="关闭">×</button></div>
    <p class="tip" data-email></p>
    <div class="verify-box" data-unverified hidden><span>⚠ 邮箱还没验证，验证后才能评论。</span><button class="btn btn-neon btn-sm" type="button" data-verify>发送验证码</button></div>
    <div class="field"><label for="nickInput">昵称 <small>2～16 个字</small></label><input class="input" id="nickInput" maxlength="16" required></div>
    <div class="acct-btns"><button class="btn btn-neon" type="submit">保存昵称</button><button class="btn btn-ghost" type="button" data-logout>退出登录</button></div>
    <p class="status" data-st role="status"></p>
  </form>`;
  document.body.appendChild(dlg);
  const V = n => dlg.querySelector(`[data-view="${n}"]`);
  const q = (v, s) => V(v).querySelector(s);
  const $in = id => dlg.querySelector('#' + id);
  function show(view) { ['auth', 'code', 'account'].forEach(n => V(n).hidden = n !== view); dlg.querySelectorAll('[data-st]').forEach(s => say(s, '')); if (!dlg.open) dlg.showModal(); }
  dlg.addEventListener('click', e => { if (e.target.closest('[data-close]') || e.target === dlg) dlg.close(); });

  /* ---------- 登录 / 注册 / 忘记密码 ---------- */
  let mode = 'login';
  function setMode(m, tip = '') {
    mode = m;
    const su = m === 'signup', fg = m === 'forgot', f = s => q('auth', `[data-f="${s}"]`);
    q('auth', '.dlg-tabs').hidden = fg;
    q('auth', '.dlg-tabs').querySelectorAll('button').forEach(b => b.classList.toggle('on', b.dataset.mode === m));
    f('nick').hidden = f('agree').hidden = f('pwdHint').hidden = !su;
    f('pwd').hidden = fg; $in('aPwd').required = !fg;
    $in('aPwd').autocomplete = su ? 'new-password' : 'current-password';
    q('auth', '[data-submit]').textContent = su ? '注册并发送验证码' : fg ? '发送验证码' : '登录';
    q('auth', '[data-forgot]').textContent = fg ? '← 返回登录' : '忘记密码？';
    q('auth', '[data-forgot]').hidden = su;
    const t = q('auth', '[data-tip]');
    t.textContent = tip || (fg ? '填上注册时用的邮箱，我们会发一个验证码给你，用来设置新密码。' : '');
    t.hidden = !t.textContent;
    say(q('auth', '[data-st]'), '');
  }
  Auth.open = (m = 'login', tip = '') => { if (Auth.me) return Auth.account(); setMode(m, tip); show('auth'); };
  Auth.account = () => {
    q('account', '[data-email]').textContent = '登录邮箱：' + (Auth.me?.email || '') + (Auth.me?.verified ? '（已验证 ✓）' : '');
    q('account', '[data-unverified]').hidden = !!Auth.me?.verified;
    $in('nickInput').value = Auth.me?.nickname || ''; show('account');
  };
  // 已登录但没验证过邮箱：发一个登录验证码到邮箱，输对了就算验证过
  Auth.verifyEmail = async (st) => {
    if (!Auth.me) return Auth.open('login');
    const { error } = await db.auth.signInWithOtp({ email: Auth.me.email, options: { shouldCreateUser: false } });
    if (error) { if (st) say(st, Auth.human(error), 'err'); return false; }
    openCode('email', Auth.me.email); return true;
  };
  q('account', '[data-verify]').onclick = e => Auth.verifyEmail(q('account', '[data-st]'));
  Auth.signOut = () => db.auth.signOut();
  q('auth', '.dlg-tabs').addEventListener('click', e => { const b = e.target.closest('button'); if (b) setMode(b.dataset.mode); });
  q('auth', '[data-forgot]').onclick = () => setMode(mode === 'forgot' ? 'login' : 'forgot');
  q('account', '[data-logout]').onclick = async () => { await db.auth.signOut(); dlg.close(); };

  V('auth').addEventListener('submit', async e => {
    e.preventDefault();
    const st = q('auth', '[data-st]'), btn = q('auth', '[data-submit]');
    const email = $in('aEmail').value.trim(), pwd = $in('aPwd').value;
    if (mode === 'signup') {
      const nick = $in('aNick').value.trim();
      if (nick.length < 2 || nick.length > 16) return say(st, '昵称要 2～16 个字。', 'err');
      if (pwd.length < 8) return say(st, '密码至少 8 位。', 'err');
      if (!$in('aAgree').checked) return say(st, '请先勾选同意评论规范。', 'err');
      const { data: taken, error: e1 } = await db.from('profiles').select('id').eq('nickname', nick).maybeSingle();
      if (e1) return say(st, Auth.human(e1), 'err');
      if (taken) return say(st, '这个昵称已经有人用了，换一个吧。', 'err');
      btn.disabled = true; say(st, '注册中…');
      const { data: chk } = await db.rpc('check_signup_email', { e: email });
      if (chk && chk !== 'ok') {
        btn.disabled = false;
        return say(st, { taken: '这个邮箱（或者它的别名写法，比如加了 +xxx）已经注册过了，一个邮箱只能注册一个账号。', disposable: '不支持临时邮箱，请用常用邮箱注册。', invalid: '邮箱格式不对。' }[chk] || chk, 'err');
      }
      const { data, error } = await db.auth.signUp({ email, password: pwd, options: { data: { nickname: nick } } });
      btn.disabled = false;
      if (error) return say(st, Auth.human(error), 'err');
      // 开了邮箱验证时，重复注册不会报错，只会返回一个空身份的用户
      if (data.user && Array.isArray(data.user.identities) && !data.user.identities.length) return say(st, '这个邮箱已经注册过了，直接登录就行。', 'err');
      if (data.session) { say(st, '注册成功，已经帮你登录了！', 'ok'); setTimeout(() => dlg.close(), 900); return; }
      openCode('signup', email);
    } else if (mode === 'forgot') {
      if (!email) return say(st, '先填邮箱。', 'err');
      btn.disabled = true; say(st, '发送中…');
      const { error } = await db.auth.resetPasswordForEmail(email);
      btn.disabled = false;
      if (error) return say(st, Auth.human(error), 'err');
      openCode('recovery', email);
    } else {
      btn.disabled = true; say(st, '登录中…');
      const { error } = await db.auth.signInWithPassword({ email, password: pwd });
      btn.disabled = false;
      if (error && /Email not confirmed/i.test(error.message)) {
        // 注册了但没验证：直接补发验证码
        const r = await db.auth.resend({ type: 'signup', email });
        if (r.error) return say(st, '邮箱还没验证，补发验证码失败：' + Auth.human(r.error), 'err');
        return openCode('signup', email, '这个邮箱还没验证，我们重新发了一个验证码。');
      }
      if (error) return say(st, Auth.human(error), 'err');
      say(st, '登录成功！', 'ok'); $in('aPwd').value = ''; setTimeout(() => dlg.close(), 500);
    }
  });

  /* ---------- 输入验证码 ---------- */
  let codeType = 'signup', codeEmail = '', timer = null;
  function openCode(type, email, note = '') {
    codeType = type; codeEmail = email;
    q('code', '[data-title]').textContent = type === 'recovery' ? '设置新密码' : '验证邮箱';
    q('code', '[data-to]').textContent = email;
    q('code', '[data-f="newpwd"]').hidden = type !== 'recovery';
    $in('aNewPwd').required = type === 'recovery';
    q('code', '[data-submit]').textContent = type === 'recovery' ? '保存新密码并登录' : '验证';
    $in('aCode').value = ''; $in('aNewPwd').value = '';
    show('code');
    if (note) say(q('code', '[data-st]'), note, 'ok');
    cooldown(60);
    setTimeout(() => $in('aCode').focus(), 50);
  }
  // 重新发送要等 60 秒（Supabase 的限制）
  function cooldown(sec) {
    const b = q('code', '[data-resend]'); clearInterval(timer);
    const tick = () => { b.disabled = sec > 0; b.textContent = sec > 0 ? `重新发送（${sec}s）` : '重新发送'; sec--; if (sec < -1) clearInterval(timer); };
    tick(); timer = setInterval(tick, 1000);
  }
  $in('aCode').addEventListener('input', e => { e.target.value = e.target.value.replace(/\D/g, ''); });
  q('code', '[data-back]').onclick = () => { if (codeType === 'email') return dlg.close(); setMode(codeType === 'signup' ? 'signup' : 'forgot'); show('auth'); };
  q('code', '[data-resend]').onclick = async () => {
    const st = q('code', '[data-st]'); say(st, '发送中…');
    const { error } = codeType === 'signup' ? await db.auth.resend({ type: 'signup', email: codeEmail })
      : codeType === 'email' ? await db.auth.signInWithOtp({ email: codeEmail, options: { shouldCreateUser: false } })
      : await db.auth.resetPasswordForEmail(codeEmail);
    if (error) return say(st, Auth.human(error), 'err');
    say(st, '新的验证码已发出，用最新收到的那一封。', 'ok'); cooldown(60);
  };

  V('code').addEventListener('submit', async e => {
    e.preventDefault();
    const st = q('code', '[data-st]'), btn = q('code', '[data-submit]'), token = $in('aCode').value.trim();
    if (!codeOk(token)) return say(st, '验证码是邮件里的那串数字。', 'err');
    const pwd = $in('aNewPwd').value;
    if (codeType === 'recovery' && pwd.length < 8) return say(st, '新密码至少 8 位。', 'err');
    btn.disabled = true; say(st, '验证中…');
    const { error } = await db.auth.verifyOtp({ email: codeEmail, token, type: codeType });
    if (error) { btn.disabled = false; return say(st, Auth.human(error), 'err'); }
    if (codeType === 'recovery') {
      const r = await db.auth.updateUser({ password: pwd });
      if (r.error) { btn.disabled = false; return say(st, '验证通过，但新密码没保存：' + Auth.human(r.error), 'err'); }
    }
    // 告诉数据库：这个账号刚刚用邮箱验证码登录过，邮箱是真的
    await db.rpc('mark_email_verified');
    btn.disabled = false; clearInterval(timer);
    await refresh((await db.auth.getSession()).data.session);
    say(st, codeType === 'recovery' ? '新密码已保存，已经帮你登录了！' : '验证成功，你可以评论了！', 'ok');
    setTimeout(() => dlg.close(), 900);
  });

  /* ---------- 我的账号 ---------- */
  V('account').addEventListener('submit', async e => {
    e.preventDefault(); const st = q('account', '[data-st]'), nick = $in('nickInput').value.trim();
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
    navBtn.textContent = Auth.me ? '👤 ' + Auth.me.nickname + (Auth.me.verified ? '' : ' · 未验证') : '登录 / 注册';
    navBtn.classList.toggle('in', !!Auth.me);
    listeners.forEach(cb => cb(Auth.me));
  }

  async function refresh(session) {
    Auth.me = null;
    if (session?.user) {
      const { data } = await db.from('profiles').select('nickname,banned,email_verified').eq('id', session.user.id).maybeSingle();
      Auth.me = { id: session.user.id, email: session.user.email, nickname: data?.nickname || session.user.email.split('@')[0], banned: !!data?.banned, verified: !!data?.email_verified };
    }
    Auth._ready = true; emit();
  }
  emit();
  db.auth.onAuthStateChange((event, session) => {
    // 回调里不能直接再调数据库（supabase-js 会卡住），放到下一轮执行
    if (['SIGNED_IN', 'SIGNED_OUT', 'INITIAL_SESSION', 'USER_UPDATED'].includes(event)) setTimeout(() => refresh(session), 0);
  });
})();
