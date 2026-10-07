import { Node, type JSONContent } from "@tiptap/core";
import { MarkdownManager } from "@tiptap/markdown";
import { Marked, marked } from "marked";
import { baseExtensions } from "./extensions";
import { loadFlowIcons } from "./inline-icon";
import {
  cleanRich,
  normaliseDocument,
  safeLink,
  type EditorMode,
  type PaperDocument,
  type RichNode,
} from "../data/model";

function literal(text: string): JSONContent[] {
  return text
    .replace(/\n$/, "")
    .split("\n")
    .flatMap((line, index) => [
      ...(index ? [{ type: "hardBreak" }] : []),
      ...(line ? [{ type: "text", text: line }] : []),
    ]);
}
const LiteralImage = Node.create({
  name: "literalImage",
  markdownTokenName: "image",
  parseMarkdown: (token) => ({
    type: "text",
    text: token.raw || `![${token.text || ""}](${token.href || ""})`,
  }),
});
const LiteralTable = Node.create({
  name: "literalTable",
  markdownTokenName: "table",
  parseMarkdown: (token) => ({
    type: "paragraph",
    content: literal(token.raw || ""),
  }),
});
const LiteralHTML = Node.create({
  name: "literalHTML",
  markdownTokenizer: {
    name: "literalHTML",
    level: "inline",
    start: (src) => src.indexOf("<"),
    tokenize(src) {
      const match = src.match(
        /^(?:<!--[\s\S]*?-->|<![a-z][^>]*>|<\?[\s\S]*?\?>|<\/?[a-z][a-z0-9-]*(?:\s[^>]*|\/?)>)/i,
      );
      return match ? { type: "literalHTML", raw: match[0] } : undefined;
    },
  },
  parseMarkdown: (token) => ({ type: "text", text: token.raw || "" }),
});
const LiteralBlock = Node.create({
  name: "literalBlock",
  markdownTokenizer: {
    name: "literalBlock",
    level: "block",
    start: (src) =>
      src.search(
        /^ {0,3}(?:<(?:![a-z-]|\?|\/?[a-z][a-z0-9-]*(?:[\s/>]))|> ?\[!)/im,
      ),
    tokenize(src) {
      if (/^ {0,3}<!-- pagebreak -->[ \t]*(?:\n|$)/.test(src)) return undefined;
      const callout = src.match(
        /^ {0,3}> ?\[![^\]\n]+\][^\n]*(?:\n {0,3}>[^\n]*)*\n?/,
      );
      const html = /^ {0,3}<(?:![a-z-]|\?|\/?[a-z][a-z0-9-]*(?:[\s/>]))/i.test(
        src,
      )
        ? src.match(/^[\s\S]+?(?=\n[ \t]*\n|$)/)
        : null;
      const match = callout || html;
      return match ? { type: "literalBlock", raw: match[0] } : undefined;
    },
  },
  parseMarkdown: (token) => ({
    type: "paragraph",
    content: literal(token.raw || ""),
  }),
});
const parser = new MarkdownManager({
  // A private Marked instance prevents custom tokenizers leaking to other editors.
  marked: new Marked() as unknown as typeof marked,
  markedOptions: { gfm: true, breaks: false },
  extensions: [
    ...baseExtensions(),
    LiteralImage,
    LiteralTable,
    LiteralHTML,
    LiteralBlock,
  ],
});

export function compileMarkdown(source: string): RichNode {
  const json = parser.parse(source);
  if (!json.content?.length) json.content = [{ type: "paragraph" }];
  // A terminal break needs a following writing paragraph to produce its blank page.
  if (json.content.at(-1)?.type === "pageBreak")
    json.content.push({ type: "paragraph" });
  const cleanLinks = (node: JSONContent) => {
    node.marks = node.marks?.filter(
      (mark) =>
        mark.type !== "link" ||
        (typeof mark.attrs?.href === "string" &&
          mark.attrs.href.length > 0 &&
          safeLink(mark.attrs.href)),
    );
    node.content?.forEach(cleanLinks);
  };
  cleanLinks(json);
  return cleanRich(json);
}
export function withEditorMode(
  doc: PaperDocument,
  mode: EditorMode,
): PaperDocument {
  if (mode === "richtext") return doc;
  const source = parser.serialize(doc.flow);
  return normaliseDocument({
    ...doc,
    editorMode: mode,
    markdownSource: source,
    flow: compileMarkdown(source),
  });
}
export async function prepareDocument(input: unknown) {
  const doc = normaliseDocument(input);
  if (doc.editorMode === "markdown")
    doc.flow = compileMarkdown(doc.markdownSource!);
  await loadFlowIcons(doc.flow);
  return normaliseDocument(doc);
}

export type MarkdownCommand =
  | "bold"
  | "italic"
  | "heading"
  | "bullet"
  | "task"
  | "divider"
  | "link"
  | "code"
  | "pageBreak";
export function markdownInsertion(command: MarkdownCommand, text: string) {
  switch (command) {
    case "bold":
      return `**${text || "bold text"}**`;
    case "italic":
      return `*${text || "italic text"}*`;
    case "heading":
      return `## ${text || "Heading"}`;
    case "bullet":
      return (text || "List item")
        .split("\n")
        .map((line) => `- ${line}`)
        .join("\n");
    case "task":
      return (text || "Task")
        .split("\n")
        .map((line) => `- [ ] ${line}`)
        .join("\n");
    case "divider":
      return "\n\n---\n\n";
    case "link":
      return `[${text || "link text"}](https://example.com)`;
    case "code":
      return text.includes("\n")
        ? `\n\n\`\`\`\n${text}\n\`\`\`\n\n`
        : `\`${text || "code"}\``;
    case "pageBreak":
      return "\n\n<!-- pagebreak -->\n\n";
  }
}
