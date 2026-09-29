import { getWorkspaceState } from "@/lib/sqlite";

export const runtime = "nodejs";

function escapeHtml(value) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function renderBlock(block) {
  const text = escapeHtml(block.text || "");
  switch (block.type) {
    case "heading1":
      return `<h1>${text}</h1>`;
    case "heading2":
      return `<h2>${text}</h2>`;
    case "heading3":
      return `<h3>${text}</h3>`;
    case "bullet":
      return `<li>${text}</li>`;
    case "number":
      return `<li>${text}</li>`;
    case "callout":
      return `<blockquote>${text}</blockquote>`;
    case "code":
      return `<pre><code>${text}</code></pre>`;
    case "divider":
      return "<hr />";
    case "database":
      return `<section><h3>${escapeHtml(block.props?.title || "Database")}</h3><p>Rows: ${block.props?.rows?.length || 0}</p></section>`;
    default:
      return `<p>${text}</p>`;
  }
}

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
  const html = `
<!DOCTYPE html>
<html>
  <head>
    <meta charset="utf-8" />
    <title>${escapeHtml(page.title)}</title>
    <style>
      body { font-family: Georgia, "Times New Roman", serif; margin: 2rem auto; max-width: 860px; line-height: 1.6; color: #101828; }
      blockquote { border-left: 4px solid #0f766e; padding-left: 12px; color: #155e75; }
      pre { background: #0b1120; color: #dbeafe; padding: 12px; border-radius: 8px; overflow-x: auto; }
      hr { border: none; border-top: 1px solid #cbd5e1; margin: 1.25rem 0; }
    </style>
  </head>
  <body>
    <h1>${escapeHtml(page.title)}</h1>
    ${blocks.map((block) => renderBlock(block)).join("\n")}
  </body>
</html>`;

  return new Response(html, {
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Content-Disposition": `attachment; filename="${(page.title || "page").replace(/\s+/g, "-").toLowerCase()}.html"`,
    },
  });
}

