"use client";
import { create } from "zustand";
import { applyMutation, documentFrom } from "./workspaceMutations.mjs";

const emptyDocument = () => ({
  meta: {},
  users: [],
  pages: [],
  blocksByPage: {},
  commentThreads: [],
  comments: [],
  templates: [],
  favorites: [],
  recent: [],
  sharedLinks: [],
  versions: [],
  activities: [],
  trash: [],
});
export const useWorkspaceStore = create((set, get) => {
  const apply = (action, input) =>
    set((local) => {
      try {
        const { state, result } = applyMutation(
          documentFrom(local),
          action,
          input,
          local.currentUserId,
        );
        const valid = state.pages.some(
          (page) => page.id === local.activePageId && !page.isDeleted,
        );
        const activePageId =
          result?.pageId ??
          (valid
            ? local.activePageId
            : (state.pages.find((page) => !page.isDeleted)?.id ?? ""));
        return {
          ...state,
          error: "",
          activePageId,
          selectedBlockId: result?.blockId ?? local.selectedBlockId,
          expandedPageIds: {
            ...local.expandedPageIds,
            ...(result?.pageId ? { [result.pageId]: true } : {}),
            ...(input?.parentId ? { [input.parentId]: true } : {}),
          },
        };
      } catch (error) {
        return { error: error.message };
      }
    });
  const replace = (state, preserveActive = true) =>
    set((local) => {
      const document = structuredClone(state),
        first = document.pages.find((page) => !page.isDeleted)?.id ?? "";
      return {
        ...document,
        workspaceId: document.meta.workspaceId,
        currentUserId: document.meta.ownerId,
        loaded: true,
        loading: false,
        error: "",
        activePageId:
          preserveActive &&
          document.pages.some(
            (page) => page.id === local.activePageId && !page.isDeleted,
          )
            ? local.activePageId
            : first,
        expandedPageIds: {
          ...Object.fromEntries(
            document.pages
              .filter((page) => page.parentId === null)
              .map((page) => [page.id, true]),
          ),
          ...local.expandedPageIds,
        },
      };
    });
  return {
    ...emptyDocument(),
    workspaceId: "workspace-default",
    currentUserId: "user-owner",
    loaded: false,
    loading: false,
    error: "",
    activePageId: "",
    selectedBlockId: "",
    expandedPageIds: {},
    presence: {},
    typing: {},
    versionsByPage: {},
    commandPaletteOpen: false,
    commandPaletteQuery: "",
    showDeleted: false,
    reset: () =>
      set({
        ...emptyDocument(),
        loaded: false,
        loading: false,
        error: "",
        activePageId: "",
        selectedBlockId: "",
        presence: {},
        typing: {},
        versionsByPage: {},
        expandedPageIds: {},
        commandPaletteOpen: false,
        commandPaletteQuery: "",
        showDeleted: false,
      }),
    hydrateWorkspace: (_workspaceId, state) => replace(state, false),
    replaceDocument: (state) => replace(state, true),
    setLoading: (loading) => set({ loading }),
    setError: (error) => set({ error }),
    setActivePage: (pageId) =>
      set((local) =>
        local.pages.some((page) => page.id === pageId && !page.isDeleted)
          ? {
              activePageId: pageId,
              recent: [
                pageId,
                ...local.recent.filter((id) => id !== pageId),
              ].slice(0, 40),
              commandPaletteOpen: false,
              commandPaletteQuery: "",
            }
          : { error: "Active page not found" },
      ),
    toggleExpandPage: (pageId) =>
      set((local) => ({
        expandedPageIds: {
          ...local.expandedPageIds,
          [pageId]: !local.expandedPageIds[pageId],
        },
      })),
    setCommandPaletteOpen: (commandPaletteOpen) => set({ commandPaletteOpen }),
    setCommandPaletteQuery: (commandPaletteQuery) =>
      set({ commandPaletteQuery }),
    setSelectedBlock: (selectedBlockId) => set({ selectedBlockId }),
    setShowDeleted: (showDeleted) => set({ showDeleted }),
    createPage: (input) => apply("createPage", input),
    updatePage: (pageId, patch) => apply("updatePage", { pageId, patch }),
    movePage: (pageId, parentId) => apply("movePage", { pageId, parentId }),
    toggleFavorite: (pageId) => apply("toggleFavorite", { pageId }),
    softDeletePage: (pageId) => apply("trashPage", { pageId }),
    restorePage: (pageId) => apply("restorePage", { pageId }),
    addBlock: (input) => apply("addBlock", input),
    updateBlock: (input) => apply("updateBlock", input),
    removeBlock: (input) => apply("removeBlock", input),
    reorderBlocks: (input) => apply("reorderBlocks", input),
    createThread: (input) => apply("createThread", input),
    replyThread: (input) => apply("replyThread", input),
    toggleThreadResolved: (threadId) =>
      apply("toggleThreadResolved", { threadId }),
    removeThread: (threadId) => apply("removeThread", { threadId }),
    editComment: (input) => apply("editComment", input),
    removeComment: (commentId) => apply("removeComment", { commentId }),
    toSerializableState: () => structuredClone(documentFrom(get())),
    setVersionsForPage: (pageId, versions) =>
      set((local) => ({
        versionsByPage: { ...local.versionsByPage, [pageId]: versions },
      })),
    setPresence: (input) =>
      set((local) => {
        if (
          !input ||
          typeof input.clientId !== "string" ||
          !/^[a-zA-Z0-9_-]{1,100}$/.test(input.clientId) ||
          ["__proto__", "constructor", "prototype"].includes(input.clientId) ||
          !local.pages.some((page) => page.id === input.pageId) ||
          !local.users.some((user) => user.id === input.userId) ||
          typeof input.name !== "string" ||
          input.name.length > 100 ||
          !/^#[a-fA-F0-9]{6}$/.test(input.color)
        )
          return {};
        const entries = Object.entries({
          ...local.presence,
          [input.clientId]: {
            pageId: input.pageId,
            userId: input.userId,
            name: input.name,
            color: input.color,
            updatedAt: Date.now(),
          },
        })
          .sort((a, b) => b[1].updatedAt - a[1].updatedAt)
          .slice(0, 64);
        return { presence: Object.fromEntries(entries) };
      }),
    prunePresence: (maxAgeMs = 13000) =>
      set((local) => ({
        presence: Object.fromEntries(
          Object.entries(local.presence).filter(
            ([, value]) => Date.now() - value.updatedAt <= maxAgeMs,
          ),
        ),
      })),
    setTyping: (input) =>
      set((local) => {
        if (
          !input ||
          typeof input.pageId !== "string" ||
          !Object.hasOwn(local.blocksByPage, input.pageId) ||
          !Array.isArray(local.blocksByPage[input.pageId]) ||
          !local.blocksByPage[input.pageId].some(
            (block) => block.id === input.blockId,
          ) ||
          typeof input.userName !== "string" ||
          input.userName.length > 100
        )
          return {};
        return {
          typing: {
            ...local.typing,
            [input.pageId]: {
              ...(local.typing[input.pageId] ?? {}),
              [input.blockId]: {
                userName: input.userName,
                updatedAt: Date.now(),
              },
            },
          },
        };
      }),
    pruneTyping: (maxAgeMs = 3000) =>
      set((local) => ({
        typing: Object.fromEntries(
          Object.entries(local.typing)
            .map(([pageId, entries]) => [
              pageId,
              Object.fromEntries(
                Object.entries(entries).filter(
                  ([, value]) => Date.now() - value.updatedAt <= maxAgeMs,
                ),
              ),
            ])
            .filter(([, entries]) => Object.keys(entries).length),
        ),
      })),
  };
});
