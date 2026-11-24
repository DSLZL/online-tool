import { describe, expect, test } from "bun:test";
import { generatePureCmd } from "./generate-cmd";
import type { StepId, Versions } from "./recipes/types";

const versions: Versions = {
  node: "v26.13.1",
  bun: "1.4.5",
  claudeCode: "2.1.331",
  ccSwitch: "4.0.40",
  ccSwitchUrl: "https://example.invalid/cc.msi",
};

const all: StepId[] = ["node", "bun", "claudeCode", "ccSwitch"];

describe("generatePureCmd", () => {
  test("纯 ASCII", () => {
    const cmd = generatePureCmd(versions, all, "2026-11-24T00:00:00.000Z");
    expect(/^[\x00-\x7F]*$/.test(cmd)).toBe(true);
  });

  test("不引用任何 .ps1 文件", () => {
    const cmd = generatePureCmd(versions, all, "2026-11-24T00:00:00.000Z");
    expect(cmd).not.toContain("install-claude-env.ps1");
    expect(cmd).not.toContain("-File");
  });

  test("用 curl 续传", () => {
    const cmd = generatePureCmd(versions, all, "2026-11-24T00:00:00.000Z");
    expect(cmd).toContain("--continue-at -");
    expect(cmd).toContain("curl");
  });

  test("版本号注入", () => {
    const cmd = generatePureCmd(versions, all, "2026-11-24T00:00:00.000Z");
    expect(cmd).toContain('set "NODE_VER=v26.13.1"');
    expect(cmd).toContain("bun@1.4.5");
    expect(cmd).toContain("@anthropic-ai/claude-code@2.1.331");
    expect(cmd).toContain('set "CC_VERSION=4.0.40"');
  });

  test("未勾选的步骤不出现", () => {
    const cmd = generatePureCmd(versions, ["ccSwitch"], "2026-11-24T00:00:00.000Z");
    expect(cmd).toContain("CC-Switch");
    expect(cmd).not.toContain("node-v26.13.1-x64.msi");
    expect(cmd).not.toContain("bun@1.4.5");
  });

  test("步骤编号按勾选顺序连续", () => {
    const cmd = generatePureCmd(versions, ["ccSwitch"], "2026-11-24T00:00:00.000Z");
    expect(cmd).toContain("echo [1] CC-Switch ...");
    expect(cmd).not.toContain("echo [4] CC-Switch");
  });

  test("CRLF 行尾", () => {
    const cmd = generatePureCmd(versions, all, "2026-11-24T00:00:00.000Z");
    expect(cmd).toContain("\r\n");
    expect(cmd.split("\n").every((l) => l === "" || l.endsWith("\r"))).toBe(true);
  });

  test("含生成标记与时间", () => {
    const cmd = generatePureCmd(versions, all, "2026-11-24T00:00:00.000Z");
    expect(cmd).toContain("rem generated-by: online-tool installer-generator");
    expect(cmd).toContain("2026-11-24T00:00:00.000Z");
  });

  test("标签唯一且都被引用", () => {
    const cmd = generatePureCmd(versions, all, "2026-11-24T00:00:00.000Z");
    for (const label of [":download", ":latency", ":installed", ":installmsi", ":addpath", ":refreshpath", ":fail", ":main"]) {
      expect(cmd).toContain(`\r\n${label}\r`);
    }
  });

  // Inside a double-quoted -Command there is no caret escaping: ^| reaches PowerShell as two
  // characters and is a syntax error, swallowed by catch into the 99999 sentinel. That makes
  // every mirror lose the latency race, so this must never come back.
  test("延迟探测不把 ^| 传进 PowerShell", () => {
    const cmd = generatePureCmd(versions, all, "2026-11-24T00:00:00.000Z");
    expect(cmd).not.toContain("^| Out-Null");
    expect(cmd).toContain("[void](Invoke-WebRequest");
  });

  // `if errorlevel 3011` cannot see 3010/3011 reliably, and 3010 means success (reboot pending).
  test("MSI 退出码按字符串比较，3010 算成功", () => {
    const cmd = generatePureCmd(versions, all, "2026-11-24T00:00:00.000Z");
    expect(cmd).not.toContain("errorlevel 3011");
    expect(cmd).toContain('if "%IM_RC%"=="3010" exit /b 0');
  });

  // String GEQ ranks "4.0.9" above "4.0.40", which would skip a real upgrade.
  test("CC-Switch 版本用 [version] 比较", () => {
    const cmd = generatePureCmd(versions, all, "2026-11-24T00:00:00.000Z");
    expect(cmd).not.toContain("GEQ");
    expect(cmd).toContain("[version]'%CC_VER%'");
  });
});
