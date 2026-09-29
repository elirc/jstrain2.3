import { randomUUID } from "node:crypto";
import Fuse from "fuse.js";
import { fail, fields, id, text, validateJson } from "./workspaceSchema.mjs";
import { WORKSPACE_ID } from "./workspaceRepository.mjs";
import { markdownToBlocks, blocksToMarkdown } from "./markdown.js";

const BODY_LIMIT = 9 * 1024 * 1024;
function json(value, status = 200, revision) {
  return Response.json(value, {
    status,
    headers: {
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
      "Referrer-Policy": "no-referrer",
      ...(revision ? { ETag: `"${revision}"` } : {}),
    },
  });
}
async function body(request) {
  if (
    !/^application\/json(?:\s*;\s*charset=utf-8)?$/i.test(
      request.headers.get("content-type") || "",
    )
  )
    throw fail("Use application/json for mutation requests", 415);
  if (
    request.headers.has("content-encoding") &&
    request.headers.get("content-encoding") !== "identity"
  )
    throw fail("Compressed request bodies are not supported", 415);
  const declared = request.headers.get("content-length");
  if (
    declared !== null &&
    (!/^\d+$/.test(declared) || Number(declared) > BODY_LIMIT)
  )
    throw fail("Request body exceeds 9 MiB", 413);
  const reader = request.body?.getReader();
  if (!reader) throw fail("A JSON object body is required", 400);
  let total = 0;
  const chunks = [];
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > BODY_LIMIT) {
        await reader.cancel();
        throw fail("Request body exceeds 9 MiB", 413);
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  let value;
  try {
    const bytes = new Uint8Array(total);
    let offset = 0;
    for (const chunk of chunks) {
      bytes.set(chunk, offset);
      offset += chunk.length;
    }
    value = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
  } catch {
    throw fail("Malformed JSON body", 400);
  }
  validateJson(value);
  return value;
}
function revision(request) {
  const raw = request.headers.get("if-match");
  if (!raw || !/^"[a-f0-9]{64}"$/.test(raw))
    throw fail("A quoted accepted revision is required in If-Match", 428);
  return raw.slice(1, -1);
}
function query(url, allowed) {
  for (const key of url.searchParams.keys())
    if (!allowed.includes(key) || url.searchParams.getAll(key).length !== 1)
      throw fail("Unknown or repeated query parameter");
  if (
    url.searchParams.has("workspaceId") &&
    url.searchParams.get("workspaceId") !== WORKSPACE_ID
  )
    throw fail("Workspace not found", 404);
}
function workspace(input, allowed, required = []) {
  fields(input, ["workspaceId", ...allowed], "Request", required);
  if (input.workspaceId !== undefined && input.workspaceId !== WORKSPACE_ID)
    throw fail("Workspace not found", 404);
}
function positive(value, fallback, max) {
  if (value === null) return fallback;
  if (!/^[1-9]\d*$/.test(value) || Number(value) > max)
    throw fail("Invalid pagination");
  return Number(value);
}
function activePage(state, pageId) {
  id(pageId, "page ID");
  const page = state.pages.find(
    (item) => item.id === pageId && !item.isDeleted,
  );
  if (!page) throw fail("Active page not found", 404);
  return page;
}
function escape(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}
function renderBlock(block) {
  const content = escape(block.text);
  if (/^heading[123]$/.test(block.type)) {
    const level = block.type.at(-1);
    return `<h${level}>${content}</h${level}>`;
  }
  if (block.type === "divider") return "<hr>";
  if (block.type === "code") return `<pre><code>${content}</code></pre>`;
  if (block.type === "callout") return `<blockquote>${content}</blockquote>`;
  if (block.type === "bullet" || block.type === "number")
    return `<p>${block.type === "bullet" ? "•" : "1."} ${content}</p>`;
  if (block.type === "database")
    return `<section><h2>${escape(block.props.title)}</h2><table><thead><tr>${block.props.properties.map((prop) => `<th>${escape(prop.name)}</th>`).join("")}</tr></thead><tbody>${block.props.rows.map((row) => `<tr>${block.props.properties.map((prop) => `<td>${escape(row.values[prop.id])}</td>`).join("")}</tr>`).join("")}</tbody></table></section>`;
  return `<p>${content}</p>`;
}
function attachment(content, title, extension, type) {
  const filename = (title || "page").slice(0, 120) + "." + extension;
  const encoded = encodeURIComponent(filename).replace(
    /[!'()*]/g,
    (char) => "%" + char.charCodeAt(0).toString(16).toUpperCase(),
  );
  return new Response(content, {
    headers: {
      "Content-Type": type + "; charset=utf-8",
      "Content-Disposition": `attachment; filename="page.${extension}"; filename*=UTF-8''${encoded}`,
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
      "Referrer-Policy": "no-referrer",
      "Content-Security-Policy":
        "default-src 'none'; style-src 'unsafe-inline'; sandbox",
    },
  });
}
export function createApiHandler(
  repository,
  { origin = "http://127.0.0.1:3000" } = {},
) {
  const expected = new URL(origin);
  if (
    expected.protocol !== "http:" ||
    !["127.0.0.1", "localhost"].includes(expected.hostname) ||
    expected.pathname !== "/" ||
    expected.search ||
    expected.hash ||
    expected.username ||
    expected.password
  )
    throw new Error("WORKSPACE_ORIGIN must be an HTTP loopback origin");
  const port = expected.port ? ":" + expected.port : "";
  const hosts = new Set(["127.0.0.1" + port, "localhost" + port]);
  return async (request) => {
    try {
      const url = new URL(request.url),
        host = request.headers.get("host") || url.host;
      if (!hosts.has(host) || !hosts.has(url.host))
        throw fail("Untrusted request host", 403);
      const caller = request.headers.get("origin");
      if (caller && caller !== `http://${host}`)
        throw fail("Cross-origin request refused", 403);
      if (request.headers.get("sec-fetch-site") === "cross-site")
        throw fail("Cross-site request refused", 403);
      if (!["GET", "PUT", "POST", "PATCH", "DELETE"].includes(request.method))
        throw fail("Method not allowed", 405);
      const authorization = request.headers.get("authorization") || "";
      // Request body is awaited before the synchronous authenticated transaction.
      const input = request.method === "GET" ? null : await body(request);
      repository.authenticate(
        authorization.startsWith("Bearer ") ? authorization.slice(7) : "",
      );
      const snapshot = repository.read();
      if (url.pathname === "/api/workspace") {
        query(url, ["workspaceId"]);
        if (request.method === "GET")
          return json(
            { workspaceId: WORKSPACE_ID, ...snapshot },
            200,
            snapshot.revision,
          );
        if (request.method === "PUT") {
          workspace(input, ["state"], ["state"]);
          const accepted = repository.replace(revision(request), input.state);
          return json({ ok: true, ...accepted }, 200, accepted.revision);
        }
        if (request.method === "POST") {
          workspace(input, ["pageId"], ["pageId"]);
          const captured = repository.capture(revision(request), input.pageId);
          return json({ ok: true, ...captured }, 201, captured.revision);
        }
      }
      if (url.pathname === "/api/workspace/version") {
        query(url, ["pageId", "versionId", "page", "pageSize"]);
        if (request.method === "GET") {
          if (url.searchParams.has("versionId")) {
            if ([...url.searchParams.keys()].some((key) => key !== "versionId"))
              throw fail("Choose one snapshot or a page history");
            const saved = repository.version(url.searchParams.get("versionId"));
            activePage(snapshot.state, saved.pageId);
            return json({ version: saved }, 200, snapshot.revision);
          }
          const pageId = url.searchParams.get("pageId");
          activePage(snapshot.state, pageId);
          return json(
            repository.listVersions(pageId, {
              page: positive(url.searchParams.get("page"), 1, 100000),
              pageSize: positive(url.searchParams.get("pageSize"), 20, 50),
            }),
            200,
            snapshot.revision,
          );
        }
        if (url.search) throw fail("Mutation queries are not allowed");
        workspace(input, ["versionId"], ["versionId"]);
        if (request.method === "PATCH") {
          const accepted = repository.restore(
            revision(request),
            input.versionId,
          );
          return json({ ok: true, ...accepted }, 200, accepted.revision);
        }
        if (request.method === "DELETE") {
          const removed = repository.removeVersion(
            revision(request),
            input.versionId,
          );
          return json(removed, 200, removed.revision);
        }
      }
      if (
        url.pathname === "/api/import/markdown" &&
        request.method === "POST"
      ) {
        query(url, []);
        workspace(
          input,
          ["title", "markdown", "parentId"],
          ["title", "markdown"],
        );
        text(input.title, "Import title", 200, true);
        text(input.markdown, "Markdown", 500000, true, true);
        if (input.parentId !== undefined && input.parentId !== null)
          id(input.parentId, "parent ID");
        const accepted = repository.update(
          revision(request),
          (draft) => {
            const parentId = input.parentId ?? null;
            if (parentId) activePage(draft, parentId);
            const pageId = randomUUID(),
              timestamp = new Date().toISOString();
            draft.pages.push({
              id: pageId,
              title: input.title.trim(),
              parentId,
              icon: "📥",
              coverImage: "",
              isDeleted: false,
              isFavorite: false,
              shared: "private",
              roles: {},
              createdAt: timestamp,
              updatedAt: timestamp,
            });
            draft.blocksByPage[pageId] = markdownToBlocks(input.markdown);
            draft.recent = [pageId, ...draft.recent].slice(0, 40);
            return { pageId };
          },
          { action: "markdown_imported" },
        );
        return json(
          { ok: true, ...accepted, pageId: accepted.result.pageId },
          201,
          accepted.revision,
        );
      }
      if (url.pathname === "/api/search" && request.method === "GET") {
        query(url, ["workspaceId", "q", "page", "pageSize"]);
        const q = url.searchParams.get("q") || "";
        text(q, "Search query", 200);
        const page = positive(url.searchParams.get("page"), 1, 100000),
          pageSize = positive(url.searchParams.get("pageSize"), 20, 50);
        const pages = snapshot.state.pages.filter((page) => !page.isDeleted),
          byId = new Map(pages.map((page) => [page.id, page]));
        const dataset = [
          ...pages.map((page) => ({
            id: "page:" + page.id,
            kind: "page",
            pageId: page.id,
            title: page.title,
            text: page.title,
          })),
          ...Object.entries(snapshot.state.blocksByPage)
            .filter(([pageId]) => byId.has(pageId))
            .flatMap(([pageId, blocks]) =>
              blocks.map((block) => ({
                id: "block:" + block.id,
                kind: "block",
                pageId,
                blockId: block.id,
                title: byId.get(pageId).title,
                text: block.text || block.props.title || "",
              })),
            ),
        ];
        const matches = q.trim()
          ? new Fuse(dataset, { threshold: 0.36, keys: ["title", "text"] })
              .search(q.trim())
              .map((item) => item.item)
          : [];
        return json(
          {
            results: matches.slice((page - 1) * pageSize, page * pageSize),
            total: matches.length,
            page,
            pageSize,
          },
          200,
          snapshot.revision,
        );
      }
      if (url.pathname === "/api/export/json" && request.method === "GET") {
        query(url, []);
        return attachment(
          JSON.stringify(
            {
              schemaVersion: 1,
              exportedAt: new Date().toISOString(),
              state: snapshot.state,
            },
            null,
            2,
          ),
          "workspace",
          "json",
          "application/json",
        );
      }
      if (
        ["/api/export/markdown", "/api/export/html"].includes(url.pathname) &&
        request.method === "GET"
      ) {
        query(url, ["workspaceId", "pageId"]);
        const page = activePage(snapshot.state, url.searchParams.get("pageId")),
          blocks = snapshot.state.blocksByPage[page.id];
        if (url.pathname.endsWith("/markdown"))
          return attachment(
            blocksToMarkdown(page, blocks),
            page.title,
            "md",
            "text/markdown",
          );
        const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escape(page.title)}</title><style>body{max-width:900px;margin:2rem auto;padding:1rem;font-family:system-ui;line-height:1.6;overflow-wrap:anywhere}table{border-collapse:collapse}th,td{border:1px solid #bbb;padding:.5rem}pre{white-space:pre-wrap;background:#eee;padding:1rem}</style></head><body><h1>${escape(page.title)}</h1>${blocks.map(renderBlock).join("\n")}</body></html>`;
        return attachment(html, page.title, "html", "text/html");
      }
      throw fail("Route or method not found", 404);
    } catch (error) {
      return json(
        {
          error: error.status
            ? error.message
            : "Workspace operation failed. Review accepted state before retrying",
        },
        error.status || 500,
      );
    }
  };
}
