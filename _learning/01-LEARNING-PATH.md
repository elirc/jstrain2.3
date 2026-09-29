> Historical guide for the original implementation. Start with the [current CRUD learning course](../astraupskill/README.md) for the delivered code, setup and verified behavior. The [unaltered original guide](../docs/original/_learning/01-LEARNING-PATH.md.txt) is preserved for comparison. Claims below about autosave, sharing or collaboration describe the earlier design and should not be used as current guarantees.

﻿# Learning Path

Use this order. It starts with easiest files and builds toward the most complex one.

## Chapter 0: Project Orientation
Read:
1. `_learning/00-ARCHITECTURE.md`
2. [package.json guide](_learning/guides/package.json.guide.md)

Checkpoint:
- You can explain what the app does end-to-end.
- You understand which libraries are used and why.
- You know where UI, API, and persistence code lives.

## Chapter 1: App Shell Basics
Read:
1. [src/app/layout.js guide](_learning/guides/src/app/layout.js.guide.md)
2. [src/app/page.js guide](_learning/guides/src/app/page.js.guide.md)
3. [src/app/globals.css guide](_learning/guides/src/app/globals.css.guide.md)

Checkpoint:
- You understand Next.js App Router layout/page composition.
- You can trace how global styles shape the UI structure.
- You can point to where fonts, metadata, and root shell are configured.

## Chapter 2: Utility Layer Foundations
Read:
1. [src/lib/workspaceUtils.js guide](_learning/guides/src/lib/workspaceUtils.js.guide.md)
2. [src/lib/markdown.js guide](_learning/guides/src/lib/markdown.js.guide.md)
3. [src/lib/defaultWorkspace.js guide](_learning/guides/src/lib/defaultWorkspace.js.guide.md)

Checkpoint:
- You can explain recursive tree building and breadcrumb generation.
- You can explain markdown parsing/serialization in this project.
- You understand the default domain model shape for pages/blocks/users.

## Chapter 3: Persistence and Offline Data
Read:
1. [src/lib/sqlite.js guide](_learning/guides/src/lib/sqlite.js.guide.md)
2. [src/lib/offlineStore.js guide](_learning/guides/src/lib/offlineStore.js.guide.md)

Checkpoint:
- You can explain how server persistence works from startup to write.
- You can describe why IndexedDB queue/drafts improve reliability.
- You can identify tradeoffs of full-state blob persistence.

## Chapter 4: API Route Layer
Read:
1. [src/app/api/workspace/route.js guide](_learning/guides/src/app/api/workspace/route.js.guide.md)
2. [src/app/api/workspace/version/route.js guide](_learning/guides/src/app/api/workspace/version/route.js.guide.md)
3. [src/app/api/search/route.js guide](_learning/guides/src/app/api/search/route.js.guide.md)
4. [src/app/api/import/markdown/route.js guide](_learning/guides/src/app/api/import/markdown/route.js.guide.md)
5. [src/app/api/export/markdown/route.js guide](_learning/guides/src/app/api/export/markdown/route.js.guide.md)
6. [src/app/api/export/html/route.js guide](_learning/guides/src/app/api/export/html/route.js.guide.md)

Checkpoint:
- You can trace how each endpoint receives input and returns output.
- You can distinguish read/write/version/import/export responsibilities.
- You can point out current validation and missing validation.

## Chapter 5: State Management Core
Read:
1. [src/lib/workspaceStore.js guide](_learning/guides/src/lib/workspaceStore.js.guide.md)

Checkpoint:
- You can explain every major store slice.
- You understand immutable updates for deeply nested data.
- You can add a new action safely without mutating old state.

## Chapter 6: Main UI Orchestration
Read:
1. [src/components/WorkspaceApp.js guide](_learning/guides/src/components/WorkspaceApp.js.guide.md)

Checkpoint:
- You can trace user action -> store update -> API sync.
- You understand why there are many `useEffect` hooks and what each one does.
- You can explain drag/drop, command palette, comments, version restore, and import flow.

## Chapter 7: Engineering Judgment
Read:
1. `_learning/02-GLOSSARY.md`
2. `_learning/03-PATTERNS.md`

Checkpoint:
- You can name patterns this codebase uses and where.
- You can identify anti-patterns and propose safer alternatives.
- You can suggest a next refactor roadmap with tradeoffs.

## Suggested Practice Schedule
- Day 1: Chapters 0-2
- Day 2: Chapters 3-4
- Day 3: Chapter 5
- Day 4: Chapter 6
- Day 5: Chapter 7 + implement one improvement

## Final Intern Challenge
After finishing all chapters, implement these in order:
1. Add a "duplicate page" action in store + UI.
2. Add API input validation for at least one route using a schema library.
3. Replace one `window.prompt` interaction with a real modal component.
4. Add a basic test for `markdownToBlocks`.
