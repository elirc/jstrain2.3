import { nanoid } from "nanoid";

function stripPrefix(text, prefixRegex) {
  return text.replace(prefixRegex, "").trim();
}

export function markdownToBlocks(markdown) {
  const lines = markdown.split(/\r?\n/);
  const blocks = [];

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) {
      blocks.push({ id: nanoid(), type: "paragraph", text: "", props: {}, children: [] });
      continue;
    }
    if (trimmed.startsWith("### ")) {
      blocks.push({ id: nanoid(), type: "heading3", text: stripPrefix(trimmed, /^###\s+/), props: {}, children: [] });
      continue;
    }
    if (trimmed.startsWith("## ")) {
      blocks.push({ id: nanoid(), type: "heading2", text: stripPrefix(trimmed, /^##\s+/), props: {}, children: [] });
      continue;
    }
    if (trimmed.startsWith("# ")) {
      blocks.push({ id: nanoid(), type: "heading1", text: stripPrefix(trimmed, /^#\s+/), props: {}, children: [] });
      continue;
    }
    if (/^[-*]\s+/.test(trimmed)) {
      blocks.push({ id: nanoid(), type: "bullet", text: stripPrefix(trimmed, /^[-*]\s+/), props: {}, children: [] });
      continue;
    }
    if (/^\d+\.\s+/.test(trimmed)) {
      blocks.push({ id: nanoid(), type: "number", text: stripPrefix(trimmed, /^\d+\.\s+/), props: {}, children: [] });
      continue;
    }
    if (trimmed === "---") {
      blocks.push({ id: nanoid(), type: "divider", text: "", props: {}, children: [] });
      continue;
    }
    if (trimmed.startsWith("> ")) {
      blocks.push({ id: nanoid(), type: "callout", text: stripPrefix(trimmed, /^>\s+/), props: { tone: "info" }, children: [] });
      continue;
    }
    blocks.push({ id: nanoid(), type: "paragraph", text: trimmed, props: {}, children: [] });
  }

  return blocks;
}

function renderBlock(block, index) {
  switch (block.type) {
    case "heading1":
      return `# ${block.text}`;
    case "heading2":
      return `## ${block.text}`;
    case "heading3":
      return `### ${block.text}`;
    case "bullet":
      return `- ${block.text}`;
    case "number":
      return `${index + 1}. ${block.text}`;
    case "code":
      return `\`\`\`\n${block.text || ""}\n\`\`\``;
    case "callout":
      return `> ${block.text}`;
    case "divider":
      return "---";
    case "database":
      return `## ${block.props?.title || "Database"}\n\n[Database block with ${block.props?.rows?.length || 0} rows]`;
    default:
      return block.text || "";
  }
}

export function blocksToMarkdown(page, blocks) {
  const title = `# ${page.title}`;
  const body = blocks.map((block, index) => renderBlock(block, index)).join("\n\n");
  return `${title}\n\n${body}`.trim();
}

