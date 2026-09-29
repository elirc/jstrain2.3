import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { randomBytes } from "node:crypto";
import {
  createWorkspaceRepository,
  initializeWorkspace,
} from "../src/lib/workspaceRepository.mjs";
import { createApiHandler } from "../src/lib/workspaceApi.mjs";
import { state, TIME } from "./fixtures.mjs";

function fixture(t) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "jstrain23-api-")),
    file = path.join(directory, "state.sqlite"),
    token = randomBytes(32).toString("hex");
  initializeWorkspace(file, { state: state(), token });
  const repository = createWorkspaceRepository(file);
  const handler = createApiHandler(repository, {
    origin: "http://127.0.0.1:4327",
  });
  t.after(() => {
    repository.close();
    assert.equal(
      path.dirname(path.resolve(directory)),
      path.resolve(os.tmpdir()),
    );
    assert.ok(path.basename(directory).startsWith("jstrain23-api-"));
    for (const name of fs.readdirSync(directory))
      fs.unlinkSync(path.join(directory, name));
    fs.rmdirSync(directory);
  });
  function request(route, { method = "GET", body, headers = {}, raw } = {}) {
    return handler(
      new Request("http://127.0.0.1:4327" + route, {
        method,
        headers: {
          host: "127.0.0.1:4327",
          authorization: "Bearer " + token,
          ...(body !== undefined
            ? {
                "content-type": "application/json",
                "if-match": '"' + repository.read().revision + '"',
              }
            : {}),
          ...headers,
        },
        ...(body !== undefined
          ? { body: JSON.stringify(body) }
          : raw !== undefined
            ? { body: raw }
            : {}),
      }),
    );
  }
  return { repository, token, request, handler };
}

test("read endpoint requires owner authorization and returns an accepted revision", async (t) => {
  const f = fixture(t);
  const denied = await f.request("/api/workspace", {
    headers: { authorization: "" },
  });
  assert.equal(denied.status, 401);
  const response = await f.request("/api/workspace");
  assert.equal(response.status, 200);
  const value = await response.json();
  assert.equal(response.headers.get("etag"), '"' + value.revision + '"');
  assert.equal(response.headers.get("cache-control"), "no-store");
  assert.ok(!JSON.stringify(value).includes(f.token));
});
test("document save enforces required and stale If-Match values", async (t) => {
  const f = fixture(t),
    old = f.repository.read();
  const absent = await f.request("/api/workspace", {
    method: "PUT",
    body: { state: old.state },
    headers: { "if-match": "" },
  });
  assert.equal(absent.status, 428);
  old.state.pages[0].title = "HTTP accepted";
  const good = await f.request("/api/workspace", {
    method: "PUT",
    body: { state: old.state },
  });
  assert.equal(good.status, 200);
  assert.equal((await good.json()).state.pages[0].title, "HTTP accepted");
  const stale = await f.request("/api/workspace", {
    method: "PUT",
    body: { state: old.state },
    headers: { "if-match": '"' + old.revision + '"' },
  });
  assert.equal(stale.status, 409);
});
test("malformed body unknown fields and invalid state leave accepted data unchanged", async (t) => {
  const f = fixture(t),
    old = f.repository.read();
  const malformed = await f.request("/api/workspace", {
    method: "PUT",
    raw: "{broken",
    headers: { "content-type": "application/json" },
  });
  assert.equal(malformed.status, 400);
  const typo = await f.request("/api/workspace", {
    method: "PUT",
    body: { state: old.state, actorId: "outsider" },
  });
  assert.equal(typo.status, 422);
  old.state.pages[1].parentId = "missing";
  const invalid = await f.request("/api/workspace", {
    method: "PUT",
    body: { state: old.state },
  });
  assert.equal(invalid.status, 422);
  assert.equal(f.repository.read().revision, old.revision);
});
test("host origin and cross-site checks reject browser requests outside the local application", async (t) => {
  const f = fixture(t);
  for (const headers of [
    { host: "attacker.example" },
    { origin: "https://attacker.example" },
    { "sec-fetch-site": "cross-site" },
  ])
    assert.equal((await f.request("/api/workspace", { headers })).status, 403);
});
test("wrong media compressed bodies and declared oversize fail before mutation", async (t) => {
  const f = fixture(t),
    old = f.repository.read();
  for (const [headers, status] of [
    [{ "content-type": "text/plain" }, 415],
    [{ "content-encoding": "gzip" }, 415],
    [{ "content-length": String(10 * 1024 * 1024) }, 413],
  ])
    assert.equal(
      (
        await f.request("/api/workspace", {
          method: "PUT",
          body: { state: old.state },
          headers,
        })
      ).status,
      status,
    );
  assert.deepEqual(f.repository.read(), old);
});
test("a streamed body without content length is bounded by actual bytes", async (t) => {
  const f = fixture(t);
  const stream = new ReadableStream({
    start(controller) {
      controller.enqueue(new Uint8Array(5 * 1024 * 1024));
      controller.enqueue(new Uint8Array(5 * 1024 * 1024));
      controller.close();
    },
  });
  const request = new Request("http://127.0.0.1:4327/api/workspace", {
    method: "PUT",
    duplex: "half",
    headers: {
      host: "127.0.0.1:4327",
      "content-type": "application/json",
      authorization: "Bearer " + f.token,
    },
    body: stream,
  });
  assert.equal((await f.handler(request)).status, 413);
});
test("unknown workspace IDs repeated queries and unknown snapshot target never fall back to unrelated data", async (t) => {
  const f = fixture(t);
  assert.equal(
    (await f.request("/api/workspace?workspaceId=other")).status,
    404,
  );
  assert.equal((await f.request("/api/search?q=a&q=b")).status, 422);
  assert.equal(
    (await f.request("/api/export/markdown?pageId=absent")).status,
    404,
  );
  assert.equal((await f.request("/api/export/html")).status, 422);
});
test("Markdown import validates parent and returns the accepted page and workspace state", async (t) => {
  const f = fixture(t);
  const invalid = await f.request("/api/import/markdown", {
    method: "POST",
    body: { title: "Imported", markdown: "# Heading", parentId: "absent" },
  });
  assert.equal(invalid.status, 404);
  const response = await f.request("/api/import/markdown", {
    method: "POST",
    body: {
      title: "Imported",
      markdown: "# Heading\n\nA practice paragraph",
      parentId: "root",
    },
  });
  assert.equal(response.status, 201);
  const value = await response.json();
  assert.equal(
    value.state.pages.find((page) => page.id === value.pageId).parentId,
    "root",
  );
  assert.equal(value.state.blocksByPage[value.pageId][0].type, "heading1");
});
test("search excludes deleted pages and their blocks and supplies stable bounded pagination", async (t) => {
  const f = fixture(t);
  let current = f.repository.read();
  current.state.pages[1].isDeleted = true;
  current.state.trash = [{ id: "trash", pageId: "child", deletedAt: TIME }];
  f.repository.replace(current.revision, current.state);
  const response = await f.request("/api/search?q=Page&pageSize=1");
  assert.equal(response.status, 200);
  const value = await response.json();
  assert.equal(value.results.length, 1);
  assert.ok(value.results.every((item) => item.pageId !== "child"));
  assert.ok(value.total >= 1);
});
test("HTML export escapes content and uses a safe encoded download filename", async (t) => {
  const f = fixture(t),
    current = f.repository.read();
  current.state.pages[0].title = 'Title " <script> &';
  current.state.blocksByPage.root[0].text = "<img src=x onerror=alert(1)>";
  f.repository.replace(current.revision, current.state);
  const response = await f.request("/api/export/html?pageId=root");
  assert.equal(response.status, 200);
  const html = await response.text();
  assert.ok(html.includes("&lt;img"));
  assert.ok(!html.includes("<img"));
  assert.match(
    response.headers.get("content-disposition"),
    /filename\*=UTF-8''/,
  );
  assert.match(response.headers.get("content-security-policy"), /sandbox/);
});
test("full JSON export contains document records without the owner token or authentication table", async (t) => {
  const f = fixture(t),
    response = await f.request("/api/export/json");
  assert.equal(response.status, 200);
  const value = await response.json();
  assert.equal(value.state.pages.length, 2);
  assert.ok(!JSON.stringify(value).includes(f.token));
  assert.ok(!Object.hasOwn(value, "local_owner"));
});
test("snapshot API supports accepted capture inspection restore pagination and explicit deletion", async (t) => {
  const f = fixture(t);
  const captured = await f.request("/api/workspace", {
    method: "POST",
    body: { pageId: "root" },
  });
  assert.equal(captured.status, 201);
  const { versionId } = await captured.json();
  const detail = await f.request(
    "/api/workspace/version?versionId=" + versionId,
  );
  assert.equal(detail.status, 200);
  const listing = await f.request(
    "/api/workspace/version?pageId=root&pageSize=1",
  );
  assert.equal((await listing.json()).total, 1);
  const current = f.repository.read();
  current.state.pages[0].title = "Changed";
  f.repository.replace(current.revision, current.state);
  const restored = await f.request("/api/workspace/version", {
    method: "PATCH",
    body: { versionId },
  });
  assert.equal(restored.status, 200);
  assert.equal((await restored.json()).state.pages[0].title, "Page root");
  const removed = await f.request("/api/workspace/version", {
    method: "DELETE",
    body: { versionId },
  });
  assert.equal(removed.status, 200);
  assert.equal(
    (await f.request("/api/workspace/version?versionId=" + versionId)).status,
    404,
  );
});
