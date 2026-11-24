import { describe, expect, test } from "bun:test";
import { claudeEnv, deselect, resolveSelection } from "./claude-env";
import type { StepId } from "./types";

describe("resolveSelection", () => {
  test("补全依赖闭包", () => {
    expect(resolveSelection(claudeEnv, ["claudeCode"])).toEqual([
      "node",
      "bun",
      "claudeCode",
    ]);
  });

  test("独立步骤不引入依赖", () => {
    expect(resolveSelection(claudeEnv, ["ccSwitch"])).toEqual(["ccSwitch"]);
  });

  test("全选时保持配方顺序", () => {
    expect(resolveSelection(claudeEnv, ["ccSwitch", "node", "claudeCode"])).toEqual([
      "node",
      "bun",
      "claudeCode",
      "ccSwitch",
    ]);
  });

  test("依赖图无环", () => {
    const visiting = new Set<StepId>();
    const done = new Set<StepId>();
    const byId = new Map(claudeEnv.steps.map((s) => [s.id, s]));
    const walk = (id: StepId): void => {
      if (done.has(id)) return;
      expect(visiting.has(id)).toBe(false);
      visiting.add(id);
      byId.get(id)?.requires.forEach(walk);
      visiting.delete(id);
      done.add(id);
    };
    claudeEnv.steps.forEach((s) => walk(s.id));
  });
});

describe("deselect", () => {
  test("取消被依赖项时级联取消", () => {
    expect(deselect(claudeEnv, ["node", "bun", "claudeCode"], "node")).toEqual([]);
  });

  test("取消独立项不影响其他", () => {
    expect(deselect(claudeEnv, ["node", "bun", "ccSwitch"], "ccSwitch")).toEqual([
      "node",
      "bun",
    ]);
  });

  test("取消叶子节点只移除自己", () => {
    expect(deselect(claudeEnv, ["node", "bun", "claudeCode"], "claudeCode")).toEqual([
      "node",
      "bun",
    ]);
  });
});
