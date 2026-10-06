import { EditorContent, useEditor } from "@tiptap/react";
import { generateHTML, type Editor, type JSONContent } from "@tiptap/core";
import { useEffect, useMemo, useRef } from "react";
import {
  baseExtensions,
  Pagination,
  type FlowLayout,
} from "../../editor/extensions";
import { MM, pageMargins, type PaperDocument } from "../../data/model";
export function flowStyle(doc: PaperDocument) {
  return {
    width:
      (doc.paper.width - doc.paper.margins.inner - doc.paper.margins.outer) *
      MM,
    height:
      (doc.paper.height - doc.paper.margins.top - doc.paper.margins.bottom) *
      MM,
    columnWidth:
      (doc.paper.width - doc.paper.margins.inner - doc.paper.margins.outer) *
      MM,
    columnGap: 0,
    columnFill: "auto" as const,
    fontFamily: doc.typography.font,
    fontSize: `${doc.typography.size}pt`,
    color: doc.typography.color,
  };
}
export function flowHTML(doc: PaperDocument) {
  return generateHTML(doc.flow as JSONContent, baseExtensions());
}
export function FlowPreview({
  doc,
  index,
  html,
}: {
  doc: PaperDocument;
  index: number;
  html: string;
}) {
  const m = pageMargins(doc, index),
    style = flowStyle(doc);
  return (
    <div
      className="flow-clip"
      aria-hidden="true"
      inert
      style={{
        left: m.left * MM,
        top: m.top * MM,
        width: style.width,
        height: style.height,
      }}
    >
      <div
        className="flow-text flow-preview"
        style={{ ...style, transform: `translateX(${-index * style.width}px)` }}
        dangerouslySetInnerHTML={{ __html: html }}
      />
    </div>
  );
}
export function FlowEditor({
  doc,
  index,
  onChange,
  onLayout,
  onEditor,
  readonly = false,
}: {
  doc: PaperDocument;
  index: number;
  onChange: (json: JSONContent) => void;
  onLayout: (layout: FlowLayout, selectionChanged: boolean) => void;
  onEditor?: (editor: Editor | null) => void;
  readonly?: boolean;
}) {
  const style = flowStyle(doc);
  const layoutRef = useRef(onLayout);
  layoutRef.current = onLayout;
  const changeRef = useRef(onChange);
  changeRef.current = onChange;
  const extensions = useMemo(
    () => [
      ...baseExtensions(),
      Pagination.configure({
        width: style.width,
        height: style.height,
        onLayout: (l, s) => layoutRef.current(l, s),
      }),
    ],
    [],
  );
  const editor = useEditor(
    {
      extensions,
      content: doc.flow as JSONContent,
      immediatelyRender: false,
      editable: !readonly,
      editorProps: {
        attributes: {
          class: "flow-text",
          role: "textbox",
          "aria-label": "Continuous document text",
          "aria-multiline": "true",
        },
      },
      onUpdate: ({ editor }) => changeRef.current(editor.getJSON()),
    },
    [extensions],
  );
  useEffect(() => {
    if (editor) {
      Object.assign(editor.view.dom.style, {
        ...style,
        width: `${style.width}px`,
        height: `${style.height}px`,
        columnWidth: `${style.width}px`,
        columnGap: "0px",
      });
      editor.view.dispatch(editor.state.tr.setMeta("layout", true));
    }
  }, [
    editor,
    doc.typography.font,
    doc.typography.size,
    doc.typography.color,
    style.width,
    style.height,
  ]);
  useEffect(() => {
    onEditor?.(editor);
    return () => onEditor?.(null);
  }, [editor]);
  const m = pageMargins(doc, index);
  return (
    <div
      className="flow-clip live-flow"
      style={{
        left: m.left * MM,
        top: m.top * MM,
        width: style.width,
        height: style.height,
      }}
    >
      <div style={{ transform: `translateX(${-index * style.width}px)` }}>
        <EditorContent editor={editor} />
      </div>
    </div>
  );
}
