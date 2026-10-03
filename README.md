# Bobs 的小宇宙

Bobs 的个人博客：开源项目「纸间 Paperroom」、B站空间，还有一只会带路的果冻小导游「啵啵」（AI 功能开发中）。

- 主页：`index.html`
- 博文：`blog.html`（列表）、`post.html`（文章 + 评论）
- 管理后台：`admin.html`（登录后写博文、管理评论）
- 下载站：`downloads.html`（自动读取 GitHub Releases）
- 支持页：`support.html`
- 图片：`assets/`，共用样式和脚本：`css/`、`js/`

网页本身是纯静态的，用 GitHub Pages 托管；博文、评论和管理员登录存在 Supabase，数据库结构见 `supabase/schema.sql`，连接信息填在 `js/config.js`。

## 图片来源

- 背景 [Hong Kong](https://commons.wikimedia.org/wiki/File:Hong_Kong_(Unsplash_cGUbzDqLCyg).jpg)，Annie Spratt，CC0（已提亮）
- 背景 [Mong Kok Neon Signs Night](https://commons.wikimedia.org/wiki/File:Mong_Kok_Neon_Signs_Night_(48127904386).jpg)，Benh LIEU SONG，CC BY-SA 2.0（已调色）
- 纸间截图来自 [paperroom](https://github.com/haha362636-coder/paperroom) 仓库
