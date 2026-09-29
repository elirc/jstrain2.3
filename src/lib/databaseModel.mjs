import { validateDatabase, fail } from "./workspaceSchema.mjs";
export function cellValue(property, input) {
  if (property.type === "checkbox") return Boolean(input);
  if (property.type === "number") {
    if (input === "") return "";
    const value = Number(input);
    if (!Number.isFinite(value)) throw fail("Enter a finite number");
    return value;
  }
  return String(input ?? "");
}
export function removeProperty(database, propertyId) {
  if (database.properties.length <= 1) throw fail("Keep at least one property");
  if (!database.properties.some((prop) => prop.id === propertyId))
    throw fail("Property not found");
  const next = structuredClone(database);
  next.properties = next.properties.filter((prop) => prop.id !== propertyId);
  for (const row of [...next.rows, ...(next.templates ?? [])])
    delete row.values[propertyId];
  for (const view of next.views) {
    view.filters = (view.filters ?? []).filter(
      (item) => item.field !== propertyId,
    );
    view.sorts = (view.sorts ?? []).filter((item) => item.field !== propertyId);
    if (view.visibleProperties)
      view.visibleProperties = view.visibleProperties.filter(
        (id) => id !== propertyId,
      );
    if (view.groupBy === propertyId) delete view.groupBy;
    if (view.dateProperty === propertyId) delete view.dateProperty;
  }
  validateDatabase(next);
  return next;
}
const blank = (value) => value === undefined || value === null || value === "";
function compare(a, b) {
  if (blank(a)) return blank(b) ? 0 : 1;
  if (blank(b)) return -1;
  if (typeof a === "number" && typeof b === "number") return a - b;
  if (typeof a === "boolean" && typeof b === "boolean")
    return Number(a) - Number(b);
  return String(a).localeCompare(String(b), undefined, {
    numeric: true,
    sensitivity: "base",
  });
}
export function visibleRows(database, view) {
  const rows = database.rows.filter((row) =>
    (view.filters ?? []).every((filter) => {
      const actual = row.values[filter.field],
        expected =
          database.properties.find((prop) => prop.id === filter.field)?.type ===
            "number" && filter.value !== ""
            ? Number(filter.value)
            : filter.value;
      switch (filter.operator) {
        case "empty":
          return blank(actual);
        case "contains":
          return String(actual ?? "")
            .toLowerCase()
            .includes(String(expected ?? "").toLowerCase());
        case "eq":
          return String(actual ?? "") === String(expected ?? "");
        case "ne":
          return String(actual ?? "") !== String(expected ?? "");
        case "gt":
          return !blank(actual) && compare(actual, expected) > 0;
        case "lt":
          return !blank(actual) && compare(actual, expected) < 0;
        default:
          return false;
      }
    }),
  );
  return rows.sort((a, b) => {
    for (const sort of view.sorts ?? []) {
      const x = a.values[sort.field],
        y = b.values[sort.field];
      const difference = compare(x, y);
      if (difference)
        return blank(x) || blank(y)
          ? difference
          : difference * (sort.direction === "desc" ? -1 : 1);
    }
    return 0;
  });
}
export function rowGroups(database, view, rows = visibleRows(database, view)) {
  if (view.type === "calendar") {
    const groups = new Map();
    for (const row of rows) {
      const date = row.values[view.dateProperty] || "No date";
      if (!groups.has(date)) groups.set(date, []);
      groups.get(date).push(row);
    }
    return [...groups].sort(([a], [b]) =>
      a === "No date" ? 1 : b === "No date" ? -1 : a.localeCompare(b),
    );
  }
  const property = database.properties.find(
    (prop) => prop.id === view.groupBy && prop.type === "select",
  );
  if (!property) return [["Unassigned", rows]];
  const groups = new Map(property.options.map((option) => [option, []])),
    unassigned = [];
  for (const row of rows) {
    const value = row.values[property.id];
    if (groups.has(value)) groups.get(value).push(row);
    else unassigned.push(row);
  }
  return [...groups, ["Unassigned (blank)", unassigned]];
}
