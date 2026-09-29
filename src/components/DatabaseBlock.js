"use client";
import { useState } from "react";
import { nanoid } from "nanoid";
import {
  cellValue,
  removeProperty,
  visibleRows,
  rowGroups,
} from "@/lib/databaseModel.mjs";

export default function DatabaseBlock({ block, pageId, onUpdate }) {
  const data = block.props,
    view = data.views.find((item) => item.id === data.activeViewId),
    properties = data.properties;
  const [error, setError] = useState(""),
    [propertyName, setPropertyName] = useState(""),
    [propertyType, setPropertyType] = useState("text"),
    [options, setOptions] = useState("Todo, Doing, Done");
  const [filterField, setFilterField] = useState(""),
    [filterOperator, setFilterOperator] = useState("contains"),
    [filterValue, setFilterValue] = useState("");
  const rows = visibleRows(data, view),
    display = properties.filter(
      (prop) =>
        !view.visibleProperties || view.visibleProperties.includes(prop.id),
    );
  function update(next) {
    setError("");
    onUpdate({ pageId, blockId: block.id, patch: { props: next } });
  }
  function changeView(patch) {
    update({
      ...data,
      views: data.views.map((item) =>
        item.id === view.id ? { ...item, ...patch } : item,
      ),
    });
  }
  function setCell(rowId, property, value) {
    try {
      const typed = cellValue(property, value);
      update({
        ...data,
        rows: data.rows.map((row) =>
          row.id === rowId
            ? { ...row, values: { ...row.values, [property.id]: typed } }
            : row,
        ),
      });
    } catch (error) {
      setError(error.message);
    }
  }
  function addRow(template) {
    const defaults = Object.fromEntries(
      properties.map((prop) => [
        prop.id,
        prop.type === "checkbox" ? false : "",
      ]),
    );
    update({
      ...data,
      rows: [
        ...data.rows,
        { id: nanoid(), values: { ...defaults, ...(template?.values ?? {}) } },
      ],
    });
  }
  function addProperty(event) {
    event.preventDefault();
    const name = propertyName.trim();
    if (!name) return;
    const id = nanoid(),
      property = { id, name, type: propertyType };
    if (propertyType === "select") {
      property.options = [
        ...new Set(
          options
            .split(",")
            .map((value) => value.trim())
            .filter(Boolean),
        ),
      ];
      if (!property.options.length) {
        setError("Enter select options");
        return;
      }
    }
    update({
      ...data,
      properties: [...properties, property],
      rows: data.rows.map((row) => ({
        ...row,
        values: {
          ...row.values,
          [id]: propertyType === "checkbox" ? false : "",
        },
      })),
      views: data.views.map((item) => ({
        ...item,
        visibleProperties: [
          ...(item.visibleProperties ?? properties.map((prop) => prop.id)),
          id,
        ],
      })),
    });
    setPropertyName("");
  }
  function deleteProperty(prop) {
    if (
      !window.confirm(
        "Delete " + prop.name + " and its values from every row and template?",
      )
    )
      return;
    try {
      update(removeProperty(data, prop.id));
    } catch (error) {
      setError(error.message);
    }
  }
  function cell(row, prop) {
    const label = `${prop.name} for row ${row.id}`;
    if (prop.type === "checkbox")
      return (
        <input
          aria-label={label}
          type="checkbox"
          checked={row.values[prop.id] ?? false}
          onChange={(event) => setCell(row.id, prop, event.target.checked)}
        />
      );
    if (prop.type === "select")
      return (
        <select
          aria-label={label}
          value={row.values[prop.id] ?? ""}
          onChange={(event) => setCell(row.id, prop, event.target.value)}
        >
          <option value="">Unassigned</option>
          {prop.options.map((option) => (
            <option key={option}>{option}</option>
          ))}
        </select>
      );
    return (
      <input
        aria-label={label}
        type={["number", "date"].includes(prop.type) ? prop.type : "text"}
        step={prop.type === "number" ? "any" : undefined}
        maxLength={4000}
        value={row.values[prop.id] ?? ""}
        onChange={(event) => setCell(row.id, prop, event.target.value)}
      />
    );
  }
  function deleteRow(row) {
    if (window.confirm("Delete this record?"))
      update({ ...data, rows: data.rows.filter((item) => item.id !== row.id) });
  }
  function card(row) {
    return (
      <article className="record-card" key={row.id}>
        {display.map((prop) => (
          <label key={prop.id}>
            {prop.name}
            {cell(row, prop)}
          </label>
        ))}
        <button onClick={() => deleteRow(row)}>Delete record</button>
      </article>
    );
  }
  return (
    <section className="database-block" aria-label={`Database ${data.title}`}>
      <div className="database-header">
        <input
          aria-label="Database title"
          maxLength={200}
          className="db-title"
          value={data.title}
          onChange={(event) => update({ ...data, title: event.target.value })}
        />
        <div className="database-actions">
          {data.views.map((item) => (
            <button
              key={item.id}
              className={`view-tab ${item.id === view.id ? "active" : ""}`}
              onClick={() => update({ ...data, activeViewId: item.id })}
            >
              {item.name}
            </button>
          ))}
          <button disabled={data.rows.length >= 1000} onClick={() => addRow()}>
            Add record
          </button>
        </div>
      </div>
      {error && <p role="alert">{error}</p>}
      <details>
        <summary>Properties, views and filters</summary>
        <form onSubmit={addProperty}>
          <label>
            New property name
            <input
              maxLength={80}
              value={propertyName}
              onChange={(event) => setPropertyName(event.target.value)}
              required
            />
          </label>
          <label>
            New property type
            <select
              aria-label="New property type"
              value={propertyType}
              onChange={(event) => setPropertyType(event.target.value)}
            >
              {["text", "number", "checkbox", "date", "select", "person"].map(
                (type) => (
                  <option key={type}>{type}</option>
                ),
              )}
            </select>
          </label>
          {propertyType === "select" && (
            <label>
              Options, separated by commas
              <input
                value={options}
                onChange={(event) => setOptions(event.target.value)}
              />
            </label>
          )}
          <button disabled={properties.length >= 30}>Add property</button>
        </form>
        <ul>
          {properties.map((prop) => (
            <li key={prop.id}>
              {prop.name} ({prop.type}){" "}
              <button
                onClick={() => {
                  const name = window.prompt("Property name", prop.name);
                  if (name?.trim())
                    update({
                      ...data,
                      properties: properties.map((item) =>
                        item.id === prop.id
                          ? { ...item, name: name.trim() }
                          : item,
                      ),
                    });
                }}
              >
                Rename
              </button>
              <button
                disabled={properties.length <= 1}
                onClick={() => deleteProperty(prop)}
              >
                Delete property
              </button>
              <label>
                <input
                  type="checkbox"
                  checked={display.some((item) => item.id === prop.id)}
                  onChange={(event) =>
                    changeView({
                      visibleProperties: event.target.checked
                        ? [...display.map((item) => item.id), prop.id]
                        : display
                            .filter((item) => item.id !== prop.id)
                            .map((item) => item.id),
                    })
                  }
                />
                Visible
              </label>
            </li>
          ))}
        </ul>
        <label>
          View type
          <select
            aria-label="View type"
            value={view.type}
            onChange={(event) => changeView({ type: event.target.value })}
          >
            {["table", "board", "list", "calendar", "gallery"].map((type) => (
              <option key={type}>{type}</option>
            ))}
          </select>
        </label>
        <button
          disabled={data.views.length >= 15}
          onClick={() => {
            const name = window.prompt("View name");
            if (name?.trim()) {
              const id = nanoid();
              update({
                ...data,
                activeViewId: id,
                views: [
                  ...data.views,
                  {
                    id,
                    name: name.trim(),
                    type: "table",
                    filters: [],
                    sorts: [],
                    visibleProperties: properties.map((prop) => prop.id),
                  },
                ],
              });
            }
          }}
        >
          Add view
        </button>
        <button
          onClick={() => {
            const name = window.prompt("View name", view.name);
            if (name?.trim()) changeView({ name: name.trim() });
          }}
        >
          Rename view
        </button>
        <button
          disabled={data.views.length <= 1}
          onClick={() => {
            if (window.confirm("Delete this view? Records are kept.")) {
              const views = data.views.filter((item) => item.id !== view.id);
              update({ ...data, views, activeViewId: views[0].id });
            }
          }}
        >
          Delete view
        </button>
        {view.type === "board" && (
          <label>
            Group records by
            <select
              aria-label="Group records by"
              value={view.groupBy ?? ""}
              onChange={(event) => {
                const next = { ...view };
                if (event.target.value) next.groupBy = event.target.value;
                else delete next.groupBy;
                update({
                  ...data,
                  views: data.views.map((item) =>
                    item.id === view.id ? next : item,
                  ),
                });
              }}
            >
              <option value="">Unassigned</option>
              {properties
                .filter((prop) => prop.type === "select")
                .map((prop) => (
                  <option key={prop.id} value={prop.id}>
                    {prop.name}
                  </option>
                ))}
            </select>
          </label>
        )}
        {view.type === "calendar" && (
          <label>
            Date property
            <select
              aria-label="Date property"
              value={view.dateProperty ?? ""}
              onChange={(event) => {
                const next = { ...view };
                if (event.target.value) next.dateProperty = event.target.value;
                else delete next.dateProperty;
                update({
                  ...data,
                  views: data.views.map((item) =>
                    item.id === view.id ? next : item,
                  ),
                });
              }}
            >
              <option value="">No date</option>
              {properties
                .filter((prop) => prop.type === "date")
                .map((prop) => (
                  <option key={prop.id} value={prop.id}>
                    {prop.name}
                  </option>
                ))}
            </select>
          </label>
        )}
        <label>
          Sort field
          <select
            aria-label="Sort field"
            value={view.sorts?.[0]?.field ?? ""}
            onChange={(event) =>
              changeView({
                sorts: event.target.value
                  ? [{ field: event.target.value, direction: "asc" }]
                  : [],
              })
            }
          >
            <option value="">Original order</option>
            {properties.map((prop) => (
              <option key={prop.id} value={prop.id}>
                {prop.name}
              </option>
            ))}
          </select>
        </label>
        {view.sorts?.length > 0 && (
          <label>
            Sort direction
            <select
              aria-label="Sort direction"
              value={view.sorts[0].direction}
              onChange={(event) =>
                changeView({
                  sorts: [{ ...view.sorts[0], direction: event.target.value }],
                })
              }
            >
              <option value="asc">Ascending</option>
              <option value="desc">Descending</option>
            </select>
          </label>
        )}
        <form
          onSubmit={(event) => {
            event.preventDefault();
            if (!properties.some((prop) => prop.id === filterField)) return;
            changeView({
              filters: [
                ...(view.filters ?? []),
                {
                  field: filterField,
                  operator: filterOperator,
                  ...(filterOperator === "empty" ? {} : { value: filterValue }),
                },
              ],
            });
          }}
        >
          <label>
            Filter field
            <select
              required
              aria-label="Filter field"
              value={filterField}
              onChange={(event) => setFilterField(event.target.value)}
            >
              <option value="">Choose property</option>
              {properties.map((prop) => (
                <option key={prop.id} value={prop.id}>
                  {prop.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            Comparison
            <select
              aria-label="Comparison"
              value={filterOperator}
              onChange={(event) => setFilterOperator(event.target.value)}
            >
              {["contains", "eq", "ne", "gt", "lt", "empty"].map((value) => (
                <option key={value}>{value}</option>
              ))}
            </select>
          </label>
          {filterOperator !== "empty" && (
            <label>
              Filter value
              <input
                value={filterValue}
                onChange={(event) => setFilterValue(event.target.value)}
              />
            </label>
          )}
          <button disabled={(view.filters?.length ?? 0) >= 15}>
            Add filter
          </button>
        </form>
        {(view.filters ?? []).map((filter, index) => (
          <p key={index}>
            {properties.find((prop) => prop.id === filter.field)?.name}{" "}
            {filter.operator} {String(filter.value ?? "")}{" "}
            <button
              onClick={() =>
                changeView({
                  filters: view.filters.filter((_, i) => i !== index),
                })
              }
            >
              Remove filter
            </button>
          </p>
        ))}
        {(data.templates ?? []).map((template) => (
          <button key={template.id} onClick={() => addRow(template)}>
            Add record from {template.name}
          </button>
        ))}
      </details>
      <p>
        {rows.length} of {data.rows.length} records shown. Blank numbers differ
        from zero; unchecked boxes store false.
      </p>
      {view.type === "table" ? (
        <div className="db-table-wrap">
          <table className="db-table">
            <thead>
              <tr>
                {display.map((prop) => (
                  <th key={prop.id} scope="col">
                    {prop.name}
                  </th>
                ))}
                <th scope="col">Actions</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.id}>
                  {display.map((prop) => (
                    <td key={prop.id}>{cell(row, prop)}</td>
                  ))}
                  <td>
                    <button onClick={() => deleteRow(row)}>
                      Delete record
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : ["board", "calendar"].includes(view.type) ? (
        <div className={view.type === "board" ? "db-board" : "calendar-groups"}>
          {rowGroups(data, view, rows).map(([name, items], index) => (
            <section className="board-column" key={name + index}>
              <h4>{name}</h4>
              {items.map(card)}
            </section>
          ))}
        </div>
      ) : (
        <div className={view.type === "gallery" ? "db-gallery" : "db-list"}>
          {rows.map(card)}
        </div>
      )}
      {!rows.length && (
        <p>No records match this view. Add a record or review the filters.</p>
      )}
    </section>
  );
}
