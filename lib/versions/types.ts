import type { StepId } from "../recipes/types";

export type Source = "direct" | "mirror" | "snapshot";
export type Channel = "auto" | "direct" | "mirror";

export interface VersionItem {
  version: string;
  url?: string;
}

/** One key per installable component — kept in sync with the recipe step ids. */
export type ItemKey = StepId;
export type Items = Record<ItemKey, VersionItem>;

export interface ResolvedVersions extends Items {
  source: Source;
  /** Items that fell back to snapshot while others came from a live source. */
  fromSnapshot: ItemKey[];
  at: string;
}

export interface Fetchers {
  node: (base: string, signal: AbortSignal) => Promise<VersionItem>;
  bun: (base: string, signal: AbortSignal) => Promise<VersionItem>;
  claudeCode: (base: string, signal: AbortSignal) => Promise<VersionItem>;
  ccSwitch: (url: string, signal: AbortSignal) => Promise<VersionItem>;
}
