import { validateWorkspace, fail } from "./workspaceSchema.mjs";
import { mergeWorkspace } from "./mergeWorkspace.mjs";
const copy = (value) => structuredClone(value);
function contentKey(state) {
  const value = copy(state);
  value.activities = [];
  if (value.meta) delete value.meta.updatedAt;
  return JSON.stringify(value);
}
function checkSnapshot(value) {
  if (
    !value ||
    !/^[a-f0-9]{64}$/.test(value.revision) ||
    !/^[a-f0-9]{24}$/.test(value.instanceId)
  )
    throw fail("Server returned an invalid workspace snapshot", 502);
  validateWorkspace(value.state);
  return copy(value);
}

export class WorkspaceSession {
  constructor({ load, save, persist = async () => {}, onDocument = () => {} }) {
    this.loadRemote = load;
    this.saveRemote = save;
    this.persist = persist;
    this.onDocument = onDocument;
    this.accepted = null;
    this.draft = null;
    this.generation = 0;
    this.busy = false;
    this.phase = "signed-out";
    this.message = "";
    this.warning = "";
    this.needsReview = false;
    this.review = null;
    this.closed = false;
    this.listeners = new Set();
    this.current = {
      phase: this.phase,
      dirty: false,
      busy: false,
      needsReview: false,
      review: null,
    };
  }
  subscribe = (listener) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };
  getSnapshot = () => this.current;
  dirty() {
    return Boolean(
      this.accepted &&
        this.draft &&
        contentKey(this.accepted.state) !== contentKey(this.draft),
    );
  }
  notify() {
    if (this.closed) return;
    this.current = {
      phase: this.phase,
      busy: this.busy,
      dirty: this.dirty(),
      needsReview: this.needsReview,
      message: this.message,
      warning: this.warning,
      review: this.review,
      revision: this.accepted?.revision,
      instanceId: this.accepted?.instanceId,
    };
    for (const listener of this.listeners) listener();
  }
  start(snapshot) {
    this.accepted = checkSnapshot(snapshot);
    this.draft = copy(this.accepted.state);
    this.phase = "ready";
    this.message = "Accepted workspace loaded.";
    this.onDocument(copy(this.draft));
    this.notify();
  }
  async retain() {
    const data =
      this.dirty() || this.needsReview
        ? {
            base: copy(this.accepted),
            state: copy(this.draft),
            needsReview: this.needsReview,
            updatedAt: Date.now(),
          }
        : null;
    try {
      await this.persist(data);
      if (!this.closed && this.warning) {
        this.warning = "";
        this.notify();
      }
    } catch {
      if (!this.closed) {
        this.warning =
          "The local draft could not be stored. Keep this tab open or download your draft.";
        this.notify();
      }
    }
  }
  edit(document) {
    if (
      this.closed ||
      !this.accepted ||
      contentKey(document) === contentKey(this.draft)
    )
      return false;
    this.draft = copy(document);
    this.generation++;
    this.review = null;
    if (!this.needsReview && !this.busy) {
      this.phase = "dirty";
      this.message = "Unsaved draft.";
    }
    this.notify();
    return true;
  }
  async save() {
    if (this.closed || !this.accepted || this.busy || this.needsReview)
      return false;
    if (!this.dirty()) {
      this.phase = "saved";
      this.message = "Saved and accepted.";
      this.notify();
      await this.retain();
      return true;
    }
    try {
      validateWorkspace(this.draft);
    } catch (error) {
      this.phase = "invalid";
      this.message = error.message;
      this.notify();
      await this.retain();
      return false;
    }
    const generation = this.generation,
      sent = copy(this.draft),
      revision = this.accepted.revision;
    this.busy = true;
    this.phase = "saving";
    this.message = "Saving draft…";
    this.notify();
    try {
      const response = checkSnapshot(
        await this.saveRemote({ state: sent, revision }),
      );
      if (this.closed) return false;
      if (response.instanceId !== this.accepted.instanceId)
        throw fail(
          "The server workspace changed. Download your draft and sign in again",
          409,
        );
      this.accepted = response;
      if (generation === this.generation) this.draft = copy(response.state);
      else {
        this.draft.meta.updatedAt = response.state.meta.updatedAt;
        this.draft.activities = copy(response.state.activities);
        this.draft.users = copy(response.state.users);
      }
      this.phase = this.dirty() ? "dirty" : "saved";
      this.message = this.dirty()
        ? "Earlier edits saved. Newer edits remain unsaved."
        : "Saved and accepted.";
      this.onDocument(copy(this.draft));
      return true;
    } catch (error) {
      if (this.closed) return false;
      this.needsReview =
        error.status === 409 ||
        error.status === 401 ||
        !error.status ||
        error.status >= 500 ||
        error.uncertain === true;
      this.phase = this.needsReview ? "review-required" : "invalid";
      this.message = this.needsReview
        ? "This save needs review. It may have been accepted; your draft is retained. " +
          error.message
        : error.message;
      return false;
    } finally {
      if (!this.closed) {
        this.busy = false;
        this.notify();
        await this.retain();
      }
    }
  }
  async reviewLatest() {
    if (this.closed || this.busy) return false;
    this.busy = true;
    this.phase = "reviewing";
    this.message = "Loading accepted state; keeping your draft.";
    this.notify();
    try {
      const latest = checkSnapshot(await this.loadRemote());
      if (this.closed) return false;
      if (latest.instanceId !== this.accepted.instanceId)
        throw fail(
          "This is a different workspace. Download the draft and sign in again",
          409,
        );
      const base = copy(this.accepted),
        local = copy(this.draft);
      this.review = {
        base,
        local,
        latest,
        result: mergeWorkspace(base.state, local, latest.state),
      };
      this.needsReview = true;
      this.phase = "review";
      this.message =
        "Compare accepted changes and choose how to resolve conflicts. Nothing has been submitted.";
      return true;
    } catch (error) {
      if (!this.closed) {
        this.phase = "review-required";
        this.needsReview = true;
        this.message = error.message;
      }
      return false;
    } finally {
      if (!this.closed) {
        this.busy = false;
        this.notify();
      }
    }
  }
  previewReview(choices = {}) {
    if (!this.review)
      throw fail("Load the latest state before resolving a draft");
    return mergeWorkspace(
      this.review.base.state,
      this.review.local,
      this.review.latest.state,
      choices,
    );
  }
  acceptReview(choices = {}) {
    if (this.closed || this.busy || !this.review) return false;
    const result = this.previewReview(choices);
    if (!result.ready) {
      this.message =
        result.validationError ||
        "Choose a value for every conflicting change.";
      this.notify();
      return false;
    }
    this.accepted = copy(this.review.latest);
    this.draft = copy(result.state);
    this.generation++;
    this.review = null;
    this.needsReview = false;
    this.phase = this.dirty() ? "dirty" : "ready";
    this.message = this.dirty()
      ? "Reviewed draft retained. Save it when ready."
      : "The accepted workspace already contains these changes.";
    this.onDocument(copy(this.draft));
    this.notify();
    void this.retain();
    return true;
  }
  async reloadAccepted() {
    if (this.closed || this.busy) return false;
    const generation = this.generation;
    this.busy = true;
    this.phase = "reloading";
    this.notify();
    try {
      const latest = checkSnapshot(await this.loadRemote());
      if (this.closed) return false;
      if (latest.instanceId !== this.accepted.instanceId)
        throw fail(
          "Different workspace; download this draft and sign in again",
          409,
        );
      if (generation !== this.generation)
        throw fail(
          "The draft changed while reloading. Review it instead of discarding it",
          409,
        );
      this.accepted = latest;
      this.draft = copy(latest.state);
      this.review = null;
      this.needsReview = false;
      this.phase = "ready";
      this.message =
        "Accepted state loaded; the previous local draft was discarded.";
      this.onDocument(copy(this.draft));
      return true;
    } catch (error) {
      if (!this.closed) {
        this.message = error.message;
        this.phase = "review-required";
        this.needsReview = true;
      }
      return false;
    } finally {
      if (!this.closed) {
        this.busy = false;
        this.notify();
        await this.retain();
      }
    }
  }
  recover(data) {
    if (this.closed || this.busy || !data?.base || !data.state) return false;
    const base = checkSnapshot(data.base);
    if (base.instanceId !== this.accepted.instanceId)
      throw fail("Saved draft belongs to another workspace");
    // Allow incomplete title/cover input, but never render an arbitrary IDB object.
    const shape = copy(data.state);
    if (Array.isArray(shape.pages))
      for (const page of shape.pages) {
        if (page.title === "") page.title = "Incomplete title";
        if (
          typeof page.coverImage === "string" &&
          page.coverImage.length <= 2048
        )
          page.coverImage = "";
      }
    validateWorkspace(shape);
    const result = mergeWorkspace(base.state, data.state, this.accepted.state);
    this.draft = copy(data.state);
    this.generation++;
    this.review = {
      base,
      local: copy(this.draft),
      latest: copy(this.accepted),
      result,
    };
    this.needsReview = true;
    this.phase = "review";
    this.message =
      "Recovered local draft for review. It has not been submitted.";
    this.onDocument(copy(this.draft));
    this.notify();
    return true;
  }
  async operation(run) {
    if (this.closed || this.busy || this.needsReview) return null;
    if (this.dirty() && !(await this.save())) return null;
    // Typing during the preceding save must not be overwritten by import/restore.
    if (this.dirty()) {
      this.message = "Save the newer edits before this operation.";
      this.notify();
      return null;
    }
    const generation = this.generation;
    this.busy = true;
    this.phase = "operation";
    this.message = "Applying requested operation…";
    this.notify();
    try {
      const result = await run(this.accepted.revision);
      if (this.closed) return null;
      const latest = checkSnapshot(
        result?.state ? result : await this.loadRemote(),
      );
      if (this.closed) return null;
      if (latest.instanceId !== this.accepted.instanceId)
        throw fail("The workspace identity changed", 409);
      if (generation !== this.generation)
        throw fail(
          "Edits arrived while the operation was running. Review the accepted result with your retained draft",
          409,
        );
      this.accepted = latest;
      this.draft = copy(latest.state);
      this.phase = "saved";
      this.message = "Operation accepted.";
      this.onDocument(copy(this.draft));
      return result;
    } catch (error) {
      if (!this.closed) {
        this.needsReview = true;
        this.phase = "review-required";
        this.message =
          "The operation needs review before retrying. " + error.message;
      }
      return null;
    } finally {
      if (!this.closed) {
        this.busy = false;
        this.notify();
        await this.retain();
      }
    }
  }
  close() {
    this.closed = true;
    this.listeners.clear();
    this.accepted = null;
    this.draft = null;
    this.review = null;
  }
}
