import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import ts from "typescript";
// Compile tests with the project's TypeScript dependency. This runner works on
// Windows restricted accounts where tsx's os.userInfo() may not be available.
const root = process.cwd(),
  out = path.join(root, ".test-build");
for (const folder of ["tests", "shared", "src/lib"]) {
  for (const entry of fs.readdirSync(folder, { withFileTypes: true })) {
    if (!entry.isFile() || !entry.name.endsWith(".ts")) continue;
    if (
      folder === "src/lib" &&
      !["metrics.ts", "types.ts"].includes(entry.name)
    )
      continue;
    const file = path.join(folder, entry.name),
      dest = path.join(out, file.replace(/\.ts$/, ".js"));
    let code = ts.transpileModule(fs.readFileSync(file, "utf8"), {
      compilerOptions: {
        target: ts.ScriptTarget.ES2022,
        module: ts.ModuleKind.ESNext,
        verbatimModuleSyntax: false,
      },
    }).outputText;
    code = code.replace(
      /(from\s*["'])(\.\.?\/[^"']+)(["'])/g,
      (_, a, b, c) => a + (path.extname(b) ? b : b + ".js") + c,
    );
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.writeFileSync(dest, code);
  }
}
fs.mkdirSync(out, { recursive: true });
fs.writeFileSync(path.join(out, "package.json"), '{"type":"module"}');
fs.cpSync("supabase", path.join(out, "supabase"), { recursive: true });
const tests = fs
  .readdirSync("tests")
  .filter((f) => f.endsWith(".test.ts"))
  .map((f) => path.join(out, "tests", f.replace(/\.ts$/, ".js")));
const result = spawnSync(process.execPath, ["--test", ...tests], {
  stdio: "inherit",
});
process.exit(result.status ?? 1);
