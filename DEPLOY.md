# 部署到 Cloudflare Pages

生产部署走 **Git 集成**：push 到 `main`，Cloudflare 自己构建并发布。本地不需要跑 `build`。

线上：<https://online-tool.dslzl.eu.org>（项目名 `online-tool`）

## 项目配置

Dashboard → Workers & Pages → `online-tool` → Settings → Build

| 字段 | 值 |
|---|---|
| Framework preset | `Next.js (Static HTML Export)` |
| Build command | `bun run build` |
| Build output directory | `out` |
| Production branch | `main` |
| `BUN_VERSION`（环境变量） | `1.4.4` |

`BUN_VERSION` 官方默认就是 1.4.4，显式设置是为了将来默认值变动时不悄悄换版本。版本要和 `package.json` 的 `packageManager` 一致。

## 日常部署

```bash
git push origin main
```

Cloudflare 自动构建，3–5 分钟。PR 会生成预览部署，不覆盖生产。

## 本地复现云端构建

出问题时先确认不是本地环境差异：

```bash
rm -rf /tmp/cf-sim && git clone --depth 1 https://github.com/DSLZL/online-tool.git /tmp/cf-sim
cd /tmp/cf-sim && bun install --frozen-lockfile && bun run build
```

产物应当与本地 `out/` 的 HTML 文件列表完全一致。

## 手动部署（备用）

Git 集成不可用时的退路，产物是本地编译后上传：

```bash
bun run deploy           # 构建 + 上传到生产
bun run deploy:preview   # 构建 + 上传到 preview 分支
```

⚠️ 同一个 Pages 项目不能同时用 Git 集成和手动上传——Git 集成创建的项目拒绝 direct upload，反之亦然。手动部署需要单独建项目。

## 部署前自检

`out/` 里不应该出现任何服务端产物：

```bash
find out -name "_worker.js" -o -name "_middleware.js" -o -type d -name "functions"
```

输出为空才对。`output: "export"` 已经保证这一点，这条命令用于确认没有意外引入 SSR、API 路由或中间件。

## 路由注意事项

`next.config.ts` 设了 `trailingSlash: true`。Cloudflare Pages 按目录找 `index.html`；没有这个设置时 Next 导出 `about.html`，访问 `/about/` 会 404。改这个设置前先在本地验证三种路径都能打开。

## 已验证

- 从零克隆 → `bun install --frozen-lockfile` → `bun run build` 成功，52 个测试通过，产物与本地构建一致
- `out/` 中无 `_worker.js`、无 `_middleware.js`、无 `functions/`、无 `process.env` 引用
- 线上 `/`、`/about/`、`/apps/claude-env/` 返回 200；`/about` 返回 308 重定向到 `/about/`；不存在的路径返回 404
- 产物由 `output: "export"` 生成，不含 ISR、SSR、server actions
