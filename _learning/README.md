> Historical: describes the pre-2026-09 implementation; the current course is in `astraupskill/`.

# Learning documentation entry point

The current detailed course is [astraupskill/README.md](../astraupskill/README.md). It covers the implemented request path, SQLite transactions, revision checks, draft recovery, conflict review, typed record CRUD, worked changes, tests and progressively harder exercises.

The other documents in this folder describe the original project. They remain useful for a before/after code review, but they are marked historical because the save lifecycle, API authorization, repository and database controls have changed. Exact original text is preserved in `docs/original`, including the original package and source files. Follow the comparison links at the top of each historical guide.

Start by tracing one accepted page rename in the current application, then compare the earlier autosave effect with the new session controller. Explain why a finished HTTP request does not necessarily mean the server accepted the latest draft. Use the current verification guide for evidence and limitations; do not treat original architecture descriptions as tested guarantees.
