# Test behavior at the boundary that owns it

Run `npm test` from the project root. [scripts/test.mjs](../scripts/test.mjs) explicitly discovers the project's test files and invokes Node's test runner. It avoids depending on a shell expanding a wildcard differently on Windows and Unix. Run `npm run lint` and `npm run build` as separate checks: passing unit tests does not prove that the Next application compiles, and a production build does not prove that a stale write is rejected.

## What `npm test` actually runs

`npm test` is not a wildcard handed to a shell. `scripts/test.mjs` reads the `test/` directory itself and passes the explicit file list to Node's test runner, which is why the same command behaves identically on Windows and Unix. The whole script:

```js
import { readdirSync } from "node:fs";
import { spawnSync } from "node:child_process";
const files = readdirSync(new URL("../test/", import.meta.url))
  .filter((name) => name.endsWith(".test.mjs"))
  .sort()
  .map((name) => "test/" + name);
const result = spawnSync(process.execPath, ["--test", ...files], {
  stdio: "inherit",
  cwd: new URL("../", import.meta.url),
});
if (result.error) console.error(result.error.message);
process.exitCode = result.status ?? 1;
```

## Reading the browser harness

`scripts/browser-check.py` drives the built app with Playwright. Its helpers now carry docstrings naming the invariant each defends: `accepted()` reads the committed workspace (what every check compares against), `passed(label)` records one named invariant, `command(args)` runs a project script, `login(page)` pastes the owner token. Read `accepted()` first: a browser check that only looks at the screen proves nothing about what was stored; the harness always re-reads `/api/workspace` after an action. The remaining workflow functions are formatted one statement per line in the fix pass where they were one-liners; the rest are left as delivered.

## Pure document tests

[mutations.test.mjs](../test/mutations.test.mjs) exercises page hierarchy, block operations, templates and comments. [database.test.mjs](../test/database.test.mjs) checks typed values, filters, sorts, grouping and property cleanup. [schema.test.mjs](../test/schema.test.mjs) tests malformed documents and relationships. These tests run without a browser or server, which makes a failure easy to localize.

For example, a property-deletion test should create references in rows, templates and views, then verify that all relevant references disappear and the original input remains unchanged. It should also test the last-property guard. Checking only `properties.length` would miss the most important defect: dangling references elsewhere in the document.

## Repository tests with real SQLite

[repository.test.mjs](../test/repository.test.mjs) uses temporary database files. It exercises actual SQL, two independent connections, revision checks, explicit setup/adoption and snapshot operations. A rollback test injects a database failure after the workspace bytes are updated but before the revision counter is accepted. Both values must remain at the previous accepted state after the failure.

This is stronger evidence than replacing the database with an object whose `save()` always succeeds. A mock can verify that a method was called; it cannot prove SQLite transaction behavior. Conversely, a real database test does not need a browser to prove a transaction invariant. Use the smallest real boundary capable of revealing the defect.

## Request-boundary tests

[api.test.mjs](../test/api.test.mjs) sends WHATWG `Request` objects through the API handler with a real repository. These tests cover authorization, host/origin checks, request limits, revision headers, exports, search and history. They are handler integration tests. They are not a substitute for starting Next and making actual HTTP requests; the framework's URL handling, route exports and runtime configuration also need verification.

[client.test.mjs](../test/client.test.mjs) controls fetch responses to verify headers, status preservation, timeouts and uncertain writes. In these tests, fake network behavior is intentional because the point is to create an outcome such as a lost response deterministically. Be precise in your report: “simulated lost response” is different from “tested every network failure.”

## Session timing tests

[session.test.mjs](../test/session.test.mjs) uses deferred promises to control the order of typing and responses. The important assertions distinguish accepted state, draft state, dirty status and review requirements. Add a test by describing an event sequence first: load R1, edit A, start save, edit B, resolve save of A, inspect B. Then implement that sequence without arbitrary sleeps.

When a test fails, first decide whether the behavior is wrong or the expectation is wrong. A test expecting a particular error phrase can fail even when the intended guard works. Verify the substantive invariant before changing code. Do not weaken assertions merely to get green output; explain why a revised expectation still tests the contract.

## Browser debugging procedure

Use a disposable database and open DevTools. In Network, filter for `/api/workspace`. Rename a page and inspect the request method, content type, bearer header and quoted `If-Match`. Avoid copying the token into notes. Inspect the response revision and save status. Reload, sign in and confirm persistence. For a conflict, open a second signed-in tab and make competing edits before saving both.

Use Application/IndexedDB to inspect the draft store. A failed save should retain a draft with its accepted base. A successful accepted save can clear that draft only when no newer edits remain. The legacy database has a different name and is available for explicit export; do not manually replay its old whole-state queue against the new API.

## Useful debugging questions

- Is this value local draft content, accepted server content, or transient UI state?
- Did the request fail before submission, receive a rejection, or end with an unknown outcome?
- Does the revision in the request match the state used to construct the candidate?
- Did a later edit arrive before an earlier response?
- Which invariant is violated, and which layer should enforce it?

Keep a small evidence log: command, environment, result and limitation. Include screenshots only when they demonstrate layout or user-visible state. A screenshot of a green test command is less useful than the actual test output and a clear explanation of what those tests cover.
