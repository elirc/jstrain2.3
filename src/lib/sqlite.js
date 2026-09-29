import path from "node:path";
import { createWorkspaceRepository } from "./workspaceRepository.mjs";

const KEY = Symbol.for("jstrain23.workspaceRepository");
export function getWorkspaceRepository() {
  const file = path.resolve(
    /* turbopackIgnore: true */
    process.env.WORKSPACE_DB_FILE || ".data/workspace.sqlite",
  );
  if (globalThis[KEY]) {
    if (globalThis[KEY].file !== file)
      throw new Error("Restart the server before changing WORKSPACE_DB_FILE");
    return globalThis[KEY].repository;
  }
  const repository = createWorkspaceRepository(file);
  globalThis[KEY] = { file, repository };
  return repository;
}
