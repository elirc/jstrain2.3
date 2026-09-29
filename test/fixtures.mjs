export const TIME = "2026-09-12T00:00:00.000Z";
export function page(id, parentId = null) {
  return {
    id,
    title: "Page " + id,
    parentId,
    icon: "",
    coverImage: "",
    isDeleted: false,
    isFavorite: false,
    shared: "private",
    roles: {},
    createdAt: TIME,
    updatedAt: TIME,
  };
}
export function block(id, type = "paragraph") {
  return { id, type, text: "A practice paragraph", props: {}, children: [] };
}
export function state() {
  return {
    meta: {
      workspaceId: "workspace-default",
      workspaceName: "Test workspace",
      ownerId: "owner",
      createdAt: TIME,
      updatedAt: TIME,
    },
    users: [{ id: "owner", name: "Learner", color: "#112233" }],
    pages: [page("root"), page("child", "root")],
    blocksByPage: {
      root: [block("block-root")],
      child: [block("block-child")],
    },
    commentThreads: [],
    comments: [],
    templates: [],
    favorites: [],
    recent: [],
    sharedLinks: [],
    versions: [],
    activities: [],
    trash: [],
  };
}
export function database() {
  return {
    title: "Tasks",
    properties: [
      { id: "name", name: "Name", type: "text" },
      { id: "score", name: "Score", type: "number" },
      { id: "done", name: "Done", type: "checkbox" },
      { id: "due", name: "Due", type: "date" },
      {
        id: "status",
        name: "Status",
        type: "select",
        options: ["Todo", "Done"],
      },
    ],
    rows: [
      {
        id: "row-one",
        values: {
          name: "Practice",
          score: 0,
          done: false,
          due: "2026-09-12",
          status: "Todo",
        },
      },
    ],
    views: [
      {
        id: "table",
        name: "Table",
        type: "table",
        filters: [],
        sorts: [],
        visibleProperties: ["name", "score", "done", "due", "status"],
      },
    ],
    activeViewId: "table",
    templates: [],
  };
}
