# Practice ladder for CRUD application development

These are exercises for you to implement after understanding the delivered application. They are not claims that the features already exist. Work in a separate branch or copy and use a disposable database. Read [the review guide](06-SOLUTIONS-AND-REVIEW.md) only after writing your own design and acceptance criteria.

## Exercise 1: a clear empty workspace state

Trash every active page in a disposable workspace. The sidebar still allows creating a page, but the document area can explain the next action more clearly. Add an empty state with a New top-level page button and a View trash button. Do not duplicate page-creation logic in the component. Use the existing store action with an explicit null parent.

Acceptance criteria: the message appears only when no active page can be selected; creating a page persists after reload; restoring a trashed page removes the empty state; keyboard focus reaches both actions; narrow screens do not overflow. Explain why this primarily needs a browser check rather than a large new unit-test suite mirroring markup.

## Exercise 2: record duplication

Add Duplicate record beside Delete record. Copy values into a new record with a fresh ID. Preserve numbers as numbers and booleans as booleans. Do not reuse the legacy row `pageId` as a new resource identity. Respect the row limit and route the candidate through the existing validation and save lifecycle.

Acceptance criteria: editing the duplicate does not mutate the original; zero, false, blank dates and selected options survive; duplication at the limit gives a clear error; the duplicate persists after an accepted save and reload. Write a pure test for identity and detached nested data, then one browser check for the actual control.

## Exercise 3: a reusable row template editor

Existing row templates can be used when present in the document. Add controls to capture a record's values as a named template, rename a template and delete one. Reuse current property definitions rather than copying their schema into the template. Decide how a property deletion affects saved templates by studying the existing cleanup helper.

Acceptance criteria: names are bounded and nonempty; templates have unique IDs; captured values are detached; deleting a property cleans template values; deleting a template does not delete records already created from it. Include both success and invalid-input tests at the mutation/schema boundary.

## Exercise 4: typed filter validation

The current view model supports comparison operators, but the form can guide users more precisely. Make a checkbox filter offer true/false, a date filter offer a date input, and a number filter reject nonfinite numeric text. Decide which operators make sense for each type. Implement the same rule at the server validation boundary so hand-written requests cannot bypass it.

Acceptance criteria: a numeric comparison is numeric; blank is distinct from zero; an invalid date cannot be accepted; old valid saved filters still work or have an explicit migration story. This is a contract change, so discuss compatibility before changing the schema. Avoid silently deleting existing filters merely because the new UI does not understand them.

## Exercise 5: durable receipts for an import

Today, an uncertain import requires review because a lost response may follow a committed write. Design an operation ID sent with an import, stored in the same transaction as the new page, and associated with the accepted outcome. A repeated identical operation should return the previous outcome. Reusing an ID with a different payload should fail.

Acceptance criteria: one logical import creates exactly one page even when the response is lost and the client retries; concurrent duplicate requests cannot race past the receipt check; a receipt is scoped to the workspace and operation type; stored payload fingerprints do not expose content in logs; retention policy is explicit. This exercise requires repository and actual request tests, not only a UI button.

## Exercise 6: move one resource into relational tables

Choose comments or database records. Design normalized SQLite tables with primary keys, foreign keys and useful indexes. Keep the migration reversible through a private backup and preserve IDs. Define how the existing JSON export and snapshot behavior continue to work. Do not migrate every resource at once; prove one vertical slice first.

Acceptance criteria: reads and writes preserve behavior; orphan references are rejected; migration failure leaves the original data intact; repeated migration is safe or explicitly refused; export still includes the intended content. Explain the tradeoff between a convenient whole-document model and queryable relational resources.

For each exercise, submit a short change description, an annotated request trace, the meaningful test evidence and one limitation. A reviewer should understand the trigger and resulting behavior without reading your learning notebook. Keep changes bounded enough that you can explain every altered invariant.

## Exercise 7: add TypeScript where it pays

Starting state: `src/lib/workspaceSchema.mjs` validates the document at runtime; `src/lib/databaseModel.mjs` computes views. Nothing is typed. `astraupskill/typescript/workspaceSchema.ts` is a starter: a `WorkspaceDocument` type and a discriminated union for `Property`.

1. Run `npx tsc -p tsconfig.json` (the added `tsconfig.json` only includes the starter) and make it pass.
2. Convert `databaseModel.mjs` to `databaseModel.ts` importing those types; keep the `.mjs` runtime module exporting the same functions (compile with `tsc` or keep both while you learn).
3. Decide, for each of the runtime validators in `workspaceSchema.mjs`, whether TypeScript makes it redundant. Answer: none of the ones that check *network JSON* (`object`, `fields`, `text`, `id`, `validateJson`) become redundant, because types are erased at runtime; the ones that would go away are internal calls between already-validated modules.

Acceptance: `tsc` passes, the 97 runtime tests still pass unchanged, and your notes list which validators stayed and why.
