import { nanoid } from "nanoid";
import { getWorkspaceState, listPageVersions, savePageVersion, upsertWorkspaceState } from "@/lib/sqlite";

export const runtime = "nodejs";

function json(data, init) {
  return Response.json(data, init);
}

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const workspaceId = searchParams.get("workspaceId") || "workspace-default";
  const state = getWorkspaceState(workspaceId);

  return json({
    workspaceId,
    state,
  });
}

export async function PUT(request) {
  try {
    const payload = await request.json();
    const workspaceId = payload.workspaceId || "workspace-default";
    const state = payload.state;
    const actorId = payload.actorId || "user-owner";
    const action = payload.action || "workspace_updated";

    if (!state || !Array.isArray(state.pages) || typeof state.blocksByPage !== "object") {
      return json({ error: "Invalid workspace state payload." }, { status: 400 });
    }

    const nextState = {
      ...state,
      meta: {
        ...(state.meta || {}),
        workspaceId,
        updatedAt: new Date().toISOString(),
      },
      activities: [
        ...(state.activities || []),
        {
          id: nanoid(),
          pageId: payload.pageId || null,
          actorId,
          action,
          createdAt: new Date().toISOString(),
        },
      ].slice(-200),
    };

    upsertWorkspaceState(workspaceId, nextState);

    return json({ ok: true, updatedAt: nextState.meta.updatedAt });
  } catch {
    return json({ error: "Failed to persist workspace state." }, { status: 500 });
  }
}

export async function POST(request) {
  try {
    const payload = await request.json();
    if (!payload.pageId) {
      return json({ error: "pageId is required." }, { status: 400 });
    }
    const versionId = savePageVersion({
      pageId: payload.pageId,
      workspaceId: payload.workspaceId || "workspace-default",
      authorId: payload.actorId || "user-owner",
    });
    if (!versionId) {
      return json({ error: "Page not found." }, { status: 404 });
    }
    const versions = listPageVersions(payload.pageId);
    return json({ ok: true, versionId, versions });
  } catch {
    return json({ error: "Failed to save page version." }, { status: 500 });
  }
}

