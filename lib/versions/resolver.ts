import {
  GH_API,
  GH_PROXY,
  NODE_CN,
  NODE_ORG,
  NPM_CN,
  NPM_ORG,
  fetchText,
  parseCcSwitchRelease,
  parseNodeIndex,
  parseRegistryVersion,
} from "./parsers";
import type {
  Channel,
  Fetchers,
  ItemKey,
  Items,
  ResolvedVersions,
  Source,
  VersionItem,
} from "./types";

export const CC_SWITCH_REPO = "farion1231/cc-switch";
const TIMEOUT_MS = 5000;
const ITEM_KEYS: ItemKey[] = ["node", "bun", "claudeCode", "ccSwitch"];

const BASES = {
  // gh is a PREFIX: gh-proxy mirrors api.github.com by prepending its own origin to the full URL,
  // while direct has no prefix. Keeping it a prefix avoids the doubled-host bug.
  direct: { node: NODE_ORG, npm: NPM_ORG, gh: "" },
  mirror: { node: NODE_CN, npm: NPM_CN, gh: GH_PROXY },
};

/** Prefix + full api.github.com URL. Covers both "no prefix" (direct) and gh-proxy's prefixing. */
function ccSwitchUrl(base: { gh: string }): string {
  return `${base.gh}${GH_API}/repos/${CC_SWITCH_REPO}/releases/latest`;
}

export const liveFetchers: Fetchers = {
  node: (base, signal) => fetchText(`${base}/index.json`, signal).then(parseNodeIndex),
  bun: (base, signal) => fetchText(`${base}/bun/latest`, signal).then(parseRegistryVersion),
  claudeCode: (base, signal) =>
    fetchText(`${base}/@anthropic-ai/claude-code/latest`, signal).then(parseRegistryVersion),
  ccSwitch: (url, signal) => fetchText(url, signal).then(parseCcSwitchRelease),
};

/** Ordered attempts per channel. `auto` tries direct first, then mirror — no speed-based sorting. */
export function sourcesFor(channel: Channel): Array<"direct" | "mirror"> {
  if (channel === "direct") return ["direct"];
  if (channel === "mirror") return ["mirror"];
  return ["direct", "mirror"];
}

function withTimeout<T>(fn: (signal: AbortSignal) => Promise<T>): Promise<T> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  return fn(ctrl.signal).finally(() => clearTimeout(timer));
}

/** One attempt against a single source. Items that fail fall back to their snapshot value. */
async function attempt(
  source: "direct" | "mirror",
  fetchers: Fetchers,
  snapshot: Items,
): Promise<{ items: Items; failed: ItemKey[] }> {
  const base = BASES[source];
  const failed: ItemKey[] = [];
  const run = async (key: ItemKey, fn: (s: AbortSignal) => Promise<VersionItem>) => {
    try {
      return await withTimeout(fn);
    } catch {
      failed.push(key);
      return snapshot[key];
    }
  };
  const [node, bun, claudeCode, ccSwitch] = await Promise.all([
    run("node", (s) => fetchers.node(base.node, s)),
    run("bun", (s) => fetchers.bun(base.npm, s)),
    run("claudeCode", (s) => fetchers.claudeCode(base.npm, s)),
    run("ccSwitch", (s) => fetchers.ccSwitch(ccSwitchUrl(base), s)),
  ]);
  return { items: { node, bun, claudeCode, ccSwitch }, failed };
}

export async function resolveVersions(
  channel: Channel,
  fetchers: Fetchers,
  snapshot: Items,
): Promise<ResolvedVersions> {
  const at = new Date().toISOString();
  for (const source of sourcesFor(channel)) {
    const { items, failed } = await attempt(source, fetchers, snapshot);
    // A source that returned nothing at all is not worth reporting; move to the next one.
    if (failed.length === ITEM_KEYS.length) continue;
    return { ...items, source, fromSnapshot: failed, at };
  }
  return { ...snapshot, source: "snapshot", fromSnapshot: ITEM_KEYS, at };
}

export type { Source };
