"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Badge } from "@/components/ui/badge";
import { claudeEnv, deselect, resolveSelection } from "@/lib/recipes/claude-env";
import type { StepId } from "@/lib/recipes/types";
import type { Channel, ItemKey, ResolvedVersions, Source } from "@/lib/versions/types";
import type { Versions } from "@/lib/recipes/types";
import { resolveVersions, liveFetchers } from "@/lib/versions/resolver";
import { generate } from "@/lib/generate";
import { buildFiles, zipName, type OutputKind } from "@/lib/output";
import { ScriptPreview } from "@/components/script-preview";
import { WriteButton } from "@/components/write-button";
import snapshotJson from "@/lib/versions.snapshot.json";

const LABELS: Record<ItemKey, string> = {
  node: "Node.js",
  bun: "Bun",
  claudeCode: "Claude Code",
  ccSwitch: "CC-Switch",
};

const SOURCE_LABELS: Record<Source, string> = {
  direct: "实时 · 直连",
  mirror: "实时 · 镜像",
  snapshot: "快照",
};

interface SnapshotFile {
  node: { version: string };
  bun: { version: string };
  claudeCode: { version: string };
  ccSwitch: { version: string; url: string };
  snapshotAt: string;
}

const snapshot = snapshotJson as SnapshotFile;

const snapshotItems = {
  node: snapshot.node,
  bun: snapshot.bun,
  claudeCode: snapshot.claudeCode,
  ccSwitch: snapshot.ccSwitch,
};

export function Configurator() {
  // Nothing is preselected: the user chooses what gets installed.
  const [selected, setSelected] = useState<StepId[]>([]);
  const [channel, setChannel] = useState<Channel>("auto");
  const [kind, setKind] = useState<OutputKind>("both");
  const [result, setResult] = useState<{ channel: Channel; versions: ResolvedVersions } | null>(null);

  useEffect(() => {
    let cancelled = false;
    resolveVersions(channel, liveFetchers, snapshotItems).then((r) => {
      if (!cancelled) setResult({ channel, versions: r });
    });
    return () => {
      cancelled = true;
    };
  }, [channel]);

  // Derive loading from data instead of setting state inside the effect.
  const versions = result?.channel === channel ? result.versions : null;
  const loading = versions === null;

  // A dependency of a selected step cannot be unchecked; it would leave a dangling requirement.
  const isDependency = (id: StepId) =>
    selected.some((s) => claudeEnv.steps.find((x) => x.id === s)?.requires.includes(id));

  const toggle = (id: StepId, on: boolean) => {
    setSelected(on ? resolveSelection(claudeEnv, [...selected, id]) : deselect(claudeEnv, selected, id));
  };

  const resolved: Versions = {
    node: versions?.node.version ?? snapshot.node.version,
    bun: versions?.bun.version ?? snapshot.bun.version,
    claudeCode: versions?.claudeCode.version ?? snapshot.claudeCode.version,
    ccSwitch: versions?.ccSwitch.version ?? snapshot.ccSwitch.version,
    ccSwitchUrl: versions?.ccSwitch.url ?? snapshot.ccSwitch.url,
  };
  const generatedAt = versions?.at ?? snapshot.snapshotAt;

  const generated = generate({ versions: resolved, selected, generatedAt });
  const files = buildFiles({ versions: resolved, selected, generatedAt, kind }, generated);

  return (
    <div className="mx-auto w-full max-w-2xl px-6 py-12">
      <header className="mb-10">
        <h1 className="text-2xl font-semibold tracking-tight">{claudeEnv.name}</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          勾选需要的组件，生成脚本写入你选择的目录，双击运行。所有内容在运行前都可见。
        </p>
        <p className="mt-2 flex gap-4 text-sm">
          <Link href={`/apps/${claudeEnv.id}`} className="underline">
            它会动哪些文件
          </Link>
          <Link href="/about" className="underline">
            安全说明
          </Link>
        </p>
      </header>

      <section className="mb-8">
        <h2 className="mb-3 text-sm font-medium">
          安装项
          <span className="ml-2 font-normal text-muted-foreground">
            已选 {selected.length} / {claudeEnv.steps.length}
          </span>
        </h2>
        <div className="space-y-3">
          {claudeEnv.steps.map((step) => {
            const locked = isDependency(step.id);
            return (
              <div key={step.id} className="flex items-center gap-3">
                <Checkbox
                  id={step.id}
                  checked={selected.includes(step.id)}
                  disabled={locked}
                  onCheckedChange={(v) => toggle(step.id, v === true)}
                />
                <Label htmlFor={step.id} className={locked ? "text-muted-foreground" : ""}>
                  {step.name}
                </Label>
                {locked && <span className="text-xs text-muted-foreground">被其他组件依赖</span>}
              </div>
            );
          })}
        </div>
      </section>

      <section className="mb-8">
        <h2 className="mb-3 text-sm font-medium">版本数据源</h2>
        <RadioGroup value={channel} onValueChange={(v) => setChannel(v as Channel)}>
          {(
            [
              ["auto", "自动（直连失败走镜像）"],
              ["direct", "仅直连"],
              ["mirror", "仅镜像"],
            ] as const
          ).map(([value, label]) => (
            <div key={value} className="flex items-center gap-3">
              <RadioGroupItem value={value} id={`ch-${value}`} />
              <Label htmlFor={`ch-${value}`}>{label}</Label>
            </div>
          ))}
        </RadioGroup>
      </section>

      <section className="mb-8">
        <h2 className="mb-3 text-sm font-medium">将安装的版本</h2>
        {loading ? (
          <p className="text-sm text-muted-foreground">读取中…</p>
        ) : (
          <ul className="space-y-1 text-sm">
            {(Object.keys(LABELS) as ItemKey[]).map((k) => (
              <li key={k} className="flex items-center gap-2">
                <span className="w-28 text-muted-foreground">{LABELS[k]}</span>
                <span className="font-mono">{versions?.[k].version ?? "—"}</span>
                {versions && !versions.fromSnapshot.includes(k) && (
                  <Badge variant="secondary">{SOURCE_LABELS[versions.source]}</Badge>
                )}
                {versions?.fromSnapshot.includes(k) && <Badge variant="outline">快照</Badge>}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="mb-8">
        <h2 className="mb-3 text-sm font-medium">输出内容</h2>
        <RadioGroup value={kind} onValueChange={(v) => setKind(v as OutputKind)}>
          {(
            [
              ["both", "两个文件（双击 .cmd 运行，.cmd 调用同目录的 .ps1）"],
              ["ps1", "只有 .ps1（自己在终端里运行）"],
              ["cmd", "只有 .cmd（独立运行，不依赖 .ps1；提示为英文）"],
            ] as const
          ).map(([value, label]) => (
            <div key={value} className="flex items-center gap-3">
              <RadioGroupItem value={value} id={`out-${value}`} />
              <Label htmlFor={`out-${value}`}>{label}</Label>
            </div>
          ))}
        </RadioGroup>
      </section>

      <section>
        <h2 className="mb-1 text-sm font-medium">脚本预览</h2>
        <p className="mb-2 text-xs text-muted-foreground">
          {selected.length === 0
            ? "勾选组件后，这里会显示将要写入磁盘的脚本原文。"
            : "这是将要写入磁盘的原文，运行时看到的就是这份。"}
        </p>
        {versions && selected.length > 0 && <ScriptPreview files={files} />}
      </section>

      <section className="mt-8 border-t pt-6">
        <h2 className="text-sm font-medium">写入并运行</h2>
        {selected.length === 0 ? (
          <p className="mt-2 text-sm text-muted-foreground">
            还没选任何组件。勾选上面的至少一项才能生成脚本。
          </p>
        ) : (
          <>
            {versions && <WriteButton files={files} zipFilename={zipName(kind)} />}
            <p className="mt-3 text-xs text-muted-foreground">
              写入后到资源管理器里找到你选的文件夹
              {kind === "ps1" ? "，右键 .ps1 选择「使用 PowerShell 运行」" : "，双击 .cmd 运行"}。
              装 MSI 时会弹出管理员权限请求。Windows 也可能对未签名脚本给出提示，这与文件来源无关。
            </p>
          </>
        )}
      </section>
    </div>
  );
}
