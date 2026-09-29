import { readdirSync } from "node:fs";
import { spawnSync } from "node:child_process";
const files = readdirSync(new URL("../test/", import.meta.url))
  .filter((name) => name.endsWith(".test.mjs"))
  .sort()
  .map((name) => "test/" + name);
const result = spawnSync(process.execPath, ["--test", ...files], {
  stdio: "inherit",
  cwd: new URL("../", import.meta.url),
});
if (result.error) console.error(result.error.message);
process.exitCode = result.status ?? 1;
