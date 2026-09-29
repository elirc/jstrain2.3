import { getWorkspaceRepository } from "./sqlite.js";
import { createApiHandler } from "./workspaceApi.mjs";

export async function handleWorkspaceRequest(request) {
  try {
    const repository = getWorkspaceRepository();
    return await createApiHandler(repository, {
      origin: process.env.WORKSPACE_ORIGIN || "http://127.0.0.1:3000",
    })(request);
  } catch (error) {
    return Response.json(
      {
        error: error.status
          ? error.message
          : "Workspace is unavailable; preserve its database and review setup",
      },
      {
        status: error.status || 503,
        headers: {
          "Cache-Control": "no-store",
          "X-Content-Type-Options": "nosniff",
        },
      },
    );
  }
}
