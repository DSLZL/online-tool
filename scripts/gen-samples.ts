// Emits every recipe/selection combination as <name>.sample.ps1 for syntax validation.
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { generate } from "../lib/generate";

const versions = {
  node: "v26.13.1",
  bun: "1.4.5",
  claudeCode: "2.1.331",
  ccSwitch: "4.0.40",
  ccSwitchUrl: "https://example.invalid/cc-switch.msi",
};

const cases: Array<[string, Parameters<typeof generate>[0]["selected"]]> = [
  ["all", ["node", "bun", "claudeCode", "ccSwitch"]],
  ["cc-switch-only", ["ccSwitch"]],
  ["bun-only", ["node", "bun"]],
];

const dir = fileURLToPath(new URL("../", import.meta.url));
for (const [name, selected] of cases) {
  const { ps1 } = generate({ versions, selected, generatedAt: "2026-11-24T00:00:00.000Z" });
  writeFileSync(`${dir}${name}.sample.ps1`, "\uFEFF" + ps1);
}
console.log(`wrote ${cases.length} samples`);
