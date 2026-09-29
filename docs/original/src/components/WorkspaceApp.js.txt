"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Image from "next/image";
import { DndContext, PointerSensor, closestCenter, useSensor, useSensors } from "@dnd-kit/core";
import { SortableContext, arrayMove, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { nanoid } from "nanoid";
import {
  FiChevronDown,
  FiChevronRight,
  FiClock,
  FiCommand,
  FiCopy,
  FiCornerUpLeft,
  FiDownload,
  FiFilePlus,
  FiFolder,
  FiMessageSquare,
  FiSearch,
  FiStar,
  FiTrash2,
  FiUpload,
  FiUsers,
} from "react-icons/fi";
import { saveDraft, readDraft, queueSync, readSyncQueue, removeQueuedSync } from "@/lib/offlineStore";
import { useWorkspaceStore } from "@/lib/workspaceStore";
import { buildPageTree, createDiffText, getBreadcrumbs, mapBlockTypeLabel } from "@/lib/workspaceUtils";

const BLOCK_TYPES = [
  "paragraph",
  "heading1",
  "heading2",
  "heading3",
  "bullet",
  "number",
  "callout",
  "code",
  "divider",
  "database",
];

function SortableBlock({ block, pageId, typing, onUpdate, onAddAfter, onDelete, onType, onComment }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: block.id });
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.45 : 1,
  };

  return (
    <div ref={setNodeRef} style={style} className={`block-row ${isDragging ? "dragging" : ""}`}>
      <button className="drag-handle" {...attributes} {...listeners} aria-label="Drag block">
        ::
      </button>
      <div className="block-type-chip">{mapBlockTypeLabel(block.type)}</div>
      <div className="block-body">
        <div className="block-row-controls">
          <select
            className="block-type-select"
            value={block.type}
            onChange={(event) =>
              onUpdate({
                pageId,
                blockId: block.id,
                patch: {
                  type: event.target.value,
                  props:
                    event.target.value === "database"
                      ? {
                          title: "New Database",
                          properties: [{ id: "name", name: "Name", type: "text" }],
                          rows: [],
                          views: [
                            {
                              id: "table",
                              type: "table",
                              name: "Table",
                              filters: [],
                              sorts: [],
                              visibleProperties: ["name"],
                            },
                          ],
                          activeViewId: "table",
                          templates: [],
                        }
                      : {},
                },
              })
            }
          >
            {BLOCK_TYPES.map((type) => (
              <option key={type} value={type}>
                {type}
              </option>
            ))}
          </select>
          <button className="inline-btn" onClick={() => onAddAfter(block.id)}>
            + block
          </button>
          <button className="inline-btn" onClick={() => onComment(block.id)}>
            <FiMessageSquare />
          </button>
          <button className="inline-btn danger" onClick={() => onDelete(block.id)}>
            <FiTrash2 />
          </button>
        </div>
        {block.type === "divider" ? (
          <hr />
        ) : block.type === "database" ? (
          <DatabaseBlock block={block} pageId={pageId} onUpdate={onUpdate} />
        ) : (
          <textarea
            className={`block-input ${block.type === "code" ? "code" : ""}`}
            value={block.text || ""}
            placeholder={`Write ${block.type}...`}
            onChange={(event) => {
              onUpdate({ pageId, blockId: block.id, patch: { text: event.target.value } });
              onType(block.id);
            }}
          />
        )}
        {typing && <div className="typing-indicator">{typing}</div>}
      </div>
    </div>
  );
}

function DatabaseBlock({ block, pageId, onUpdate }) {
  const data = block.props || {};
  const properties = data.properties || [];
  const rows = data.rows || [];
  const views = data.views || [
    { id: "table", type: "table", name: "Table", visibleProperties: properties.map((item) => item.id) },
  ];
  const activeViewId = data.activeViewId || views[0]?.id;
  const activeView = views.find((item) => item.id === activeViewId) || views[0];
  const title = data.title || "Database";

  const updateDb = (nextProps) => {
    onUpdate({
      pageId,
      blockId: block.id,
      patch: {
        props: nextProps,
      },
    });
  };

  const addRow = () => {
    const row = {
      id: nanoid(),
      pageId: nanoid(),
      values: Object.fromEntries(properties.map((prop) => [prop.id, prop.type === "checkbox" ? false : ""])),
    };
    updateDb({ ...data, rows: [...rows, row] });
  };

  const setCell = (rowId, propertyId, value) => {
    updateDb({
      ...data,
      rows: rows.map((row) => (row.id === rowId ? { ...row, values: { ...row.values, [propertyId]: value } } : row)),
    });
  };

  const addProperty = () => {
    const id = nanoid(6);
    const nextProperties = [...properties, { id, name: `Field ${properties.length + 1}`, type: "text" }];
    const nextRows = rows.map((row) => ({ ...row, values: { ...row.values, [id]: "" } }));
    updateDb({ ...data, properties: nextProperties, rows: nextRows });
  };

  const grouped = properties.find((item) => item.id === activeView?.groupBy);
  const groups = grouped
    ? (grouped.options || []).reduce(
        (acc, option) => ({ ...acc, [option]: rows.filter((row) => row.values[grouped.id] === option) }),
        {}
      )
    : {};

  return (
    <div className="database-block">
      <div className="database-header">
        <input className="db-title" value={title} onChange={(event) => updateDb({ ...data, title: event.target.value })} />
        <div className="database-actions">
          {views.map((view) => (
            <button
              key={view.id}
              className={`view-tab ${view.id === activeViewId ? "active" : ""}`}
              onClick={() => updateDb({ ...data, activeViewId: view.id })}
            >
              {view.name}
            </button>
          ))}
          <button className="inline-btn" onClick={addProperty}>
            + property
          </button>
          <button className="inline-btn" onClick={addRow}>
            + row
          </button>
        </div>
      </div>
      {activeView?.type === "board" ? (
        <div className="db-board">
          {Object.entries(groups).map(([option, groupRows]) => (
            <div key={option} className="board-column">
              <h4>{option}</h4>
              {groupRows.map((row) => (
                <article key={row.id} className="board-card">
                  {properties.map((prop) => (
                    <div key={prop.id}>
                      <strong>{prop.name}:</strong> {String(row.values[prop.id] || "")}
                    </div>
                  ))}
                </article>
              ))}
            </div>
          ))}
        </div>
      ) : activeView?.type === "gallery" ? (
        <div className="db-gallery">
          {rows.map((row) => (
            <article key={row.id} className="gallery-card">
              {properties.map((prop) => (
                <div key={prop.id}>
                  <small>{prop.name}</small>
                  <p>{String(row.values[prop.id] || "")}</p>
                </div>
              ))}
            </article>
          ))}
        </div>
      ) : activeView?.type === "calendar" ? (
        <div className="db-calendar">
          {rows.map((row) => (
            <div key={row.id} className="calendar-row">
              <span>{row.values[activeView.dateProperty || "due"] || "No date"}</span>
              <strong>{String(row.values.name || "Untitled")}</strong>
            </div>
          ))}
        </div>
      ) : (
        <div className="db-table-wrap">
          <table className="db-table">
            <thead>
              <tr>
                {properties.map((prop) => (
                  <th key={prop.id}>{prop.name}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.id}>
                  {properties.map((prop) => (
                    <td key={prop.id}>
                      {prop.type === "select" ? (
                        <select value={row.values[prop.id] || ""} onChange={(event) => setCell(row.id, prop.id, event.target.value)}>
                          <option value="">Select...</option>
                          {(prop.options || []).map((option) => (
                            <option key={option} value={option}>
                              {option}
                            </option>
                          ))}
                        </select>
                      ) : prop.type === "checkbox" ? (
                        <input
                          type="checkbox"
                          checked={Boolean(row.values[prop.id])}
                          onChange={(event) => setCell(row.id, prop.id, event.target.checked)}
                        />
                      ) : (
                        <input value={row.values[prop.id] || ""} onChange={(event) => setCell(row.id, prop.id, event.target.value)} />
                      )}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function PageTree({ nodes, depth = 0, expanded, onToggle, onOpen, activePageId }) {
  return nodes.map((node) => (
    <div key={node.id}>
      <button className={`tree-item ${activePageId === node.id ? "active" : ""}`} style={{ paddingLeft: `${10 + depth * 16}px` }} onClick={() => onOpen(node.id)}>
        {node.children.length > 0 ? (
          <span
            className="twisty"
            onClick={(event) => {
              event.stopPropagation();
              onToggle(node.id);
            }}
          >
            {expanded[node.id] ? <FiChevronDown /> : <FiChevronRight />}
          </span>
        ) : (
          <span className="twisty placeholder" />
        )}
        <span>{node.icon || <FiFolder />}</span>
        <span className="title">{node.title}</span>
      </button>
      {expanded[node.id] && node.children.length > 0 && (
        <PageTree
          nodes={node.children}
          depth={depth + 1}
          expanded={expanded}
          onToggle={onToggle}
          onOpen={onOpen}
          activePageId={activePageId}
        />
      )}
    </div>
  ));
}

function CommandPalette({ open, query, setQuery, results, onClose, onSelect, recentPages }) {
  if (!open) {
    return null;
  }

  return (
    <div className="palette-overlay" onClick={onClose}>
      <div className="palette" onClick={(event) => event.stopPropagation()}>
        <div className="palette-input-wrap">
          <FiSearch />
          <input autoFocus value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search pages, blocks, and docs..." />
        </div>
        <div className="palette-results">
          {(query ? results : recentPages).map((item) => (
            <button key={item.id || item.pageId} className="palette-result" onClick={() => onSelect(item.pageId || item.id)}>
              <small>{item.kind || "recent"}</small>
              <span>{item.title || item.name || "Untitled"}</span>
            </button>
          ))}
          {query && results.length === 0 && <p className="muted">No results.</p>}
        </div>
      </div>
    </div>
  );
}

export default function WorkspaceApp() {
  const store = useWorkspaceStore();
  const {
    workspaceId,
    loading,
    loaded,
    error,
    users,
    pages,
    activePageId,
    blocksByPage,
    commentThreads,
    comments,
    templates,
    favorites,
    recent,
    presence,
    typing,
    expandedPageIds,
    commandPaletteOpen,
    commandPaletteQuery,
    showDeleted,
    versionsByPage,
    pendingSaves,
    lastSavedAt,
  } = store;

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));
  const channelRef = useRef(null);
  const clientIdRef = useRef(nanoid());
  const syncTimerRef = useRef(null);
  const searchTimerRef = useRef(null);
  const [searchResults, setSearchResults] = useState([]);
  const [importOpen, setImportOpen] = useState(false);
  const [importText, setImportText] = useState("");
  const [importTitle, setImportTitle] = useState("Imported Page");
  const [selectedVersion, setSelectedVersion] = useState(null);

  const currentUser = users.find((user) => user.id === store.currentUserId) || {
    id: "user-owner",
    name: "Owner",
    color: "#1f7a8c",
  };
  const activePage = pages.find((page) => page.id === activePageId) || null;
  const blocks = blocksByPage[activePageId] || [];
  const pageTree = useMemo(() => buildPageTree(pages), [pages]);
  const breadcrumbs = useMemo(() => getBreadcrumbs(pages, activePageId), [pages, activePageId]);
  const deletedPages = useMemo(() => pages.filter((page) => page.isDeleted), [pages]);
  const favoritePages = useMemo(
    () =>
      favorites
        .filter((fav) => fav.userId === store.currentUserId)
        .map((fav) => pages.find((page) => page.id === fav.pageId))
        .filter(Boolean),
    [favorites, pages, store.currentUserId]
  );
  const recentPages = useMemo(() => recent.map((id) => pages.find((page) => page.id === id)).filter(Boolean), [recent, pages]);
  const pageThreads = useMemo(() => commentThreads.filter((thread) => thread.pageId === activePageId), [commentThreads, activePageId]);
  const visiblePresence = useMemo(
    () => Object.entries(presence).filter(([key, value]) => key !== clientIdRef.current && value.pageId === activePageId),
    [presence, activePageId]
  );

  const serializableState = useMemo(
    () => ({
      meta: store.meta,
      users,
      pages,
      blocksByPage,
      commentThreads,
      comments,
      templates,
      favorites,
      recent,
      sharedLinks: store.sharedLinks,
      versions: [],
      activities: store.activities,
      trash: store.trash,
    }),
    [
      store.meta,
      users,
      pages,
      blocksByPage,
      commentThreads,
      comments,
      templates,
      favorites,
      recent,
      store.sharedLinks,
      store.activities,
      store.trash,
    ]
  );

  const flushSyncQueue = useCallback(async () => {
    const queue = await readSyncQueue().catch(() => []);
    for (const item of queue) {
      try {
        await fetch("/api/workspace", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(item.payload),
        });
        await removeQueuedSync(item.id);
      } catch {
        break;
      }
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    async function bootstrap() {
      store.setLoading(true);
      try {
        const [response, draft] = await Promise.all([
          fetch(`/api/workspace?workspaceId=${workspaceId}`),
          readDraft(workspaceId).catch(() => null),
        ]);
        if (!response.ok) {
          throw new Error("Failed to load workspace");
        }
        const payload = await response.json();
        const remoteState = payload.state;
        const useDraft =
          draft?.state &&
          new Date(draft.state.meta?.updatedAt || 0).getTime() > new Date(remoteState.meta?.updatedAt || 0).getTime();
        if (!cancelled) {
          store.hydrateWorkspace(workspaceId, useDraft ? draft.state : remoteState);
        }
        await flushSyncQueue();
      } catch (err) {
        if (!cancelled) {
          store.setError(err.message || "Workspace failed to load.");
          store.setLoading(false);
        }
      }
    }
    bootstrap();
    return () => {
      cancelled = true;
    };
  }, [workspaceId, store, flushSyncQueue]);

  useEffect(() => {
    const onKeyDown = (event) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        store.setCommandPaletteOpen(!commandPaletteOpen);
      }
      if (event.key === "Escape") {
        store.setCommandPaletteOpen(false);
        setImportOpen(false);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [store, commandPaletteOpen]);

  useEffect(() => {
    if (!loaded) {
      return;
    }
    channelRef.current = new BroadcastChannel("workspace-realtime");
    channelRef.current.onmessage = (event) => {
      const message = event.data;
      if (!message || message.clientId === clientIdRef.current) {
        return;
      }
      if (message.type === "state") {
        store.applyRemoteState(message.state);
      }
      if (message.type === "presence") {
        store.setPresence(message.payload);
      }
      if (message.type === "typing") {
        store.setTyping(message.payload);
      }
    };
    return () => channelRef.current?.close();
  }, [loaded, store]);

  useEffect(() => {
    if (!loaded || !channelRef.current) {
      return;
    }
    clearTimeout(syncTimerRef.current);
    syncTimerRef.current = setTimeout(() => {
      channelRef.current?.postMessage({ type: "state", clientId: clientIdRef.current, state: serializableState });
    }, 500);
    return () => clearTimeout(syncTimerRef.current);
  }, [serializableState, loaded]);

  useEffect(() => {
    if (!loaded || !currentUser.id || !channelRef.current) {
      return;
    }
    const sendPresence = () => {
      channelRef.current?.postMessage({
        type: "presence",
        clientId: clientIdRef.current,
        payload: {
          clientId: clientIdRef.current,
          pageId: activePageId,
          userId: currentUser.id,
          name: currentUser.name,
          color: currentUser.color,
          updatedAt: Date.now(),
        },
      });
    };
    sendPresence();
    const interval = setInterval(() => {
      sendPresence();
      store.prunePresence();
      store.pruneTyping();
    }, 4000);
    return () => clearInterval(interval);
  }, [loaded, currentUser.id, currentUser.name, currentUser.color, activePageId, store]);

  useEffect(() => {
    if (!loaded) {
      return;
    }
    saveDraft(workspaceId, serializableState).catch(() => null);
    const payload = {
      workspaceId,
      actorId: currentUser.id,
      action: "workspace_autosave",
      pageId: activePageId,
      state: serializableState,
    };

    const timer = setTimeout(async () => {
      store.incrementPendingSaves();
      try {
        const response = await fetch("/api/workspace", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        if (!response.ok) {
          throw new Error("save failed");
        }
      } catch {
        await queueSync({ id: nanoid(), createdAt: Date.now(), payload });
      } finally {
        store.decrementPendingSaves();
      }
    }, 650);

    return () => clearTimeout(timer);
  }, [serializableState, workspaceId, currentUser.id, activePageId, loaded, store]);

  useEffect(() => {
    const onOnline = () => {
      flushSyncQueue();
    };
    window.addEventListener("online", onOnline);
    return () => window.removeEventListener("online", onOnline);
  }, [flushSyncQueue]);

  useEffect(() => {
    if (!commandPaletteOpen || !commandPaletteQuery.trim()) {
      setSearchResults([]);
      return;
    }
    clearTimeout(searchTimerRef.current);
    searchTimerRef.current = setTimeout(async () => {
      const response = await fetch(`/api/search?q=${encodeURIComponent(commandPaletteQuery)}&workspaceId=${workspaceId}`);
      if (!response.ok) {
        return;
      }
      const payload = await response.json();
      setSearchResults(payload.results || []);
    }, 180);
    return () => clearTimeout(searchTimerRef.current);
  }, [commandPaletteQuery, workspaceId, commandPaletteOpen]);

  const onDragEnd = (event) => {
    const { active, over } = event;
    if (!over || active.id === over.id) {
      return;
    }
    const oldIndex = blocks.findIndex((block) => block.id === active.id);
    const newIndex = blocks.findIndex((block) => block.id === over.id);
    if (oldIndex < 0 || newIndex < 0) {
      return;
    }
    const ordered = arrayMove(blocks, oldIndex, newIndex).map((block) => block.id);
    store.reorderBlocks({ pageId: activePageId, orderedIds: ordered });
  };

  const onTypeBroadcast = (blockId) => {
    const payload = {
      clientId: clientIdRef.current,
      pageId: activePageId,
      blockId,
      userName: currentUser.name,
      updatedAt: Date.now(),
    };
    store.setTyping(payload);
    channelRef.current?.postMessage({ type: "typing", clientId: clientIdRef.current, payload });
  };

  const createPage = (templateId = "") => {
    store.createPage({ title: "Untitled", parentId: activePageId || null, templateId });
  };

  const openCommentForBlock = (blockId) => {
    const content = window.prompt("Comment on this block:");
    if (!content) {
      return;
    }
    store.createThread({ pageId: activePageId, blockId, content });
  };

  const loadVersions = async () => {
    if (!activePageId) {
      return;
    }
    const response = await fetch(`/api/workspace/version?pageId=${activePageId}`);
    if (!response.ok) {
      return;
    }
    const payload = await response.json();
    store.setVersionsForPage(activePageId, payload.versions || []);
  };

  const captureSnapshot = async () => {
    if (!activePageId) {
      return;
    }
    await fetch("/api/workspace", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ workspaceId, pageId: activePageId, actorId: currentUser.id }),
    });
    await loadVersions();
  };

  const selectVersion = async (versionId) => {
    const response = await fetch(`/api/workspace/version?versionId=${versionId}`);
    if (!response.ok) {
      return;
    }
    const payload = await response.json();
    setSelectedVersion(payload.version);
  };

  const restoreVersion = async (versionId) => {
    await fetch("/api/workspace/version", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ workspaceId, versionId }),
    });
    const refreshed = await fetch(`/api/workspace?workspaceId=${workspaceId}`);
    const payload = await refreshed.json();
    store.hydrateWorkspace(workspaceId, payload.state);
    setSelectedVersion(null);
  };

  const importMarkdown = async () => {
    if (!importText.trim()) {
      return;
    }
    const response = await fetch("/api/import/markdown", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        workspaceId,
        title: importTitle,
        markdown: importText,
        parentId: activePageId || null,
      }),
    });
    if (!response.ok) {
      return;
    }
    const payload = await response.json();
    const refreshed = await fetch(`/api/workspace?workspaceId=${workspaceId}`);
    const data = await refreshed.json();
    store.hydrateWorkspace(workspaceId, data.state);
    store.setActivePage(payload.pageId);
    setImportOpen(false);
    setImportText("");
  };

  if (loading) {
    return <main className="loading-shell">Loading workspace...</main>;
  }
  if (error) {
    return <main className="loading-shell">{error}</main>;
  }

  return (
    <main className="workspace-shell">
      <aside className="sidebar">
        <div className="sidebar-head">
          <h2>Notion Clone</h2>
          <button onClick={() => store.setCommandPaletteOpen(true)}>
            <FiCommand /> Quick Find
          </button>
        </div>

        <div className="sidebar-group">
          <button className="wide-btn" onClick={() => createPage()}>
            <FiFilePlus /> New Page
          </button>
          <button className="wide-btn" onClick={() => setImportOpen(true)}>
            <FiUpload /> Import Markdown
          </button>
        </div>

        <div className="sidebar-group">
          <h3>Templates</h3>
          {templates.map((template) => (
            <button key={template.id} className="ghost-btn" onClick={() => createPage(template.id)}>
              {template.name}
            </button>
          ))}
        </div>

        <div className="sidebar-group">
          <h3>Favorites</h3>
          {favoritePages.length === 0 && <small className="muted">No favorites yet.</small>}
          {favoritePages.map((page) => (
            <button key={page.id} className="ghost-btn" onClick={() => store.setActivePage(page.id)}>
              <FiStar /> {page.title}
            </button>
          ))}
        </div>

        <div className="sidebar-group">
          <h3>Recent</h3>
          {recentPages.slice(0, 6).map((page) => (
            <button key={page.id} className="ghost-btn" onClick={() => store.setActivePage(page.id)}>
              <FiClock /> {page.title}
            </button>
          ))}
        </div>

        <div className="sidebar-group">
          <h3>Pages</h3>
          <PageTree
            nodes={pageTree}
            expanded={expandedPageIds}
            onToggle={store.toggleExpandPage}
            onOpen={store.setActivePage}
            activePageId={activePageId}
          />
        </div>

        <div className="sidebar-group">
          <button className="ghost-btn" onClick={() => store.setShowDeleted(!showDeleted)}>
            <FiTrash2 /> Trash ({deletedPages.length})
          </button>
          {showDeleted &&
            deletedPages.map((page) => (
              <div key={page.id} className="trash-item">
                <span>{page.title}</span>
                <button onClick={() => store.restorePage(page.id)}>
                  <FiCornerUpLeft />
                </button>
              </div>
            ))}
        </div>
      </aside>
      <section className="doc-area">
        {activePage && (
          <>
            <header className="doc-header">
              <div className="breadcrumbs">
                {breadcrumbs.map((crumb) => (
                  <button key={crumb.id} onClick={() => store.setActivePage(crumb.id)}>
                    {crumb.title}
                  </button>
                ))}
              </div>
              <div className="doc-header-actions">
                <span className="save-status">
                  {pendingSaves > 0
                    ? "Saving..."
                    : lastSavedAt
                      ? `Saved ${new Date(lastSavedAt).toLocaleTimeString()}`
                      : "Unsaved"}
                </span>
                <a href={`/api/export/markdown?workspaceId=${workspaceId}&pageId=${activePage.id}`} target="_blank">
                  <FiDownload /> MD
                </a>
                <a href={`/api/export/html?workspaceId=${workspaceId}&pageId=${activePage.id}`} target="_blank">
                  <FiDownload /> HTML
                </a>
                <button onClick={captureSnapshot}>
                  <FiCopy /> Snapshot
                </button>
                <button onClick={loadVersions}>Versions</button>
              </div>
            </header>

            <section className="page-meta">
              <input
                className="page-icon"
                value={activePage.icon || ""}
                onChange={(event) => store.updatePage(activePage.id, { icon: event.target.value })}
              />
              <input
                className="page-title"
                value={activePage.title}
                onChange={(event) => store.updatePage(activePage.id, { title: event.target.value })}
              />
              <select value={activePage.parentId || ""} onChange={(event) => store.movePage(activePage.id, event.target.value || null)}>
                <option value="">Top level</option>
                {pages
                  .filter((page) => page.id !== activePage.id && !page.isDeleted)
                  .map((page) => (
                    <option key={page.id} value={page.id}>
                      {page.title}
                    </option>
                  ))}
              </select>
              <select value={activePage.shared || "workspace"} onChange={(event) => store.updatePage(activePage.id, { shared: event.target.value })}>
                <option value="private">Private</option>
                <option value="workspace">Workspace</option>
                <option value="public">Public link</option>
              </select>
              <button onClick={() => store.toggleFavorite(activePage.id)}>
                <FiStar />
              </button>
              <button onClick={() => store.softDeletePage(activePage.id)}>
                <FiTrash2 />
              </button>
            </section>

            {activePage.coverImage && (
              <Image alt="" src={activePage.coverImage} className="cover-img" width={1200} height={300} unoptimized />
            )}
            <input
              className="cover-input"
              placeholder="Cover image URL"
              value={activePage.coverImage || ""}
              onChange={(event) => store.updatePage(activePage.id, { coverImage: event.target.value })}
            />

            <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
              <SortableContext items={blocks.map((item) => item.id)} strategy={verticalListSortingStrategy}>
                <div className="blocks">
                  {blocks.map((block) => (
                    <SortableBlock
                      key={block.id}
                      block={block}
                      pageId={activePage.id}
                      typing={
                        typing[activePage.id]?.[block.id]?.userName
                          ? `${typing[activePage.id][block.id].userName} is typing...`
                          : ""
                      }
                      onUpdate={store.updateBlock}
                      onAddAfter={(afterId) => store.addBlock({ pageId: activePage.id, afterBlockId: afterId })}
                      onDelete={(blockId) => store.removeBlock({ pageId: activePage.id, blockId })}
                      onType={onTypeBroadcast}
                      onComment={openCommentForBlock}
                    />
                  ))}
                </div>
              </SortableContext>
            </DndContext>

            <button className="wide-btn add-block" onClick={() => store.addBlock({ pageId: activePage.id })}>
              + Add block
            </button>
          </>
        )}
      </section>

      <aside className="right-panel">
        <section className="presence-card">
          <h3>
            <FiUsers /> Presence
          </h3>
          <p>You are viewing this page as {currentUser.name}.</p>
          {visiblePresence.length === 0 && <small className="muted">No teammates on this page.</small>}
          {visiblePresence.map(([id, person]) => (
            <div key={id} className="presence-user">
              <span className="presence-dot" style={{ backgroundColor: person.color }} />
              {person.name} is viewing this page
            </div>
          ))}
        </section>

        <section className="comments-card">
          <h3>Comments</h3>
          {pageThreads.length === 0 && <small className="muted">No comments yet.</small>}
          {pageThreads.map((thread) => (
            <article key={thread.id} className={`thread ${thread.resolved ? "resolved" : ""}`}>
              <header>
                <span>Block {thread.blockId.slice(0, 6)}</span>
                <button onClick={() => store.toggleThreadResolved(thread.id)}>{thread.resolved ? "Reopen" : "Resolve"}</button>
              </header>
              {comments
                .filter((comment) => comment.threadId === thread.id)
                .map((comment) => (
                  <p key={comment.id}>
                    <strong>{users.find((user) => user.id === comment.authorId)?.name || "User"}:</strong> {comment.content}
                  </p>
                ))}
              <button
                className="inline-btn"
                onClick={() => {
                  const reply = window.prompt("Reply");
                  if (reply) {
                    store.replyThread({ threadId: thread.id, content: reply });
                  }
                }}
              >
                Reply
              </button>
            </article>
          ))}
        </section>

        <section className="versions-card">
          <h3>Version History</h3>
          {(versionsByPage[activePageId] || []).map((version) => (
            <button key={version.id} className="version-row" onClick={() => selectVersion(version.id)}>
              {new Date(version.created_at).toLocaleString()}
            </button>
          ))}
          {selectedVersion && (
            <div className="version-detail">
              <p>{createDiffText(blocks, selectedVersion.snapshot?.blocks || [])}</p>
              <button className="inline-btn" onClick={() => restoreVersion(selectedVersion.id)}>
                Restore this version
              </button>
            </div>
          )}
        </section>
      </aside>

      <CommandPalette
        open={commandPaletteOpen}
        query={commandPaletteQuery}
        setQuery={store.setCommandPaletteQuery}
        results={searchResults}
        onClose={() => store.setCommandPaletteOpen(false)}
        onSelect={(pageId) => store.setActivePage(pageId)}
        recentPages={recentPages}
      />

      {importOpen && (
        <div className="palette-overlay" onClick={() => setImportOpen(false)}>
          <div className="palette import-dialog" onClick={(event) => event.stopPropagation()}>
            <h3>Import Markdown</h3>
            <input value={importTitle} onChange={(event) => setImportTitle(event.target.value)} placeholder="Page title" />
            <textarea value={importText} onChange={(event) => setImportText(event.target.value)} placeholder="# Notes" />
            <button className="wide-btn" onClick={importMarkdown}>
              Import
            </button>
          </div>
        </div>
      )}
    </main>
  );
}
