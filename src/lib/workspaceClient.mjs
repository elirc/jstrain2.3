export function createWorkspaceClient(
  token,
  { fetcher = globalThis.fetch, timeoutMs = 15000 } = {},
) {
  return async function request(
    path,
    { method = "GET", body, revision, signal, blob = false } = {},
  ) {
    const controller = new AbortController();
    const abort = () => controller.abort();
    if (signal?.aborted) abort();
    signal?.addEventListener("abort", abort, { once: true });
    const timer = setTimeout(abort, timeoutMs);
    try {
      const headers = { Authorization: "Bearer " + token };
      if (body !== undefined) headers["Content-Type"] = "application/json";
      if (revision) headers["If-Match"] = '"' + revision + '"';
      const response = await fetcher(path, {
        method,
        headers,
        body: body === undefined ? undefined : JSON.stringify(body),
        signal: controller.signal,
        cache: "no-store",
        credentials: "omit",
      });
      if (!response.ok) {
        const value = await response.json().catch(() => ({}));
        throw Object.assign(
          new Error(value.error || "Request failed (" + response.status + ")"),
          { status: response.status },
        );
      }
      return blob ? await response.blob() : await response.json();
    } catch (error) {
      if (!error.status && method !== "GET") error.uncertain = true;
      if (error.name === "AbortError")
        throw Object.assign(new Error("Request interrupted or timed out"), {
          uncertain: method !== "GET",
        });
      throw error;
    } finally {
      clearTimeout(timer);
      signal?.removeEventListener("abort", abort);
    }
  };
}

export function downloadFile(value, filename, type = "application/json") {
  const blob =
    value instanceof Blob
      ? value
      : new Blob(
          [typeof value === "string" ? value : JSON.stringify(value, null, 2)],
          { type },
        );
  const url = URL.createObjectURL(blob),
    link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
