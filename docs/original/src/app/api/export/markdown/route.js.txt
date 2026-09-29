import { blocksToMarkdown } from "@/lib/markdown";
import { getWorkspaceState } from "@/lib/sqlite";

export const runtime = "nodejs";

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const workspaceId = searchParams.get("workspaceId") || "workspace-default";
  const pageId = searchParams.get("pageId");

  const state = getWorkspaceState(workspaceId);
  const page = state.pages.find((item) => item.id === pageId) || state.pages[0];
  if (!page) {
    return Response.json({ error: "No page available." }, { status: 404 });
  }
  const blocks = state.blocksByPage[page.id] || [];
  const markdown = blocksToMarkdown(page, blocks);
  return new Response(markdown, {
    headers: {
      "Content-Type": "text/markdown; charset=utf-8",
      "Content-Disposition": `attachment; filename="${(page.title || "page").replace(/\s+/g, "-").toLowerCase()}.md"`,
    },
  });
}

