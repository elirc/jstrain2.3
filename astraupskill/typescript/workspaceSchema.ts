// Exercise 7 starter: a typed view of the workspace document validated by src/lib/workspaceSchema.mjs.
// Convert the runtime validators to these types one at a time; every existing runtime test must keep passing.

export type PropertyType = "text" | "number" | "select" | "checkbox" | "date" | "relation";

export type Property =
  | { id: string; name: string; type: "text" }
  | { id: string; name: string; type: "number"; precision?: number }
  | { id: string; name: string; type: "select"; options: string[] }
  | { id: string; name: string; type: "checkbox" }
  | { id: string; name: string; type: "date" }
  | { id: string; name: string; type: "relation"; databaseId: string };

export interface RecordRow {
  id: string;
  cells: Record<string, unknown>; // exercise: narrow per property type with a discriminated lookup
}

export interface Database {
  id: string;
  name: string;
  properties: Property[];
  rows: RecordRow[];
  views: View[];
}

export interface View {
  id: string;
  name: string;
  filter?: unknown; // exercise: type the filter expression
  groupBy?: string;
}

export interface WorkspaceDocument {
  id: string;
  ownerId: string;
  revision: number;
  databases: Database[];
  blocks: unknown[]; // exercise: BLOCK_TYPES from workspaceSchema.mjs becomes a union here
}
