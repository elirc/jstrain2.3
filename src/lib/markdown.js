import { nanoid } from "nanoid";
export function markdownToBlocks(markdown) {
  const blocks = [],
    lines = markdown.split(/\r?\n/);
  let fence = null,
    code = [];
  const push = (type, text, props = {}) =>
    blocks.push({ id: nanoid(), type, text, props, children: [] });
  for (const line of lines) {
    const trimmed = line.trim(),
      marker = trimmed.match(/^(`{3,}|~{3,})(.*)$/);
    if (fence) {
      if (
        marker &&
        marker[1][0] === fence[0] &&
        marker[1].length >= fence.length &&
        !marker[2].trim()
      ) {
        push("code", code.join("\n"));
        fence = null;
        code = [];
      } else code.push(line);
      continue;
    }
    if (marker) {
      fence = marker[1];
      continue;
    }
    if (/^#{1,3}\s+/.test(trimmed)) {
      const heading = trimmed.match(/^(#{1,3})\s+(.*)$/);
      push("heading" + heading[1].length, heading[2]);
    } else if (/^[-*]\s+/.test(trimmed))
      push("bullet", trimmed.replace(/^[-*]\s+/, ""));
    else if (/^\d+\.\s+/.test(trimmed))
      push("number", trimmed.replace(/^\d+\.\s+/, ""));
    else if (trimmed === "---") push("divider", "");
    else if (/^>\s?/.test(trimmed))
      push("callout", trimmed.replace(/^>\s?/, ""), { tone: "info" });
    else push("paragraph", line);
  }
  if (fence) push("code", code.join("\n"));
  return blocks;
}
function tableCell(value) {
  return String(value ?? "")
    .replaceAll("\\", "\\\\")
    .replaceAll("|", "\\|")
    .replaceAll("\r", "")
    .replaceAll("\n", "<br>");
}
export function blocksToMarkdown(page, blocks) {
  let number = 0;
  const body = blocks
    .map((block) => {
      if (block.type !== "number") number = 0;
      if (/^heading[123]$/.test(block.type))
        return "#".repeat(Number(block.type.at(-1))) + " " + block.text;
      if (block.type === "bullet") return "- " + block.text;
      if (block.type === "number") return ++number + ". " + block.text;
      if (block.type === "divider") return "---";
      if (block.type === "callout")
        return block.text
          .split("\n")
          .map((line) => "> " + line)
          .join("\n");
      if (block.type === "code") {
        const lengths = [...(block.text || "").matchAll(/`+/g)].map(
          (match) => match[0].length,
        );
        const fence = "`".repeat(
          Math.max(3, ...lengths.map((length) => length + 1)),
        );
        return fence + "\n" + block.text + "\n" + fence;
      }
      if (block.type === "database") {
        const properties = block.props.properties;
        return (
          "## " +
          block.props.title +
          "\n\n| " +
          properties.map((prop) => tableCell(prop.name)).join(" | ") +
          " |\n| " +
          properties.map(() => "---").join(" | ") +
          " |\n" +
          block.props.rows
            .map(
              (row) =>
                "| " +
                properties
                  .map((prop) => tableCell(row.values[prop.id]))
                  .join(" | ") +
                " |",
            )
            .join("\n")
        );
      }
      return block.text || "";
    })
    .join("\n\n");
  return "# " + page.title + "\n\n" + body;
}
