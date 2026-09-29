import { nanoid } from "nanoid";

function nowIso() {
  return new Date().toISOString();
}

function createStarterDatabaseBlock() {
  return {
    id: nanoid(),
    type: "database",
    text: "",
    props: {
      title: "Tasks",
      properties: [
        { id: "name", name: "Name", type: "text" },
        {
          id: "status",
          name: "Status",
          type: "select",
          options: ["Todo", "Doing", "Done"],
        },
        { id: "due", name: "Due", type: "date" },
        { id: "assignee", name: "Assignee", type: "person" },
      ],
      rows: [
        {
          id: nanoid(),
          pageId: nanoid(),
          values: {
            name: "Kickoff call",
            status: "Todo",
            due: "",
            assignee: "Sarah",
          },
        },
      ],
      views: [
        {
          id: "table",
          type: "table",
          name: "Table",
          filters: [],
          sorts: [],
          visibleProperties: ["name", "status", "due", "assignee"],
        },
        {
          id: "board",
          type: "board",
          name: "Board",
          groupBy: "status",
          filters: [],
          sorts: [],
        },
        { id: "list", type: "list", name: "List", filters: [], sorts: [] },
        {
          id: "calendar",
          type: "calendar",
          name: "Calendar",
          dateProperty: "due",
          filters: [],
          sorts: [],
        },
        {
          id: "gallery",
          type: "gallery",
          name: "Gallery",
          filters: [],
          sorts: [],
        },
      ],
      activeViewId: "table",
      templates: [
        {
          id: nanoid(),
          name: "Bug report",
          values: {
            name: "Investigate bug",
            status: "Todo",
            due: "",
            assignee: "",
          },
        },
      ],
    },
    children: [],
  };
}

export function createDefaultWorkspace() {
  const createdAt = nowIso();
  const pageRoot = nanoid();
  const pageNotes = nanoid();
  const pageMeetings = nanoid();
  const introBlockId = nanoid();
  const calloutBlockId = nanoid();

  return {
    meta: {
      workspaceId: "workspace-default",
      workspaceName: "Team Knowledge Base",
      ownerId: "user-owner",
      updatedAt: createdAt,
      createdAt,
    },
    users: [
      { id: "user-owner", name: "Owner", color: "#1f7a8c" },
      { id: "user-sarah", name: "Sarah", color: "#c0392b" },
      { id: "user-diego", name: "Diego", color: "#2e7d32" },
    ],
    pages: [
      {
        id: pageRoot,
        title: "Workspace Home",
        parentId: null,
        icon: "🏠",
        coverImage: "",
        isDeleted: false,
        isFavorite: true,
        shared: "workspace",
        roles: {},
        createdAt,
        updatedAt: createdAt,
      },
      {
        id: pageNotes,
        title: "Engineering Notes",
        parentId: pageRoot,
        icon: "🧠",
        coverImage: "",
        isDeleted: false,
        isFavorite: false,
        shared: "workspace",
        roles: {},
        createdAt,
        updatedAt: createdAt,
      },
      {
        id: pageMeetings,
        title: "Meeting Notes",
        parentId: pageRoot,
        icon: "📝",
        coverImage: "",
        isDeleted: false,
        isFavorite: false,
        shared: "workspace",
        roles: {},
        createdAt,
        updatedAt: createdAt,
      },
    ],
    blocksByPage: {
      [pageRoot]: [
        {
          id: introBlockId,
          type: "heading1",
          text: "Welcome to your workspace",
          props: {},
          children: [],
        },
        {
          id: calloutBlockId,
          type: "callout",
          text: "Use Cmd/Ctrl+K to quickly jump to pages.",
          props: { tone: "info" },
          children: [],
        },
        createStarterDatabaseBlock(),
      ],
      [pageNotes]: [
        {
          id: nanoid(),
          type: "paragraph",
          text: "Capture architecture decisions here.",
          props: {},
          children: [],
        },
      ],
      [pageMeetings]: [
        {
          id: nanoid(),
          type: "heading2",
          text: "Weekly Sync",
          props: {},
          children: [],
        },
        {
          id: nanoid(),
          type: "bullet",
          text: "Review current sprint progress",
          props: {},
          children: [],
        },
      ],
    },
    commentThreads: [],
    comments: [],
    favorites: [{ id: nanoid(), userId: "user-owner", pageId: pageRoot }],
    recent: [pageRoot],
    templates: [
      {
        id: nanoid(),
        kind: "page",
        name: "Meeting Notes",
        payload: {
          title: "Meeting Notes",
          blocks: [
            { type: "heading2", text: "Agenda", props: {} },
            { type: "bullet", text: "Topic 1", props: {} },
            { type: "heading2", text: "Action Items", props: {} },
          ],
        },
      },
      {
        id: nanoid(),
        kind: "page",
        name: "Project Brief",
        payload: {
          title: "Project Brief",
          blocks: [
            { type: "heading2", text: "Problem", props: {} },
            { type: "paragraph", text: "", props: {} },
            { type: "heading2", text: "Success Metrics", props: {} },
          ],
        },
      },
    ],
    sharedLinks: [],
    versions: [],
    activities: [],
    trash: [],
  };
}
