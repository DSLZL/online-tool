// Writes lib/versions.snapshot.json from live sources. Run manually: bun run gen:snapshot
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { parseCcSwitchRelease, parseNodeIndex, parseRegistryVersion, fetchText, NODE_ORG, NPM_ORG, GH_API } from "../lib/versions/parsers";

const ctrl = new AbortController();
const timer = setTimeout(() => ctrl.abort(), 15000);
const base = process.env.SNAPSHOT_MIRROR === "1";

async function main() {
  const nodeBase = base ? "https://cdn.npmmirror.com/binaries/node" : NODE_ORG;
  const npmBase = base ? "https://registry.npmmirror.com" : NPM_ORG;
  const ghBase = base ? "https://gh-proxy.com/" : "";
  const [node, bun, claudeCode, ccSwitch] = await Promise.all([
    fetchText(`${nodeBase}/index.json`, ctrl.signal).then(parseNodeIndex),
    fetchText(`${npmBase}/bun/latest`, ctrl.signal).then(parseRegistryVersion),
    fetchText(`${npmBase}/@anthropic-ai/claude-code/latest`, ctrl.signal).then(parseRegistryVersion),
    fetchText(`${ghBase}${GH_API}/repos/farion1231/cc-switch/releases/latest`, ctrl.signal).then(parseCcSwitchRelease),
  ]);
  const out = { node, bun, claudeCode, ccSwitch, snapshotAt: new Date().toISOString() };
  writeFileSync(fileURLToPath(new URL("../lib/versions.snapshot.json", import.meta.url)), JSON.stringify(out, null, 2) + "\n");
  console.log(JSON.stringify(out, null, 2));
}
main().catch((e) => { console.error(e.message); process.exit(1); }).finally(() => clearTimeout(timer));
