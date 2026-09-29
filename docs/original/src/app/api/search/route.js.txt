import Fuse from "fuse.js";
import { getWorkspaceState } from "@/lib/sqlite";

export const runtime = "nodejs";

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const query = (searchParams.get("q") || "").trim();
  const workspaceId = searchParams.get("workspaceId") || "workspace-default";

  if (!query) {
    return Response.json({ results: [] });
  }

  const state = getWorkspaceState(workspaceId);
  const pageIndex = state.pages.map((page) => ({
    id: `page:${page.id}`,
    kind: "page",
    pageId: page.id,
    title: page.title,
    text: `${page.icon || ""} ${page.title}`,
  }));

  const blockIndex = Object.entries(state.blocksByPage || {}).flatMap(([pageId, blocks]) =>
    (blocks || []).map((block) => ({
      id: `block:${block.id}`,
      kind: "block",
      pageId,
      blockId: block.id,
      title: state.pages.find((item) => item.id === pageId)?.title || "Untitled",
      text: block.text || block.props?.title || "",
    }))
  );

  const dataset = [...pageIndex, ...blockIndex];
  const fuse = new Fuse(dataset, {
    includeScore: true,
    threshold: 0.36,
    keys: ["title", "text"],
  });
  const results = fuse.search(query).slice(0, 30).map((item) => item.item);
  return Response.json({ results });
}

