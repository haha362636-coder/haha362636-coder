/* 博客共用工具：Supabase 客户端、Markdown 渲染、日期格式 */
(function () {
  const cfg = window.BLOG_CONFIG || {};
  const ready = !!(cfg.supabaseUrl && cfg.supabaseAnonKey && window.supabase);

  const Blog = {
    cfg,
    ready,
    db: ready ? window.supabase.createClient(cfg.supabaseUrl, cfg.supabaseAnonKey) : null,

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
      el.innerHTML = `<div class="notice"><b>博客后台还没有配置好。</b><br>
        需要先在 <code>js/config.js</code> 里填好 Supabase 的地址和密钥，步骤见《后台设置教程.md》。
        配置完成后，这里就会显示文章。</div>`;
    }
  };

  window.Blog = Blog;
})();
