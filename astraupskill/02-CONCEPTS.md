# Concepts behind reliable CRUD

CRUD means create, read, update and delete, but a useful application must also define identity, relationships, valid values, ownership and failure behavior. This project makes those decisions visible. Use [workspaceSchema.mjs](../src/lib/workspaceSchema.mjs), [workspaceRepository.mjs](../src/lib/workspaceRepository.mjs) and [workspaceSession.mjs](../src/lib/workspaceSession.mjs) as the concrete examples for this guide.

## Identity and relationships

A page title can change; its ID should not. A block belongs to a page, a comment belongs to a thread, and a thread refers to a block. Those relationships are references even though the operational document is stored as JSON. Removing a block while leaving its thread behind produces a dangling reference. A database foreign key would normally help enforce such relationships in normalized tables; this JSON-document design enforces them through full-state validation and mutation rules.

Consider deleting a parent page. Simply setting one flag can hide active children without making their status understandable. The mutation marks the subtree as deleted and maintains trash entries consistently. Restore also considers ancestors. Moving a page below itself or a descendant is rejected because it would create a cycle. Tree traversal includes a bound as a defensive measure, but that bound does not replace validation.

## Draft validity and accepted validity

While typing a replacement title, a user may briefly clear the old title. Rejecting each empty keystroke makes editing awkward. A local draft can therefore contain some incomplete text. The accepted server document has a stricter contract: titles must be nonempty and cover URLs must be valid permitted URLs. The Save action validates before sending, and the server independently validates before committing.

This is not duplicate work without purpose. Client validation gives quick feedback. Server validation protects the boundary from every caller, including old tabs, scripts and malformed requests. Never assume a browser control is your only input path. Open the Network panel and imagine someone sending a hand-written JSON body that contains an unknown property or a comment pointing to a missing block.

## Types and absence

`0`, `false`, `""`, `null` and an absent property are different values. A quantity of zero is not an empty quantity. An unchecked boolean is not missing information. In [databaseModel.mjs](../src/lib/databaseModel.mjs), numeric inputs become finite JavaScript numbers, checkbox inputs become booleans, and blank numbers remain an explicit blank. The schema rejects `NaN`, infinity and invalid date strings.

Try these expressions in a console: `0 || "blank"`, `0 ?? "blank"`, `false || "blank"`, and `false ?? "blank"`. Explain the results before looking them up. Then find every display expression in the record editor and verify it follows the intended absence rule. A small language shortcut can become a data-integrity bug when it crosses a form, JSON serialization and a storage boundary.

Continue with [02b: drafts, revisions and conflict](02b-CONCEPTS-DRAFTS.md).
