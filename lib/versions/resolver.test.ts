import { describe, expect, test } from "bun:test";
import { resolveVersions, sourcesFor } from "./resolver";
import type { Fetchers, Items, VersionItem } from "./types";

const snapshot: Items = {
  node: { version: "v24.0.0" },
  bun: { version: "1.0.0" },
  claudeCode: { version: "1.0.0" },
  ccSwitch: { version: "1.0.0", url: "https://snap/cc.msi" },
};

const live: Items = {
  node: { version: "v26.13.1" },
  bun: { version: "1.4.5" },
  claudeCode: { version: "2.1.331" },
  ccSwitch: { version: "4.0.40", url: "https://live/cc.msi" },
};

function fetchers(where: (base: string) => "ok" | "fail"): Fetchers {
  const mk = (item: VersionItem) => async (base: string) =>
    where(base) === "ok" ? item : Promise.reject(new Error("boom"));
  return {
    node: mk(live.node),
    bun: mk(live.bun),
    claudeCode: mk(live.claudeCode),
    ccSwitch: mk(live.ccSwitch),
  };
}

describe("sourcesFor", () => {
  test("auto 先直连后镜像", () => {
    expect(sourcesFor("auto")).toEqual(["direct", "mirror"]);
  });
  test("单通道只有一个来源", () => {
    expect(sourcesFor("direct")).toEqual(["direct"]);
    expect(sourcesFor("mirror")).toEqual(["mirror"]);
  });
});

describe("resolveVersions", () => {
  test("ccSwitch 的 URL 不会重复拼接主机名", async () => {
    const seen: string[] = [];
    const f = fetchers(() => "ok");
    f.ccSwitch = async (url) => {
      seen.push(url);
      return live.ccSwitch;
    };
    await resolveVersions("auto", f, snapshot);
    expect(seen[0]).toBe("https://api.github.com/repos/farion1231/cc-switch/releases/latest");
  });

  test("镜像通道的 ccSwitch URL 带 gh-proxy 前缀", async () => {
    const seen: string[] = [];
    const f = fetchers(() => "ok");
    f.ccSwitch = async (url) => {
      seen.push(url);
      return live.ccSwitch;
    };
    await resolveVersions("mirror", f, snapshot);
    expect(seen[0]).toBe(
      "https://gh-proxy.com/https://api.github.com/repos/farion1231/cc-switch/releases/latest",
    );
  });

  test("直连成功时使用实时数据", async () => {
    const r = await resolveVersions("auto", fetchers(() => "ok"), snapshot);
    expect(r.source).toBe("direct");
    expect(r.node.version).toBe("v26.13.1");
    expect(r.fromSnapshot).toEqual([]);
  });

  test("直连失败时回退镜像", async () => {
    const f = fetchers((base) => (base.includes("npmjs") || base.includes("nodejs.org") || !base.includes("npmmirror") ? "fail" : "ok"));
    const r = await resolveVersions("auto", f, snapshot);
    expect(r.source).toBe("mirror");
  });

  test("仅直连失败时回退快照而不是空", async () => {
    const r = await resolveVersions("direct", fetchers(() => "fail"), snapshot);
    expect(r.source).toBe("snapshot");
    expect(r.node.version).toBe("v24.0.0");
    expect(r.fromSnapshot).toEqual(["node", "bun", "claudeCode", "ccSwitch"]);
  });

  test("单项失败不影响其余项", async () => {
    const f = fetchers(() => "ok");
    f.ccSwitch = () => Promise.reject(new Error("gh down"));
    const r = await resolveVersions("direct", f, snapshot);
    expect(r.source).toBe("direct");
    expect(r.node.version).toBe("v26.13.1");
    expect(r.ccSwitch.version).toBe("1.0.0");
    expect(r.fromSnapshot).toEqual(["ccSwitch"]);
  });

  test("快照数据不伪装成实时", async () => {
    const r = await resolveVersions("mirror", fetchers(() => "fail"), snapshot);
    expect(r.source).toBe("snapshot");
  });
});
