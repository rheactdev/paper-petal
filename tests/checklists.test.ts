import { describe, expect, it } from "vitest";
import { Editor, type JSONContent } from "@tiptap/core";
import type { EditorView } from "@tiptap/pm/view";
import { baseExtensions } from "../src/editor/extensions";
import { setTaskChecked } from "../src/editor/task-item";
import { cleanRich, normaliseDocument, type RichNode } from "../src/data/model";
import { newDocument } from "../src/data/templates";

const paragraph = (text = ""): JSONContent => ({
  type: "paragraph",
  ...(text ? { content: [{ type: "text", text }] } : {}),
});
const task = (text: string, checked = false): JSONContent => ({
  type: "taskItem",
  attrs: { checked },
  content: [paragraph(text)],
});
function editorFor(content: JSONContent[]) {
  const editor = new Editor({
    element: null,
    extensions: baseExtensions(),
    content: { type: "doc", content },
  });
  // Exercise the actual Tiptap commands and keymaps without a browser view.
  editor.view.updateState(
    editor.state.reconfigure({
      plugins: editor.extensionManager.plugins,
    }),
  );
  return editor;
}
function selectText(editor: Editor, text: string, end = false) {
  let position = -1;
  editor.state.doc.descendants((node, pos) => {
    if (node.type.name === "paragraph" && node.textContent === text)
      position = pos + 1 + (end ? node.content.size : 0);
  });
  expect(position).toBeGreaterThanOrEqual(0);
  editor.commands.setTextSelection(position);
}
function key(editor: Editor, name: string, shiftKey = false, ctrlKey = false) {
  const mac =
    typeof navigator !== "undefined" && /Mac/.test(navigator.platform);
  const event = {
    key: name,
    keyCode: name === "9" ? 57 : 0,
    shiftKey,
    ctrlKey: ctrlKey && !mac,
    metaKey: ctrlKey && mac,
    altKey: false,
  } as KeyboardEvent;
  return editor.state.plugins.some((plugin) =>
    plugin.props.handleKeyDown?.call(plugin, editor.view as EditorView, event),
  );
}

describe("rich-text checklists", () => {
  it("converts selected paragraphs, preserving formatting, and toggles back", () => {
    const editor = editorFor([
      {
        type: "paragraph",
        content: [
          { type: "text", text: "Keep this bold", marks: [{ type: "bold" }] },
        ],
      },
      paragraph("Another task"),
    ]);
    editor.commands.setTextSelection({
      from: 1,
      to: editor.state.doc.content.size - 1,
    });
    expect(editor.commands.toggleTaskList()).toBe(true);
    const list = editor.getJSON().content![0];
    expect(list.type).toBe("taskList");
    expect(list.content).toHaveLength(2);
    expect(list.content![0].attrs?.checked).toBe(false);
    expect(list.content![0].content![0].content![0].marks).toEqual([
      { type: "bold" },
    ]);
    expect(editor.commands.toggleTaskList()).toBe(true);
    expect(editor.getJSON().content!.every((n) => n.type === "paragraph")).toBe(
      true,
    );
    expect(editor.state.doc.textContent).toBe("Keep this boldAnother task");
  });
  it("Enter creates an unchecked task after a completed one; empty Enter exits", () => {
    const editor = editorFor([
      { type: "taskList", content: [task("Finished", true)] },
    ]);
    selectText(editor, "Finished", true);
    expect(key(editor, "Enter")).toBe(true);
    expect(editor.getJSON().content![0].content).toHaveLength(2);
    expect(editor.getJSON().content![0].content![1].attrs?.checked).toBe(false);
    expect(key(editor, "Enter")).toBe(true);
    expect(editor.getJSON().content![0].content).toHaveLength(1);
    expect(editor.state.selection.$from.parent.type.name).toBe("paragraph");
    expect(editor.state.selection.$from.depth).toBe(1);
  });
  it("Tab nests and Shift+Tab outdents without coupling checked states", () => {
    const editor = editorFor([
      { type: "taskList", content: [task("Parent", true), task("Child")] },
    ]);
    selectText(editor, "Child");
    expect(key(editor, "Tab")).toBe(true);
    const parent = editor.getJSON().content![0].content![0];
    expect(parent.attrs?.checked).toBe(true);
    expect(parent.content![1].type).toBe("taskList");
    expect(parent.content![1].content![0].attrs?.checked).toBe(false);
    expect(key(editor, "Tab", true)).toBe(true);
    expect(editor.getJSON().content![0].content).toHaveLength(2);
  });
  it("the checklist keyboard shortcut converts ordinary text", () => {
    const editor = editorFor([paragraph("Keyboard task")]);
    expect(key(editor, "9", true, true)).toBe(true);
    expect(editor.getJSON().content![0].type).toBe("taskList");
  });
  it("deleting a task boundary retains both texts and Undo restores the tasks", () => {
    const editor = editorFor([
      { type: "taskList", content: [task("First"), task("Second", true)] },
    ]);
    selectText(editor, "Second");
    expect(key(editor, "Backspace")).toBe(true);
    expect(editor.state.doc.textContent).toBe("FirstSecond");
    expect(editor.getJSON().content![0].content).toHaveLength(1);
    expect(editor.commands.undo()).toBe(true);
    const tasks = editor.getJSON().content![0].content!;
    expect(tasks).toHaveLength(2);
    expect(tasks[0].content![0].content![0].text).toBe("First");
    expect(tasks[1].content![0].content![0].text).toBe("Second");
    expect(tasks[1].attrs?.checked).toBe(true);
  });
  it("checkbox toggles preserve selection, formatting and independent undo events", () => {
    const editor = editorFor([
      { type: "taskList", content: [task("Original")] },
    ]);
    selectText(editor, "Original", true);
    editor.commands.insertContent({
      type: "text",
      text: " bold",
      marks: [{ type: "bold" }],
    });
    const selection = editor.state.selection;
    expect(setTaskChecked(editor, 1, true)).toBe(true);
    expect(editor.state.selection.eq(selection)).toBe(true);
    editor.commands.insertContent({ type: "text", text: " after" });
    expect(editor.commands.undo()).toBe(true);
    expect(editor.state.doc.textContent).toBe("Original bold");
    expect(editor.getJSON().content![0].content![0].attrs?.checked).toBe(true);
    expect(editor.commands.undo()).toBe(true);
    expect(editor.getJSON().content![0].content![0].attrs?.checked).toBe(false);
    expect(editor.state.doc.textContent).toBe("Original bold");
    expect(editor.commands.redo()).toBe(true);
    expect(editor.getJSON().content![0].content![0].attrs?.checked).toBe(true);
    expect(setTaskChecked(editor, 1, false)).toBe(true);
    expect(
      editor.getJSON().content![0].content![0].content![0].content![1].marks,
    ).toEqual([{ type: "bold" }]);
  });
  it("does not toggle readonly content or a non-task node", () => {
    const editor = editorFor([
      { type: "taskList", content: [task("Read only")] },
    ]);
    editor.setEditable(false);
    expect(setTaskChecked(editor, 1, true)).toBe(false);
    expect(editor.getJSON().content![0].content![0].attrs?.checked).toBe(false);
    editor.setEditable(true);
    expect(setTaskChecked(editor, 0, true)).toBe(false);
  });
  it("retains composition-tagged Unicode replacements through validation and undo", () => {
    const editor = editorFor([{ type: "taskList", content: [task("")] }]);
    selectText(editor, "");
    const position = editor.state.selection.from;
    editor.view.dispatch(
      editor.state.tr.insertText("に").setMeta("composition", 7),
    );
    editor.view.dispatch(
      editor.state.tr
        .insertText("日本語 🌼", position, position + 1)
        .setMeta("composition", 7),
    );
    expect(editor.state.doc.textContent).toBe("日本語 🌼");
    expect(editor.state.selection.from).toBe(position + "日本語 🌼".length);
    const doc = newDocument("blank");
    doc.flow = cleanRich(editor.getJSON());
    expect(normaliseDocument(doc).flow).toEqual(doc.flow);
    expect(editor.commands.undo()).toBe(true);
    expect(editor.state.doc.textContent).toBe("");
    expect(editor.commands.redo()).toBe(true);
    expect(editor.state.doc.textContent).toBe("日本語 🌼");
  });
  it("retains nested rich content and manual breaks through cleaning and schema validation", () => {
    const doc = newDocument("blank");
    doc.flow = cleanRich({
      type: "doc",
      content: [
        {
          type: "taskList",
          content: [
            {
              ...task("Parent", true),
              content: [
                paragraph("Parent"),
                { type: "pageBreak" },
                { type: "taskList", content: [task("Child")] },
                {
                  type: "bulletList",
                  content: [{ type: "listItem", content: [paragraph("Note")] }],
                },
              ],
            },
          ],
        },
      ],
    });
    expect(normaliseDocument(JSON.parse(JSON.stringify(doc)))).toEqual(doc);
    const editor = editorFor(doc.flow.content as JSONContent[]);
    expect(() => editor.state.doc.check()).not.toThrow();
    doc.flow = cleanRich(editor.getJSON());
    expect(normaliseDocument(JSON.parse(JSON.stringify(doc))).flow).toEqual(
      doc.flow,
    );
    expect(doc.flow.content![0].content![0].attrs?.checked).toBe(true);
    expect(editor.state.doc.textContent).toBe("ParentChildNote");
  });
  it.each([
    { type: "taskList", content: [] },
    { type: "taskList", content: [paragraph("Orphan")] },
    { type: "taskList", content: [{ type: "taskItem", content: [] }] },
    {
      type: "taskList",
      content: [
        {
          type: "taskItem",
          content: [
            {
              type: "heading",
              content: [{ type: "text", text: "Wrong first block" }],
            },
          ],
        },
      ],
    },
    {
      type: "taskList",
      content: [{ ...task("Invalid"), attrs: { checked: "true" } }],
    },
    {
      type: "taskList",
      content: [{ ...task("Invalid"), attrs: { checked: 1 } }],
    },
    { type: "taskItem", content: [paragraph("Orphan task")] },
    { ...paragraph("Not a task"), attrs: { checked: true } },
  ])("rejects malformed task structure %#", (node) => {
    const doc = newDocument("blank");
    doc.flow = { type: "doc", content: [node] } as RichNode;
    expect(() => normaliseDocument(doc)).toThrow();
  });
});
