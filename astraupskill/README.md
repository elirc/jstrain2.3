# Knowledge Workspace: from junior to mid-level CRUD development

This course uses the actual jstrain2.3 application: a Next.js workspace with pages, editable blocks, comments, typed database records and SQLite persistence. Start here after reading the project setup instructions. The aim is to explain why a change is correct, trace it across layers, and demonstrate the failure cases with evidence. Completing a feature means more than making a button respond.

The original application is preserved as text under [docs/original](../docs/original/README.md.txt). Those files are historical reference, not a second runnable application. Compare them with the current source when a lesson asks you to find a defect. Keep real notes and private data out of your training database. Use a separate database file for destructive exercises such as deleting snapshots or deliberately corrupting JSON.

## Prerequisites and pacing

**Prerequisites:** comfortable JavaScript (modules, `async`/`await`, `fetch`), one prior CRUD project with an HTTP API, and the idea that a document store validates on write. TypeScript is *not* required to start; exercise 7 adds it.

**Pacing:** map 45 min, concepts (two files) 90 min, worked change 90 min, testing 60 min, practice 4-6 h, solutions 60 min, trace lab 45 min, TypeScript exercise 2-3 h.

## Recommended order

1. [Codebase map](01-CODEBASE-MAP.md): follow one page edit from input to SQLite and back.
2. [Concepts](02-CONCEPTS.md) and [02b: drafts, revisions and conflict](02b-CONCEPTS-DRAFTS.md): understand identity, relationships, validation, transactions, revisions and draft state.
3. [Worked change](03-WORKED-CHANGE.md): study a complete record-property deletion and a safe save lifecycle.
4. [Testing and debugging](04-TESTING-AND-DEBUGGING.md): reproduce failures and choose the right test boundary.
5. [Practice](05-PRACTICE.md): implement progressively harder changes with explicit acceptance criteria.
6. [Solutions and review](06-SOLUTIONS-AND-REVIEW.md): compare your reasoning with design outlines and reviewer questions.
7. [Trace lab](07-TRACE-LAB.md): use a debugger, Network panel and two tabs to inspect real behavior.
8. [Verification](VERIFICATION.md): read what was tested and what remains a limitation.

## Your first working session

Use the documented Node version and install from the lockfile with `npm ci`. Create a new local workspace with `npm run setup -- --owner "Learner"`. The command prints a private owner token once. Start the app with `npm run dev`, open the loopback address, and paste that token into the sign-in form. The browser keeps it in memory for that tab; reloading asks you to sign in again. Do not paste the token into a screenshot, exercise answer, issue or source file.

Create a page named `CRUD practice`. Write a paragraph describing a small feature, such as a quantity field for equipment records. Watch the save status. Type a second sentence, press Save, reload, sign in again, and confirm the text comes from the accepted server state. The reload matters: a value on screen alone proves only that React rendered it, not that a transaction committed it.

Now add a database block. Add a number property named Quantity and a checkbox named Inspected. Enter `0` and leave Inspected unchecked. Export accepted Markdown and JSON. Find the values `0` and `false`. Explain why code such as `value || ""` would hide both, while `value ?? ""` preserves them. This small example connects JavaScript truthiness, HTML form behavior, JSON types and database persistence.

## What to write in your learning notebook

For each exercise, record the trigger, expected outcome, files involved, invariant, failure scenario and proof. For example: “When a property is deleted, every record and row template loses that value, and views lose filters and sorts referencing it. The last property cannot be deleted. A pure test verifies all references; a browser check verifies the control and persistence.” This is much more useful than “I learned CRUD.”

Before coding, write a three-line prediction. Which layer should reject invalid input? What remains unchanged if the operation fails? Which check would fail if your implementation were wrong? After coding, compare the prediction with the actual trace. When a prediction is wrong, update your model rather than only changing the assertion.

## A realistic completion standard

You are ready to move on when you can explain the data flow without reading every line aloud, make a small change without bypassing validation, demonstrate both success and failure, and describe one remaining tradeoff. This application is deliberately a local single-owner system. Its visibility labels are metadata; they do not create public sharing. Cross-tab presence is not internet collaboration. Treat multi-user authorization, durable operation receipts and relational schema extraction as later engineering exercises, not existing capabilities.

Spend several focused sessions here rather than racing through every guide. A useful rhythm is to read one concept, trace one existing behavior, implement one bounded change, then review your own patch as if a teammate wrote it. Keep the original comparison, test output and explanation together so that your portfolio shows reasoning and evidence as well as a finished screen.
