# Verification and practical limits

This guide separates executable checks from design explanations and future exercises. The current implementation has a Node test suite, a Next production build, lint checks and a browser verification harness using a disposable SQLite database. The final delivery evidence is recorded alongside this guide. Read the exact results before interpreting a feature description as proof that every environment or edge case has been tested.

## Automated application checks

Run `npm test` from the project root. The suite currently contains 97 tests: 16 schema checks, 9 merge checks, 10 document-mutation checks, 15 save-session checks, 17 real SQLite repository checks, 12 request-handler integration checks, 5 fetch-client checks, 6 database-record checks, 5 Markdown/navigation checks and 2 Zustand adapter checks. The accepted recorded Node run passes all 97. Repeated runs are not added to that count.

Repository tests use real temporary SQLite files and independent connections. They cover stale revisions, externally changed JSON bytes, validation failures, transaction rollback, lock contention, explicit setup/adoption, history pagination and snapshot restoration. The handler tests use real repositories with WHATWG Request objects; they exercise authorization, request limits, parameter validation, search and exports. They do not by themselves prove framework routing or real browser behavior.

Session tests control response timing with deferred promises. They verify that newer typing survives an older save response, failed local storage has a separate warning, uncertain writes do not automatically replay, saved drafts require review, and edits arriving during a server operation are retained for reconciliation. Client tests deliberately simulate fetch failures and timeouts. These are controlled scenarios, not exhaustive network certification.

## Build, lint and dependency evidence

`npm run lint` checks the source, scripts and tests with the Next ESLint configuration. `npm run build` compiles the actual Next application. The dependency lock records Next and eslint-config-next 16.3.3 with React 19.2.3. The update removed unused Prisma, date, icon, UUID and external collaboration packages; the existing imports determine which dependencies remain.

Original dependency installation and the updated installation both completed. Fresh CLI setup is exercised with a newly created database, and repeated setup must refuse to change its bytes. This is a fresh-database test, not a claim that the whole application was installed on every operating system. The tested environment is Windows, Node 22.16 and Python Playwright with Chromium.

## Browser evidence boundary

The browser harness starts the production server on a temporary loopback port and passes an explicit temporary database path. It never opens the original project's user database. It drives sign-in, accepted edits, typed fields, record views, history, two-tab conflicts, local draft recovery, import/export and narrow-screen layout. One failure scenario deliberately aborts an outgoing browser write; the two-tab conflict uses the real server and real SQLite revision checks.

The final run passed all 25 enumerated browser/HTTP/setup workflow groups. Together with 97 Node tests, that is 122 recorded checks. The production build and lint also passed. The reviewed screenshots and exact results are attached below. A failing harness run is retained as diagnostic evidence rather than counted as a passing workflow. Follow the final result file for the exact checks and known limits.

## Limits to explain in a review

This is a local single-owner workspace. Visibility labels do not provide public sharing or separate user permissions. BroadcastChannel presence is limited to tabs at the same origin. The application does not implement durable operation receipts, account recovery, an encrypted local draft store or a general JSON restore interface. JSON export is content evidence; operational recovery requires a private database backup and deliberate handling of SQLite sidecar files.

The operational workspace is a bounded JSON document. Limits include 500 pages, 5,000 total blocks, 1,000 rows per database and bounded snapshots, comments and activity. Standard JSON duplicate-key parsing behavior remains. Date-only values receive calendar validation; timestamp validation is less strict. Legacy adoption refuses incompatible documents rather than silently repairing them. Snapshot restore validates the candidate and preserves current page placement and labels, but it is not an unlimited database backup system.

Markdown supports a defined block subset and exports table values; it does not round-trip all database types, comments, views or history. Chromium checks do not establish compatibility with every browser, screen reader or operating system. Original text snapshots are preserved for study, but their earlier feature claims are not current verification evidence.

## Final recorded evidence

- [Machine-readable results, checks and limits](verification-results.json)
- [Accepted workspace at desktop width](images/workspace-desktop.png)
- [Workspace at 390-pixel width](images/workspace-mobile.png)

The final browser run exercised real two-tab stale writes, explicit conflict choices, independent draft keys, unreviewed-draft retention across sign-out, offline recovery using actual IndexedDB, comment creation/editing/replies/resolution and related-data deletion. Early harness runs exposed selector assumptions; a later run exposed a real stale save-status bug when a view was changed back to the already accepted setting. That behavior was fixed and added to the Node regressions before the final run. The original user database was never used as a fixture.

To rerun the optional browser harness, first build the app. Use Python with Playwright 1.59.0 and its Chromium installation, or set `ASTRA_BROWSER_EXECUTABLE` to a compatible installed Chromium executable. Run `python scripts/browser-check.py review-01`. Choose a new run name each time: the harness refuses to overwrite evidence. It starts and stops its own loopback Next server, creates a new database under `.browser-checks`, and retains logs/screenshots for inspection. The shipped harness differs from the recorded working harness only in project-local paths and Chromium discovery; those adaptations are syntax-checked.
