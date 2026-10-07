import { useEffect, useRef, useState } from "react";
import { EditorState } from "@codemirror/state";
import {
  EditorView,
  keymap,
  lineNumbers,
  highlightActiveLine,
  drawSelection,
} from "@codemirror/view";
import {
  defaultKeymap,
  history,
  historyKeymap,
  undo,
  redo,
} from "@codemirror/commands";
import {
  defaultHighlightStyle,
  syntaxHighlighting,
} from "@codemirror/language";
import { markdown } from "@codemirror/lang-markdown";
import { Code2, PanelLeftClose, PanelLeftOpen } from "lucide-react";
import { markdownInsertion, type MarkdownCommand } from "../../editor/markdown";

export type SourceEditor = {
  hide: () => void;
  focused: () => boolean;
  undo: () => boolean;
  redo: () => boolean;
  insert: (command: MarkdownCommand, position?: "selection" | "end") => void;
};
export function MarkdownSource({
  source,
  onChange,
  onEditor,
  onResize,
}: {
  source: string;
  onChange: (source: string) => void;
  onEditor: (editor: SourceEditor | null) => void;
  onResize: () => void;
}) {
  const host = useRef<HTMLDivElement>(null),
    view = useRef<EditorView | null>(null);
  const change = useRef(onChange),
    editorReady = useRef(onEditor);
  change.current = onChange;
  editorReady.current = onEditor;
  const [width, setWidth] = useState(320),
    [collapsed, setCollapsed] = useState(false);
  const gesture = useRef<{ x: number; width: number } | null>(null);
  useEffect(() => {
    const editor = new EditorView({
      parent: host.current!,
      state: EditorState.create({
        doc: source,
        extensions: [
          history(),
          lineNumbers(),
          highlightActiveLine(),
          drawSelection(),
          syntaxHighlighting(defaultHighlightStyle),
          markdown({ completeHTMLTags: false, pasteURLAsLink: false }),
          keymap.of([...historyKeymap, ...defaultKeymap]),
          EditorView.lineWrapping,
          EditorView.contentAttributes.of({
            "aria-label": "Markdown source",
            spellcheck: "true",
          }),
          EditorView.updateListener.of((update) => {
            if (update.docChanged) change.current(update.state.doc.toString());
          }),
        ],
      }),
    });
    view.current = editor;
    editorReady.current({
      hide: () => setCollapsed(true),
      focused: () => editor.hasFocus,
      undo: () => undo(editor),
      redo: () => redo(editor),
      insert: (command, position = "selection") => {
        const range =
          position === "end"
            ? { from: editor.state.doc.length, to: editor.state.doc.length }
            : editor.state.selection.main;
        let insert = markdownInsertion(
          command,
          editor.state.sliceDoc(range.from, range.to),
        );
        if (["heading", "bullet", "task"].includes(command)) {
          if (range.from > editor.state.doc.lineAt(range.from).from)
            insert = `\n${insert}`;
          if (range.to < editor.state.doc.lineAt(range.to).to) insert += "\n";
        }
        editor.dispatch({
          changes: { from: range.from, to: range.to, insert },
          selection: { anchor: range.from + insert.length },
          scrollIntoView: true,
          userEvent: "input",
        });
        editor.focus();
      },
    });
    return () => {
      editorReady.current(null);
      view.current = null;
      editor.destroy();
    };
  }, []);
  useEffect(() => {
    if (view.current && view.current.state.doc.toString() !== source) {
      view.current.dispatch({
        changes: { from: 0, to: view.current.state.doc.length, insert: source },
        annotations: [],
      });
    }
  }, [source]);
  useEffect(() => {
    onResize();
  }, [width, collapsed]);
  return (
    <aside
      className={`markdown-source-pane ${collapsed ? "collapsed" : ""}`}
      style={{ width: collapsed ? 44 : width }}
      aria-label="Markdown editor"
    >
      <div className="markdown-source-heading">
        {collapsed ? (
          <button
            aria-label="Show Markdown source"
            title="Show Markdown source"
            onClick={() => setCollapsed(false)}
          >
            <PanelLeftOpen size={18} />
          </button>
        ) : (
          <>
            <span>
              <Code2 size={15} /> Markdown
            </span>
            <button
              aria-label="Hide Markdown source"
              title="Hide Markdown source"
              onClick={() => setCollapsed(true)}
            >
              <PanelLeftClose size={16} />
            </button>
          </>
        )}
      </div>
      <div className="markdown-source-host" ref={host} hidden={collapsed} />
      {!collapsed && (
        <div
          role="separator"
          aria-label="Markdown panel width"
          aria-orientation="vertical"
          aria-valuemin={240}
          aria-valuemax={480}
          aria-valuenow={width}
          tabIndex={0}
          className="source-resize-handle"
          onPointerDown={(event) => {
            if (event.button !== 0) return;
            gesture.current = { x: event.clientX, width };
            event.currentTarget.setPointerCapture(event.pointerId);
          }}
          onPointerMove={(event) => {
            if (gesture.current)
              setWidth(
                Math.max(
                  240,
                  Math.min(
                    480,
                    gesture.current.width + event.clientX - gesture.current.x,
                  ),
                ),
              );
          }}
          onPointerUp={() => {
            gesture.current = null;
          }}
          onPointerCancel={() => {
            if (gesture.current) setWidth(gesture.current.width);
            gesture.current = null;
          }}
          onKeyDown={(event) => {
            if (event.key === "Escape" && gesture.current) {
              setWidth(gesture.current.width);
              gesture.current = null;
            }
            if (
              ["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)
            ) {
              event.preventDefault();
              setWidth((value) =>
                event.key === "Home"
                  ? 240
                  : event.key === "End"
                    ? 480
                    : Math.max(
                        240,
                        Math.min(
                          480,
                          value + (event.key === "ArrowLeft" ? -10 : 10),
                        ),
                      ),
              );
            }
          }}
        />
      )}
    </aside>
  );
}
