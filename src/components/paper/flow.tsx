import { EditorContent, useEditor } from "@tiptap/react";
import { generateHTML, type Editor, type JSONContent } from "@tiptap/core";
import { useEffect, useMemo, useRef, useState } from "react";
import { loadFlowIcons } from "../../editor/inline-icon";
import {
  baseExtensions,
  Pagination,
  type FlowLayout,
} from "../../editor/extensions";
import {
  MM,
  cleanRich,
  pageMargins,
  type PaperDocument,
} from "../../data/model";
import { headerSpace } from "../../data/header";
export function flowStyle(doc: PaperDocument) {
  return {
    width:
      (doc.paper.width - doc.paper.margins.inner - doc.paper.margins.outer) *
      MM,
    height:
      (doc.paper.height -
        doc.paper.margins.top -
        doc.paper.margins.bottom -
        headerSpace(doc.header)) *
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
export function useFlowHTML(doc: PaperDocument) {
  const [resolved, setResolved] = useState<PaperDocument["flow"] | null>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    let disposed = false;
    setError("");
    loadFlowIcons(doc.flow)
      .then(() => {
        if (!disposed) setResolved(doc.flow);
      })
      .catch(() => {
        if (!disposed)
          setError(
            "An icon could not be loaded. Reload this document to try again.",
          );
      });
    return () => {
      disposed = true;
    };
  }, [doc.flow]);
  const html = useMemo(() => flowHTML(doc), [doc.flow, resolved]);
  return { html, ready: resolved === doc.flow, error };
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
        top: (m.top + headerSpace(doc.header)) * MM,
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
  onFocus,
  readonly = false,
  artworkKey,
}: {
  doc: PaperDocument;
  index: number;
  onChange: (json: JSONContent) => void;
  onLayout: (layout: FlowLayout, selectionChanged: boolean) => void;
  onEditor?: (editor: Editor | null) => void;
  onFocus?: () => void;
  readonly?: boolean;
  artworkKey?: string;
}) {
  const focusRef = useRef(onFocus);
  focusRef.current = onFocus;
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
          "aria-readonly": readonly ? "true" : "false",
        },
      },
      onUpdate: ({ editor }) => changeRef.current(editor.getJSON()),
      onFocus: () => focusRef.current?.(),
    },
    [extensions],
  );
  useEffect(() => {
    if (editor && !editor.isDestroyed) {
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
  useEffect(() => {
    if (
      readonly &&
      editor &&
      !editor.isDestroyed &&
      JSON.stringify(cleanRich(editor.getJSON())) !== JSON.stringify(doc.flow)
    )
      editor.commands.setContent(doc.flow as JSONContent, {
        emitUpdate: false,
      });
  }, [readonly, editor, doc.flow, artworkKey]);
  const m = pageMargins(doc, index);
  return (
    <div
      aria-hidden={readonly || undefined}
      inert={readonly || undefined}
      className={`flow-clip live-flow ${readonly ? "readonly-flow" : ""}`}
      style={{
        left: m.left * MM,
        top: (m.top + headerSpace(doc.header)) * MM,
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
