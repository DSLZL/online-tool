import type { Recipe, StepId } from "./types";

export const claudeEnv: Recipe = {
  id: "claude-env",
  name: "Claude Code 环境",
  steps: [
    { id: "node", name: "Node.js", requires: [] },
    { id: "bun", name: "Bun", requires: ["node"] },
    { id: "claudeCode", name: "Claude Code", requires: ["bun"] },
    { id: "ccSwitch", name: "CC-Switch", requires: [] },
  ],
};

export function resolveSelection(recipe: Recipe, selected: StepId[]): StepId[] {
  const byId = new Map(recipe.steps.map((s) => [s.id, s]));
  const picked = new Set<StepId>();
  const add = (id: StepId) => {
    if (picked.has(id)) return;
    picked.add(id);
    byId.get(id)?.requires.forEach(add);
  };
  selected.forEach(add);
  return recipe.steps.filter((s) => picked.has(s.id)).map((s) => s.id);
}

export function deselect(recipe: Recipe, selected: StepId[], id: StepId): StepId[] {
  const doomed = new Set<StepId>([id]);
  let changed = true;
  while (changed) {
    changed = false;
    for (const s of recipe.steps) {
      if (!doomed.has(s.id) && s.requires.some((r) => doomed.has(r))) {
        doomed.add(s.id);
        changed = true;
      }
    }
  }
  return selected.filter((s) => !doomed.has(s));
}
