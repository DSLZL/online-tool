# 部署到 Cloudflare Pages

纯静态包，没有服务端、没有环境变量。构建产物在 `out/`。

## 前置

```bash
bun install
bun x wrangler login      # 浏览器里授权，一次就够
```

## 部署

```bash
bun run deploy
```

等价于 `bun run build && bun x wrangler pages deploy`。`wrangler.toml` 已写明 `pages_build_output_dir = "./out"`，无需再传目录参数。

首次部署时 wrangler 会问是否创建项目，回答 yes，项目名用 `wrangler.toml` 里的 `online-tool`。

## 预览环境

```bash
bun run deploy:preview
```

部署到 `preview` 分支，得到独立 URL，不覆盖生产。

## 部署前自检

`out/` 里不应该出现任何服务端产物：

```bash
find out -name "_worker.js" -o -name "_middleware.js" -o -type d -name "functions"
```

输出为空才对。构建配置已经保证这一点（`output: "export"`），这条命令用于确认没有意外引入。

## 为什么没有用 Git 集成

Git 集成需要仓库先推送到 GitHub 并在 Dashboard 里授权。当前仓库还没有 remote。若之后接上，构建配置是：

```
Framework preset:  Next.js (Static HTML Export)
Build command:     bun run build
Build directory:   out
```

## 路由注意事项

`next.config.ts` 设了 `trailingSlash: true`。Cloudflare Pages 按目录找 `index.html`，没有这个设置时 Next 导出 `about.html`，访问 `/about/` 会 404。改这个设置前先在本地验证三种路径都能打开。

## 已验证

- `out/` 中无 `_worker.js`、无 `_middleware.js`、无 `functions/`、无 `process.env` 引用
- 6 个 HTML 页面，`/`、`/about/`、`/apps/claude-env/` 均返回 200，带与不带尾部斜杠都可以
- 产物由 `output: "export"` 生成，不含 ISR、SSR、server actions
