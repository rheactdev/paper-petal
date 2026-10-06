import { TaskItem } from "@tiptap/extension-list";
import { closeHistory } from "@tiptap/pm/history";
import type { Editor } from "@tiptap/core";

export function setTaskChecked(
  editor: Editor,
  position: number,
  checked: boolean,
) {
  const node = editor.state.doc.nodeAt(position);
  if (!editor.isEditable || node?.type.name !== "taskItem") return false;
  editor.view.dispatch(
    closeHistory(editor.state.tr).setNodeMarkup(position, undefined, {
      ...node.attrs,
      checked,
    }),
  );
  // Keep the next keystroke out of the checkbox's undo event, too.
  editor.view.dispatch(closeHistory(editor.state.tr));
  return true;
}

// Keep the upstream schema, HTML, input rules and list commands. Checkbox
// interaction should preserve both the text selection and keyboard focus.
export const PaperTaskItem = TaskItem.extend({
  addNodeView() {
    const render = this.parent?.();
    if (!render) throw new Error("The task item renderer is unavailable.");
    return (props) => {
      const view = render(props);
      const label = view.dom.querySelector("label");
      const checkbox = label?.querySelector("input");
      if (!checkbox || !label) return view;
      checkbox.disabled = !props.editor.isEditable;
      const change = (event: Event) => {
        // Intercept the upstream change handler, which focuses the text editor.
        event.stopImmediatePropagation();
        const position = props.getPos();
        if (typeof position !== "number") return;
        const node = props.editor.state.doc.nodeAt(position);
        if (!node) return;
        if (!props.editor.isEditable) {
          checkbox.checked = Boolean(node.attrs.checked);
          return;
        }
        setTaskChecked(props.editor, position, checkbox.checked);
      };
      const keydown = (event: KeyboardEvent) => {
        if (!(event.metaKey || event.ctrlKey) || event.altKey) return;
        const key = event.key.toLowerCase();
        if (key !== "z" && key !== "y") return;
        event.preventDefault();
        event.stopPropagation();
        if (key === "y" || event.shiftKey) props.editor.commands.redo();
        else props.editor.commands.undo();
      };
      checkbox.addEventListener("change", change, true);
      checkbox.addEventListener("keydown", keydown);
      return {
        ...view,
        stopEvent: (event) =>
          (event.target instanceof globalThis.Node &&
            label.contains(event.target)) ||
          view.stopEvent?.(event) ||
          false,
        destroy: () => {
          checkbox.removeEventListener("change", change, true);
          checkbox.removeEventListener("keydown", keydown);
          view.destroy?.();
        },
      };
    };
  },
}).configure({
  nested: true,
  HTMLAttributes: { "data-type": "taskItem" },
  a11y: {
    checkboxLabel: (node) => {
      const text = Array.from(
        node.firstChild?.textContent.trim() || "Empty task",
      );
      return `Complete task: ${text.slice(0, 160).join("")}${text.length > 160 ? "…" : ""}`;
    },
  },
});
