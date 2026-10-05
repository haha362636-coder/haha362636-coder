-- =========================================================
-- 一键发布博文：《Noe Agent 上线》下载与使用教程
-- 用法：Supabase → SQL Editor → New query → 整份粘贴 → Run
-- 发布后可以在博客后台「文章管理」里继续编辑。重复运行不会发两篇。
-- =========================================================
insert into public.posts (title, summary, cover, tags, published, content)
select
  'Noe Agent 上线：把 AI 编程助手装进一个聊天软件（下载与使用教程）',
  '我的新工具 Noe Agent 发布 Beta 测试版。一键安装 Claude Code、Codex 等 AI 编程助手，私聊、拉群、@ 谁就谁来干活。这篇讲清楚怎么下载、安装和上手。',
  'assets/noe-cover.jpg',
  array['Noe Agent', '教程', '开源项目'],
  true,
  $md$> ⚠️ **这是 Beta 测试版，还会有一些问题。** 遇到 Bug 或者有想法，欢迎到 [GitHub Issues](https://github.com/haha362636-coder/noe-agent/issues) 告诉我，或者直接在这篇文章下面留言。

## Noe Agent 是什么

我平时写代码离不开 Claude Code 和 Codex，但每个 AI 工具都是一个单独的命令行，装起来、登录、切换模型都挺麻烦。于是我做了 **Noe Agent**：

**把各种 AI 编程助手装进一个聊天软件。**

- **一键安装**：Claude Code、Codex、DeepSeek Harness、Gemini CLI、Qwen Code、OpenCode，点一下就装好，也能一键更新、卸载
- **多家模型 API 统一管理**：Anthropic、OpenAI、DeepSeek、智谱 GLM、Kimi、阿里云百炼、MiniMax、OpenRouter、硅基流动、Gemini，也可以添加任意兼容接口
- **像聊微信一样用 AI**：可以私聊任意一个 AI，也可以把几个 AI 拖进一个群，**@ 谁就谁来干活**，AI 之间还能互相 @ 接力
- **免费开源**：MIT 协议，代码全在 [GitHub](https://github.com/haha362636-coder/noe-agent)

---

## 一、下载

目前只有 **macOS** 版，系统要求 **macOS 12 及以上**。

### 先看你的 Mac 是什么芯片

点屏幕左上角的苹果图标  →「**关于本机**」，看「**芯片**」那一栏：

| 「芯片」一栏写的是 | 下载这个 |
|---|---|
| Apple M1 / M2 / M3 / M4 … | `Noe-Agent-0.2.0-beta.1-mac-arm64.dmg`（约 104 MB） |
| Intel … | `Noe-Agent-0.2.0-beta.1-mac-x64.dmg`（约 111 MB） |

> 💡 选错了也不会弄坏电脑，只是装好后打不开或者很慢，换另一个重新装就行。

### 去哪下载

- **博客下载站**：[点这里](downloads.html)，找到「Noe Agent 相关下载」，标着「最新」的就是
- **GitHub Releases**：[github.com/haha362636-coder/noe-agent/releases](https://github.com/haha362636-coder/noe-agent/releases)

两个地方的文件是同一份，哪个快用哪个。

---

## 二、安装

**1. 拖进「应用程序」**

双击下载好的 `.dmg`，在弹出的窗口里把 **Noe Agent** 图标拖到「应用程序」文件夹。

**2. 第一次打开前，执行一条命令**

安装包没有经过 Apple 公证（公证要每年付费给苹果），所以第一次打开时 macOS 可能会提示「**已损坏**」或者「**无法验证开发者**」。这不是真的坏了，打开「**终端**」（启动台里搜「终端」），粘贴下面这行，按回车：

```bash
xattr -cr "/Applications/Noe Agent.app"
```

这条命令的意思是：去掉 macOS 给「从网上下载的文件」加的隔离标记。执行完不会有任何提示，这是正常的。

**3. 双击打开**

去「应用程序」里双击 Noe Agent，就能正常打开了。以后再打开都不用执行那条命令。

> 内置终端功能需要系统自带的 `python3`。如果你的 Mac 没装过，macOS 会弹窗提示安装「命令行开发者工具」，点「安装」等它装完就行。

---

## 三、五分钟上手

### 第 1 步：装一个 AI 工具

打开后先去「**AI 工具**」，挑一个你想用的（比如 Claude Code 或 Codex），点安装。装好后卡片上会显示它的官方账号登录状态。

如果你有别的命令行 AI 工具，也可以作为「自定义 CLI」接进来。

### 第 2 步：让 AI 能用起来（二选一）

**方式 A：用官方账号登录**

在聊天里输入 `/login`，Noe Agent 会在内置终端里打开对应工具的登录流程，按提示登录就行。

**方式 B：用模型厂商的 API Key**

去「**模型厂商**」，选一个预设厂商（比如 DeepSeek、智谱、Kimi），填入你的 API Key。可以点「连通性测试」确认能连上，还能拉取这家的模型列表。

两种方式随时能切换：在工具卡片上、聊天窗口顶部，或者输入 `/use` 都可以。

> 🔒 API Key 只保存在你自己电脑的 `~/.noe-agent/data.json` 里（权限 600），不会上传到任何地方。

### 第 3 步：新建会话，选工作目录

新建会话时会先让你**选一个项目文件夹**。AI 写出来的文件都会放在这里，不会到处乱丢。回复里提到的文件，点链接就会用默认程序打开。

### 第 4 步：开始聊

- **私聊**：选一个 AI，直接说你要做什么，比如「帮我写一个待办清单网页」
- **拉群**：把几个 AI 拖进同一个群，用 @ 分配任务。比如：

  > @Claude 帮我写个登录页面，@Codex 写完后帮它补上测试

  AI 之间也能互相 @ 接力。回复支持 Markdown 和代码高亮，还能看到执行过程的时间线、耗时、token 用量和费用。

---

## 四、常用 / 命令

在聊天输入框里打 `/` 就能用：

| 命令 | 作用 |
|---|---|
| `/help` | 查看所有命令 |
| `/login` `/logout` | 登录、退出 AI 工具的官方账号 |
| `/use` | 在官方登录和各家 API 之间切换 |
| `/model` | 切换模型，支持模糊匹配，比如 `/model opus 5.5`、`/model gpt-6` |
| `/effort` | 调整思考强度（Claude Code 和 Codex 支持） |
| `/status` | 查看当前状态 |
| `/new` `/clear` | 新建会话、清空当前会话 |
| `/stop` | 让 AI 停下来 |
| `/cwd` | 查看或切换工作目录 |
| `/invite` `/kick` | 把 AI 拉进群、移出群 |
| `/rename` | 给会话改名 |
| `/terminal` `/shell` | 打开内置终端（快捷键 ⌘J） |

需要交互界面的命令（比如 Claude 的 `/config`、`/mcp`），会自动在内置终端里打开。

---

## 五、进阶：MCP 和插件

- **MCP 服务器**：内置 20 个常用预设，比如文件系统、Context7、GitHub、Playwright、Chrome DevTools、Tavily、高德地图、Notion。选好后可以**一键装进多个 AI 工具**，还能在「已安装」矩阵里同步或移除；也支持自定义，或者直接粘贴 JSON 导入。
- **插件**：支持 Claude Code 插件市场（300 多个插件）、Codex 插件、Gemini CLI 扩展，一键安装、启用、卸载。

> 第一次修改 Gemini / Qwen / OpenCode 的配置文件前，Noe Agent 会先备份成 `*.noe-backup`，改坏了也能恢复。

---

## 六、注意事项

- **「全自动模式」要小心用**：设置里的全自动模式会跳过 AI 工具的所有权限确认，AI 可以直接改文件、跑命令。**只在你信得过的项目文件夹里开。**
- **Codex 接第三方厂商**：厂商需要兼容 OpenAI 的 Responses 接口（`/v1/responses`），不是所有厂商都支持。
- **AI 工具更新很频繁**：如果某个工具升级后命令出问题，可能需要等 Noe Agent 更新。

---

## 七、常见问题

**打开时提示「已损坏，无法打开」？**
执行一次第二部分里的 `xattr -cr` 命令就好。

**装好了但是打不开，或者特别卡？**
很可能下错了芯片版本，回到第一部分核对一下。

**能在 Windows 上用吗？**
暂时不行，目前只支持 macOS。

**想自己改代码？**
需要 Node.js 18 以上：

```bash
git clone https://github.com/haha362636-coder/noe-agent.git
cd noe-agent
npm install
npm start
```

只想在浏览器里用，可以运行 `npm run web`，然后打开 `http://127.0.0.1:17860`。

---

## 最后

这是 Noe Agent 的第一个测试版，肯定还有不少不完善的地方。用着有问题、或者想要什么功能，欢迎在下面评论区留言，或者去 [GitHub Issues](https://github.com/haha362636-coder/noe-agent/issues) 反馈。

觉得好用的话，去 GitHub 点个 ⭐ Star，或者到 [支持页面](support.html) 请我喝杯奶茶，都是对我很大的鼓励 ❤
$md$
where not exists (select 1 from public.posts where title like 'Noe Agent 上线%');
