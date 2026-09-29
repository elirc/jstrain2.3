import { nanoid } from "nanoid";
import { markdownToBlocks } from "@/lib/markdown";
import { getWorkspaceState, upsertWorkspaceState } from "@/lib/sqlite";

export const runtime = "nodejs";

export async function POST(request) {
  try {
    const payload = await request.json();
    const workspaceId = payload.workspaceId || "workspace-default";
    const title = (payload.title || "Imported Markdown").trim();
    const markdown = payload.markdown || "";
    const parentId = payload.parentId || null;
    if (!markdown.trim()) {
      return Response.json({ error: "markdown is required." }, { status: 400 });
    }

    const state = getWorkspaceState(workspaceId);
    const pageId = nanoid();
    const now = new Date().toISOString();

    state.pages.push({
      id: pageId,
      title,
      parentId,
      icon: "📥",
      coverImage: "",
      isDeleted: false,
      isFavorite: false,
      shared: "workspace",
      roles: {},
      createdAt: now,
      updatedAt: now,
    });
    state.blocksByPage[pageId] = markdownToBlocks(markdown);
    state.recent = [pageId, ...(state.recent || []).filter((id) => id !== pageId)].slice(0, 30);
    state.meta.updatedAt = now;

    upsertWorkspaceState(workspaceId, state);
    return Response.json({ ok: true, pageId });
  } catch {
    return Response.json({ error: "Failed to import markdown." }, { status: 500 });
  }
}

