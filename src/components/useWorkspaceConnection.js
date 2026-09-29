"use client";
import { useEffect, useRef, useState } from "react";
import { WorkspaceSession } from "@/lib/workspaceSession.mjs";
import {
  createDraftWriter,
  readDraft,
  removeSavedDraft,
} from "@/lib/offlineStore";
import { useWorkspaceStore } from "@/lib/workspaceStore";

export function useWorkspaceConnection(connection) {
  const sessionRef = useRef(null),
    timerRef = useRef(null);
  const [status, setStatus] = useState({
    phase: "loading",
    busy: true,
    dirty: false,
    needsReview: false,
  });
  const [recovery, setRecovery] = useState(null),
    [localReady, setLocalReady] = useState(false),
    [remoteNotice, setRemoteNotice] = useState(false);
  useEffect(() => {
    let active = true,
      reflecting = false;
    const channel =
      typeof BroadcastChannel === "undefined"
        ? null
        : new BroadcastChannel(
            "knowledge-workspace:" + connection.snapshot.instanceId,
          );
    const session = new WorkspaceSession({
      load: () => connection.api("/api/workspace"),
      save: ({ state, revision }) =>
        connection.api("/api/workspace", {
          method: "PUT",
          body: { state },
          revision,
        }),
      persist: createDraftWriter(connection.snapshot.instanceId),
      onDocument: (document) => {
        reflecting = true;
        useWorkspaceStore.getState().replaceDocument(document);
        reflecting = false;
      },
    });
    sessionRef.current = session;
    let previousRevision = connection.snapshot.revision;
    const unsubscribeSession = session.subscribe(() => {
      if (!active) return;
      setStatus(session.getSnapshot());
      if (previousRevision !== session.accepted?.revision) {
        previousRevision = session.accepted?.revision;
        channel?.postMessage({ type: "revision", revision: previousRevision });
      }
    });
    session.start(connection.snapshot);
    async function autosave() {
      await session.save();
      if (active && session.getSnapshot().phase === "dirty")
        timerRef.current = setTimeout(autosave, 650);
    }
    const unsubscribeStore = useWorkspaceStore.subscribe(() => {
      if (!active || reflecting) return;
      if (session.edit(useWorkspaceStore.getState().toSerializableState())) {
        void session.retain();
        clearTimeout(timerRef.current);
        timerRef.current = setTimeout(autosave, 650);
      }
    });
    readDraft(connection.snapshot.instanceId)
      .then((value) => {
        if (active) {
          setRecovery(value ?? null);
          setLocalReady(true);
        }
      })
      .catch(() => {
        if (active) {
          setLocalReady(true);
          useWorkspaceStore
            .getState()
            .setError(
              "Local drafts could not be read. Keep unsaved work in this tab or download it.",
            );
        }
      });
    if (channel)
      channel.onmessage = (event) => {
        const data = event.data;
        if (
          data?.type === "revision" &&
          /^[a-f0-9]{64}$/.test(data.revision) &&
          data.revision !== session.accepted?.revision
        )
          setRemoteNotice(true);
      };
    const beforeUnload = (event) => {
      if (session.dirty() || session.busy || session.needsReview) {
        event.preventDefault();
        event.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", beforeUnload);
    return () => {
      active = false;
      unsubscribeStore();
      unsubscribeSession();
      clearTimeout(timerRef.current);
      channel?.close();
      window.removeEventListener("beforeunload", beforeUnload);
      session.close();
    };
  }, [connection]);
  const review = async () => {
    clearTimeout(timerRef.current);
    setRemoteNotice(false);
    await sessionRef.current?.reviewLatest();
  };
  const recover = async () => {
    try {
      sessionRef.current.recover(recovery);
      await sessionRef.current.retain();
      if (!sessionRef.current.getSnapshot().warning)
        await removeSavedDraft(
          connection.snapshot.instanceId,
          recovery.draftKey,
        );
      setRecovery(null);
    } catch (error) {
      useWorkspaceStore
        .getState()
        .setError(
          "Draft recovery failed: " +
            error.message +
            ". Download the saved draft before discarding it.",
        );
    }
  };
  const discardRecovery = async () => {
    try {
      await removeSavedDraft(connection.snapshot.instanceId, recovery.draftKey);
      setRecovery(await readDraft(connection.snapshot.instanceId));
    } catch (error) {
      useWorkspaceStore.getState().setError(error.message);
    }
  };
  return {
    session: sessionRef,
    status,
    review,
    recovery,
    recover,
    discardRecovery,
    localReady,
    remoteNotice,
  };
}
