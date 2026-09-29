// A new database leaves the original unversioned offline queue intact.
const NAME = "knowledge-workspace-drafts-v2",
  STORE = "drafts";
function openDb() {
  return new Promise((resolve, reject) => {
    if (!globalThis.indexedDB) {
      reject(new Error("IndexedDB unavailable"));
      return;
    }
    const request = indexedDB.open(NAME, 1);
    request.onupgradeneeded = () => request.result.createObjectStore(STORE);
    request.onerror = () => reject(request.error);
    request.onblocked = () =>
      reject(new Error("Draft database upgrade blocked by another tab"));
    request.onsuccess = () => resolve(request.result);
  });
}
async function transaction(mode, work) {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    let tx, value;
    const finish = (error) => {
      db.close();
      error ? reject(error) : resolve(value);
    };
    try {
      tx = db.transaction(STORE, mode);
      const request = work(tx.objectStore(STORE));
      request.onsuccess = () => {
        value = request.result;
      };
    } catch (error) {
      finish(error);
      return;
    }
    tx.oncomplete = () => finish();
    tx.onerror = () =>
      finish(tx.error || new Error("Draft transaction failed"));
    tx.onabort = () =>
      finish(tx.error || new Error("Draft transaction aborted"));
  });
}
function key(instanceId) {
  if (!/^[a-f0-9]{24}$/.test(instanceId))
    throw new Error("Invalid draft scope");
  return "workspace-default:" + instanceId;
}
export async function readDraft(instanceId) {
  const prefix = key(instanceId),
    db = await openDb();
  return new Promise((resolve, reject) => {
    const entries = [],
      tx = db.transaction(STORE, "readonly");
    const request = tx
      .objectStore(STORE)
      .openCursor(IDBKeyRange.bound(prefix, prefix + "\uffff"));
    request.onsuccess = () => {
      const cursor = request.result;
      if (!cursor) return;
      if (cursor.key === prefix || cursor.key.startsWith(prefix + ":"))
        entries.push({ key: cursor.key, value: cursor.value });
      if (entries.length > 1000) {
        tx.abort();
        return;
      }
      cursor.continue();
    };
    tx.oncomplete = () => {
      db.close();
      entries.sort(
        (a, b) => (b.value.updatedAt ?? 0) - (a.value.updatedAt ?? 0),
      );
      const first = entries[0];
      resolve(
        first
          ? {
              ...first.value,
              draftKey: first.key,
              otherDrafts: entries.length - 1,
            }
          : null,
      );
    };
    tx.onerror = tx.onabort = () => {
      db.close();
      reject(tx.error || new Error("Local draft read aborted"));
    };
  });
}
export function createDraftWriter(instanceId) {
  // Every editing session owns a separate key. A clean tab cannot erase another
  // tab's draft. After reload, saved sessions are offered one at a time.
  const scope = key(instanceId) + ":" + crypto.randomUUID();
  let tail = Promise.resolve();
  // Capture bytes now and preserve call order, including clears after acceptance.
  return (value) => {
    const captured = value === null ? null : structuredClone(value);
    const write = () =>
      transaction("readwrite", (store) =>
        captured === null ? store.delete(scope) : store.put(captured, scope),
      );
    const result = tail.then(write, write);
    tail = result.catch(() => {});
    return result;
  };
}
export async function removeSavedDraft(instanceId, draftKey) {
  const prefix = key(instanceId);
  if (
    typeof draftKey !== "string" ||
    (draftKey !== prefix && !draftKey.startsWith(prefix + ":"))
  )
    throw new Error("Draft does not belong to this workspace");
  return transaction("readwrite", (store) => store.delete(draftKey));
}
export async function readLegacyDrafts() {
  if (!globalThis.indexedDB) return null;
  // Do not create or mutate the legacy database just to look for it.
  if (!indexedDB.databases)
    return {
      notice:
        "This browser cannot enumerate legacy databases. Use DevTools > Application > IndexedDB to export notion-clone-offline if needed.",
    };
  const databases = await indexedDB.databases();
  if (!databases.some((item) => item.name === "notion-clone-offline"))
    return null;
  const db = await new Promise((resolve, reject) => {
    const request = indexedDB.open("notion-clone-offline");
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
  return new Promise((resolve, reject) => {
    const names = ["drafts", "syncQueue"].filter((name) =>
      db.objectStoreNames.contains(name),
    );
    if (!names.length) {
      db.close();
      resolve(null);
      return;
    }
    const tx = db.transaction(names, "readonly"),
      data = {};
    for (const name of names) {
      const req = tx.objectStore(name).getAll();
      req.onsuccess = () => {
        data[name] = req.result;
      };
    }
    tx.oncomplete = () => {
      db.close();
      resolve(data);
    };
    tx.onabort = tx.onerror = () => {
      db.close();
      reject(tx.error || new Error("Legacy draft read failed"));
    };
  });
}
