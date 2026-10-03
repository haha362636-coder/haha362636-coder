/* =========================================================
   博客后台配置 —— 照着《后台设置教程.md》把下面三项填好
   ---------------------------------------------------------
   这里填的 anon key 是「公开密钥」，本来就是给网页用的，
   放在 GitHub 上没关系。真正的权限由数据库里的规则控制。
   千万不要把 service_role 那个密钥填到这里！
   ========================================================= */
window.BLOG_CONFIG = {
  // Supabase 项目地址，形如 https://abcdefgh.supabase.co
  supabaseUrl: 'https://cvoromzgcgzqlchzktjc.supabase.co',
  // Supabase 的 anon public key（一长串 eyJ 开头的字符）
  supabaseAnonKey:'sb_publishable_JHvjNFDTSbfNvf08Jne5BQ_5MDQ4jVp',
  // 管理员邮箱：只有用这个邮箱登录，后台才会显示写文章的功能
  adminEmail: 'haha362636@icloud.com'
};
