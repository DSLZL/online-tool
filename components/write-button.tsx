"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { downloadZip, forgetHandle, isEmbeddedWebview, supportsDirectoryPicker, writeInstaller } from "@/lib/write";
import type { OutputFile } from "@/lib/output";

interface Props {
  files: OutputFile[];
  zipFilename: string;
}

export function WriteButton({ files, zipFilename }: Props) {
  const [status, setStatus] = useState<string | null>(null);
  const [stage, setStage] = useState<string | null>(null);
  const [blocked, setBlocked] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const names = files.map((f) => f.name).join("、");

  const handle = async () => {
    setBusy(true);
    setStatus(null);
    setStage("准备中…");
    const outcome = await writeInstaller(files, setStage);
    setBusy(false);
    setStage(null);
    switch (outcome.kind) {
      case "written":
        setStatus(
          `${outcome.updated ? "已更新到" : "已写入"}「${outcome.dirName}」文件夹：${names}。`,
        );
        break;
      case "blocked":
        setBlocked(outcome.existing);
        break;
      case "cancelled":
        setStatus("未选择文件夹，什么都没有写入。");
        break;
      case "fallback":
        downloadZip(files, zipFilename);
        setStatus(
          outcome.reason === "unsupported"
            ? "当前浏览器不支持直接写入文件夹，已改为下载压缩包。"
            : outcome.reason === "embedded"
              ? "这个内嵌浏览器不支持文件夹选择。已改为下载压缩包；或改用独立的 Chrome / Edge 打开本站。"
              : outcome.reason === "no-dialog"
                ? "没有等到文件夹选择框（可能被窗口挡住）。已改为下载压缩包。"
                : "写入被拒绝，已改为下载压缩包。",
        );
        break;
    }
  };

  return (
    <div className="mt-4">
      <Button onClick={handle} disabled={busy} size="lg">
        {busy ? (stage ?? "写入中…") : "写入文件夹…"}
      </Button>
      <p className="mt-2 text-xs text-muted-foreground">
        {isEmbeddedWebview()
          ? "当前是内嵌浏览器，无法弹出文件夹选择框。点按钮会改为下载压缩包；用独立浏览器打开本站可直接写入文件夹。"
          : supportsDirectoryPicker()
            ? `会写入 ${names}，并弹出系统对话框让你选择文件夹。下次点击会直接写入同一位置。`
            : "当前浏览器不支持直接写文件夹，会改为下载压缩包。"}
      </p>
      {busy && (
        <p className="mt-2 text-xs text-muted-foreground">
          如果没看到对话框，检查任务栏有没有闪烁的窗口，或浏览器地址栏下方的授权提示。
        </p>
      )}
      {status && <p className="mt-3 text-sm">{status}</p>}
      {!busy && supportsDirectoryPicker() && (
        <button
          type="button"
          className="mt-2 text-xs text-muted-foreground underline"
          onClick={async () => {
            await forgetHandle();
            setStatus("已忘记上次的文件夹，下次写入会重新弹出选择框。");
          }}
        >
          换个文件夹
        </button>
      )}

      <AlertDialog open={blocked !== null} onOpenChange={(o) => !o && setBlocked(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>目标文件夹里已有同名文件</AlertDialogTitle>
            <AlertDialogDescription>
              「{blocked}」不是本工具生成的（内容里没有生成标记）。为避免覆盖你已有的文件，这次没有写入。
              请换一个文件夹再试。
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogAction onClick={() => setBlocked(null)}>知道了</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
