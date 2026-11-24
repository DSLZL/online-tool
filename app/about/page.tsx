import Link from "next/link";
import { claudeEnv } from "@/lib/recipes/claude-env";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

export default function AboutPage() {
  return (
    <main className="mx-auto w-full max-w-2xl px-6 py-12">
      <Link href="/" className="text-sm text-muted-foreground hover:underline">
        ← 返回
      </Link>

      <h1 className="mt-4 text-2xl font-semibold tracking-tight">安全说明</h1>
      <p className="mt-2 text-sm text-muted-foreground">
        本站生成的是可执行脚本。下面说明它会做什么、不会做什么，以及你如何自行核实。
      </p>

      <div className="mt-8 space-y-4">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">站点在浏览器里做什么</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm text-muted-foreground">
            <p>读取公开的版本信息（npm registry、nodejs.org、GitHub API），在页面里拼出脚本文本。</p>
            <p>把生成的文本写入你通过系统对话框选择的目录，文件数量取决于你选的输出组合。浏览器不会把目录完整路径告诉网页。</p>
            <p>没有账号、没有 Cookie、没有分析脚本、没有服务端；所有逻辑都在你的浏览器里运行。</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">站点不会做什么</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm text-muted-foreground">
            <p>不会执行任何命令——浏览器没有这个能力。</p>
            <p>不会在你不点按钮的情况下写文件。</p>
            <p>不会覆盖不是本工具生成的文件：写入前会检查同名文件是否带本工具的标记注释，没有就拒绝。</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">如何自行核实</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm text-muted-foreground">
            <p>
              脚本全文在配置器页面可直接查看、可复制。运行时没有任何隐藏逻辑，全部内容以文本形式可见。
            </p>
            <p>
              每份生成脚本的头部带 <code className="font-mono text-xs"># generated-by</code> 与生成时间，
              可与页面显示比对。
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">运行脚本时会发生什么</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm text-muted-foreground">
            <p>安装 MSI 时会弹出管理员权限请求（UAC）。这是 Windows 的机制，脚本无法绕过。</p>
            <p>
              写入的文件<strong className="font-medium text-foreground">不带</strong>
              {" "}「来自 Internet」标记（实测：2026-11-24 在 Chromium 中写入后检查
              <code className="font-mono text-xs">Zone.Identifier</code>，未发现该数据流）。
              但 Windows SmartScreen 对未签名脚本仍可能给出提示，是否提示取决于文件声誉而非下载来源，本站不作承诺。
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">配方</CardTitle>
            <CardDescription>每个配方的行为都以数据描述，可以逐条阅读。</CardDescription>
          </CardHeader>
          <CardContent>
            <Link href={`/apps/${claudeEnv.id}`} className="flex items-center gap-2 text-sm underline">
              {claudeEnv.name}
              <Badge variant="secondary">{claudeEnv.steps.length} 个组件</Badge>
            </Link>
          </CardContent>
        </Card>
      </div>
    </main>
  );
}
