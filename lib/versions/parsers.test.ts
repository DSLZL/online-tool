import { describe, expect, test } from "bun:test";
import { pickNodeLts, parseCcSwitchRelease, parseNodeIndex, parseRegistryVersion } from "./parsers";

describe("parseNodeIndex", () => {
  const index = JSON.stringify([
    { version: "v27.0.0", lts: false },
    { version: "v26.13.1", lts: "Krypton" },
    { version: "v25.0.0", lts: "Jod" },
  ]);

  test("挑选 LTS 线的最新版本", () => {
    expect(parseNodeIndex(index).version).toBe("v26.13.1");
  });

  test("lts 是代号字符串而非布尔值", () => {
    const entries = JSON.parse(index);
    expect(pickNodeLts(entries)?.lts).toBe("Krypton");
    expect(entries.find((e: { lts: unknown }) => e.lts === true)).toBeUndefined();
  });

  test("没有 LTS 时报错", () => {
    expect(() => parseNodeIndex(JSON.stringify([{ version: "v27.0.0", lts: false }]))).toThrow();
  });
});

describe("parseRegistryVersion", () => {
  test("读取 version 字段", () => {
    expect(parseRegistryVersion(JSON.stringify({ version: "1.4.5" })).version).toBe("1.4.5");
  });

  test("缺少 version 时报错", () => {
    expect(() => parseRegistryVersion("{}")).toThrow();
  });
});

describe("parseCcSwitchRelease", () => {
  const release = JSON.stringify({
    tag_name: "v4.0.40",
    assets: [
      { name: "CC-Switch-v4.0.40-Linux-arm64.AppImage", browser_download_url: "https://x/lin" },
      { name: "CC-Switch-v4.0.40-Windows-arm64.msi", browser_download_url: "https://x/arm" },
      { name: "CC-Switch-v4.0.40-Windows.msi", browser_download_url: "https://x/x64" },
    ],
  });

  test("选 x64 的 Windows msi 而不是 arm64", () => {
    const item = parseCcSwitchRelease(release);
    expect(item.url).toBe("https://x/x64");
  });

  test("版本去掉 v 前缀", () => {
    expect(parseCcSwitchRelease(release).version).toBe("4.0.40");
  });

  test("没有 Windows msi 时报错", () => {
    expect(() =>
      parseCcSwitchRelease(JSON.stringify({ tag_name: "v1", assets: [{ name: "x.dmg", browser_download_url: "u" }] })),
    ).toThrow();
  });
});
