/* 博客共用工具：Supabase 客户端、Markdown 渲染、日期格式 */
(function () {
  const cfg = window.BLOG_CONFIG || {};
  const ready = !!(cfg.supabaseUrl && cfg.supabaseAnonKey && window.supabase);

  // 国内连 Supabase（海外服务器）偶尔会断：每个请求最多等 15 秒，网络错误自动重试 3 次
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  async function steadyFetch(url, opts = {}) {
    for (let i = 0; ; i++) {
      const ctrl = opts.signal ? null : new AbortController();
      const timer = ctrl && setTimeout(() => ctrl.abort(), 15000);
      try {
        return await fetch(url, ctrl ? { ...opts, signal: ctrl.signal } : opts);
      } catch (e) {
        if (i >= 2 || opts.signal?.aborted) throw e;
        await sleep(800 * (i + 1));
      } finally { clearTimeout(timer); }
    }
  }

  const Blog = {
    cfg,
    ready,
    db: ready ? window.supabase.createClient(cfg.supabaseUrl, cfg.supabaseAnonKey, { global: { fetch: steadyFetch } }) : null,

    // 是不是网络连不上导致的错误（TypeError: Failed to fetch / Load failed 之类）
    isNetErr(err) {
      return /failed to fetch|load failed|networkerror|network request failed|aborted|timeout/i.test(err?.message || String(err || ''));
    },

    // 统一的出错提示：网络问题给「重试」按钮，其他错误显示原因
    showError(el, err, what, retry) {
      const net = Blog.isNetErr(err);
      el.innerHTML = `<div class="notice"><b>${what}加载失败。</b><br>${net
        ? '连不上博客的数据服务器，可能是网络不稳定（服务器在海外）。换个网络、或者过一会儿再试试。'
        : '出错原因：' + Blog.esc(err?.message || err)}
        ${retry ? '<div style="margin-top:12px"><button class="btn btn-neon btn-sm" type="button" data-retry>重试</button></div>' : ''}</div>`;
      el.querySelector('[data-retry]')?.addEventListener('click', retry);
    },

    // 本机缓存：网络不好时先显示上次成功加载的内容
    cache: {
      get(k) { try { return JSON.parse(localStorage.getItem('bobs-cache:' + k) || 'null'); } catch (_) { return null; } },
      set(k, v) { try { localStorage.setItem('bobs-cache:' + k, JSON.stringify(v)); } catch (_) {} }
    },

    // 把 Markdown 转成安全的 HTML（先 marked 解析，再用 DOMPurify 过滤脚本）
    md(text) {
      const html = window.marked ? window.marked.parse(text || '', { breaks: true, gfm: true }) : Blog.esc(text || '').replace(/\n/g, '<br>');
      return window.DOMPurify ? window.DOMPurify.sanitize(html) : Blog.esc(text || '');
    },

    esc(s) {
      return String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    },

    date(iso, withTime) {
      if (!iso) return '';
      const d = new Date(iso), p = n => String(n).padStart(2, '0');
      const day = `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
      return withTime ? `${day} ${p(d.getHours())}:${p(d.getMinutes())}` : day;
    },

    // 估算阅读时间：中文约 400 字/分钟
    readMin(text) {
      return Math.max(1, Math.round(String(text || '').replace(/\s+/g, '').length / 400));
    },

    // 后台没配置时的提示
    notConfigured(el) {
      if (cfg.supabaseUrl && cfg.supabaseAnonKey && !window.supabase) {
        el.innerHTML = `<div class="notice"><b>页面组件没加载出来。</b><br>可能是网络不稳定，刷新一下试试。</div>`;
        return;
      }
      el.innerHTML = `<div class="notice"><b>博客后台还没有配置好。</b><br>
        需要先在 <code>js/config.js</code> 里填好 Supabase 的地址和密钥，步骤见《后台设置教程.md》。
        配置完成后，这里就会显示文章。</div>`;
    }
  };

  window.Blog = Blog;
})();
