import { validateWorkspace } from "./workspaceSchema.mjs";

const MISSING = Symbol("missing");
const copy = (value) => (value === MISSING ? MISSING : structuredClone(value));
function canonical(value) {
  if (value === MISSING) return "__missing__";
  if (Array.isArray(value)) return "[" + value.map(canonical).join(",") + "]";
  if (value && typeof value === "object")
    return (
      "{" +
      Object.keys(value)
        .sort()
        .map((key) => JSON.stringify(key) + ":" + canonical(value[key]))
        .join(",") +
      "}"
    );
  return JSON.stringify(value);
}
const same = (a, b) => canonical(a) === canonical(b);
const plain = (value) =>
  value !== MISSING &&
  value !== null &&
  typeof value === "object" &&
  !Array.isArray(value);
const escape = (value) =>
  String(value).replaceAll("~", "~0").replaceAll("/", "~1");
const display = (value) =>
  value === MISSING
    ? { present: false }
    : { present: true, value: copy(value) };

// A three-way merge prepares a review candidate. It never writes or grants a
// revision. Every conflict must be explicitly chosen, then the entire candidate
// must satisfy the same relational contract used by persistence.
export function mergeWorkspace(base, local, remote, choices = {}) {
  const conflicts = [];
  function conflict(before, draft, accepted, path) {
    const choice = choices[path];
    if (choice === "local") return copy(draft);
    if (choice === "remote") return copy(accepted);
    conflicts.push({
      path,
      base: display(before),
      local: display(draft),
      remote: display(accepted),
    });
    return copy(accepted);
  }
  function merge(before, draft, accepted, path) {
    if (same(draft, before)) return copy(accepted);
    if (same(accepted, before) || same(draft, accepted)) return copy(draft);
    if (draft === MISSING || accepted === MISSING)
      return conflict(before, draft, accepted, path);
    if (plain(before) && plain(draft) && plain(accepted)) {
      if (
        Object.hasOwn(before, "isDeleted") &&
        ((draft.isDeleted !== before.isDeleted && !same(accepted, before)) ||
          (accepted.isDeleted !== before.isDeleted && !same(draft, before)))
      )
        return conflict(before, draft, accepted, path);
      const result = {};
      for (const key of new Set([
        ...Object.keys(before),
        ...Object.keys(draft),
        ...Object.keys(accepted),
      ])) {
        if (
          key === "updatedAt" &&
          typeof draft[key] === "string" &&
          typeof accepted[key] === "string"
        ) {
          result[key] = draft[key] > accepted[key] ? draft[key] : accepted[key];
          continue;
        }
        const value = merge(
          Object.hasOwn(before, key) ? before[key] : MISSING,
          Object.hasOwn(draft, key) ? draft[key] : MISSING,
          Object.hasOwn(accepted, key) ? accepted[key] : MISSING,
          path + "/" + escape(key),
        );
        if (value !== MISSING) result[key] = value;
      }
      return result;
    }
    const keyed = (array) =>
      Array.isArray(array) &&
      array.every((item) => plain(item) && typeof item.id === "string") &&
      new Set(array.map((item) => item.id)).size === array.length;
    if (keyed(before) && keyed(draft) && keyed(accepted)) {
      const maps = [before, draft, accepted].map(
          (items) => new Map(items.map((item) => [item.id, item])),
        ),
        records = new Map();
      for (const key of new Set([
        ...maps[0].keys(),
        ...maps[1].keys(),
        ...maps[2].keys(),
      ])) {
        const value = merge(
          ...maps.map((map) => (map.has(key) ? map.get(key) : MISSING)),
          path + "/@" + escape(key),
        );
        if (value !== MISSING) records.set(key, value);
      }
      const common = before
        .map((item) => item.id)
        .filter(
          (key) => maps[1].has(key) && maps[2].has(key) && records.has(key),
        );
      const commonSet = new Set(common);
      const localOrder = draft
        .map((item) => item.id)
        .filter((key) => commonSet.has(key));
      const remoteOrder = accepted
        .map((item) => item.id)
        .filter((key) => commonSet.has(key));
      let preferred = accepted.map((item) => item.id),
        secondary = draft.map((item) => item.id);
      if (
        !same(localOrder, common) &&
        !same(remoteOrder, common) &&
        !same(localOrder, remoteOrder)
      ) {
        const chosen = conflict(
          before.map((item) => item.id),
          draft.map((item) => item.id),
          accepted.map((item) => item.id),
          path + "/$order",
        );
        preferred = chosen;
        secondary =
          choices[path + "/$order"] === "local"
            ? accepted.map((item) => item.id)
            : draft.map((item) => item.id);
      } else if (!same(localOrder, common)) {
        preferred = draft.map((item) => item.id);
        secondary = accepted.map((item) => item.id);
      }
      const order = preferred.filter((key) => records.has(key));
      for (let index = 0; index < secondary.length; index++) {
        const key = secondary[index];
        if (!records.has(key) || order.includes(key)) continue;
        let previous = index - 1;
        while (previous >= 0 && !order.includes(secondary[previous]))
          previous--;
        if (previous >= 0)
          order.splice(order.indexOf(secondary[previous]) + 1, 0, key);
        else {
          let next = index + 1;
          while (next < secondary.length && !order.includes(secondary[next]))
            next++;
          if (next < secondary.length)
            order.splice(order.indexOf(secondary[next]), 0, key);
          else order.push(key);
        }
      }
      for (const key of records.keys())
        if (!order.includes(key)) order.push(key);
      return order.map((key) => records.get(key));
    }
    return conflict(before, draft, accepted, path);
  }
  // Server-managed history/identity are never reconciled from a browser draft.
  const localCopy = copy(local),
    baseCopy = copy(base),
    remoteCopy = copy(remote);
  for (const state of [localCopy, baseCopy]) {
    state.activities = copy(remoteCopy.activities);
    state.users = copy(remoteCopy.users);
    state.versions = [];
    for (const key of ["workspaceId", "ownerId", "createdAt", "updatedAt"])
      state.meta[key] = remoteCopy.meta[key];
  }
  const candidate = merge(baseCopy, localCopy, remoteCopy, "");
  candidate.recent = [...new Set([...local.recent, ...remote.recent])]
    .filter((key) =>
      candidate.pages.some((page) => page.id === key && !page.isDeleted),
    )
    .slice(0, 40);
  // Trash is an index of the chosen deletion state, not independent content.
  const deleted = new Set(
    candidate.pages.filter((page) => page.isDeleted).map((page) => page.id),
  );
  const indexed = new Set();
  candidate.trash = candidate.trash.filter((item) => {
    if (!deleted.has(item.pageId) || indexed.has(item.pageId)) return false;
    indexed.add(item.pageId);
    return true;
  });
  // Recents are navigation state and should not force a document conflict.
  const documentConflicts = conflicts.filter((item) => item.path !== "/recent");
  let validationError = null;
  try {
    validateWorkspace(candidate);
  } catch (error) {
    validationError = error.message;
  }
  return {
    state: candidate,
    conflicts: documentConflicts,
    validationError,
    ready: documentConflicts.length === 0 && !validationError,
  };
}
