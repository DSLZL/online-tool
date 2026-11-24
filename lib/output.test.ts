import { expect, test } from "bun:test";
import { buildFiles, zipName } from "./output";
import type { Versions } from "./recipes/types";

const versions: Versions = {
  node: "v26.13.1",
  bun: "1.4.5",
  claudeCode: "2.1.331",
  ccSwitch: "4.0.40",
  ccSwitchUrl: "https://example.invalid/cc.msi",
};
const launcher = { cmd: "launcher-cmd", ps1: "launcher-ps1" };
const base = { versions, selected: ["node"] as const, generatedAt: "2026-01-01T00:00:00.000Z" };

test("both: 两个文件，ps1 带 BOM", () => {
  const files = buildFiles({ ...base, selected: ["node"], kind: "both" }, launcher);
  expect(files.map((f) => f.name)).toEqual(["install-claude-env.ps1", "install-claude-env.cmd"]);
  expect(files[0].bom).toBe(true);
  expect(files[1].bom).toBe(false);
});

test("ps1: 只有一个文件，不依赖 cmd", () => {
  const files = buildFiles({ ...base, selected: ["node"], kind: "ps1" }, launcher);
  expect(files).toHaveLength(1);
  expect(files[0].name).toBe("install-claude-env.ps1");
  expect(files[0].content).toBe("launcher-ps1");
});

test("cmd: 单文件且不与 ps1 内容相同", () => {
  const files = buildFiles({ ...base, selected: ["node"], kind: "cmd" }, launcher);
  expect(files).toHaveLength(1);
  expect(files[0].name).toBe("install-claude-env.cmd");
  expect(files[0].content).not.toBe("launcher-cmd");
  expect(files[0].content).toContain("rem generated-by");
  expect(files[0].content).not.toContain(".ps1");
});

test("zip 名称区分 cmd-only", () => {
  expect(zipName("cmd")).toContain("cmd-only");
  expect(zipName("both")).not.toContain("cmd-only");
});
