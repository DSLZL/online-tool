import { notFound } from "next/navigation";
import Link from "next/link";
import { claudeEnv } from "@/lib/recipes/claude-env";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export function generateStaticParams() {
  return [{ slug: claudeEnv.id }];
}

const DETAILS: Record<string, { files: string[]; registry: string[]; sources: string[] }> = {
  "claude-env": {
    files: [
      "%TEMP%\\node-lts-x64.msi（安装后由 msiexec 处理）",
      "%TEMP%\\cc-switch.msi（安装后由 msiexec 处理）",
      "%USERPROFILE%\\.bun\\bin\\ 下的 bun / claude 可执行文件",
      "用户环境变量 Path 追加 npm 全局 bin 与 %USERPROFILE%\\.bun\\bin",
    ],
    registry: [
      "写入：MSI 的卸载信息（node、CC-Switch 各一条）",
      "读取：卸载注册表以判断 CC-Switch 已安装版本",
      "不修改其它注册表项",
    ],
    sources: [
      "https://nodejs.org/dist/",
      "https://cdn.npmmirror.com/binaries/node/",
      "https://registry.npmjs.org/",
      "https://registry.npmmirror.com/",
      "https://github.com/farion1231/cc-switch/releases",
    ],
  },
};

export default async function RecipePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const detail = DETAILS[slug];
  if (!detail) notFound();

  return (
    <main className="mx-auto w-full max-w-2xl px-6 py-12">
      <Link href="/" className="text-sm text-muted-foreground hover:underline">
        ← 返回
      </Link>
      <h1 className="mt-4 text-2xl font-semibold tracking-tight">{claudeEnv.name}</h1>
      <p className="mt-2 text-sm text-muted-foreground">
        安装 {claudeEnv.steps.map((s) => s.name).join("、")}。已安装的组件会被检测并跳过。
      </p>

      <div className="mt-8 space-y-4">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">会写入的文件</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="space-y-1 text-sm text-muted-foreground">
              {detail.files.map((f) => (
                <li key={f} className="font-mono text-xs">{f}</li>
              ))}
            </ul>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">注册表</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="space-y-1 text-sm text-muted-foreground">
              {detail.registry.map((r) => (
                <li key={r}>{r}</li>
              ))}
            </ul>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">下载来源</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="space-y-1 text-sm">
              {detail.sources.map((s) => (
                <li key={s}>
                  <a href={s} target="_blank" rel="noreferrer" className="underline">
                    {s}
                  </a>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">安装步骤</CardTitle>
          </CardHeader>
          <CardContent>
            <ol className="space-y-1 text-sm text-muted-foreground">
              {claudeEnv.steps.map((s) => (
                <li key={s.id} className="flex items-center gap-2">
                  <Badge variant="outline">{s.name}</Badge>
                  {s.requires.length > 0 && (
                    <span className="text-xs">依赖 {s.requires.join("、")}</span>
                  )}
                </li>
              ))}
            </ol>
          </CardContent>
        </Card>
      </div>
    </main>
  );
}
