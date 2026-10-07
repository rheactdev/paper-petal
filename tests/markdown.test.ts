import { describe, expect, it } from "vitest";
import { getSchema } from "@tiptap/core";
import {
  compileMarkdown,
  markdownInsertion,
  prepareDocument,
  withEditorMode,
} from "../src/editor/markdown";
import { loadFlowIcons } from "../src/editor/inline-icon";
import { baseExtensions } from "../src/editor/extensions";
import { normaliseDocument, type RichNode } from "../src/data/model";
import { newDocument } from "../src/data/templates";

export const sample =
  "## :LiLayoutList: Tasks\n---\n- [ ] :LiShowerHead: Shower\n- [ ] :LiBrushCleaning: Clean Room\n## :LiNotebook: Notes\n---\n- what is my goal rn\n- i wanna like ermm\n- hmmm";
function nodes(flow: RichNode): RichNode[] {
  return [flow, ...(flow.content || []).flatMap(nodes)];
}
const text = (flow: RichNode) =>
  nodes(flow)
    .map((node) => node.text || "")
    .join("");
describe("Markdown documents", () => {
  it("renders the Obsidian sample with four icons, dividers and unchecked tasks", () => {
    const flow = compileMarkdown(sample),
      all = nodes(flow);
    expect(
      all
        .filter((node) => node.type === "lucideIcon")
        .map((node) => node.attrs?.iconName),
    ).toEqual(["layout-list", "shower-head", "brush-cleaning", "notebook"]);
    expect(all.filter((node) => node.type === "horizontalRule")).toHaveLength(
      2,
    );
    expect(
      all
        .filter((node) => node.type === "taskItem")
        .map((node) => node.attrs?.checked),
    ).toEqual([false, false]);
    expect(text(flow)).toContain("Clean Room");
    expect(
      normaliseDocument({
        ...newDocument(),
        editorMode: "markdown",
        markdownSource: sample,
        flow,
      }).flow,
    ).toEqual(flow);
  });
  it("preserves unknown/escaped shortcodes and code without substituting icons", () => {
    const q = String.fromCharCode(96);
    const flow = compileMarkdown(
      ":LiDoesNotExist: \\:LiNotebook: " +
        q +
        ":LiShowerHead:" +
        q +
        "\n\n" +
        q.repeat(3) +
        "\n:LiLayoutList:\n" +
        q.repeat(3),
    );
    expect(
      nodes(flow).filter((node) => node.type === "lucideIcon"),
    ).toHaveLength(0);
    expect(text(flow)).toContain(":LiDoesNotExist:");
    expect(text(flow)).toContain(":LiNotebook:");
    expect(
      nodes(flow).find((node) => node.type === "codeBlock")?.content?.[0].text,
    ).toBe(":LiLayoutList:");
  });
  it("still recognises a known shortcode following an unknown one", () => {
    expect(
      nodes(compileMarkdown(":LiNotAnIcon: :linotebook:")).filter(
        (node) => node.type === "lucideIcon",
      ),
    ).toHaveLength(1);
  });
  it("keeps a writing paragraph after a final page break", () => {
    const flow = compileMarkdown("First page\n\n<!-- pagebreak -->\n");
    expect(flow.content?.at(-2)?.type).toBe("pageBreak");
    expect(flow.content?.at(-1)?.type).toBe("paragraph");
  });
  it("supports formatted nested and completed tasks independently", () => {
    const flow = compileMarkdown(
      "- [x] **Parent**\n  - [ ] *Child*\n\n1. First\n2. Second",
    );
    expect(
      nodes(flow)
        .filter((node) => node.type === "taskItem")
        .map((node) => node.attrs?.checked),
    ).toEqual([true, false]);
    expect(
      nodes(flow).find((node) => node.text === "Parent")?.marks?.[0].type,
    ).toBe("bold");
    expect(
      nodes(flow).find((node) => node.text === "Child")?.marks?.[0].type,
    ).toBe("italic");
    expect(nodes(flow).some((node) => node.type === "orderedList")).toBe(true);
  });
  it("supports links, quotes, six heading levels and manual page breaks", () => {
    const all = nodes(
      compileMarkdown(
        "###### Small heading\n\n> A quote with [a link](https://example.com)\n\n<!-- pagebreak -->\n\nNext page",
      ),
    );
    expect(all.find((node) => node.type === "heading")?.attrs?.level).toBe(6);
    expect(all.some((node) => node.type === "blockquote")).toBe(true);
    expect(all.some((node) => node.type === "pageBreak")).toBe(true);
    expect(
      all.some((node) => node.marks?.some((mark) => mark.type === "link")),
    ).toBe(true);
  });
  it("renders HTML, tables, callouts and attachments as literal text", () => {
    const source =
      "<script>alert(1)</script>\n\nHello <b>literal</b>\n\n| A | B |\n| --- | --- |\n| 1 | 2 |\n\n> [!note] Callout\n> Body\n\n![[photo.png]]\n\n![picture](photo.png)";
    const flow = compileMarkdown(source),
      allText = text(flow);
    for (const value of [
      "<script>alert(1)</script>",
      "<b>literal</b>",
      "| A | B |",
      "> [!note]",
      "![picture](photo.png)",
      "![[photo.png]]",
    ])
      expect(allText).toContain(value);
    expect(
      nodes(flow).some((node) =>
        node.marks?.some((mark) => mark.type === "bold"),
      ),
    ).toBe(false);
  });
  it("never emits unsafe link schemes or imports arbitrary HTML", () => {
    const flow = compileMarkdown(
      "[bad](javascript:alert%281%29)\n\n<img src=x onerror=alert(1)>",
    );
    expect(
      nodes(flow).some((node) =>
        node.marks?.some((mark) => mark.type === "link"),
      ),
    ).toBe(false);
    expect(text(flow)).toContain("<img");
    const bad = {
      ...newDocument(),
      flow: {
        type: "doc",
        content: [
          {
            type: "paragraph",
            content: [
              {
                type: "text",
                text: "bad",
                marks: [
                  { type: "link", attrs: { href: "javascript:alert(1)" } },
                ],
              },
            ],
          },
        ],
      },
    };
    expect(() => normaliseDocument(bad)).toThrow();
  });
  it("keeps HTML declarations literal and renders empty links as plain text", () => {
    const source =
      '<!DOCTYPE html>\n\n<?xml version="1.0"?>\n\n[label]() and ~~done~~';
    const flow = compileMarkdown(source);
    expect(text(flow)).toContain("<!DOCTYPE html>");
    expect(text(flow)).toContain('<?xml version="1.0"?>');
    expect(
      nodes(flow).some((node) =>
        node.marks?.some((mark) => mark.type === "link"),
      ),
    ).toBe(false);
    expect(
      nodes(flow).find((node) => node.text === "done")?.marks?.[0].type,
    ).toBe("strike");
    expect(() => normaliseDocument({ ...newDocument(), flow })).not.toThrow();
  });
  it("preserves original source on reload and disregards stale cached flow", async () => {
    const source = "##   :LiNotebook: Notes\n\n\n- [X] Task  \n\n",
      doc = withEditorMode(newDocument(), "markdown");
    doc.markdownSource = source;
    const restored = await prepareDocument(JSON.parse(JSON.stringify(doc)));
    expect(restored.markdownSource).toBe(source);
    expect(nodes(restored.flow).some((node) => node.attrs?.checked)).toBe(true);
  });
  it("seeds templates without moving decorations and defaults old documents to rich text", () => {
    const template = newDocument("journal"),
      result = withEditorMode(template, "markdown");
    expect(result.pages).toEqual(template.pages);
    expect(result.markdownSource).toContain("Little moments");
    expect(result.flow).toEqual(compileMarkdown(result.markdownSource!));
    const { editorMode: _, ...legacy } = template;
    expect(normaliseDocument(legacy).editorMode).toBe("richtext");
  });
  it("validates mode/source combinations and inline icon data", () => {
    expect(() =>
      normaliseDocument({ ...newDocument(), editorMode: "markdown" }),
    ).toThrow();
    expect(() =>
      normaliseDocument({ ...newDocument(), markdownSource: "wrong mode" }),
    ).toThrow();
    expect(() =>
      normaliseDocument({
        ...newDocument(),
        flow: {
          type: "doc",
          content: [
            {
              type: "paragraph",
              content: [
                { type: "lucideIcon", attrs: { iconName: "not-a-real-icon" } },
              ],
            },
          ],
        },
      }),
    ).toThrow();
  });
  it("retains long paragraphs and task lists without losing text", () => {
    const source =
      "Long " +
      "word ".repeat(5000) +
      "\n\n" +
      Array.from({ length: 150 }, (_, i) => "- [ ] Task " + i).join("\n");
    const flow = compileMarkdown(source);
    expect(text(flow).match(/word/g)).toHaveLength(5000);
    expect(nodes(flow).filter((node) => node.type === "taskItem")).toHaveLength(
      150,
    );
  });
  it("resolves locally bundled SVG paths through the shared schema", async () => {
    const flow = compileMarkdown(":LiLayoutList:"),
      icon = nodes(flow).find((node) => node.type === "lucideIcon")!;
    await loadFlowIcons(flow);
    const schema = getSchema(baseExtensions()),
      node = schema.nodeFromJSON(icon);
    const artwork = schema.nodes.lucideIcon.spec.toDOM!(node);
    expect(JSON.stringify(artwork)).toContain("svg");
    expect(JSON.stringify(artwork)).toContain("M14 4h7");
  });
  it("inserts Markdown syntax and explicit page breaks", () => {
    expect(markdownInsertion("bold", "kept")).toBe("**kept**");
    expect(markdownInsertion("task", "One\nTwo")).toBe("- [ ] One\n- [ ] Two");
    expect(markdownInsertion("pageBreak", "")).toContain("<!-- pagebreak -->");
  });
});
