"use client";

import { nanoid } from "nanoid";
import { create } from "zustand";
import { isDescendant } from "./workspaceUtils";

const DEFAULT_BLOCK = { type: "paragraph", text: "", props: {}, children: [] };

function nowIso() {
  return new Date().toISOString();
}

function safeArray(value) {
  return Array.isArray(value) ? value : [];
}

export const useWorkspaceStore = create((set, get) => ({
  workspaceId: "workspace-default",
  currentUserId: "user-owner",
  loading: true,
  loaded: false,
  error: "",
  meta: {},
  users: [],
  pages: [],
  activePageId: "",
  blocksByPage: {},
  commentThreads: [],
  comments: [],
  templates: [],
  favorites: [],
  recent: [],
  sharedLinks: [],
  versionsByPage: {},
  activities: [],
  trash: [],
  presence: {},
  typing: {},
  expandedPageIds: {},
  commandPaletteOpen: false,
  commandPaletteQuery: "",
  selectedBlockId: "",
  showDeleted: false,
  pendingSaves: 0,
  lastSavedAt: "",

  hydrateWorkspace: (workspaceId, state) =>
    set(() => {
      const pages = safeArray(state.pages);
      const firstPage = pages.find((page) => !page.isDeleted)?.id || "";
      const expanded = {};
      pages.forEach((page) => {
        if (page.parentId === null) {
          expanded[page.id] = true;
        }
      });
      return {
        workspaceId,
        loading: false,
        loaded: true,
        meta: state.meta || {},
        users: safeArray(state.users),
        pages,
        activePageId: firstPage,
        blocksByPage: state.blocksByPage || {},
        commentThreads: safeArray(state.commentThreads),
        comments: safeArray(state.comments),
        templates: safeArray(state.templates),
        favorites: safeArray(state.favorites),
        recent: safeArray(state.recent),
        sharedLinks: safeArray(state.sharedLinks),
        activities: safeArray(state.activities),
        trash: safeArray(state.trash),
        expandedPageIds: expanded,
      };
    }),

  setLoading: (loading) => set(() => ({ loading })),
  setError: (error) => set(() => ({ error })),
  setActivePage: (pageId) =>
    set((state) => ({
      activePageId: pageId,
      recent: [pageId, ...state.recent.filter((id) => id !== pageId)].slice(0, 40),
      commandPaletteOpen: false,
      commandPaletteQuery: "",
    })),
  toggleExpandPage: (pageId) =>
    set((state) => ({
      expandedPageIds: {
        ...state.expandedPageIds,
        [pageId]: !state.expandedPageIds[pageId],
      },
    })),
  setCommandPaletteOpen: (open) => set(() => ({ commandPaletteOpen: open })),
  setCommandPaletteQuery: (query) => set(() => ({ commandPaletteQuery: query })),
  setSelectedBlock: (selectedBlockId) => set(() => ({ selectedBlockId })),
  setShowDeleted: (showDeleted) => set(() => ({ showDeleted })),

  createPage: ({ title = "Untitled", parentId = null, templateId = "" }) =>
    set((state) => {
      const template = state.templates.find((item) => item.id === templateId);
      const pageId = nanoid();
      const timestamp = nowIso();
      const page = {
        id: pageId,
        title: template?.payload?.title || title,
        parentId,
        icon: "📄",
        coverImage: "",
        isDeleted: false,
        isFavorite: false,
        shared: "workspace",
        roles: {},
        createdAt: timestamp,
        updatedAt: timestamp,
      };

      const blocks = (template?.payload?.blocks || [DEFAULT_BLOCK]).map((item) => ({
        id: nanoid(),
        type: item.type || "paragraph",
        text: item.text || "",
        props: item.props || {},
        children: [],
      }));

      return {
        pages: [...state.pages, page],
        activePageId: pageId,
        blocksByPage: { ...state.blocksByPage, [pageId]: blocks },
        recent: [pageId, ...state.recent.filter((id) => id !== pageId)].slice(0, 40),
        expandedPageIds: { ...state.expandedPageIds, [pageId]: true, ...(parentId ? { [parentId]: true } : {}) },
      };
    }),

  updatePage: (pageId, patch) =>
    set((state) => ({
      pages: state.pages.map((page) =>
        page.id === pageId
          ? {
              ...page,
              ...patch,
              updatedAt: nowIso(),
            }
          : page
      ),
    })),

  movePage: (pageId, nextParentId) =>
    set((state) => {
      if (nextParentId === pageId) {
        return {};
      }
      if (isDescendant(state.pages, nextParentId, pageId)) {
        return {};
      }
      return {
        pages: state.pages.map((page) =>
          page.id === pageId ? { ...page, parentId: nextParentId, updatedAt: nowIso() } : page
        ),
      };
    }),

  toggleFavorite: (pageId) =>
    set((state) => {
      const exists = state.favorites.some((item) => item.pageId === pageId && item.userId === state.currentUserId);
      if (exists) {
        return {
          favorites: state.favorites.filter((item) => !(item.pageId === pageId && item.userId === state.currentUserId)),
        };
      }
      return {
        favorites: [...state.favorites, { id: nanoid(), pageId, userId: state.currentUserId }],
      };
    }),

  softDeletePage: (pageId) =>
    set((state) => {
      const deleted = state.pages.find((item) => item.id === pageId);
      if (!deleted) {
        return {};
      }
      const timestamp = nowIso();
      const nextPages = state.pages.map((page) =>
        page.id === pageId ? { ...page, isDeleted: true, updatedAt: timestamp } : page
      );
      const fallbackPage = nextPages.find((page) => !page.isDeleted)?.id || "";
      return {
        pages: nextPages,
        activePageId: state.activePageId === pageId ? fallbackPage : state.activePageId,
        trash: [{ id: nanoid(), pageId, deletedAt: timestamp }, ...state.trash.filter((item) => item.pageId !== pageId)],
      };
    }),

  restorePage: (pageId) =>
    set((state) => ({
      pages: state.pages.map((page) =>
        page.id === pageId ? { ...page, isDeleted: false, updatedAt: nowIso() } : page
      ),
      trash: state.trash.filter((item) => item.pageId !== pageId),
      activePageId: pageId,
    })),

  addBlock: ({ pageId, afterBlockId = "", type = "paragraph" }) =>
    set((state) => {
      const list = [...(state.blocksByPage[pageId] || [])];
      const index = afterBlockId ? list.findIndex((block) => block.id === afterBlockId) : list.length - 1;
      const nextBlock = { id: nanoid(), type, text: "", props: {}, children: [] };
      if (index < 0 || index === list.length - 1) {
        list.push(nextBlock);
      } else {
        list.splice(index + 1, 0, nextBlock);
      }
      return { blocksByPage: { ...state.blocksByPage, [pageId]: list }, selectedBlockId: nextBlock.id };
    }),

  updateBlock: ({ pageId, blockId, patch }) =>
    set((state) => ({
      blocksByPage: {
        ...state.blocksByPage,
        [pageId]: (state.blocksByPage[pageId] || []).map((block) =>
          block.id === blockId
            ? {
                ...block,
                ...patch,
                props: patch.props ? { ...(block.props || {}), ...patch.props } : block.props,
              }
            : block
        ),
      },
    })),

  removeBlock: ({ pageId, blockId }) =>
    set((state) => ({
      blocksByPage: {
        ...state.blocksByPage,
        [pageId]: (state.blocksByPage[pageId] || []).filter((block) => block.id !== blockId),
      },
    })),

  reorderBlocks: ({ pageId, orderedIds }) =>
    set((state) => {
      const map = new Map((state.blocksByPage[pageId] || []).map((block) => [block.id, block]));
      return {
        blocksByPage: {
          ...state.blocksByPage,
          [pageId]: orderedIds.map((id) => map.get(id)).filter(Boolean),
        },
      };
    }),

  updateDatabaseInBlock: ({ pageId, blockId, updater }) =>
    set((state) => ({
      blocksByPage: {
        ...state.blocksByPage,
        [pageId]: (state.blocksByPage[pageId] || []).map((block) => {
          if (block.id !== blockId || block.type !== "database") {
            return block;
          }
          return {
            ...block,
            props: updater(block.props || {}),
          };
        }),
      },
    })),

  createThread: ({ pageId, blockId, content }) =>
    set((state) => {
      const threadId = nanoid();
      const commentId = nanoid();
      const timestamp = nowIso();
      return {
        commentThreads: [
          ...state.commentThreads,
          {
            id: threadId,
            pageId,
            blockId,
            resolved: false,
            createdAt: timestamp,
          },
        ],
        comments: [
          ...state.comments,
          {
            id: commentId,
            threadId,
            authorId: state.currentUserId,
            content,
            createdAt: timestamp,
          },
        ],
      };
    }),

  replyThread: ({ threadId, content }) =>
    set((state) => ({
      comments: [
        ...state.comments,
        {
          id: nanoid(),
          threadId,
          authorId: state.currentUserId,
          content,
          createdAt: nowIso(),
        },
      ],
    })),

  toggleThreadResolved: (threadId) =>
    set((state) => ({
      commentThreads: state.commentThreads.map((thread) =>
        thread.id === threadId ? { ...thread, resolved: !thread.resolved } : thread
      ),
    })),

  setPresence: ({ clientId, pageId, userId, name, color, updatedAt }) =>
    set((state) => ({
      presence: {
        ...state.presence,
        [clientId]: { pageId, userId, name, color, updatedAt },
      },
    })),

  prunePresence: (maxAgeMs = 13000) =>
    set((state) => {
      const now = Date.now();
      const next = {};
      Object.entries(state.presence).forEach(([key, value]) => {
        if (now - value.updatedAt <= maxAgeMs) {
          next[key] = value;
        }
      });
      return { presence: next };
    }),

  setTyping: ({ pageId, blockId, userName }) =>
    set((state) => ({
      typing: {
        ...state.typing,
        [pageId]: {
          ...(state.typing[pageId] || {}),
          [blockId]: { userName, updatedAt: Date.now() },
        },
      },
    })),

  pruneTyping: (maxAgeMs = 3000) =>
    set((state) => {
      const now = Date.now();
      const nextTyping = {};
      Object.entries(state.typing).forEach(([pageId, entry]) => {
        const nextEntry = {};
        Object.entries(entry).forEach(([blockId, info]) => {
          if (now - info.updatedAt <= maxAgeMs) {
            nextEntry[blockId] = info;
          }
        });
        if (Object.keys(nextEntry).length) {
          nextTyping[pageId] = nextEntry;
        }
      });
      return { typing: nextTyping };
    }),

  applyRemoteState: (state) =>
    set((local) => {
      const localUpdatedAt = new Date(local.meta?.updatedAt || 0).getTime();
      const remoteUpdatedAt = new Date(state.meta?.updatedAt || 0).getTime();
      if (Number.isNaN(remoteUpdatedAt) || remoteUpdatedAt <= localUpdatedAt) {
        return {};
      }
      return {
        meta: state.meta || {},
        users: safeArray(state.users),
        pages: safeArray(state.pages),
        blocksByPage: state.blocksByPage || {},
        commentThreads: safeArray(state.commentThreads),
        comments: safeArray(state.comments),
        templates: safeArray(state.templates),
        favorites: safeArray(state.favorites),
        recent: safeArray(state.recent),
        sharedLinks: safeArray(state.sharedLinks),
        activities: safeArray(state.activities),
        trash: safeArray(state.trash),
      };
    }),

  toSerializableState: () => {
    const state = get();
    return {
      meta: state.meta,
      users: state.users,
      pages: state.pages,
      blocksByPage: state.blocksByPage,
      commentThreads: state.commentThreads,
      comments: state.comments,
      templates: state.templates,
      favorites: state.favorites,
      recent: state.recent,
      sharedLinks: state.sharedLinks,
      versions: [],
      activities: state.activities,
      trash: state.trash,
    };
  },

  setVersionsForPage: (pageId, versions) =>
    set((state) => ({
      versionsByPage: {
        ...state.versionsByPage,
        [pageId]: versions,
      },
    })),

  incrementPendingSaves: () => set((state) => ({ pendingSaves: state.pendingSaves + 1 })),
  decrementPendingSaves: () =>
    set((state) => ({ pendingSaves: Math.max(0, state.pendingSaves - 1), lastSavedAt: nowIso() })),
}));

