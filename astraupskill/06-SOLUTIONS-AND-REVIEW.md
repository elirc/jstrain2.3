# Design outlines and review questions

Use this guide after attempting the [practice exercises](05-PRACTICE.md). These are solution outlines, not completed new features. A strong solution explains the invariant, the layer enforcing it, the failure behavior and the evidence. There can be several reasonable implementations; compare their consequences rather than matching a particular line of code.

## Empty workspace state

Derive the empty condition from active, nondeleted pages. Do not introduce a second boolean that can disagree with the document. The create action should explicitly use `parentId: null`, and the restore action should continue through the existing mutation path. A browser check should create the condition by trashing pages, exercise the actions and verify the result after reload.

A common mistake is to show the empty state while the first request is still loading. Loading, signed out, failed initialization and an accepted empty workspace are different states. Keep the existing sign-in and load boundaries and add the message only inside the accepted editor. Explain why this avoids misleading a learner into creating duplicate content when data has simply not arrived yet.

## Duplicate record

A reasonable pure helper finds the source record, checks the row limit, clones its values and gives the copy a new ID. It returns a new database candidate. The store still validates it and the save controller still supplies the current revision. Do not call the repository directly from the component or silently mutate the source row's nested `values` object.

Your test should include a number equal to zero, a false checkbox, a select value and a blank date. Change one value in the duplicate and assert the original remains unchanged. Add a missing-record test and a limit test. In review, ask whether the new record inherits anything it should not, such as a legacy page identifier or an old revision. Identity belongs to the new resource; copied values are content.

## Template editing

Treat a row template as a named set of values keyed by existing property IDs. It is not a copy of the whole database. Capturing a template should detach values from the source record. Removing the template must leave existing records untouched. Property deletion already cleans template values in [databaseModel.mjs](../src/lib/databaseModel.mjs); reuse that invariant rather than inventing a conflicting policy.

If a property's type changes in a future feature, decide whether incompatible template values are rejected, converted with explicit rules, or require user review. Avoid arbitrary coercion such as converting every value to a string, because it would weaken the typed-record contract. Write down the compatibility policy before implementing the control.

## Typed filters

Start with a table mapping property types to allowed operators and value types. Number comparisons should receive finite numbers; date comparisons should receive valid calendar dates; booleans should use equality or an explicit truth choice. Keep empty-value behavior explicit. `false` and `0` must not match the empty operator.

Apply the rule in schema validation as well as form construction. For existing saved filters, choose a documented transition: retain accepted legacy forms with a clear normalization step, or reject incompatible data with instructions for explicit repair. Silently stripping a user's filters during load can change the apparent dataset and conceal information. The migration story is part of correctness, even in a small app.

## Durable operation receipts

Worked partial. The receipt table and the lookup order inside the transaction:

```sql
CREATE TABLE operation_receipts (
  workspace_id   TEXT NOT NULL,
  operation_type TEXT NOT NULL,      -- e.g. 'import'
  operation_id   TEXT NOT NULL,      -- client-generated idempotency key
  fingerprint    TEXT NOT NULL,      -- sha256 of the canonical request body
  response       TEXT NOT NULL,      -- the JSON the client received the first time
  created_at     TEXT NOT NULL,
  PRIMARY KEY (workspace_id, operation_type, operation_id)
);
```

Inside `tx(...)`: 1) `SELECT fingerprint, response FROM operation_receipts WHERE ...` for the key; 2) if found and the fingerprint matches, return the stored response (replay); if found and it differs, fail with 409 (same key, different body); 3) otherwise apply the import, `INSERT` the receipt with the response, commit. The lookup and the insert must be in the same transaction, or two concurrent retries both miss the receipt. What is left for you: the fingerprint function, the 409 body, and the test that sends the same key twice with different bodies.

## Relational extraction

Worked partial for one resource (records):

```sql
CREATE TABLE records (
  id           TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  database_id  TEXT NOT NULL,
  revision     INTEGER NOT NULL,
  updated_at   TEXT NOT NULL
);
CREATE TABLE record_cells (
  record_id    TEXT NOT NULL REFERENCES records(id) ON DELETE CASCADE,
  property_id  TEXT NOT NULL,
  value_json   TEXT NOT NULL,
  PRIMARY KEY (record_id, property_id)
);
```

Sequence: 1) add the tables, keep the JSON document as the source of truth; 2) dual-write on every accepted mutation (document and rows in the same transaction); 3) backfill existing documents with one script; 4) switch reads for record lists to the rows behind a flag; 5) stop writing the document fields you moved. What is left for you: the flag, the backfill script, and the test that proves a read from rows equals a read from the document for the same workspace.

## Review rubric

Ask whether the change has one clear purpose, preserves identity, validates every entry point, maintains related data, handles stale or uncertain outcomes, and provides useful feedback. Then ask whether the tests would detect the original defect and whether the report names what was not tested. If you cannot explain a changed line or a remaining tradeoff, reduce the scope and investigate it before calling the work complete.
