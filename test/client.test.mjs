import { test } from "node:test";
import assert from "node:assert/strict";
import { createWorkspaceClient } from "../src/lib/workspaceClient.mjs";
test("client sends owner auth and quoted revision without cookies", async () => {
  let observed;
  const api = createWorkspaceClient("token", {
    fetcher: async (path, options) => {
      observed = { path, ...options };
      return Response.json({ ok: true });
    },
  });
  assert.deepEqual(
    await api("/api/workspace", {
      method: "PUT",
      body: { state: {} },
      revision: "a".repeat(64),
    }),
    { ok: true },
  );
  assert.equal(observed.headers.Authorization, "Bearer token");
  assert.equal(observed.headers["If-Match"], '"' + "a".repeat(64) + '"');
  assert.equal(observed.credentials, "omit");
  assert.equal(observed.cache, "no-store");
});
test("client preserves HTTP status so stale writes enter review", async () => {
  const api = createWorkspaceClient("x", {
    fetcher: async () => Response.json({ error: "Stale" }, { status: 409 }),
  });
  await assert.rejects(
    api("/api/workspace", { method: "PUT", body: {} }),
    (error) => error.status === 409 && error.message === "Stale",
  );
});
test("network failure after a mutation is explicitly uncertain", async () => {
  const api = createWorkspaceClient("x", {
    fetcher: async () => {
      throw new Error("Disconnected");
    },
  });
  await assert.rejects(
    api("/api/workspace", { method: "POST", body: {} }),
    (error) => error.uncertain === true,
  );
});
test("read timeout aborts request without claiming an uncertain write", async () => {
  const api = createWorkspaceClient("x", {
    timeoutMs: 5,
    fetcher: (_, options) =>
      new Promise((_, reject) =>
        options.signal.addEventListener("abort", () =>
          reject(new DOMException("Aborted", "AbortError")),
        ),
      ),
  });
  await assert.rejects(
    api("/api/workspace"),
    (error) => error.uncertain === false && /timed out/.test(error.message),
  );
});
test("non-JSON failure responses have a bounded generic message", async () => {
  const api = createWorkspaceClient("x", {
    fetcher: async () => new Response("server internals", { status: 500 }),
  });
  await assert.rejects(
    api("/api/workspace"),
    (error) => error.message === "Request failed (500)",
  );
});
