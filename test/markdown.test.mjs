import { test } from "node:test";
import assert from "node:assert/strict";
import { markdownToBlocks, blocksToMarkdown } from "../src/lib/markdown.js";
import {
  getBreadcrumbs,
  buildPageTree,
  isDescendant,
} from "../src/lib/workspaceUtils.js";
test("fenced code preserves indentation and markdown-like content", () => {
  const blocks = markdownToBlocks("```js\n  # literal\n- not a list\n```");
  assert.equal(blocks.length, 1);
  assert.equal(blocks[0].type, "code");
  assert.equal(blocks[0].text, "  # literal\n- not a list");
});
test("longer export fences preserve embedded triple backticks", () => {
  const text = "before\n```\nafter";
  const md = blocksToMarkdown({ title: "Code" }, [{ type: "code", text }]);
  assert.match(md, /````/);
  assert.equal(
    markdownToBlocks(md).find((block) => block.type === "code").text,
    text,
  );
});
test("unclosed fences retain remaining lines as code", () => {
  assert.equal(markdownToBlocks("~~~\n  text")[0].text, "  text");
});
test("database markdown includes escaped values, zero and false", () => {
  const md = blocksToMarkdown({ title: "Records" }, [
    {
      type: "database",
      props: {
        title: "Data",
        properties: [
          { id: "a", name: "Name" },
          { id: "b", name: "Count" },
          { id: "c", name: "Done" },
        ],
        rows: [{ values: { a: "a|b\nc", b: 0, c: false } }],
      },
    },
  ]);
  assert.match(md, /a\\\|b<br>c \| 0 \| false/);
});
test("damaged cyclic navigation stays bounded and descendant check fails closed", () => {
  const pages = [
    { id: "a", parentId: "b", title: "A" },
    { id: "b", parentId: "a", title: "B" },
  ];
  assert.equal(getBreadcrumbs(pages, "a").length, 2);
  assert.deepEqual(buildPageTree(pages), []);
  assert.equal(isDescendant(pages, "a", "unrelated"), true);
});
