// Reads lib/runtime.ps1 and emits lib/runtime.generated.ts as a template literal.
// Must NOT use String.raw: bun's transpiler rewrites non-ASCII chars (中文) to \uXXXX
// escapes, and String.raw would keep those escapes literally, corrupting the output.
// A normal template literal interprets them back, so escape only \ ` ${
import { readFileSync, writeFileSync } from "node:fs";

const src = readFileSync("lib/runtime.ps1", "utf8").replace(/\r\n/g, "\n");

const escaped = src
  .replace(/\\/g, "\\\\")
  .replace(/`/g, "\\`")
  .replace(/\$\{/g, "\\${");

writeFileSync(
  "lib/runtime.generated.ts",
  `// Generated from lib/runtime.ps1 by scripts/gen-runtime.ts. Do not edit.\nexport const RUNTIME_PS1 = \`${escaped}\`;\n`,
);
console.log("wrote lib/runtime.generated.ts");
