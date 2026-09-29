import { getPageVersion, getWorkspaceState, listPageVersions, upsertWorkspaceState } from "@/lib/sqlite";

export const runtime = "nodejs";

function json(data, init) {
  return Response.json(data, init);
}

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const pageId = searchParams.get("pageId");
  const versionId = searchParams.get("versionId");
  if (versionId) {
    const version = getPageVersion(versionId);
    if (!version) {
      return json({ error: "Version not found." }, { status: 404 });
    }
    return json({ version });
  }
  if (!pageId) {
    return json({ error: "pageId is required when versionId is missing." }, { status: 400 });
  }
  const versions = listPageVersions(pageId);
  return json({ versions });
}

export async function PATCH(request) {
  try {
    const payload = await request.json();
    const workspaceId = payload.workspaceId || "workspace-default";
    const versionId = payload.versionId;
    if (!versionId) {
      return json({ error: "versionId is required." }, { status: 400 });
    }
    const version = getPageVersion(versionId);
    if (!version) {
      return json({ error: "Version not found." }, { status: 404 });
    }

    const state = getWorkspaceState(workspaceId);
    const pageIndex = state.pages.findIndex((item) => item.id === version.pageId);
    if (pageIndex === -1) {
      return json({ error: "Page not found for version." }, { status: 404 });
    }

    state.pages[pageIndex] = {
      ...state.pages[pageIndex],
      ...version.snapshot.page,
      updatedAt: new Date().toISOString(),
    };
    state.blocksByPage[version.pageId] = version.snapshot.blocks || [];
    state.meta.updatedAt = new Date().toISOString();

    upsertWorkspaceState(workspaceId, state);
    return json({ ok: true, pageId: version.pageId });
  } catch {
    return json({ error: "Failed to restore version." }, { status: 500 });
  }
}
