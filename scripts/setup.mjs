import path from "node:path";
import { randomBytes } from "node:crypto";
import { createDefaultWorkspace } from "../src/lib/defaultWorkspace.js";
import { initializeWorkspace } from "../src/lib/workspaceRepository.mjs";

const args = process.argv.slice(2);
if (args[0] === "--owner" && args.length === 2) args.shift();
try {
  const adopt = args.length === 1 && args[0] === "--adopt";
  if (
    !adopt &&
    (args.length !== 1 || !args[0].trim() || args[0].startsWith("--"))
  )
    throw new Error(
      'Usage: node scripts/setup.mjs "Owner name" OR node scripts/setup.mjs --adopt (after a private backup)',
    );
  const file = path.resolve(
    process.env.WORKSPACE_DB_FILE || ".data/workspace.sqlite",
  );
  const state = createDefaultWorkspace();
  if (!adopt)
    state.users.find((user) => user.id === state.meta.ownerId).name =
      args[0].trim();
  const token = randomBytes(32).toString("hex");
  const result = initializeWorkspace(file, { state, token, adopt });
  console.log(
    `${result.adopted ? "Adopted existing" : "Created new"} workspace: ${file}`,
  );
  console.log(
    `Preserved/imported legacy snapshots: ${result.importedVersions}`,
  );
  console.log(
    "Save this private access token. It is shown once; existing setup cannot be used to reset it.",
  );
  console.log(token);
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
