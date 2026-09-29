import { test } from "node:test";
import assert from "node:assert/strict";
import {
  cellValue,
  removeProperty,
  visibleRows,
  rowGroups,
} from "../src/lib/databaseModel.mjs";
import { blankDatabase } from "../src/lib/workspaceMutations.mjs";
function db() {
  const data = blankDatabase();
  data.properties = [
    { id: "name", name: "Name", type: "text" },
    { id: "qty", name: "Quantity", type: "number" },
    { id: "done", name: "Done", type: "checkbox" },
    {
      id: "status",
      name: "Status",
      type: "select",
      options: ["Todo", "Unassigned"],
    },
    { id: "date", name: "Due", type: "date" },
  ];
  data.rows = [
    {
      id: "a",
      values: { name: "Alpha", qty: 0, done: false, status: "", date: "" },
    },
    {
      id: "b",
      values: {
        name: "Beta",
        qty: 10,
        done: true,
        status: "Todo",
        date: "2026-09-12",
      },
    },
    {
      id: "c",
      values: {
        name: "Gamma",
        qty: 2,
        done: false,
        status: "Unassigned",
        date: "2026-09-12",
      },
    },
  ];
  return data;
}
test("typed input preserves zero, false and a distinct blank number", () => {
  assert.equal(cellValue({ type: "number" }, "0"), 0);
  assert.equal(cellValue({ type: "number" }, ""), "");
  assert.equal(cellValue({ type: "checkbox" }, false), false);
  assert.throws(() => cellValue({ type: "number" }, "Infinity"), /finite/);
});
test("numeric sorting orders 2 before 10 and leaves source records unchanged", () => {
  const data = db(),
    before = structuredClone(data);
  assert.deepEqual(
    visibleRows(data, { sorts: [{ field: "qty", direction: "asc" }] }).map(
      (row) => row.id,
    ),
    ["a", "c", "b"],
  );
  assert.deepEqual(data, before);
});
test("filters compose and empty does not classify zero or false as missing", () => {
  const data = db();
  assert.equal(
    visibleRows(data, { filters: [{ field: "qty", operator: "empty" }] })
      .length,
    0,
  );
  assert.equal(
    visibleRows(data, { filters: [{ field: "done", operator: "empty" }] })
      .length,
    0,
  );
  assert.deepEqual(
    visibleRows(data, {
      filters: [
        { field: "qty", operator: "gt", value: "1" },
        { field: "name", operator: "contains", value: "AM" },
      ],
    }).map((row) => row.id),
    ["c"],
  );
});
test("board includes blank records separately from a real Unassigned option", () => {
  const groups = rowGroups(db(), { type: "board", groupBy: "status" });
  assert.equal(groups.flatMap(([, rows]) => rows).length, 3);
  assert.equal(groups.find(([label]) => label === "Unassigned")[1][0].id, "c");
  assert.equal(groups.at(-1)[1][0].id, "a");
});
test("calendar groups equal dates and keeps undated records visible", () => {
  const groups = rowGroups(db(), { type: "calendar", dateProperty: "date" });
  assert.equal(groups[0][0], "2026-09-12");
  assert.equal(groups[0][1].length, 2);
  assert.equal(groups.at(-1)[0], "No date");
});
test("deleting a property removes row/template values and dependent view settings", () => {
  const data = db();
  data.templates = [
    { id: "t", name: "Template", values: { qty: 4, name: "Example" } },
  ];
  data.views[0] = {
    ...data.views[0],
    filters: [{ field: "qty", operator: "eq", value: 4 }],
    sorts: [{ field: "qty", direction: "desc" }],
    visibleProperties: ["name", "qty"],
  };
  const next = removeProperty(data, "qty");
  assert.equal(Object.hasOwn(next.rows[0].values, "qty"), false);
  assert.equal(Object.hasOwn(next.templates[0].values, "qty"), false);
  assert.deepEqual(next.views[0].filters, []);
  assert.deepEqual(next.views[0].sorts, []);
  assert.deepEqual(next.views[0].visibleProperties, ["name"]);
  assert.equal(data.properties.length, 5);
  assert.throws(() => removeProperty(blankDatabase(), "name"), /at least/);
});
