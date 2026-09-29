export function buildPageTree(pages, parentId = null) {
  return pages
    .filter((page) => page.parentId === parentId && !page.isDeleted)
    .sort((a, b) => a.title.localeCompare(b.title))
    .map((page) => ({
      ...page,
      children: buildPageTree(pages, page.id),
    }));
}

export function getBreadcrumbs(pages, pageId) {
  const breadcrumbs = [];
  const byId = new Map(pages.map((page) => [page.id, page]));
  let cursor = byId.get(pageId);
  while (cursor) {
    breadcrumbs.unshift(cursor);
    cursor = cursor.parentId ? byId.get(cursor.parentId) : null;
  }
  return breadcrumbs;
}

export function isDescendant(pages, candidateParentId, pageId) {
  if (!candidateParentId) {
    return false;
  }
  const byId = new Map(pages.map((page) => [page.id, page]));
  let cursor = byId.get(candidateParentId);
  while (cursor) {
    if (cursor.id === pageId) {
      return true;
    }
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

