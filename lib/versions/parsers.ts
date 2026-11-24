import type { VersionItem } from "./types";

export const NODE_CN = "https://cdn.npmmirror.com/binaries/node";
export const NODE_ORG = "https://nodejs.org/dist";
export const NPM_CN = "https://registry.npmmirror.com";
export const NPM_ORG = "https://registry.npmjs.org";
export const GH_API = "https://api.github.com";
export const GH_PROXY = "https://gh-proxy.com/";

interface NodeIndexEntry {
  version: string;
  lts: string | false;
}

// lts is a codename string or false — NOT a boolean. `=== true` would never match.
export function pickNodeLts(entries: NodeIndexEntry[]): NodeIndexEntry | undefined {
  return entries.find((e) => e.lts);
}

export function parseNodeIndex(text: string): VersionItem {
  const lts = pickNodeLts(JSON.parse(text) as NodeIndexEntry[]);
  if (!lts) throw new Error("no LTS entry in node index");
  return { version: lts.version };
}

export function parseRegistryVersion(text: string): VersionItem {
  const data = JSON.parse(text) as { version?: string };
  if (!data.version) throw new Error("no version in registry response");
  return { version: data.version };
}

interface ReleaseAsset {
  name: string;
  browser_download_url: string;
}

interface Release {
  tag_name: string;
  assets: ReleaseAsset[];
}

// Windows x64 only: *Windows.msi excludes *Windows-arm64.msi
export function parseCcSwitchRelease(text: string): VersionItem {
  const rel = JSON.parse(text) as Release;
  const asset = rel.assets?.find((a) => a.name.endsWith("Windows.msi"));
  if (!asset) throw new Error("no Windows x64 msi asset in release");
  return { version: rel.tag_name.replace(/^v/, ""), url: asset.browser_download_url };
}

export async function fetchText(url: string, signal: AbortSignal): Promise<string> {
  const res = await fetch(url, { signal });
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
  return res.text();
}
