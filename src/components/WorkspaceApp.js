"use client";

import {
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import Image from "next/image";
import DatabaseBlock from "./DatabaseBlock";
import {
  DndContext,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
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
import { readLegacyDrafts } from "@/lib/offlineStore";
import { createWorkspaceClient, downloadFile } from "@/lib/workspaceClient.mjs";
import { useWorkspaceConnection } from "./useWorkspaceConnection";
import { useWorkspaceStore } from "@/lib/workspaceStore";
import {
  buildPageTree,
  createDiffText,
  getBreadcrumbs,
  mapBlockTypeLabel,
} from "@/lib/workspaceUtils";

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

function SortableBlock({
  block,
  pageId,
  typing,
  onUpdate,
  onAddAfter,
  onDelete,
  onType,
  onComment,
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: block.id });
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.45 : 1,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`block-row ${isDragging ? "dragging" : ""}`}
    >
      <button
        className="drag-handle"
        {...attributes}
        {...listeners}
        aria-label="Drag block"
      >
        ::
      </button>
      <div className="block-type-chip">{mapBlockTypeLabel(block.type)}</div>
      <div className="block-body">
        <div className="block-row-controls">
          <select
            aria-label="Block type"
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
                          properties: [
                            { id: "name", name: "Name", type: "text" },
                          ],
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
          <button
            aria-label="Comment on block"
            className="inline-btn"
            onClick={() => onComment(block.id)}
          >
            <FiMessageSquare />
          </button>
          <button
            aria-label="Delete block"
            className="inline-btn danger"
            onClick={() => onDelete(block.id)}
          >
            <FiTrash2 />
          </button>
        </div>
        {block.type === "divider" ? (
          <hr />
        ) : block.type === "database" ? (
          <DatabaseBlock block={block} pageId={pageId} onUpdate={onUpdate} />
        ) : (
          <textarea
            aria-label={`${mapBlockTypeLabel(block.type)} text`}
            maxLength={50000}
            className={`block-input ${block.type === "code" ? "code" : ""}`}
            value={block.text || ""}
            placeholder={`Write ${block.type}...`}
            onChange={(event) => {
              onUpdate({
                pageId,
                blockId: block.id,
                patch: { text: event.target.value },
              });
              onType(block.id);
            }}
          />
        )}
        {typing && <div className="typing-indicator">{typing}</div>}
      </div>
    </div>
  );
}

function PageTree({
  nodes,
  depth = 0,
  expanded,
  onToggle,
  onOpen,
  activePageId,
}) {
  return nodes.map((node) => (
    <div key={node.id}>
      <button
        className={`tree-item ${activePageId === node.id ? "active" : ""}`}
        style={{ paddingLeft: `${10 + depth * 16}px` }}
        onClick={() => onOpen(node.id)}
      >
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

function CommandPalette({
  open,
  query,
  setQuery,
  results,
  onClose,
  onSelect,
  recentPages,
}) {
  if (!open) {
    return null;
  }

  return (
    <div className="palette-overlay" onClick={onClose}>
      <div className="palette" onClick={(event) => event.stopPropagation()}>
        <div className="palette-input-wrap">
          <FiSearch />
          <input
            aria-label="Search accepted workspace"
            autoFocus
            value={query}
            maxLength={200}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search pages, blocks, and docs..."
          />
        </div>
        <div className="palette-results">
          {(query ? results : recentPages).map((item) => (
            <button
              key={item.id || item.pageId}
              className="palette-result"
              onClick={() => onSelect(item.pageId || item.id)}
            >
              <small>{item.kind || "recent"}</small>
              <span>{item.title || item.name || "Untitled"}</span>
            </button>
          ))}
          {query && results.length === 0 && (
            <p className="muted">No results.</p>
          )}
        </div>
      </div>
    </div>
  );
}

const actions = useWorkspaceStore.getState();

function DraftReview({ session, review }) {
  const [selection, setSelection] = useState({ review, choices: {} });
  const choices = selection.review === review ? selection.choices : {};
  const result = session.previewReview(choices);
  const show = (value) =>
    value?.present ? JSON.stringify(value.value, null, 2) : "(removed)";
  return (
    <section className="draft-review" aria-label="Draft review">
      <h2>Review your draft against the accepted workspace</h2>
      <p>
        Independent changes are combined. Choose a value for each conflict.
        Accepting this review keeps a draft; use Save to submit it.
      </p>
      {review.result.conflicts.map((conflict) => (
        <fieldset key={conflict.path}>
          <legend>{conflict.path}</legend>
          <details>
            <summary>Common starting value</summary>
            <pre>{show(conflict.base)}</pre>
          </details>
          {["local", "remote"].map((side) => (
            <label key={side}>
              <input
                type="radio"
                name={conflict.path}
                value={side}
                checked={choices[conflict.path] === side}
                onChange={() =>
                  setSelection({
                    review,
                    choices: { ...choices, [conflict.path]: side },
                  })
                }
              />
              {side === "local" ? "Your draft" : "Accepted server value"}
              <pre>{show(conflict[side])}</pre>
            </label>
          ))}
        </fieldset>
      ))}
      {result.validationError && <p role="alert">{result.validationError}</p>}
      {!result.conflicts.length && <p>No competing edits were found.</p>}
      <button
        disabled={!result.ready}
        onClick={() => session.acceptReview(choices)}
      >
        Accept reviewed draft
      </button>
    </section>
  );
}

const hydrationSubscribe = () => () => {};
export default function WorkspaceApp() {
  const hydrated = useSyncExternalStore(
    hydrationSubscribe,
    () => true,
    () => false,
  );
  const [connection, setConnection] = useState(null),
    [token, setToken] = useState(""),
    [message, setMessage] = useState(""),
    [busy, setBusy] = useState(false);
  async function signIn(event) {
    event.preventDefault();
    setBusy(true);
    setMessage("");
    try {
      const api = createWorkspaceClient(token.trim());
      const snapshot = await api("/api/workspace");
      setToken("");
      setConnection({ api, snapshot });
    } catch (error) {
      setMessage(error.message);
    } finally {
      setBusy(false);
    }
  }
  if (connection)
    return (
      <ConnectedWorkspace
        connection={connection}
        onSignOut={() => {
          actions.reset();
          setConnection(null);
        }}
      />
    );
  return (
    <main className="login-shell">
      <h1>Knowledge Workspace</h1>
      <p>
        A local owner workspace for pages, blocks, comments and structured
        records.
      </p>
      <p>
        Run <code>npm run setup -- --owner &quot;Your name&quot;</code> in this
        project first. Keep the printed owner token somewhere private, then
        enter it here. It stays in memory for this tab.
      </p>
      <form onSubmit={signIn}>
        <label>
          Owner token
          <input
            type="password"
            disabled={!hydrated}
            autoComplete="off"
            required
            pattern="[a-fA-F0-9]{64}"
            value={token}
            onChange={(event) => setToken(event.target.value)}
          />
        </label>
        <button disabled={busy || !hydrated}>
          {busy ? "Opening…" : "Open workspace"}
        </button>
      </form>
      {message && <p role="alert">{message}</p>}
    </main>
  );
}

function ConnectedWorkspace({ connection, onSignOut }) {
  const store = useWorkspaceStore();
  const sync = useWorkspaceConnection(connection);
  const {
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
  } = store;

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
  );
  const channelRef = useRef(null);
  const [clientId] = useState(() => nanoid());
  const [searchResults, setSearchResults] = useState([]);
  const [importOpen, setImportOpen] = useState(false);
  const [importText, setImportText] = useState("");
  const [importTitle, setImportTitle] = useState("Imported Page");
  const [selectedVersion, setSelectedVersion] = useState(null);
  const [historyPage, setHistoryPage] = useState({
    pageId: "",
    page: 1,
    total: 0,
  });

  const currentUser = users.find((user) => user.id === store.currentUserId) || {
    id: "user-owner",
    name: "Owner",
    color: "#1f7a8c",
  };
  const activePage = pages.find((page) => page.id === activePageId) || null;
  const blocks = blocksByPage[activePageId] || [];
  const pageTree = useMemo(() => buildPageTree(pages), [pages]);
  const breadcrumbs = useMemo(
    () => getBreadcrumbs(pages, activePageId),
    [pages, activePageId],
  );
  const deletedPages = useMemo(
    () => pages.filter((page) => page.isDeleted),
    [pages],
  );
  const favoritePages = useMemo(
    () =>
      favorites
        .filter((fav) => fav.userId === store.currentUserId)
        .map((fav) => pages.find((page) => page.id === fav.pageId))
        .filter(Boolean),
    [favorites, pages, store.currentUserId],
  );
  const recentPages = useMemo(
    () =>
      recent.map((id) => pages.find((page) => page.id === id)).filter(Boolean),
    [recent, pages],
  );
  const pageThreads = useMemo(
    () => commentThreads.filter((thread) => thread.pageId === activePageId),
    [commentThreads, activePageId],
  );
  const visiblePresence = useMemo(
    () =>
      Object.entries(presence).filter(
        ([key, value]) => key !== clientId && value.pageId === activePageId,
      ),
    [presence, activePageId, clientId],
  );

  useEffect(() => {
    const keydown = (event) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        actions.setCommandPaletteOpen(
          !useWorkspaceStore.getState().commandPaletteOpen,
        );
      }
      if (event.key === "Escape") {
        actions.setCommandPaletteOpen(false);
        setImportOpen(false);
      }
    };
    window.addEventListener("keydown", keydown);
    return () => window.removeEventListener("keydown", keydown);
  }, []);
  useEffect(() => {
    if (!loaded || typeof BroadcastChannel === "undefined") return;
    const channel = new BroadcastChannel(
      "knowledge-presence:" + connection.snapshot.instanceId,
    );
    channelRef.current = channel;
    channel.onmessage = (event) => {
      const data = event.data;
      if (!data || data.clientId === clientId) return;
      if (data.type === "presence") actions.setPresence(data.payload);
      if (data.type === "typing") actions.setTyping(data.payload);
    };
    const send = () => {
      channel.postMessage({
        type: "presence",
        clientId,
        payload: {
          clientId,
          pageId: activePageId,
          userId: currentUser.id,
          name: currentUser.name,
          color: currentUser.color,
        },
      });
      actions.prunePresence();
      actions.pruneTyping();
    };
    send();
    const timer = setInterval(send, 4000);
    return () => {
      clearInterval(timer);
      channel.close();
      channelRef.current = null;
    };
  }, [
    loaded,
    connection,
    clientId,
    activePageId,
    currentUser.id,
    currentUser.name,
    currentUser.color,
  ]);
  useEffect(() => {
    let active = true;
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      if (!commandPaletteOpen || !commandPaletteQuery.trim()) {
        if (active) setSearchResults([]);
        return;
      }
      try {
        const result = await connection.api(
          "/api/search?q=" + encodeURIComponent(commandPaletteQuery),
          { signal: controller.signal },
        );
        if (active) setSearchResults(result.results);
      } catch (error) {
        if (active) {
          setSearchResults([]);
          actions.setError(error.message);
        }
      }
    }, 180);
    return () => {
      active = false;
      clearTimeout(timer);
      controller.abort();
    };
  }, [connection, commandPaletteOpen, commandPaletteQuery]);

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
    const ordered = arrayMove(blocks, oldIndex, newIndex).map(
      (block) => block.id,
    );
    store.reorderBlocks({ pageId: activePageId, orderedIds: ordered });
  };

  const onTypeBroadcast = (blockId) => {
    const payload = {
      clientId: clientId,
      pageId: activePageId,
      blockId,
      userName: currentUser.name,
      updatedAt: Date.now(),
    };
    store.setTyping(payload);
    channelRef.current?.postMessage({
      type: "typing",
      clientId: clientId,
      payload,
    });
  };

  const createPage = (templateId = "") => {
    store.createPage({
      title: "Untitled",
      parentId: activePageId || null,
      templateId,
    });
  };

  const openCommentForBlock = (blockId) => {
    const content = window.prompt("Comment on this block:");
    if (!content) {
      return;
    }
    store.createThread({ pageId: activePageId, blockId, content });
  };

  const loadVersions = async (page = 1) => {
    if (!activePageId) return;
    try {
      const payload = await connection.api(
        `/api/workspace/version?pageId=${activePageId}&page=${page}`,
      );
      actions.setVersionsForPage(activePageId, payload.versions);
      setHistoryPage({
        pageId: activePageId,
        page: payload.page,
        total: payload.total,
      });
    } catch (error) {
      actions.setError(error.message);
    }
  };
  const captureSnapshot = async () => {
    if (!activePageId) return;
    const result = await sync.session.current.operation((revision) =>
      connection.api("/api/workspace", {
        method: "POST",
        body: { pageId: activePageId },
        revision,
      }),
    );
    if (result) await loadVersions();
  };
  const selectVersion = async (versionId) => {
    try {
      const payload = await connection.api(
        "/api/workspace/version?versionId=" + versionId,
      );
      setSelectedVersion(payload.version);
    } catch (error) {
      actions.setError(error.message);
    }
  };
  const restoreVersion = async (versionId) => {
    if (
      !window.confirm(
        "Replace this page content and comments with the snapshot? Current hierarchy and visibility labels stay the same.",
      )
    )
      return;
    const result = await sync.session.current.operation((revision) =>
      connection.api("/api/workspace/version", {
        method: "PATCH",
        body: { versionId },
        revision,
      }),
    );
    if (result) setSelectedVersion(null);
  };
  const deleteVersion = async (versionId) => {
    if (
      !window.confirm(
        "Permanently delete this snapshot? The current page stays unchanged.",
      )
    )
      return;
    const result = await sync.session.current.operation((revision) =>
      connection.api("/api/workspace/version", {
        method: "DELETE",
        body: { versionId },
        revision,
      }),
    );
    if (result) {
      setSelectedVersion(null);
      await loadVersions();
    }
  };
  const importMarkdown = async () => {
    if (!importText.trim()) return;
    const result = await sync.session.current.operation((revision) =>
      connection.api("/api/import/markdown", {
        method: "POST",
        body: {
          title: importTitle,
          markdown: importText,
          parentId: activePageId || null,
        },
        revision,
      }),
    );
    if (result) {
      actions.setActivePage(result.pageId);
      setImportOpen(false);
      setImportText("");
    }
  };
  const exportAccepted = async (format) => {
    try {
      const path =
        format === "json"
          ? "/api/export/json"
          : `/api/export/${format}?pageId=${activePageId}`;
      downloadFile(
        await connection.api(path, { blob: true }),
        format === "json"
          ? "workspace.json"
          : `page.${format === "markdown" ? "md" : "html"}`,
      );
    } catch (error) {
      actions.setError(error.message);
    }
  };
  const exportLegacy = async () => {
    try {
      const value = await readLegacyDrafts();
      if (value) downloadFile(value, "legacy-offline-drafts.json");
      else
        actions.setError(
          "No legacy offline drafts were found in this browser.",
        );
    } catch (error) {
      actions.setError(error.message);
    }
  };
  const signOut = async () => {
    if (sync.status.busy) {
      actions.setError("Wait for the current request before signing out.");
      return;
    }
    if (
      (sync.status.dirty || sync.status.needsReview) &&
      !window.confirm(
        "Sign out with unsaved edits? Your local draft will be retained if browser storage is available. Download it first if needed.",
      )
    )
      return;
    if (!sync.recovery) await sync.session.current.retain();
    if (sync.session.current.getSnapshot().warning) {
      actions.setError(
        "Local storage failed. Download the draft before signing out.",
      );
      return;
    }
    sync.session.current.close();
    onSignOut();
  };
  if (!loaded || loading || !sync.localReady)
    return (
      <main className="loading-shell">
        Loading accepted workspace and checking local drafts…
      </main>
    );

  return (
    <div>
      <section className="sync-toolbar" aria-label="Save and recovery controls">
        <p role="status">
          <strong>{sync.status.phase}</strong>: {sync.status.message}
        </p>
        {sync.status.warning && <p role="alert">{sync.status.warning}</p>}
        {error && (
          <p role="alert">
            {error}{" "}
            <button onClick={() => actions.setError("")}>Dismiss</button>
          </p>
        )}
        {sync.remoteNotice && (
          <p>
            Another tab accepted changes. Review the latest workspace before
            your next save.
          </p>
        )}
        <div>
          <button
            disabled={
              sync.status.busy ||
              sync.status.needsReview ||
              Boolean(sync.recovery)
            }
            onClick={() => sync.session.current.save()}
          >
            Save
          </button>
          <button
            disabled={sync.status.busy || Boolean(sync.recovery)}
            onClick={sync.review}
          >
            Review latest
          </button>
          <button
            onClick={() =>
              downloadFile(
                {
                  base: sync.session.current.accepted,
                  state: sync.session.current.draft,
                },
                "local-workspace-draft.json",
              )
            }
          >
            Download local draft
          </button>
          <button
            disabled={sync.status.busy || Boolean(sync.recovery)}
            onClick={() => {
              if (
                window.confirm(
                  "Discard the local draft and load accepted state?",
                )
              )
                sync.session.current.reloadAccepted();
            }}
          >
            Discard draft
          </button>
          <button onClick={() => exportAccepted("json")}>
            Export accepted JSON
          </button>
          <button onClick={exportLegacy}>Export legacy drafts</button>
          <button disabled={sync.status.busy} onClick={signOut}>
            Sign out
          </button>
        </div>
        {sync.recovery && (
          <section aria-label="Saved local draft">
            <h2>Saved local draft found</h2>
            <p>
              Review it before editing. It will not be replayed automatically.
            </p>
            <button onClick={sync.recover}>Review saved draft</button>
            <button
              onClick={() =>
                downloadFile(sync.recovery, "saved-workspace-draft.json")
              }
            >
              Download saved draft
            </button>
            <button
              onClick={() => {
                if (window.confirm("Discard this saved local draft?"))
                  sync.discardRecovery();
              }}
            >
              Discard saved draft
            </button>
          </section>
        )}
        {sync.status.review && (
          <DraftReview
            key={
              sync.status.review.latest.revision +
              sync.status.review.base.revision
            }
            session={sync.session.current}
            review={sync.status.review}
          />
        )}
      </section>
      <main
        className="workspace-shell"
        inert={
          Boolean(sync.recovery) ||
          ["operation", "reviewing", "reloading"].includes(sync.status.phase)
        }
      >
        <aside className="sidebar">
          <div className="sidebar-head">
            <h2>Knowledge Workspace</h2>
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
              <button
                key={template.id}
                className="ghost-btn"
                onClick={() => createPage(template.id)}
              >
                {template.name}
              </button>
            ))}
          </div>

          <div className="sidebar-group">
            <h3>Favorites</h3>
            {favoritePages.length === 0 && (
              <small className="muted">No favorites yet.</small>
            )}
            {favoritePages.map((page) => (
              <button
                key={page.id}
                className="ghost-btn"
                onClick={() => store.setActivePage(page.id)}
              >
                <FiStar /> {page.title}
              </button>
            ))}
          </div>

          <div className="sidebar-group">
            <h3>Recent</h3>
            {recentPages.slice(0, 6).map((page) => (
              <button
                key={page.id}
                className="ghost-btn"
                onClick={() => store.setActivePage(page.id)}
              >
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
            <button
              className="ghost-btn"
              onClick={() => store.setShowDeleted(!showDeleted)}
            >
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
                    <button
                      key={crumb.id}
                      onClick={() => store.setActivePage(crumb.id)}
                    >
                      {crumb.title}
                    </button>
                  ))}
                </div>
                <div className="doc-header-actions">
                  <button onClick={() => exportAccepted("markdown")}>
                    <FiDownload /> Accepted MD
                  </button>
                  <button onClick={() => exportAccepted("html")}>
                    <FiDownload /> Accepted HTML
                  </button>
                  <button onClick={captureSnapshot}>
                    <FiCopy /> Snapshot
                  </button>
                  <button onClick={() => loadVersions()}>Versions</button>
                </div>
              </header>

              <section className="page-meta">
                <input
                  aria-label="Page icon"
                  maxLength={16}
                  className="page-icon"
                  value={activePage.icon || ""}
                  onChange={(event) =>
                    store.updatePage(activePage.id, {
                      icon: event.target.value,
                    })
                  }
                />
                <input
                  aria-label="Page title"
                  maxLength={200}
                  className="page-title"
                  value={activePage.title}
                  onChange={(event) =>
                    store.updatePage(activePage.id, {
                      title: event.target.value,
                    })
                  }
                />
                <select
                  aria-label="Parent page"
                  value={activePage.parentId || ""}
                  onChange={(event) =>
                    store.movePage(activePage.id, event.target.value || null)
                  }
                >
                  <option value="">Top level</option>
                  {pages
                    .filter(
                      (page) => page.id !== activePage.id && !page.isDeleted,
                    )
                    .map((page) => (
                      <option key={page.id} value={page.id}>
                        {page.title}
                      </option>
                    ))}
                </select>
                <select
                  aria-label="Visibility label; all pages remain owner only"
                  value={activePage.shared || "workspace"}
                  onChange={(event) =>
                    store.updatePage(activePage.id, {
                      shared: event.target.value,
                    })
                  }
                >
                  <option value="private">Private</option>
                  <option value="workspace">Workspace label</option>
                  <option value="public">Public label</option>
                </select>
                <button
                  aria-label="Toggle favorite"
                  onClick={() => store.toggleFavorite(activePage.id)}
                >
                  <FiStar />
                </button>
                <button
                  aria-label="Move page and descendants to trash"
                  onClick={() => {
                    if (
                      window.confirm(
                        "Move this page and all descendants to trash?",
                      )
                    )
                      store.softDeletePage(activePage.id);
                  }}
                >
                  <FiTrash2 />
                </button>
              </section>

              {/^https:\/\/[^\s]+$/.test(activePage.coverImage || "") &&
                (() => {
                  try {
                    const url = new URL(activePage.coverImage);
                    return !url.username && !url.password;
                  } catch {
                    return false;
                  }
                })() && (
                  <Image
                    alt=""
                    src={activePage.coverImage}
                    className="cover-img"
                    width={1200}
                    height={300}
                    unoptimized
                  />
                )}
              <input
                aria-label="HTTPS cover image URL"
                maxLength={2048}
                className="cover-input"
                placeholder="Cover image URL"
                value={activePage.coverImage || ""}
                onChange={(event) =>
                  store.updatePage(activePage.id, {
                    coverImage: event.target.value,
                  })
                }
              />

              <DndContext
                sensors={sensors}
                collisionDetection={closestCenter}
                onDragEnd={onDragEnd}
              >
                <SortableContext
                  items={blocks.map((item) => item.id)}
                  strategy={verticalListSortingStrategy}
                >
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
                        onAddAfter={(afterId) =>
                          store.addBlock({
                            pageId: activePage.id,
                            afterBlockId: afterId,
                          })
                        }
                        onDelete={(blockId) => {
                          if (
                            !pageThreads.some(
                              (thread) => thread.blockId === blockId,
                            ) ||
                            window.confirm(
                              "Delete this block and its comments?",
                            )
                          )
                            store.removeBlock({
                              pageId: activePage.id,
                              blockId,
                            });
                        }}
                        onType={onTypeBroadcast}
                        onComment={openCommentForBlock}
                      />
                    ))}
                  </div>
                </SortableContext>
              </DndContext>

              <button
                className="wide-btn add-block"
                onClick={() => store.addBlock({ pageId: activePage.id })}
              >
                + Add block
              </button>
            </>
          )}
        </section>

        <aside className="right-panel">
          <section className="presence-card">
            <h3>
              <FiUsers /> Local tab presence
            </h3>
            <p>You are viewing this page as {currentUser.name}.</p>
            {visiblePresence.length === 0 && (
              <small className="muted">No other local tabs on this page.</small>
            )}
            {visiblePresence.map(([id, person]) => (
              <div key={id} className="presence-user">
                <span
                  className="presence-dot"
                  style={{ backgroundColor: person.color }}
                />
                {person.name} is viewing this page
              </div>
            ))}
          </section>

          <section className="comments-card">
            <h3>Comments</h3>
            {pageThreads.length === 0 && (
              <small className="muted">No comments yet.</small>
            )}
            {pageThreads.map((thread) => (
              <article
                key={thread.id}
                className={`thread ${thread.resolved ? "resolved" : ""}`}
              >
                <header>
                  <span>Block {thread.blockId.slice(0, 6)}</span>
                  <button
                    onClick={() => {
                      if (window.confirm("Delete this thread and all replies?"))
                        actions.removeThread(thread.id);
                    }}
                  >
                    Delete thread
                  </button>
                  <button onClick={() => store.toggleThreadResolved(thread.id)}>
                    {thread.resolved ? "Reopen" : "Resolve"}
                  </button>
                </header>
                {comments
                  .filter((comment) => comment.threadId === thread.id)
                  .map((comment) => (
                    <p key={comment.id}>
                      <strong>
                        {users.find((user) => user.id === comment.authorId)
                          ?.name || "User"}
                        :
                      </strong>{" "}
                      {comment.content}
                      <button
                        aria-label="Edit comment"
                        onClick={() => {
                          const content = window.prompt(
                            "Edit comment",
                            comment.content,
                          );
                          if (content !== null)
                            actions.editComment({
                              commentId: comment.id,
                              content,
                            });
                        }}
                      >
                        Edit
                      </button>
                      <button
                        aria-label="Delete comment"
                        onClick={() => {
                          if (window.confirm("Delete this comment?"))
                            actions.removeComment(comment.id);
                        }}
                      >
                        Delete
                      </button>
                    </p>
                  ))}
                <button
                  className="inline-btn"
                  onClick={() => {
                    const reply = window.prompt("Reply");
                    if (reply) {
                      store.replyThread({
                        threadId: thread.id,
                        content: reply,
                      });
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
            {historyPage.pageId === activePageId && (
              <div>
                <span>
                  {historyPage.total} snapshots; page {historyPage.page}
                </span>
                <button
                  disabled={historyPage.page <= 1}
                  onClick={() => loadVersions(historyPage.page - 1)}
                >
                  Previous snapshots
                </button>
                <button
                  disabled={historyPage.page * 20 >= historyPage.total}
                  onClick={() => loadVersions(historyPage.page + 1)}
                >
                  Next snapshots
                </button>
              </div>
            )}
            {(versionsByPage[activePageId] || []).map((version) => (
              <button
                key={version.id}
                className="version-row"
                onClick={() => selectVersion(version.id)}
              >
                {new Date(version.created_at).toLocaleString()}
              </button>
            ))}
            {selectedVersion?.pageId === activePageId && (
              <div className="version-detail">
                <p>
                  {createDiffText(
                    blocks,
                    selectedVersion.snapshot?.blocks || [],
                  )}
                </p>
                <button
                  className="inline-btn"
                  onClick={() => restoreVersion(selectedVersion.id)}
                >
                  Restore this version
                </button>
                <button
                  className="inline-btn danger"
                  onClick={() => deleteVersion(selectedVersion.id)}
                >
                  Delete this snapshot
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
            <div
              className="palette import-dialog"
              onClick={(event) => event.stopPropagation()}
            >
              <h3>Import Markdown</h3>
              <input
                aria-label="Import page title"
                maxLength={200}
                value={importTitle}
                onChange={(event) => setImportTitle(event.target.value)}
                placeholder="Page title"
              />
              <textarea
                aria-label="Markdown to import"
                maxLength={500000}
                value={importText}
                onChange={(event) => setImportText(event.target.value)}
                placeholder="# Notes"
              />
              <button className="wide-btn" onClick={importMarkdown}>
                Import
              </button>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
