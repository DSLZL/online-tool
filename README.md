# online-tool

帮用户把本地环境配置好的一次性工具站：勾选要装的组件，页面生成可审计的 Windows 安装脚本，写入你选的文件夹，双击运行。

线上：<https://online-tool.dslzl.eu.org>

## 为什么是"生成脚本"而不是"一键安装"

浏览器不能执行本地程序。这是安全模型，不是能力缺口。所以站的产物只能是脚本，由用户自己双击。任何"加个后端代跑"或"用 WebAssembly 执行安装"的方案都碰不到真机。

由此得出一条硬规则：**配方数据公开、生成器源码公开、脚本全文在页面上可见**。任何"为了体验牺牲可见性"的改动都不接受。

## 开发

```bash
bun install
bun run dev        # http://localhost:3000
bun test           # 生成器单测
bun run lint
bun run build      # 静态导出到 out/
```

改 `lib/runtime.ps1` 之后必须重新生成常量，否则测试会失败（`lib/runtime.test.ts` 断言两者逐字节一致）：

```bash
bun run gen:runtime
```

## 架构

单一真相源是 `lib/generate.ts` + `lib/generate-cmd.ts`。页面预览、写入磁盘、zip 下载全部从这两个出口取内容，预览必须与落盘逐字节一致。

```
lib/recipes/claude-env.ts   配方数据：步骤、依赖关系
lib/recipes/types.ts        类型定义
lib/generate.ts             生成 .ps1（运行时库常量 + 按勾选展开的步骤）
lib/generate-cmd.ts         生成独立 .cmd（纯 ASCII，自带全部逻辑）
lib/runtime.ps1             运行时库源码（下载/续传/提权/安装/自检）
lib/runtime.generated.ts    由 gen-runtime.ts 从上面生成，勿手改
lib/output.ts               按输出组合组装文件集合
lib/write.ts                File System Access API 写入
lib/versions/               三通道版本读取 + 快照回退
```

三种输出组合，用户选：`.cmd` + `.ps1`（`.cmd` 只做转调）/ 仅 `.ps1` / 仅 `.cmd`（独立运行，不引用 `.ps1`）。

### 两条容易踩的编码约束

- **`.cmd` 必须纯 ASCII**。`cmd.exe` 按读取时的当前代码页逐字节解析批处理文件本身，`chcp 65001` 只改控制台输出，改不了解析——中文会在缓冲区边界被劈开变成非法命令。所以独立 `.cmd` 的提示语只能是英文。
- **`.ps1` 必须前置 UTF-8 BOM**，这是 Windows PowerShell 5.1 正确解码中文的要求。

### 测试策略

生成器是纯函数，用 golden 断言锁住：内容确定性、BOM/ASCII、版本注入、依赖闭包、标签完整性。`.ps1` 另有 `scripts/parse-check.ps1` 在 CI 的 windows-latest 上做语法解析，零错误才算过。

两条批处理陷阱有专门的回归测试（`lib/generate-cmd.test.ts`）：`powershell -Command "..."` 双引号内没有 `^` 转义、MSI 退出码 `3010` 须按成功处理、版本比较不能用 cmd 的字符串比较。

## 部署

Cloudflare Pages Git 集成，push 到 `main` 自动构建。构建命令 `bun run build`，输出目录 `out`，`BUN_VERSION=1.4.4`。

详见 [DEPLOY.md](DEPLOY.md)。

## 规格文档不在本仓库

行为契约与设计决策记录在 OpenSpec 变更里（`openspec/changes/add-installer-generator/`），该目录已从版本控制中排除。克隆本仓库不会得到那份规划文档。

代码里能直接读到的部分是配方数据、生成器源码与运行时库，也就是产品要透明的那部分。
