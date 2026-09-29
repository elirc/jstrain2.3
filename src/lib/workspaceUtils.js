// Bounded navigation tolerates a damaged local draft without hanging the UI.
export function buildPageTree(pages, parentId = null) {
  const children = new Map();
  for (const page of pages) {
    if (page.isDeleted) continue;
    const list = children.get(page.parentId) ?? [];
    list.push(page);
    children.set(page.parentId, list);
  }
  const visit = (parent, ancestors) => {
    if (ancestors.size >= 64) return [];
    return (children.get(parent) ?? [])
      .filter((page) => !ancestors.has(page.id))
      .sort((a, b) => a.title.localeCompare(b.title))
      .map((page) => ({
        ...page,
        children: visit(page.id, new Set([...ancestors, page.id])),
      }));
  };
  return visit(parentId, new Set(parentId ? [parentId] : []));
}
export function getBreadcrumbs(pages, pageId) {
  const byId = new Map(pages.map((page) => [page.id, page])),
    seen = new Set(),
    result = [];
  let cursor = byId.get(pageId);
  while (cursor && !seen.has(cursor.id) && seen.size < 64) {
    seen.add(cursor.id);
    result.unshift(cursor);
    cursor = cursor.parentId ? byId.get(cursor.parentId) : null;
  }
  return result;
}
export function isDescendant(pages, candidateParentId, pageId) {
  const byId = new Map(pages.map((page) => [page.id, page])),
    seen = new Set();
  let cursor = byId.get(candidateParentId);
  while (cursor) {
    if (cursor.id === pageId) return true;
    if (seen.has(cursor.id) || seen.size >= 64) return true;
    seen.add(cursor.id);
    cursor = cursor.parentId ? byId.get(cursor.parentId) : null;
  }
  return false;
}

export function mapBlockTypeLabel(type) {
  switch (type) {
    case "heading1":
      return "H1";
    case "heading2":
      return "H2";
    case "heading3":
      return "H3";
    case "bullet":
      return "•";
    case "number":
      return "1.";
    case "callout":
      return "!";
    case "code":
      return "</>";
    case "divider":
      return "―";
    case "database":
      return "DB";
    default:
      return "P";
  }
}

export function flattenPageTree(nodes) {
  const list = [];
  const walk = (nodeList) => {
    nodeList.forEach((node) => {
      list.push(node);
      if (node.children?.length) {
        walk(node.children);
      }
    });
  };
  walk(nodes);
  return list;
}

export function createDiffText(previousBlocks, nextBlocks) {
  const previous = previousBlocks.map((item) => item.text || "").join("\n");
  const next = nextBlocks.map((item) => item.text || "").join("\n");
  if (previous === next) {
    return "No text changes.";
  }
  const previousWords = previous.split(/\s+/).filter(Boolean).length;
  const nextWords = next.split(/\s+/).filter(Boolean).length;
  const delta = nextWords - previousWords;
  return `Words ${previousWords} -> ${nextWords} (${delta >= 0 ? "+" : ""}${delta})`;
}
