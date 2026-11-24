import { generatePureCmd } from "./generate-cmd";
import type { StepId, Versions } from "./recipes/types";

export type OutputKind = "both" | "ps1" | "cmd";

export interface OutputFile {
  name: string;
  content: string;
  /** Only .ps1 carries a BOM; .cmd must stay ASCII with no BOM. */
  bom: boolean;
}

export interface BuildOptions {
  versions: Versions;
  selected: StepId[];
  generatedAt: string;
  kind: OutputKind;
}

export function buildFiles(options: BuildOptions, launcher: { cmd: string; ps1: string }): OutputFile[] {
  const { versions, selected, generatedAt, kind } = options;
  const ps1Name = "install-claude-env.ps1";
  const cmdName = "install-claude-env.cmd";

  const files: OutputFile[] = [];
  if (kind === "ps1" || kind === "both") {
    files.push({ name: ps1Name, content: launcher.ps1, bom: true });
  }
  if (kind === "both") {
    files.push({ name: cmdName, content: launcher.cmd, bom: false });
  }
  if (kind === "cmd") {
    // Standalone: no .ps1 on disk at all, so all logic is inlined.
    files.push({
      name: cmdName,
      content: generatePureCmd(versions, selected, generatedAt),
      bom: false,
    });
  }
  return files;
}

export function zipName(kind: OutputKind): string {
  return kind === "cmd" ? "install-claude-env-cmd-only.zip" : "install-claude-env.zip";
}
