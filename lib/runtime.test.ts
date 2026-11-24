import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { RUNTIME_PS1 } from "./runtime.generated";

test("runtime 常量与 lib/runtime.ps1 逐字节一致", () => {
  const source = readFileSync("lib/runtime.ps1", "utf8").replace(/\r\n/g, "\n");
  expect(RUNTIME_PS1).toBe(source);
});
