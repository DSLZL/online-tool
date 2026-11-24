export type StepId = "node" | "bun" | "claudeCode" | "ccSwitch";

export interface Step {
  id: StepId;
  name: string;
  requires: StepId[];
}

export interface Recipe {
  id: string;
  name: string;
  steps: Step[];
}

export interface Versions {
  node: string;
  bun: string;
  claudeCode: string;
  ccSwitch: string;
  ccSwitchUrl: string;
}

export interface GenerateOptions {
  versions: Versions;
  selected: StepId[];
  generatedAt: string;
}
