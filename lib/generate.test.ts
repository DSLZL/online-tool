import { describe, expect, test } from "bun:test";
import { generate } from "./generate";
import type { GenerateOptions } from "./recipes/types";

const versions = {
  node: "v26.13.1",
  bun: "1.4.5",
  claudeCode: "2.1.331",
  ccSwitch: "4.0.40",
  ccSwitchUrl:
    "https://github.com/farion1231/cc-switch/releases/download/v4.0.40/CC-Switch-v4.0.40-Windows.msi",
};

const allSteps: GenerateOptions = {
  versions,
  selected: ["node", "bun", "claudeCode", "ccSwitch"],
  generatedAt: "2026-11-24T00:00:00.000Z",
};

describe("generate", () => {
  test("ps1 以标记注释开头", () => {
    const { ps1 } = generate(allSteps);
    expect(ps1.split("\n")[0]).toBe("# generated-by: online-tool installer-generator");
  });

  test("cmd 是纯 ASCII", () => {
    const { cmd } = generate(allSteps);
    expect(/^[\x00-\x7F]*$/.test(cmd)).toBe(true);
  });

  test("cmd 转调同目录的 ps1", () => {
    const { cmd, ps1Name } = generate(allSteps);
    expect(cmd).toContain(`%~dp0${ps1Name}`);
  });

  test("版本号注入到安装指令", () => {
    const { ps1 } = generate(allSteps);
    expect(ps1).toContain("bun@1.4.5");
    expect(ps1).toContain("@anthropic-ai/claude-code@2.1.331");
    expect(ps1).toContain("v26.13.1");
    expect(ps1).toContain("CC-Switch-v4.0.40-Windows.msi");
  });

  test("未勾选的步骤不出现", () => {
    const { ps1 } = generate({ ...allSteps, selected: ["ccSwitch"] });
    expect(ps1).toContain("CC-Switch");
    expect(ps1).not.toContain("[1] 检查 Node.js");
    expect(ps1).not.toContain("@anthropic-ai/claude-code@");
  });

  test("步骤编号连续，不按原始序号留空", () => {
    const { ps1 } = generate({ ...allSteps, selected: ["ccSwitch"] });
    expect(ps1).toContain("[1] 检查 CC-Switch");
    expect(ps1).not.toContain("[4] 检查 CC-Switch");
  });

  test("部分勾选时编号从头开始", () => {
    const { ps1 } = generate({ ...allSteps, selected: ["node", "ccSwitch"] });
    expect(ps1).toContain("[1] 检查 Node.js");
    expect(ps1).toContain("[2] 检查 CC-Switch");
  });

  test("相同输入产生相同输出", () => {
    expect(generate(allSteps).ps1).toBe(generate(allSteps).ps1);
  });

  test("运行时库被完整包含", () => {
    const { ps1 } = generate(allSteps);
    for (const fn of ["function Get-File", "function Install-Msi", "function Install-Tool", "function Sync-Path", "function Get-Latency", "function Get-InstalledVersion"]) {
      expect(ps1).toContain(fn);
    }
  });

  test("中文未变成转义序列", () => {
    const { ps1 } = generate(allSteps);
    expect(ps1).not.toMatch(/\\u[0-9A-Fa-f]{4}/);
    expect(ps1).toContain("已安装");
  });

  test("页脚自检覆盖四个命令", () => {
    const { ps1 } = generate(allSteps);
    expect(ps1).toContain("foreach ($c in 'node', 'npm', 'bun', 'claude')");
  });
});
