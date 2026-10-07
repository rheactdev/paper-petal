import { Extension, Node } from "@tiptap/core";
import StarterKit from "@tiptap/starter-kit";
import {
  TextStyle,
  Color,
  FontFamily,
  FontSize,
} from "@tiptap/extension-text-style";
import TextAlign from "@tiptap/extension-text-align";
import { TaskList } from "@tiptap/extension-list";
import { PaperTaskItem } from "./task-item";
import { InlineIcon } from "./inline-icon";
import { Plugin } from "@tiptap/pm/state";
export const PageBreak = Node.create({
  name: "pageBreak",
  group: "block",
  atom: true,
  selectable: true,
  parseHTML: () => [{ tag: "div[data-page-break]" }],
  renderHTML: () => [
    "div",
    {
      "data-page-break": "true",
      class: "manual-page-break",
      "aria-label": "Page break",
    },
  ],
  markdownTokenizer: {
    name: "pageBreak",
    level: "block",
    start: (src) => src.search(/^ {0,3}<!-- pagebreak -->[ \t]*(?:\n|$)/m),
    tokenize(src) {
      const match = src.match(/^ {0,3}<!-- pagebreak -->[ \t]*(?:\n|$)/);
      return match ? { type: "pageBreak", raw: match[0] } : undefined;
    },
  },
  parseMarkdown: () => ({ type: "pageBreak" }),
  renderMarkdown: () => "<!-- pagebreak -->",
});
export const baseExtensions = () => [
  StarterKit.configure({
    heading: { levels: [1, 2, 3, 4, 5, 6] },
    link: { openOnClick: false },
  }),
  TaskList,
  PaperTaskItem,
  TextStyle,
  Color,
  FontFamily,
  FontSize,
  TextAlign.configure({ types: ["heading", "paragraph"] }),
  PageBreak,
  InlineIcon,
];
export type FlowLayout = { count: number; active: number };
export const Pagination = Extension.create<{
  width: number;
  height: number;
  onLayout: (layout: FlowLayout, selectionChanged: boolean) => void;
}>({
  name: "paperPagination",
  addOptions() {
    return { width: 450, height: 650, onLayout: () => {} };
  },
  addProseMirrorPlugins() {
    const options = this.options;
    return [
      new Plugin({
        view(view) {
          let frame = 0,
            disposed = false,
            lastCount = 0;
          function measure(selectionChanged = false) {
            cancelAnimationFrame(frame);
            frame = requestAnimationFrame(() => {
              if (disposed || view.composing) return;
              const dom = view.dom;
              const width =
                parseFloat(dom.style.width) || dom.clientWidth || options.width;
              const count = Math.max(
                1,
                Math.ceil(dom.scrollWidth / width - 0.02),
              );
              let active = 0;
              try {
                const coords = view.coordsAtPos(view.state.selection.head),
                  bounds = dom.getBoundingClientRect();
                const scale = bounds.width / width;
                active = Math.min(
                  count - 1,
                  Math.max(
                    0,
                    Math.floor(
                      (coords.left - bounds.left + 1) / (width * scale),
                    ),
                  ),
                );
              } catch {}
              if (count !== lastCount || selectionChanged) {
                lastCount = count;
                options.onLayout({ count, active }, selectionChanged);
              }
            });
          }
          const observer = new ResizeObserver(() => measure());
          observer.observe(view.dom);
          const fontsLoaded = () => measure();
          document.fonts.addEventListener("loadingdone", fontsLoaded);
          document.fonts.ready.then(() => measure());
          measure();
          return {
            update(next, previous) {
              measure(!next.state.selection.eq(previous.selection));
            },
            destroy() {
              disposed = true;
              observer.disconnect();
              document.fonts.removeEventListener("loadingdone", fontsLoaded);
              cancelAnimationFrame(frame);
            },
          };
        },
        props: {
          handleDOMEvents: {
            compositionend: () => {
              requestAnimationFrame(() =>
                this.editor.view.dispatch(
                  this.editor.state.tr.setMeta("composition-complete", true),
                ),
              );
              return false;
            },
          },
        },
      }),
    ];
  },
});
