> Historical guide for the original implementation. Start with the [current CRUD learning course](../../../../astraupskill/README.md) for the delivered code, setup and verified behavior. The [unaltered original guide](../../../../docs/original/_learning/guides/src/lib/markdown.js.guide.md.txt) is preserved for comparison. Claims below about autosave, sharing or collaboration describe the earlier design and should not be used as current guarantees.

﻿# Guide: src/lib/markdown.js

## Purpose
`markdown.js` converts between Markdown text and internal block objects. This powers import/export features and teaches format translation between human-readable text and structured app data.

## Line-by-line walkthrough
### Import
- `nanoid` is used to assign unique IDs to generated blocks.

### `stripPrefix(text, prefixRegex)`
- Removes markdown markers (like `# ` or `- `) and trims whitespace.

Why:
- Keeps parser branches simple and reusable.

### `markdownToBlocks(markdown)`
1. Splits incoming markdown by line endings.
2. Initializes `blocks` output array.
3. Loops line-by-line:
   - empty line -> paragraph block with empty text
   - `###`, `##`, `#` -> heading blocks
   - `-`/`*` -> bullet block
   - numbered list regex -> number block
   - `---` -> divider block
   - `>` -> callout block
   - fallback -> paragraph block
4. Returns block array.

Control flow:
- Ordered `if` checks matter. `###` must be checked before `##`, and `##` before `#`.

Data shape:
- Every block has `{ id, type, text, props, children }` for consistency with editor/store.

### `renderBlock(block, index)`
- Switch statement converts each block type into markdown string.
- Uses `index` to generate numbered list labels.
- Database block is exported as descriptive placeholder text.

Why:
- Database content has no complete markdown table exporter yet.

### `blocksToMarkdown(page, blocks)`
- Generates top-level title from page.
- Renders each block and joins with blank lines.
- Trims final string.

Side effects:
- None. Pure conversion functions.

TypeScript notes:
- No types. In TS, `block.type` would be a union of known block strings.

## Concepts taught by this file
- Parser/serializer pair
- Regex matching
- Ordered conditional parsing
- Data normalization

## Common mistakes
- Regex ordering bugs (catching `#` too early).
- Forgetting to preserve block IDs.
- Losing unsupported block data during conversion.

## Mini exercises
1. Add support for markdown code fences with language markers.
2. Export checkbox blocks as `- [ ]` / `- [x]` format.
3. Decide how to serialize database rows to markdown tables.

## Further reading
- `recursive descent parsing basics`
- `markdown syntax reference`
- `regex in JavaScript`
- `serializer design`
