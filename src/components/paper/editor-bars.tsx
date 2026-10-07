import { useEffect, useRef, useState, type ReactNode } from "react";
import type { Editor } from "@tiptap/core";
import { useEditorState } from "@tiptap/react";
import {
  AlignCenter,
  AlignLeft,
  AlignRight,
  Bold,
  Italic,
  List,
  ListTodo,
  ChevronLeft,
  ChevronRight,
  Code2,
  Link2,
  Minus,
} from "lucide-react";
import type { PaperDocument } from "../../data/model";
import { paperFonts } from "../../data/fonts";
import type { SourceEditor } from "./markdown-source";

export function CompactBar({
  children,
  label,
  className = "",
}: {
  children: ReactNode;
  label: string;
  className?: string;
}) {
  const content = useRef<HTMLDivElement>(null);
  const [edges, setEdges] = useState({ left: false, right: false });
  const measure = () => {
    const element = content.current;
    if (element)
      setEdges({
        left: element.scrollLeft > 1,
        right:
          element.scrollLeft + element.clientWidth < element.scrollWidth - 1,
      });
  };
  useEffect(() => {
    const observer = new ResizeObserver(measure);
    if (content.current) {
      observer.observe(content.current);
      if (content.current.firstElementChild)
        observer.observe(content.current.firstElementChild);
    }
    measure();
    return () => observer.disconnect();
  }, []);
  useEffect(measure, [children]);
  return (
    <div
      className={`compact-bar ${className}`}
      role="toolbar"
      aria-label={label}
    >
      {(edges.left || edges.right) && (
        <button
          className="bar-overflow"
          aria-label={`Scroll ${label.toLowerCase()} left`}
          disabled={!edges.left}
          onClick={() => content.current?.scrollBy({ left: -240 })}
        >
          <ChevronLeft size={16} />
        </button>
      )}
      <div ref={content} className="compact-bar-scroll" onScroll={measure}>
        <div className="compact-bar-content">{children}</div>
      </div>
      {(edges.left || edges.right) && (
        <button
          className="bar-overflow"
          aria-label={`Scroll ${label.toLowerCase()} right`}
          disabled={!edges.right}
          onClick={() => content.current?.scrollBy({ left: 240 })}
        >
          <ChevronRight size={16} />
        </button>
      )}
    </div>
  );
}

export function FormattingBar({
  doc,
  editor,
  sourceEditor,
  checklistActive,
  commit,
}: {
  doc: PaperDocument;
  editor: Editor | null;
  sourceEditor: SourceEditor | null;
  checklistActive: boolean;
  commit: (update: (doc: PaperDocument) => PaperDocument) => void;
}) {
  const markdown = doc.editorMode === "markdown";
  const formatting = useEditorState({
    editor,
    selector: ({ editor: current }) => ({
      bold: current?.isActive("bold") || false,
      italic: current?.isActive("italic") || false,
      heading: current?.isActive("heading", { level: 1 })
        ? "h1"
        : current?.isActive("heading", { level: 2 })
          ? "h2"
          : "p",
    }),
  });
  return (
    <CompactBar label="Text formatting" className="editor-format-bar">
      <span className="editor-mode-label">
        {markdown ? "Markdown" : "Rich text"}
      </span>
      <div className="tool-group">
        <select
          aria-label="Document font"
          value={doc.typography.font}
          onChange={(event) =>
            commit((d) => ({
              ...d,
              typography: {
                ...d.typography,
                font: event.target.value as PaperDocument["typography"]["font"],
              },
            }))
          }
        >
          {paperFonts.map((font) => (
            <option key={font}>{font}</option>
          ))}
        </select>
        <select
          aria-label="Document font size"
          value={doc.typography.size}
          onChange={(event) =>
            commit((d) => ({
              ...d,
              typography: { ...d.typography, size: Number(event.target.value) },
            }))
          }
        >
          {[8, 9, 10, 11, 12, 14, 16, 18, 20, 24, 30, 36, 48].map((size) => (
            <option value={size} key={size}>
              {size} pt
            </option>
          ))}
        </select>
        <label
          className="color-tool"
          title={markdown ? "Document text colour" : "Text colour"}
        >
          <span>A</span>
          <input
            aria-label="Text colour"
            type="color"
            value={doc.typography.color}
            onChange={(event) => {
              if (markdown || !editor || editor.state.selection.empty)
                commit((d) => ({
                  ...d,
                  typography: { ...d.typography, color: event.target.value },
                }));
              else editor.chain().focus().setColor(event.target.value).run();
            }}
          />
        </label>
      </div>
      <div className="tool-group">
        <button
          aria-label="Bold"
          title="Bold"
          aria-pressed={markdown ? undefined : formatting?.bold || false}
          onMouseDown={(event) => event.preventDefault()}
          onClick={() =>
            markdown
              ? sourceEditor?.insert("bold")
              : editor?.chain().focus().toggleBold().run()
          }
        >
          <Bold size={16} />
        </button>
        <button
          aria-label="Italic"
          title="Italic"
          aria-pressed={markdown ? undefined : formatting?.italic || false}
          onMouseDown={(event) => event.preventDefault()}
          onClick={() =>
            markdown
              ? sourceEditor?.insert("italic")
              : editor?.chain().focus().toggleItalic().run()
          }
        >
          <Italic size={16} />
        </button>
        {!markdown &&
          (
            [
              ["Align left", "left", AlignLeft],
              ["Align centre", "center", AlignCenter],
              ["Align right", "right", AlignRight],
            ] as const
          ).map(([name, alignment, Icon]) => (
            <button
              key={name}
              aria-label={name}
              title={name}
              onMouseDown={(event) => event.preventDefault()}
              onClick={() =>
                editor?.chain().focus().setTextAlign(alignment).run()
              }
            >
              <Icon size={17} />
            </button>
          ))}
        <button
          aria-label="Bullet list"
          title="Bullet list"
          onMouseDown={(event) => event.preventDefault()}
          onClick={() =>
            markdown
              ? sourceEditor?.insert("bullet")
              : editor?.chain().focus().toggleBulletList().run()
          }
        >
          <List size={17} />
        </button>
        <button
          aria-label="Checklist"
          title={
            markdown
              ? "Insert Markdown task"
              : "Checklist (Ctrl / ⌘ + Shift + 9)"
          }
          aria-pressed={markdown ? undefined : checklistActive}
          onMouseDown={(event) => event.preventDefault()}
          onClick={() =>
            markdown
              ? sourceEditor?.insert("task")
              : editor?.chain().focus().toggleTaskList().run()
          }
        >
          <ListTodo size={17} />
        </button>
        {markdown ? (
          <>
            <button
              aria-label="Heading"
              title="Insert heading"
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => sourceEditor?.insert("heading")}
            >
              <strong>H</strong>
            </button>
            <button
              aria-label="Divider"
              title="Insert divider"
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => sourceEditor?.insert("divider")}
            >
              <Minus size={17} />
            </button>
            <button
              aria-label="Link"
              title="Insert link"
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => sourceEditor?.insert("link")}
            >
              <Link2 size={17} />
            </button>
            <button
              aria-label="Code"
              title="Insert code"
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => sourceEditor?.insert("code")}
            >
              <Code2 size={17} />
            </button>
          </>
        ) : (
          <select
            aria-label="Text style"
            value={formatting?.heading || "p"}
            onChange={(event) =>
              event.target.value === "p"
                ? editor?.chain().focus().setParagraph().run()
                : editor
                    ?.chain()
                    .focus()
                    .setHeading({ level: event.target.value === "h1" ? 1 : 2 })
                    .run()
            }
          >
            <option value="p">Paragraph</option>
            <option value="h1">Heading</option>
            <option value="h2">Subheading</option>
          </select>
        )}
      </div>
    </CompactBar>
  );
}
