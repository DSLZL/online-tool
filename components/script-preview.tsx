"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import type { OutputFile } from "@/lib/output";

export function ScriptPreview({ files }: { files: OutputFile[] }) {
  const [copied, setCopied] = useState<string | null>(null);
  const [picked, setPicked] = useState<string | null>(null);

  const copy = async (text: string, name: string) => {
    await navigator.clipboard.writeText(text);
    setCopied(name);
    setTimeout(() => setCopied(null), 2000);
  };

  if (files.length === 0) return null;

  // Controlled, and clamped to the current file list: when the output kind changes the previous
  // selection may no longer exist, which would leave every panel inactive.
  const value = picked && files.some((f) => f.name === picked) ? picked : files[0].name;

  const body = (f: OutputFile) => (
    <div className="relative">
      <Button
        size="sm"
        variant="secondary"
        className="absolute right-2 top-2 z-10"
        onClick={() => copy(f.content, f.name)}
      >
        复制
      </Button>
      <pre className="max-h-96 overflow-auto rounded-md border bg-muted p-4 text-xs leading-relaxed">
        <code>{f.content}</code>
      </pre>
    </div>
  );

  return (
    <div className="mt-4">
      <Tabs value={value} onValueChange={setPicked}>
        <div className="flex items-center justify-between gap-2">
          <TabsList>
            {files.map((f) => (
              <TabsTrigger key={f.name} value={f.name}>
                {f.name}
              </TabsTrigger>
            ))}
          </TabsList>
          <span className="text-xs text-muted-foreground">
            {copied ? `已复制 ${copied}` : "写入磁盘的内容与此完全一致"}
          </span>
        </div>
        {files.map((f) => (
          <TabsContent key={f.name} value={f.name}>
            {body(f)}
          </TabsContent>
        ))}
      </Tabs>
    </div>
  );
}
