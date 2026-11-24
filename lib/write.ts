import { strToU8, zipSync } from "fflate";
import type { OutputFile } from "./output";

const MARKER = "# generated-by: online-tool installer-generator";
const DB_NAME = "online-tool";
const STORE = "handles";
const KEY = "output-dir";

interface DirHandle {
  name: string;
  getFileHandle(name: string, opts?: { create?: boolean }): Promise<FileHandle>;
  queryPermission(opts: { mode: "readwrite" | "read" }): Promise<PermissionState>;
  requestPermission(opts: { mode: "readwrite" | "read" }): Promise<PermissionState>;
}

interface FileHandle {
  getFile(): Promise<File>;
  createWritable(): Promise<{ write(data: BlobPart): Promise<void>; close(): Promise<void> }>;
}

interface PickerWindow {
  showDirectoryPicker?(opts?: { mode?: "readwrite" | "read"; startIn?: string }): Promise<DirHandle>;
}

export type WriteOutcome =
  | { kind: "written"; dirName: string; updated: boolean }
  | { kind: "blocked"; existing: string }
  | { kind: "cancelled" }
  | { kind: "fallback"; reason: "unsupported" | "error" | "embedded" | "no-dialog" };

/**
 * Some hosts (VS Code's embedded browser, older Electron webviews) expose showDirectoryPicker
 * but never resolve it — no native dialog can appear inside the webview. The API's presence is
 * therefore not enough: the call must be raced against a timeout.
 */
const PICKER_TIMEOUT_MS = 15000;

function timeoutAfter<T>(ms: number, onTimeout: () => T): { promise: Promise<T>; cancel: () => void } {
  let timer: ReturnType<typeof setTimeout>;
  const promise = new Promise<T>((resolve) => {
    timer = setTimeout(() => resolve(onTimeout()), ms);
  });
  return { promise, cancel: () => clearTimeout(timer) };
}

export function supportsDirectoryPicker(): boolean {
  return typeof (window as unknown as PickerWindow).showDirectoryPicker === "function";
}

/** True when the page is running inside an IDE webview rather than a real browser tab. */
export function isEmbeddedWebview(): boolean {
  if (typeof navigator === "undefined") return false;
  return /\b(VSCode|Electron)\b/i.test(navigator.userAgent) || "vscode" in window;
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function loadHandle(): Promise<DirHandle | null> {
  const db = await openDb();
  return new Promise((resolve) => {
    const req = db.transaction(STORE, "readonly").objectStore(STORE).get(KEY);
    req.onsuccess = () => resolve((req.result as DirHandle) ?? null);
    req.onerror = () => resolve(null);
  });
}

async function saveHandle(handle: DirHandle | null): Promise<void> {
  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    if (handle) tx.objectStore(STORE).put(handle, KEY);
    else tx.objectStore(STORE).delete(KEY);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

/** Forgets the remembered folder so the next write opens the picker again. */
export async function forgetHandle(): Promise<void> {
  await saveHandle(null);
}

/** Existing files without our marker are not ours to overwrite. */
async function findConflict(dir: DirHandle, names: string[]): Promise<string | null> {
  for (const name of names) {
    try {
      const file = await (await dir.getFileHandle(name)).getFile();
      const text = await file.text();
      if (!text.includes(MARKER)) return name;
    } catch {
      // Missing file is not a conflict.
    }
  }
  return null;
}

async function writeFiles(dir: DirHandle, files: OutputFile[]): Promise<void> {
  for (const f of files) {
    const handle = await dir.getFileHandle(f.name, { create: true });
    const writable = await handle.createWritable();
    await writable.write(new Blob([f.bom ? "﻿" + f.content : f.content], { type: "text/plain" }));
    await writable.close();
  }
}

/**
 * Writes both files, prompting for a directory the first time and reusing the stored handle after.
 * Must be called inside a user gesture: requestPermission and showDirectoryPicker both require it.
 * `onStage` reports progress so the UI never sits on a generic spinner while a dialog or
 * permission bar waits for the user somewhere off-screen.
 */
export async function writeInstaller(
  files: OutputFile[],
  onStage?: (stage: string) => void,
): Promise<WriteOutcome> {
  if (!supportsDirectoryPicker()) return { kind: "fallback", reason: "unsupported" };

  try {
    onStage?.("检查已有授权…");
    let dir = await loadHandle();
    let fromStore = dir !== null;

    if (dir) {
      const state = (await dir.queryPermission({ mode: "readwrite" })) ?? "prompt";
      if (state !== "granted") {
        onStage?.("等待你在浏览器顶部允许访问该文件夹…");
        const asked = await dir.requestPermission({ mode: "readwrite" });
        if (asked !== "granted") {
          // Drop the dead handle so the next click goes straight to the folder picker.
          await saveHandle(null);
          dir = null;
          fromStore = false;
        }
      }
    }

    if (!dir) {
      onStage?.("等待你选择文件夹…");
      if (isEmbeddedWebview()) {
        // Known dead end: the picker exists but has no UI to show. Skip the 15s wait.
        return { kind: "fallback", reason: "embedded" };
      }
      const picked: DirHandle | null | "timeout" = await Promise.race([
        (window as unknown as PickerWindow).showDirectoryPicker!({
          mode: "readwrite",
          startIn: "desktop",
        }),
        timeoutAfter(PICKER_TIMEOUT_MS, () => "timeout" as const).promise,
      ]);
      if (picked === "timeout") return { kind: "fallback", reason: "no-dialog" };
      dir = picked;
    }

    onStage?.("检查同名文件…");
    const conflict = await findConflict(dir, files.map((f) => f.name));
    if (conflict) {
      await saveHandle(dir);
      return { kind: "blocked", existing: conflict };
    }

    onStage?.("写入中…");
    const dirName = dir.name || "所选";
    await writeFiles(dir, files);
    await saveHandle(dir);
    return { kind: "written", dirName, updated: fromStore };
  } catch (e) {
    if (e instanceof DOMException && e.name === "AbortError") return { kind: "cancelled" };
    console.error("write failed", e);
    return { kind: "fallback", reason: "error" };
  }
}

/** Same two files as a zip, for browsers without the directory picker. */
export function downloadZip(files: OutputFile[], filename: string): void {
  const entries: Record<string, Uint8Array> = {};
  for (const f of files) entries[f.name] = strToU8(f.bom ? "﻿" + f.content : f.content);
  const zip = zipSync(entries);
  const url = URL.createObjectURL(new Blob([new Uint8Array(zip)], { type: "application/zip" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
