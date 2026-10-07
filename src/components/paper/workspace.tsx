import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import { createClientOnlyFn } from "@tanstack/react-start";
import type { Editor, JSONContent } from "@tiptap/core";
import { useEditorState } from "@tiptap/react";
import {
  AlignCenter,
  AlignLeft,
  AlignRight,
  ArrowDown,
  ArrowLeft,
  ArrowUp,
  Bold,
  Check,
  ChevronLeft,
  ChevronRight,
  Copy,
  Download,
  Flower2,
  ImagePlus,
  Italic,
  Layers,
  List,
  ListTodo,
  LockKeyhole,
  Minus,
  Plus,
  Printer,
  Redo2,
  Settings2,
  Square,
  Type,
  Undo2,
  UnlockKeyhole,
  X,
  AlertTriangle,
  PanelLeftClose,
  PanelLeftOpen,
  PanelRightClose,
  PanelRightOpen,
  MoreHorizontal,
  Maximize2,
} from "lucide-react";
import {
  MM,
  objectStyle,
  cleanRich,
  createObject,
  normaliseDocument,
  objectWarnings,
  pageMargins,
  syncPages,
  type PaperDocument,
  type PaperObject,
  type editorSearch,
} from "../../data/model";
import type { z } from "zod";
import { paperFonts } from "../../data/fonts";
import {
  assetURLs,
  exportDocument,
  revokeAssets,
  saveAsset,
  saveDocument,
} from "../../data/storage";
import { FlowEditor, FlowPreview, flowHTML } from "./flow";
import { ObjectArtwork } from "./art";
import { StickerBrowser } from "./sticker-browser";
import { ObjectControls } from "./object-controls";
import { trackObjectGesture } from "./object-gesture";
import {
  geometryOf,
  resizeObject,
  rotateObject,
  normalizeAngle,
  cornerSigns,
  type ObjectGesture,
  type ObjectGeometry,
  type Point,
} from "../../editor/object-geometry";
import {
  dropOnPage,
  insideRect,
  isRasterObject,
  placeSticker,
  type StickerDrop,
  type StickerEntry,
} from "../../data/stickers";
import { Dialog } from "./library";
import { AccountControls } from "./account";
import type { FlowLayout } from "../../editor/extensions";
const prepareSticker = createClientOnlyFn(async (entry: StickerEntry) => {
  const client = await import("./stickers.client");
  return client.prepareSticker(entry);
});

function useAutosave(doc: PaperDocument) {
  const [status, setStatus] = useState<"saving" | "saved" | "failed">("saved");
  const latest = useRef(doc);
  latest.current = doc;
  const queue = useRef(Promise.resolve());
  const flush = useCallback(async () => {
    setStatus("saving");
    const current = latest.current;
    const next = queue.current
      .catch(() => {})
      .then(() => saveDocument(current));
    queue.current = next;
    try {
      await next;
      setStatus("saved");
    } catch (e) {
      setStatus("failed");
      throw e;
    }
  }, []);
  useEffect(() => {
    setStatus("saving");
    const timer = setTimeout(() => flush().catch(() => {}), 450);
    return () => clearTimeout(timer);
  }, [doc, flush]);
  useEffect(() => {
    const save = () => {
      if (document.visibilityState === "hidden") flush().catch(() => {});
    };
    const warn = (event: BeforeUnloadEvent) => {
      if (status !== "saved") {
        event.preventDefault();
        event.returnValue = "";
      }
    };
    document.addEventListener("visibilitychange", save);
    window.addEventListener("beforeunload", warn);
    return () => {
      document.removeEventListener("visibilitychange", save);
      window.removeEventListener("beforeunload", warn);
    };
  }, [status, flush]);
  return { status, flush };
}
export function NumberField({
  label,
  value,
  onCommit,
  min,
  max,
  unit = "mm",
  step = 1,
}: {
  label: string;
  value: number;
  onCommit: (v: number) => void;
  min?: number;
  max?: number;
  unit?: string;
  step?: number;
}) {
  const [draft, setDraft] = useState(String(Math.round(value * 100) / 100));
  useEffect(() => setDraft(String(Math.round(value * 100) / 100)), [value]);
  return (
    <label className="number-field">
      <span>{label}</span>
      <div>
        <input
          aria-label={label}
          type="number"
          step={step}
          min={min}
          max={max}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={() => {
            const n = Number(draft);
            if (
              draft !== "" &&
              Number.isFinite(n) &&
              (min === undefined || n >= min) &&
              (max === undefined || n <= max)
            ) {
              onCommit(n);
              setDraft(String(value));
            } else setDraft(String(value));
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter") e.currentTarget.blur();
          }}
        />
        <small>{unit}</small>
      </div>
    </label>
  );
}
export function Workspace({
  initial,
  search,
}: {
  initial: PaperDocument;
  search: z.infer<typeof editorSearch>;
}) {
  const [doc, setDoc] = useState(initial),
    [page, setPage] = useState(
      Math.min(initial.pages.length - 1, search.page - 1),
    ),
    [view, setView] = useState(search.view),
    [zoom, setZoom] = useState(search.zoom),
    [selected, setSelected] = useState<string | null>(null),
    [tab, setTab] = useState<"edit" | "page" | "object">("edit"),
    [libraryCollapsed, setLibraryCollapsed] = useState(false),
    [propertiesCollapsed, setPropertiesCollapsed] = useState(
      () => typeof window !== "undefined" && window.innerWidth < 900,
    ),
    [showGuides, setShowGuides] = useState(true),
    [error, setError] = useState(""),
    [assets, setAssets] = useState<Record<string, string>>({}),
    [editor, setEditor] = useState<Editor | null>(null),
    [picker, setPicker] = useState<"shape" | null>(null),
    [sidebar, setSidebar] = useState<"pages" | "stickers">("pages"),
    [dropTarget, setDropTarget] = useState<string | null>(null),
    [announcement, setAnnouncement] = useState(""),
    [focusObject, setFocusObject] = useState<string | null>(null),
    [help, setHelp] = useState(false),
    [undoStack, setUndoStack] = useState<PaperDocument[]>([]),
    [redoStack, setRedoStack] = useState<PaperDocument[]>([]),
    [flowCount, setFlowCount] = useState(1),
    [customPaper, setCustomPaper] = useState(
      !(
        (initial.paper.width === 148 && initial.paper.height === 210) ||
        (initial.paper.width === 210 && initial.paper.height === 148)
      ),
    );
  const checklistActive = useEditorState({
    editor,
    selector: ({ editor }) => editor?.isActive("taskList") ?? false,
  });
  const navigate = useNavigate(),
    imageInput = useRef<HTMLInputElement>(null),
    viewport = useRef<HTMLDivElement>(null),
    docRef = useRef(doc),
    mounted = useRef(true),
    activeGesture = useRef<(() => void) | null>(null),
    pageRef = useRef(page),
    lastEdit = useRef<"flow" | "layout">("flow");
  docRef.current = doc;
  pageRef.current = page;
  const { status, flush } = useAutosave(doc);
  useEffect(() => {
    mounted.current = true;
    return () => {
      activeGesture.current?.();
      mounted.current = false;
    };
  }, []);
  useEffect(() => {
    if (!focusObject) return;
    const button = Array.from(
      viewport.current?.querySelectorAll<HTMLButtonElement>(
        "[data-object-id]",
      ) || [],
    ).find((element) => element.dataset.objectId === focusObject);
    if (button) {
      button.focus({ preventScroll: true });
      setFocusObject(null);
    }
  }, [focusObject, page, doc]);
  const object = doc.pages[page]?.objects.find((o) => o.id === selected);
  const html = useMemo(() => flowHTML(doc), [doc.flow]);
  const pageWidth = doc.paper.width * MM,
    pageHeight = doc.paper.height * MM;
  useEffect(() => {
    let disposed = false,
      urls: Record<string, string> = {};
    assetURLs(doc)
      .then((result) => {
        urls = result;
        if (disposed) revokeAssets(result);
        else setAssets(result);
      })
      .catch(() => setError("Some pictures could not be loaded."));
    return () => {
      disposed = true;
      revokeAssets(urls);
    };
  }, [
    doc.pages.flatMap((p) => p.objects.map((o) => o.assetId || "")).join(","),
  ]);
  useEffect(() => {
    navigate({
      to: "/documents/$documentId",
      params: { documentId: doc.id },
      search: { page: page + 1, view, zoom },
      replace: true,
    });
  }, [page, view, zoom]);
  useEffect(() => {
    setPage(Math.min(doc.pages.length - 1, Math.max(0, search.page - 1)));
    setView(search.view);
    setZoom(search.zoom);
  }, [search.page, search.view, search.zoom]);
  const commit = useCallback(
    (update: (d: PaperDocument) => PaperDocument, history = true) => {
      const before = docRef.current;
      try {
        const next = normaliseDocument({
          ...update(before),
          updatedAt: new Date().toISOString(),
        });
        if (history) {
          lastEdit.current = "layout";
          setUndoStack((s) => [...s.slice(-49), structuredClone(before)]);
          setRedoStack([]);
        }
        setDoc(next);
        docRef.current = next;
      } catch (e) {
        setError(
          e instanceof Error ? e.message : "This change could not be applied.",
        );
      }
    },
    [],
  );
  const updateObject = (changes: Partial<PaperObject>, history = true) =>
    commit(
      (d) => ({
        ...d,
        pages: d.pages.map((p, i) =>
          i === page
            ? {
                ...p,
                objects: p.objects.map((o) =>
                  o.id === selected ? { ...o, ...changes } : o,
                ),
              }
            : p,
        ),
      }),
      history,
    );
  const onFlowChange = useCallback(
    (json: JSONContent) => {
      lastEdit.current = "flow";
      commit((d) => ({ ...d, flow: cleanRich(json) }), false);
    },
    [commit],
  );
  const onLayout = useCallback(
    (layout: FlowLayout, selectionChanged: boolean) => {
      setFlowCount(layout.count);
      const current = docRef.current;
      const pages = syncPages(current.pages, layout.count);
      if (pages.length !== current.pages.length) {
        const next = { ...current, pages };
        docRef.current = next;
        setDoc(next);
      }
      if (selectionChanged) {
        setPage(layout.active);
        setSelected(null);
      } else if (pageRef.current >= pages.length) setPage(pages.length - 1);
    },
    [],
  );
  function addObject(
    type: PaperObject["type"],
    props: Partial<PaperObject> = {},
  ) {
    const obj = createObject(type, props);
    commit((d) => ({
      ...d,
      pages: d.pages.map((p, i) =>
        i === page ? { ...p, objects: [...p.objects, obj] } : p,
      ),
    }));
    setSelected(obj.id);
    setTab("object");
    setPicker(null);
  }
  function findStickerTarget(x: number, y: number): StickerDrop | null {
    const canvas = viewport.current;
    if (!canvas || !insideRect(x, y, canvas.getBoundingClientRect()))
      return null;
    for (const sheet of canvas.querySelectorAll<HTMLElement>(
      "[data-sticker-page]",
    )) {
      const target = dropOnPage(
        x,
        y,
        sheet.getBoundingClientRect(),
        docRef.current.paper,
        sheet.dataset.stickerPage!,
      );
      if (target) return target;
    }
    return null;
  }
  async function insertSticker(entry: StickerEntry, target?: StickerDrop) {
    const current = docRef.current;
    const drop = target || {
      pageId: current.pages[pageRef.current].id,
      x: current.paper.width / 2,
      y: current.paper.height / 2,
    };
    try {
      const props = await prepareSticker(entry);
      if (!mounted.current) return;
      editor?.commands.blur();
      const placed = placeSticker(docRef.current, entry, props, drop);
      commit(() => placed.document);
      const index = placed.document.pages.findIndex(
        (p) => p.id === drop.pageId,
      );
      pageRef.current = index;
      setPage(index);
      setSelected(placed.object.id);
      setTab("object");
      setFocusObject(placed.object.id);
      setAnnouncement(
        `${entry.name} sticker added to page ${index + 1}. Use arrow keys to move it.`,
      );
    } catch (error) {
      if (mounted.current)
        setError(
          error instanceof Error
            ? error.message
            : "The sticker could not be added.",
        );
    }
  }
  async function insertPicture(file?: File) {
    if (!file) return;
    try {
      const id = await saveAsset(file);
      const url = URL.createObjectURL(file);
      const image = new Image();
      image.src = url;
      await image.decode();
      const ratio = image.naturalWidth / image.naturalHeight;
      URL.revokeObjectURL(url);
      addObject("image", {
        label: file.name,
        assetId: id,
        width: 60,
        height: 60 / ratio,
        aspectRatio: ratio,
      });
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "The picture could not be opened.",
      );
    }
  }
  function resize(axis: "width" | "height", value: number) {
    if (!object) return;
    const changes: Partial<PaperObject> = { [axis]: value };
    if (isRasterObject(object) && object.keepRatio && object.aspectRatio) {
      if (axis === "width") changes.height = value / object.aspectRatio;
      else changes.width = value * object.aspectRatio;
    }
    updateObject(changes);
  }
  function undo() {
    if (
      (editor?.isFocused || lastEdit.current === "flow") &&
      editor?.can().undo()
    ) {
      editor.commands.undo();
      return;
    }
    if (!undoStack.length) {
      editor?.commands.undo();
      return;
    }
    const previous = {
      ...undoStack[undoStack.length - 1],
      flow: docRef.current.flow,
      updatedAt: new Date().toISOString(),
    };
    const undone = structuredClone(docRef.current);
    setRedoStack((s) => [...s, undone]);
    setUndoStack((s) => s.slice(0, -1));
    setDoc(previous);
    docRef.current = previous;
  }
  function redo() {
    if (
      (editor?.isFocused || lastEdit.current === "flow") &&
      editor?.can().redo()
    ) {
      editor.commands.redo();
      return;
    }
    if (!redoStack.length) {
      editor?.commands.redo();
      return;
    }
    const next = {
      ...redoStack[redoStack.length - 1],
      flow: docRef.current.flow,
      updatedAt: new Date().toISOString(),
    };
    const redone = structuredClone(docRef.current);
    setUndoStack((s) => [...s, redone]);
    setRedoStack((s) => s.slice(0, -1));
    setDoc(next);
    docRef.current = next;
  }
  useEffect(() => {
    const handle = (event: KeyboardEvent) => {
      if (activeGesture.current) {
        if (
          (event.ctrlKey || event.metaKey) &&
          ["p", "z"].includes(event.key.toLowerCase())
        )
          event.preventDefault();
        return;
      }
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "p") {
        event.preventDefault();
        goPrint();
        return;
      }
      const target = event.target as HTMLElement;
      if (
        target.isContentEditable ||
        ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName)
      )
        return;
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "z") {
        event.preventDefault();
        event.shiftKey ? redo() : undo();
        return;
      }
      if (!object || object.locked) return;
      const step = event.shiftKey ? 10 : 1;
      const move: Record<string, [number, number]> = {
        ArrowLeft: [-step, 0],
        ArrowRight: [step, 0],
        ArrowUp: [0, -step],
        ArrowDown: [0, step],
      };
      if (move[event.key]) {
        event.preventDefault();
        updateObject({
          x: object.x + move[event.key][0],
          y: object.y + move[event.key][1],
        });
      }
      if (event.key === "Delete" || event.key === "Backspace") {
        event.preventDefault();
        removeObject();
      }
    };
    window.addEventListener("keydown", handle);
    return () => window.removeEventListener("keydown", handle);
  }, [object, undoStack, redoStack, editor]);
  function removeObject() {
    if (!object || object.locked) return;
    commit((d) => ({
      ...d,
      pages: d.pages.map((p, i) =>
        i === page
          ? { ...p, objects: p.objects.filter((o) => o.id !== selected) }
          : p,
      ),
    }));
    setSelected(null);
  }
  function moveLayer(direction: number) {
    if (!object || object.locked) return;
    commit((d) => ({
      ...d,
      pages: d.pages.map((p, i) => {
        if (i !== page) return p;
        const objects = [...p.objects],
          index = objects.findIndex((o) => o.id === selected),
          dest = Math.min(objects.length - 1, Math.max(0, index + direction));
        [objects[index], objects[dest]] = [objects[dest], objects[index]];
        return { ...p, objects };
      }),
    }));
  }
  function beginObjectGesture(
    event: React.PointerEvent<HTMLButtonElement>,
    id: string,
    index: number,
    kind: ObjectGesture,
  ) {
    if (event.button !== 0) return;
    const pageId = docRef.current.pages[index]?.id;
    const original = docRef.current.pages[index]?.objects.find(
      (item) => item.id === id,
    );
    if (!pageId || !original || original.locked) return;
    event.preventDefault();
    event.stopPropagation();
    activeGesture.current?.();
    editor?.commands.blur();
    setPage(index);
    setSelected(id);
    setTab("object");
    event.currentTarget.focus({ preventScroll: true });
    event.currentTarget.setPointerCapture(event.pointerId);
    const before = structuredClone(docRef.current);
    const pagePoint = (clientX: number, clientY: number): Point => {
      const sheet = Array.from(
        viewport.current?.querySelectorAll<HTMLElement>(
          "[data-sticker-page]",
        ) || [],
      ).find((element) => element.dataset.stickerPage === pageId)!;
      const rect = sheet.getBoundingClientRect();
      return {
        x: ((clientX - rect.left) / rect.width) * before.paper.width,
        y: ((clientY - rect.top) / rect.height) * before.paper.height,
      };
    };
    const start = pagePoint(event.clientX, event.clientY);
    const apply = (geometry: ObjectGeometry) => {
      const next = {
        ...docRef.current,
        updatedAt: new Date().toISOString(),
        pages: docRef.current.pages.map((p) =>
          p.id === pageId
            ? {
                ...p,
                objects: p.objects.map((item) =>
                  item.id === id ? { ...item, ...geometry } : item,
                ),
              }
            : p,
        ),
      };
      docRef.current = next;
      setDoc(next);
    };
    activeGesture.current = trackObjectGesture(window, event.nativeEvent, {
      move: (pointer) => {
        const point = pagePoint(pointer.clientX, pointer.clientY),
          delta = { x: point.x - start.x, y: point.y - start.y };
        const geometry =
          kind === "move"
            ? {
                ...geometryOf(original),
                x: original.x + delta.x,
                y: original.y + delta.y,
              }
            : kind === "rotate"
              ? rotateObject(original, start, point, pointer.shiftKey)
              : resizeObject(
                  original,
                  kind,
                  delta,
                  (isRasterObject(original) || original.type === "sticker") &&
                    original.keepRatio,
                );
        apply(geometry);
      },
      finish: (cancelled, moved) => {
        activeGesture.current = null;
        if (!moved) return;
        if (cancelled) {
          apply(geometryOf(original));
          return;
        }
        const final = docRef.current.pages
          .find((p) => p.id === pageId)
          ?.objects.find((item) => item.id === id);
        if (
          !final ||
          JSON.stringify(geometryOf(final)) ===
            JSON.stringify(geometryOf(original))
        )
          return;
        lastEdit.current = "layout";
        setUndoStack((stack) => [...stack.slice(-49), before]);
        setRedoStack([]);
        setAnnouncement(
          `${original.label} ${kind === "move" ? "moved" : kind === "rotate" ? "rotated" : "resized"}.`,
        );
      },
    });
  }
  function handleControlKey(
    event: React.KeyboardEvent<HTMLButtonElement>,
    kind: ObjectGesture,
  ) {
    if (!object || object.locked || !event.key.startsWith("Arrow")) return;
    event.preventDefault();
    event.stopPropagation();
    if (kind === "rotate") {
      if (event.key === "ArrowLeft" || event.key === "ArrowRight")
        updateObject({
          rotation: normalizeAngle(
            object.rotation +
              (event.key === "ArrowLeft" ? -1 : 1) * (event.shiftKey ? 15 : 1),
          ),
        });
      return;
    }
    if (kind === "move") return;
    const step = event.shiftKey ? 10 : 1,
      sign = cornerSigns[kind];
    const local = {
      x:
        event.key === "ArrowRight"
          ? step
          : event.key === "ArrowLeft"
            ? -step
            : 0,
      y: event.key === "ArrowDown" ? step : event.key === "ArrowUp" ? -step : 0,
    };
    const proportional =
      (isRasterObject(object) || object.type === "sticker") && object.keepRatio;
    if (proportional) {
      const factor = local.x
        ? (sign.x * local.x) / object.width
        : (sign.y * local.y) / object.height;
      local.x = sign.x * object.width * factor;
      local.y = sign.y * object.height * factor;
    }
    // Keyboard arrows adjust width/height in the object's own axes.
    const angle = (object.rotation * Math.PI) / 180;
    updateObject(
      resizeObject(
        object,
        kind,
        {
          x: local.x * Math.cos(angle) - local.y * Math.sin(angle),
          y: local.x * Math.sin(angle) + local.y * Math.cos(angle),
        },
        proportional,
      ),
    );
  }
  function fitPage() {
    const columns =
      view === "spread"
        ? Math.min(
            2,
            docRef.current.pages.length - Math.floor(pageRef.current / 2) * 2,
          )
        : 1;
    setZoom(
      Math.max(
        0.25,
        Math.min(
          1.3,
          ((viewport.current?.clientWidth || 700) - 48) /
            (pageWidth * columns + 28 * (columns - 1)),
          ((viewport.current?.clientHeight || 800) - 68) / pageHeight,
        ),
      ),
    );
  }
  function paperChange(changes: Partial<PaperDocument["paper"]>) {
    commit((d) => ({ ...d, paper: { ...d.paper, ...changes } }));
  }
  async function goHome() {
    try {
      await flush();
      navigate({ to: "/" });
    } catch {
      setError(
        "Your document could not be saved. Download a backup before leaving.",
      );
    }
  }
  async function goPrint() {
    try {
      await flush();
      navigate({
        to: "/print/$documentId",
        params: { documentId: doc.id },
        search: { mode: "document", inset: 6, background: "content" },
      });
    } catch {
      setError(
        "Your document could not be saved. Download a backup before leaving.",
      );
    }
  }
  const spreadStart = Math.floor(page / 2) * 2;
  const renderedIndices =
    view === "spread"
      ? [
          spreadStart,
          ...(spreadStart + 1 < doc.pages.length ? [spreadStart + 1] : []),
        ]
      : [page];
  const warnings = object ? objectWarnings(doc, page, object) : [];
  return (
    <div className="editor-shell">
      {error && (
        <div className="notice error" role="alert">
          {error}
          <button onClick={() => setError("")} aria-label="Dismiss error">
            <X size={16} />
          </button>
        </div>
      )}
      {status === "failed" && (
        <div className="notice error" role="alert">
          Autosave failed. Your current edits are still open.
          <button onClick={() => flush().catch(() => {})}>Retry saving</button>
          <button
            onClick={() =>
              exportDocument(doc).catch((e) => setError(e.message))
            }
          >
            Download backup
          </button>
        </div>
      )}
      <div className="editor-body">
        <aside
          className={`pages-sidebar ${sidebar === "stickers" ? "with-stickers" : ""} ${libraryCollapsed ? "collapsed" : ""}`}
        >
          {libraryCollapsed ? (
            <button
              className="panel-open"
              aria-label="Show library"
              title="Show library"
              onClick={() => setLibraryCollapsed(false)}
            >
              <PanelLeftOpen size={18} />
            </button>
          ) : (
            <>
              <div className="document-links">
                <Link
                  className="back-library"
                  to="/"
                  onClick={(event) => {
                    event.preventDefault();
                    goHome();
                  }}
                >
                  <ArrowLeft size={16} /> My documents
                </Link>
                <button
                  aria-label={
                    libraryCollapsed ? "Show library" : "Hide library"
                  }
                  title={libraryCollapsed ? "Show library" : "Hide library"}
                  onClick={() => setLibraryCollapsed(!libraryCollapsed)}
                >
                  {libraryCollapsed ? (
                    <PanelLeftOpen size={17} />
                  ) : (
                    <PanelLeftClose size={17} />
                  )}
                </button>
                <details className="document-menu">
                  <summary
                    aria-label="More document actions"
                    title="More document actions"
                  >
                    <MoreHorizontal size={19} />
                  </summary>
                  <div className="document-menu-content">
                    <button
                      aria-label="Download document backup"
                      onClick={() =>
                        exportDocument(doc).catch((error) =>
                          setError(error.message),
                        )
                      }
                    >
                      <Download size={16} /> Download backup
                    </button>
                    <button onClick={() => setHelp(true)}>Keyboard help</button>
                    <AccountControls
                      onSignIn={async () => {
                        try {
                          await flush();
                          await navigate({ to: "/sign-in" });
                        } catch {
                          setError(
                            "Save your document before leaving. Retry saving or download a backup.",
                          );
                        }
                      }}
                    />
                  </div>
                </details>
              </div>
              <div
                className="library-tabs"
                role="tablist"
                aria-label="Canvas library"
              >
                {(["pages", "stickers"] as const).map((mode) => (
                  <button
                    key={mode}
                    role="tab"
                    id={`${mode === "pages" ? "pages" : "sticker"}-tab`}
                    aria-selected={sidebar === mode}
                    aria-controls={
                      mode === "pages" ? "pages-panel" : "sticker-panel"
                    }
                    tabIndex={sidebar === mode ? 0 : -1}
                    onClick={() => setSidebar(mode)}
                    onKeyDown={(event) => {
                      if (
                        ["ArrowLeft", "ArrowRight", "Home", "End"].includes(
                          event.key,
                        )
                      ) {
                        event.preventDefault();
                        event.stopPropagation();
                        const next =
                          event.key === "Home"
                            ? "pages"
                            : event.key === "End"
                              ? "stickers"
                              : sidebar === "pages"
                                ? "stickers"
                                : "pages";
                        setSidebar(next);
                        event.currentTarget.parentElement
                          ?.querySelector<HTMLButtonElement>(
                            `#${next === "pages" ? "pages" : "sticker"}-tab`,
                          )
                          ?.focus();
                      }
                    }}
                  >
                    {mode === "pages" ? "Pages" : "Stickers"}
                  </button>
                ))}
              </div>
              {sidebar === "stickers" ? (
                <StickerBrowser
                  onInsert={insertSticker}
                  findTarget={findStickerTarget}
                  onTarget={setDropTarget}
                  previewSize={25 * MM * zoom}
                />
              ) : (
                <div
                  className="pages-panel"
                  role="tabpanel"
                  id="pages-panel"
                  aria-labelledby="pages-tab"
                >
                  <div className="sidebar-heading">
                    <span>PAGES</span>
                    <span>{doc.pages.length}</span>
                  </div>
                  <div className="page-thumbnails">
                    {doc.pages.map((p, i) => (
                      <button
                        key={p.id}
                        className={`page-thumbnail ${i === page ? "active" : ""}`}
                        onClick={() => {
                          setPage(i);
                          setSelected(null);
                        }}
                        aria-label={`Go to page ${i + 1}`}
                        aria-current={i === page ? "page" : undefined}
                      >
                        <div
                          className="thumbnail-sheet"
                          style={{
                            width: pageWidth * 0.17,
                            height: pageHeight * 0.17,
                          }}
                        >
                          <div
                            className="thumbnail-content"
                            aria-hidden="true"
                            style={{
                              width: pageWidth,
                              height: pageHeight,
                              transform: "scale(.17)",
                              background: doc.paper.background,
                            }}
                          >
                            <FlowPreview doc={doc} index={i} html={html} />
                            {p.objects.map((o) => (
                              <div
                                key={o.id}
                                className="paper-object preview-object"
                                style={objectStyle(o)}
                              >
                                <ObjectArtwork object={o} assets={assets} />
                              </div>
                            ))}
                          </div>
                        </div>
                        <span>{String(i + 1).padStart(2, "0")}</span>
                      </button>
                    ))}
                  </div>
                  <button
                    className="add-page"
                    onClick={() =>
                      editor
                        ?.chain()
                        .focus("end")
                        .insertContent([
                          { type: "pageBreak" },
                          { type: "paragraph" },
                        ])
                        .run()
                    }
                  >
                    <Plus size={15} /> Add page
                  </button>
                </div>
              )}
            </>
          )}
        </aside>
        <div className="canvas-column">
          <div className="canvas-scroll" ref={viewport}>
            <div
              className="stage-size"
              style={{
                width:
                  (pageWidth * renderedIndices.length +
                    28 * (renderedIndices.length - 1)) *
                  zoom,
                height: pageHeight * zoom,
              }}
            >
              <div
                className="paper-stage"
                style={{
                  width:
                    pageWidth * renderedIndices.length +
                    28 * (renderedIndices.length - 1),
                  height: pageHeight,
                  transform: `scale(${zoom})`,
                }}
              >
                {renderedIndices.map((index, position) => {
                  const m = pageMargins(doc, index);
                  return (
                    <div
                      className={`paper-sheet pattern-${doc.paper.pattern} ${dropTarget === doc.pages[index].id ? "sticker-drop-target" : ""}`}
                      data-sticker-page={doc.pages[index].id}
                      key={doc.pages[index].id}
                      style={{
                        width: pageWidth,
                        height: pageHeight,
                        backgroundColor: doc.paper.background,
                        left: position * (pageWidth + 28),
                      }}
                      onClick={() => {
                        if (index !== page) {
                          setPage(index);
                          setSelected(null);
                        }
                      }}
                    >
                      {showGuides && (
                        <div
                          className="margin-guide"
                          style={{
                            left: m.left * MM,
                            top: m.top * MM,
                            right: m.right * MM,
                            bottom: m.bottom * MM,
                          }}
                        />
                      )}
                      {index !== page && (
                        <FlowPreview doc={doc} index={index} html={html} />
                      )}
                      <div className="objects-layer">
                        {doc.pages[index].objects.map((o) => (
                          <button
                            key={o.id}
                            data-object-id={o.id}
                            className={`paper-object ${selected === o.id ? "selected" : ""} ${o.locked ? "locked" : ""}`}
                            style={objectStyle(o)}
                            aria-label={`${o.label}${o.locked ? ", locked" : ""}`}
                            onPointerDown={(event) =>
                              beginObjectGesture(event, o.id, index, "move")
                            }
                            onClick={(e) => {
                              e.stopPropagation();
                              setPage(index);
                              setSelected(o.id);
                              setTab("object");
                            }}
                          >
                            <ObjectArtwork object={o} assets={assets} />
                          </button>
                        ))}
                      </div>
                    </div>
                  );
                })}
                <div
                  className="canvas-flow-layer"
                  style={{
                    position: "absolute",
                    left: renderedIndices.indexOf(page) * (pageWidth + 28),
                    top: 0,
                    width: pageWidth,
                    height: pageHeight,
                    pointerEvents: "none",
                  }}
                >
                  <FlowEditor
                    doc={doc}
                    index={page}
                    onChange={onFlowChange}
                    onLayout={onLayout}
                    onEditor={setEditor}
                    onFocus={() => {
                      setSelected(null);
                      setTab("edit");
                    }}
                  />
                </div>
                {object && (
                  <ObjectControls
                    object={object}
                    zoom={zoom}
                    offset={renderedIndices.indexOf(page) * (pageWidth + 28)}
                    onPointerDown={(event, kind) =>
                      beginObjectGesture(event, object.id, page, kind)
                    }
                    onKeyDown={handleControlKey}
                  />
                )}
              </div>
            </div>
          </div>
        </div>
        <aside
          className={`properties-sidebar ${propertiesCollapsed ? "collapsed" : ""}`}
        >
          {propertiesCollapsed ? (
            <div className="property-rail">
              <button
                aria-label="Show properties"
                title="Show properties"
                onClick={() => setPropertiesCollapsed(false)}
              >
                <PanelRightOpen size={18} />
              </button>
              <button
                aria-label="Edit"
                title="Edit"
                onClick={() => {
                  setTab("edit");
                  setPropertiesCollapsed(false);
                }}
              >
                <Type size={18} />
              </button>
              <button
                aria-label="Page setup"
                title="Page setup"
                onClick={() => {
                  setTab("page");
                  setPropertiesCollapsed(false);
                }}
              >
                <Settings2 size={18} />
              </button>
              <button
                aria-label="Objects"
                title="Objects"
                onClick={() => {
                  setTab("object");
                  setPropertiesCollapsed(false);
                }}
              >
                <Layers size={18} />
              </button>
            </div>
          ) : (
            <>
              <div className="property-tabs">
                <button
                  className={tab === "edit" ? "active" : ""}
                  onClick={() => setTab("edit")}
                  aria-label="Edit"
                >
                  <Type size={14} /> Edit
                </button>
                <button
                  className={tab === "page" ? "active" : ""}
                  aria-label="Page setup"
                  onClick={() => setTab("page")}
                >
                  <Settings2 size={14} /> Page
                </button>
                <button
                  className={tab === "object" ? "active" : ""}
                  onClick={() => setTab("object")}
                >
                  <Layers size={14} /> Objects
                </button>
                <button
                  className="property-hide"
                  aria-label="Hide properties"
                  title="Hide properties"
                  onClick={() => setPropertiesCollapsed(true)}
                >
                  <PanelRightClose size={16} />
                </button>
              </div>
              <div className="properties-scroll">
                {tab === "edit" ? (
                  <>
                    <section
                      className="property-section sidebar-document"
                      aria-label="Document actions"
                    >
                      <div className="document-name">
                        <input
                          aria-label="Document title"
                          value={doc.title}
                          onChange={(e) =>
                            commit(
                              (d) => ({
                                ...d,
                                title: e.target.value.slice(0, 200),
                              }),
                              false,
                            )
                          }
                        />
                        <span
                          className={`save-indicator ${status}`}
                          role="status"
                        >
                          {status === "saved" ? (
                            <Check size={12} />
                          ) : status === "failed" ? (
                            <AlertTriangle size={12} />
                          ) : (
                            <span className="saving-dot" />
                          )}
                          {status === "saved"
                            ? "Saved on this device"
                            : status === "failed"
                              ? "Couldn’t save"
                              : "Saving…"}
                        </span>
                      </div>
                      <div className="document-quick-actions">
                        <div className="tool-group">
                          <button
                            aria-label="Undo"
                            title="Undo"
                            onMouseDown={(e) => e.preventDefault()}
                            onClick={undo}
                          >
                            <Undo2 size={17} />
                          </button>
                          <button
                            aria-label="Redo"
                            title="Redo"
                            onMouseDown={(e) => e.preventDefault()}
                            onClick={redo}
                          >
                            <Redo2 size={17} />
                          </button>
                        </div>
                        <button
                          aria-label="Print document"
                          title="Print preparation"
                          onClick={goPrint}
                        >
                          <Printer size={17} /> Print
                        </button>
                        <button
                          aria-label="Focus on page"
                          title="Focus on page"
                          onClick={() => {
                            setLibraryCollapsed(true);
                            setPropertiesCollapsed(true);
                            requestAnimationFrame(fitPage);
                          }}
                        >
                          <Maximize2 size={17} />
                        </button>
                      </div>
                    </section>
                    <section className="property-section text-formatting">
                      <h3>TEXT</h3>
                      <div
                        className="format-controls"
                        role="group"
                        aria-label="Rich text formatting"
                      >
                        <div className="tool-group">
                          <select
                            aria-label="Document font"
                            value={doc.typography.font}
                            onChange={(e) =>
                              commit((d) => ({
                                ...d,
                                typography: {
                                  ...d.typography,
                                  font: e.target
                                    .value as PaperDocument["typography"]["font"],
                                },
                              }))
                            }
                          >
                            {paperFonts.map((f) => (
                              <option key={f}>{f}</option>
                            ))}
                          </select>
                          <select
                            aria-label="Document font size"
                            value={doc.typography.size}
                            onChange={(e) =>
                              commit((d) => ({
                                ...d,
                                typography: {
                                  ...d.typography,
                                  size: Number(e.target.value),
                                },
                              }))
                            }
                          >
                            {[
                              8, 9, 10, 11, 12, 14, 16, 18, 20, 24, 30, 36, 48,
                            ].map((size) => (
                              <option key={size} value={size}>
                                {size} pt
                              </option>
                            ))}
                          </select>
                        </div>
                        <div className="tool-group">
                          <button
                            aria-label="Bold"
                            title="Bold"
                            className={
                              editor?.isActive("bold") ? "is-active" : ""
                            }
                            onMouseDown={(e) => e.preventDefault()}
                            onClick={() =>
                              editor?.chain().focus().toggleBold().run()
                            }
                          >
                            <Bold size={16} />
                          </button>
                          <button
                            aria-label="Italic"
                            title="Italic"
                            className={
                              editor?.isActive("italic") ? "is-active" : ""
                            }
                            onMouseDown={(e) => e.preventDefault()}
                            onClick={() =>
                              editor?.chain().focus().toggleItalic().run()
                            }
                          >
                            <Italic size={16} />
                          </button>
                          <label className="color-tool" title="Text colour">
                            <span>A</span>
                            <input
                              aria-label="Text colour"
                              type="color"
                              value={doc.typography.color}
                              onChange={(e) => {
                                if (editor?.state.selection.empty)
                                  commit((d) => ({
                                    ...d,
                                    typography: {
                                      ...d.typography,
                                      color: e.target.value,
                                    },
                                  }));
                                else
                                  editor
                                    ?.chain()
                                    .focus()
                                    .setColor(e.target.value)
                                    .run();
                              }}
                            />
                          </label>
                        </div>
                        <div className="tool-group">
                          {[
                            {
                              name: "Align left",
                              icon: AlignLeft,
                              value: "left",
                            },
                            {
                              name: "Align centre",
                              icon: AlignCenter,
                              value: "center",
                            },
                            {
                              name: "Align right",
                              icon: AlignRight,
                              value: "right",
                            },
                          ].map((t) => (
                            <button
                              key={t.value}
                              aria-label={t.name}
                              title={t.name}
                              onMouseDown={(e) => e.preventDefault()}
                              onClick={() =>
                                editor
                                  ?.chain()
                                  .focus()
                                  .setTextAlign(t.value)
                                  .run()
                              }
                            >
                              <t.icon size={17} />
                            </button>
                          ))}
                          <button
                            aria-label="Bullet list"
                            title="Bullet list"
                            onMouseDown={(e) => e.preventDefault()}
                            onClick={() =>
                              editor?.chain().focus().toggleBulletList().run()
                            }
                          >
                            <List size={17} />
                          </button>
                          <button
                            aria-label="Checklist"
                            aria-pressed={checklistActive ?? false}
                            title="Checklist (Ctrl / ⌘ + Shift + 9)"
                            className={checklistActive ? "is-active" : ""}
                            onMouseDown={(e) => e.preventDefault()}
                            onClick={() =>
                              editor?.chain().focus().toggleTaskList().run()
                            }
                          >
                            <ListTodo size={17} />
                          </button>
                          <select
                            aria-label="Text style"
                            value={
                              editor?.isActive("heading", { level: 1 })
                                ? "h1"
                                : editor?.isActive("heading", { level: 2 })
                                  ? "h2"
                                  : "p"
                            }
                            onChange={(e) =>
                              e.target.value === "p"
                                ? editor?.chain().focus().setParagraph().run()
                                : editor
                                    ?.chain()
                                    .focus()
                                    .setHeading({
                                      level: e.target.value === "h1" ? 1 : 2,
                                    })
                                    .run()
                            }
                          >
                            <option value="p">Paragraph</option>
                            <option value="h1">Heading</option>
                            <option value="h2">Subheading</option>
                          </select>
                        </div>
                      </div>
                    </section>
                    <section
                      className="property-section edit-view"
                      aria-label="View settings"
                    >
                      <h3>VIEW</h3>
                      <div className="canvas-settings" aria-label="Canvas view">
                        <div className="view-switch">
                          <button
                            className={view === "single" ? "active" : ""}
                            onClick={() => setView("single")}
                          >
                            <Square size={13} /> Single page
                          </button>
                          <button
                            className={view === "spread" ? "active" : ""}
                            onClick={() => setView("spread")}
                          >
                            <BookSpread /> Facing pages
                          </button>
                        </div>
                        <div className="page-navigation">
                          <button
                            aria-label="Previous page"
                            disabled={page === 0}
                            onClick={() => {
                              setPage(page - 1);
                              setSelected(null);
                            }}
                          >
                            <ChevronLeft size={17} />
                          </button>
                          <span>
                            Page {page + 1} of {doc.pages.length}
                          </span>
                          <button
                            aria-label="Next page"
                            disabled={page >= doc.pages.length - 1}
                            onClick={() => {
                              setPage(page + 1);
                              setSelected(null);
                            }}
                          >
                            <ChevronRight size={17} />
                          </button>
                        </div>
                        <div className="zoom-controls">
                          <button
                            aria-label="Zoom out"
                            onClick={() =>
                              setZoom(
                                Math.max(
                                  0.25,
                                  Math.round((zoom - 0.1) * 100) / 100,
                                ),
                              )
                            }
                          >
                            <Minus size={14} />
                          </button>
                          <span>{Math.round(zoom * 100)}%</span>
                          <button
                            aria-label="Zoom in"
                            onClick={() =>
                              setZoom(
                                Math.min(
                                  2,
                                  Math.round((zoom + 0.1) * 100) / 100,
                                ),
                              )
                            }
                          >
                            <Plus size={14} />
                          </button>
                          <button className="fit-button" onClick={fitPage}>
                            Fit
                          </button>
                        </div>
                      </div>
                      <label className="canvas-guide-control">
                        <input
                          type="checkbox"
                          checked={showGuides}
                          onChange={(event) =>
                            setShowGuides(event.target.checked)
                          }
                        />
                        Margin guides
                      </label>
                    </section>
                  </>
                ) : tab === "page" ? (
                  <>
                    <section className="property-section">
                      <h3>THE PAPER</h3>
                      <label className="select-field">
                        <span>Size</span>
                        <select
                          aria-label="Paper size"
                          value={
                            customPaper
                              ? "custom"
                              : doc.paper.width === 148 &&
                                  doc.paper.height === 210
                                ? "portrait"
                                : doc.paper.width === 210 &&
                                    doc.paper.height === 148
                                  ? "landscape"
                                  : "custom"
                          }
                          onChange={(e) => {
                            setCustomPaper(e.target.value === "custom");
                            if (e.target.value === "portrait")
                              paperChange({ width: 148, height: 210 });
                            if (e.target.value === "landscape")
                              paperChange({ width: 210, height: 148 });
                          }}
                        >
                          <option value="portrait">A5 · Portrait</option>
                          <option value="landscape">A5 · Landscape</option>
                          <option value="custom">Custom dimensions</option>
                        </select>
                      </label>
                      <div className="field-grid">
                        <NumberField
                          label="Paper width"
                          value={doc.paper.width}
                          min={60}
                          max={420}
                          onCommit={(width) => paperChange({ width })}
                        />
                        <NumberField
                          label="Paper height"
                          value={doc.paper.height}
                          min={60}
                          max={420}
                          onCommit={(height) => paperChange({ height })}
                        />
                      </div>
                    </section>
                    <section className="property-section">
                      <h3>
                        MARGINS <span>mm</span>
                      </h3>
                      <div className="margin-diagram">
                        <div />
                        <span className="margin-top">
                          {doc.paper.margins.top}
                        </span>
                        <span className="margin-left">
                          {doc.paper.margins.inner}
                        </span>
                        <span className="margin-right">
                          {doc.paper.margins.outer}
                        </span>
                        <span className="margin-bottom">
                          {doc.paper.margins.bottom}
                        </span>
                      </div>
                      <div className="field-grid">
                        {(["top", "bottom", "inner", "outer"] as const).map(
                          (side) => (
                            <NumberField
                              key={side}
                              label={`${side[0].toUpperCase() + side.slice(1)} margin`}
                              value={doc.paper.margins[side]}
                              min={0}
                              onCommit={(v) =>
                                paperChange({
                                  margins: { ...doc.paper.margins, [side]: v },
                                })
                              }
                            />
                          ),
                        )}
                      </div>
                      <p className="property-hint">
                        Inner and outer margins mirror on facing pages.
                      </p>
                    </section>
                    <section className="property-section">
                      <h3>A LITTLE CHARACTER</h3>
                      <label className="select-field">
                        <span>Paper style</span>
                        <select
                          aria-label="Paper pattern"
                          value={doc.paper.pattern}
                          onChange={(e) =>
                            paperChange({
                              pattern: e.target
                                .value as PaperDocument["paper"]["pattern"],
                            })
                          }
                        >
                          <option value="plain">Plain & simple</option>
                          <option value="dots">A gentle dot grid</option>
                          <option value="lines">Softly lined</option>
                        </select>
                      </label>
                      <div className="paper-colors">
                        {[
                          "#fffdf7",
                          "#ffffff",
                          "#f5f0e6",
                          "#edf1e6",
                          "#f8eeea",
                          "#eef0f5",
                        ].map((color) => (
                          <button
                            key={color}
                            aria-label={`Paper colour ${color}`}
                            className={
                              doc.paper.background === color ? "active" : ""
                            }
                            style={{ background: color }}
                            onClick={() => paperChange({ background: color })}
                          >
                            {doc.paper.background === color && (
                              <Check size={12} />
                            )}
                          </button>
                        ))}
                        <input
                          aria-label="Custom paper colour"
                          type="color"
                          value={doc.paper.background}
                          onChange={(e) =>
                            paperChange({ background: e.target.value })
                          }
                        />
                      </div>
                    </section>
                    <section className="property-section">
                      <h3>MAKE IT YOURS</h3>
                      <div className="insert-grid">
                        <button onClick={() => addObject("text")}>
                          <Type size={20} />
                          <span>Text box</span>
                        </button>
                        <button onClick={() => imageInput.current?.click()}>
                          <ImagePlus size={20} />
                          <span>Picture</span>
                        </button>
                        <button onClick={() => setSidebar("stickers")}>
                          <Flower2 size={20} />
                          <span>Sticker</span>
                        </button>
                        <button onClick={() => setPicker("shape")}>
                          <Square size={20} />
                          <span>Shape</span>
                        </button>
                      </div>
                    </section>
                  </>
                ) : (
                  <>
                    <section className="property-section">
                      <h3>
                        ON THIS PAGE{" "}
                        <span>{doc.pages[page].objects.length}</span>
                      </h3>
                      <div className="object-list">
                        {doc.pages[page].objects.length ? (
                          doc.pages[page].objects.map((o) => (
                            <button
                              key={o.id}
                              className={selected === o.id ? "active" : ""}
                              onClick={() => setSelected(o.id)}
                              aria-pressed={selected === o.id}
                            >
                              {o.type === "text" ? (
                                <Type size={15} />
                              ) : o.type === "image" ? (
                                <ImagePlus size={15} />
                              ) : o.type === "sticker" ? (
                                <Flower2 size={15} />
                              ) : (
                                <Square size={15} />
                              )}
                              <span>{o.label}</span>
                              {o.locked ? (
                                <LockKeyhole size={12} />
                              ) : (
                                <ChevronRight size={12} />
                              )}
                            </button>
                          ))
                        ) : (
                          <p className="property-hint">
                            No objects yet. Add a picture, sticker or text box
                            below.
                          </p>
                        )}
                      </div>
                      <div className="object-add-actions">
                        <button
                          onClick={() => addObject("text")}
                          aria-label="Add text box"
                        >
                          <Type size={17} />
                        </button>
                        <button
                          onClick={() => imageInput.current?.click()}
                          aria-label="Add picture"
                        >
                          <ImagePlus size={17} />
                        </button>
                        <button
                          onClick={() => setSidebar("stickers")}
                          aria-label="Add sticker"
                        >
                          <Flower2 size={17} />
                        </button>
                        <button
                          onClick={() => setPicker("shape")}
                          aria-label="Add shape"
                        >
                          <Square size={17} />
                        </button>
                      </div>
                    </section>
                    {object ? (
                      <>
                        <section className="property-section">
                          <div className="selected-heading">
                            <h3>SELECTED OBJECT</h3>
                            <button
                              aria-label={
                                object.locked ? "Unlock object" : "Lock object"
                              }
                              title={object.locked ? "Unlock" : "Lock"}
                              onClick={() =>
                                updateObject({ locked: !object.locked })
                              }
                            >
                              {object.locked ? (
                                <LockKeyhole size={15} />
                              ) : (
                                <UnlockKeyhole size={15} />
                              )}
                            </button>
                          </div>
                          <label className="select-field">
                            <span>Name</span>
                            <input
                              aria-label="Object name"
                              value={object.label}
                              onChange={(e) =>
                                updateObject({
                                  label: e.target.value.slice(0, 200),
                                })
                              }
                            />
                          </label>
                          {object.locked && (
                            <p className="property-hint">
                              Unlock this object to change its layout.
                            </p>
                          )}
                          <fieldset disabled={object.locked}>
                            <div className="field-grid">
                              <NumberField
                                label="Position X"
                                value={object.x}
                                onCommit={(x) => updateObject({ x })}
                              />
                              <NumberField
                                label="Position Y"
                                value={object.y}
                                onCommit={(y) => updateObject({ y })}
                              />
                              <NumberField
                                label="Object width"
                                value={object.width}
                                min={1}
                                onCommit={(v) => resize("width", v)}
                              />
                              <NumberField
                                label="Object height"
                                value={object.height}
                                min={1}
                                onCommit={(v) => resize("height", v)}
                              />
                              <NumberField
                                label="Rotation"
                                value={object.rotation}
                                min={-360}
                                max={360}
                                unit="°"
                                onCommit={(rotation) =>
                                  updateObject({ rotation })
                                }
                              />
                              <NumberField
                                label="Opacity"
                                value={object.opacity * 100}
                                min={0}
                                max={100}
                                unit="%"
                                onCommit={(value) =>
                                  updateObject({ opacity: value / 100 })
                                }
                              />
                            </div>
                            {isRasterObject(object) && (
                              <label className="check-field">
                                <input
                                  type="checkbox"
                                  checked={object.keepRatio}
                                  onChange={(e) =>
                                    updateObject({
                                      keepRatio: e.target.checked,
                                    })
                                  }
                                />{" "}
                                Keep{" "}
                                {object.type === "image"
                                  ? "picture"
                                  : "sticker"}{" "}
                                proportions
                              </label>
                            )}
                            <div className="object-align">
                              <button
                                aria-label="Align object left"
                                onClick={() =>
                                  updateObject({
                                    x: pageMargins(doc, page).left,
                                  })
                                }
                              >
                                <AlignLeft size={16} />
                              </button>
                              <button
                                aria-label="Centre object horizontally"
                                onClick={() =>
                                  updateObject({
                                    x: (doc.paper.width - object.width) / 2,
                                  })
                                }
                              >
                                <AlignCenter size={16} />
                              </button>
                              <button
                                aria-label="Align object right"
                                onClick={() =>
                                  updateObject({
                                    x:
                                      doc.paper.width -
                                      pageMargins(doc, page).right -
                                      object.width,
                                  })
                                }
                              >
                                <AlignRight size={16} />
                              </button>
                            </div>
                            {object.type === "text" && (
                              <>
                                <label className="select-field">
                                  <span>Your words</span>
                                  <textarea
                                    aria-label="Text box content"
                                    value={object.text}
                                    onChange={(e) =>
                                      updateObject({ text: e.target.value })
                                    }
                                  />
                                </label>
                                <label className="select-field">
                                  <span>Font</span>
                                  <select
                                    aria-label="Text box font"
                                    value={object.font}
                                    onChange={(e) =>
                                      updateObject({
                                        font: e.target
                                          .value as PaperObject["font"],
                                      })
                                    }
                                  >
                                    {paperFonts.map((f) => (
                                      <option key={f}>{f}</option>
                                    ))}
                                  </select>
                                </label>
                                <NumberField
                                  label="Text box font size"
                                  value={object.fontSize}
                                  min={6}
                                  max={144}
                                  unit="pt"
                                  onCommit={(fontSize) =>
                                    updateObject({ fontSize })
                                  }
                                />
                                <label className="select-field">
                                  <span>Text alignment</span>
                                  <select
                                    aria-label="Text box alignment"
                                    value={object.textAlign}
                                    onChange={(event) =>
                                      updateObject({
                                        textAlign: event.target
                                          .value as PaperObject["textAlign"],
                                      })
                                    }
                                  >
                                    <option value="left">Left</option>
                                    <option value="center">Center</option>
                                    <option value="right">Right</option>
                                  </select>
                                </label>
                                <NumberField
                                  label="Text box line spacing"
                                  value={object.lineHeight}
                                  min={1}
                                  max={3}
                                  unit="×"
                                  step={0.05}
                                  onCommit={(lineHeight) =>
                                    updateObject({ lineHeight })
                                  }
                                />
                              </>
                            )}
                            {(object.type === "text" ||
                              (object.type === "sticker" && !object.assetId) ||
                              object.type === "shape") && (
                              <label className="object-color">
                                <span>Colour</span>
                                <input
                                  aria-label="Object colour"
                                  type="color"
                                  value={
                                    object.type === "shape"
                                      ? object.fill
                                      : object.color
                                  }
                                  onChange={(e) =>
                                    updateObject(
                                      object.type === "shape"
                                        ? { fill: e.target.value }
                                        : { color: e.target.value },
                                    )
                                  }
                                />
                              </label>
                            )}
                            <div className="layer-controls">
                              <button onClick={() => moveLayer(1)}>
                                <ArrowUp size={13} /> Forward
                              </button>
                              <button onClick={() => moveLayer(-1)}>
                                <ArrowDown size={13} /> Backward
                              </button>
                            </div>
                            <div className="object-actions">
                              <button
                                onClick={() =>
                                  addObject(object.type, {
                                    ...object,
                                    id: crypto.randomUUID(),
                                    x: object.x + 5,
                                    y: object.y + 5,
                                    label: `${object.label} copy`,
                                  })
                                }
                              >
                                <Copy size={14} /> Duplicate
                              </button>
                              <button
                                className="delete-object"
                                onClick={removeObject}
                              >
                                <X size={14} /> Remove
                              </button>
                            </div>
                          </fieldset>
                        </section>
                        {warnings.length > 0 && (
                          <div className="layout-warnings">
                            <AlertTriangle size={15} />
                            <div>
                              <strong>A small layout note</strong>
                              {warnings.map((w) => (
                                <p key={w}>{w}</p>
                              ))}
                              <span>
                                Overlap is allowed. Check the print preview.
                              </span>
                            </div>
                          </div>
                        )}
                      </>
                    ) : (
                      <div className="selection-empty">
                        <Layers size={27} strokeWidth={1.3} />
                        <h4>A place for everything.</h4>
                        <p>
                          Select an object to position, resize or style it.
                          Dragging is always optional.
                        </p>
                      </div>
                    )}
                  </>
                )}
              </div>
            </>
          )}
        </aside>
      </div>
      <div className="sr-only" role="status" aria-live="polite">
        {announcement}
      </div>
      <input
        ref={imageInput}
        hidden
        type="file"
        accept="image/png,image/jpeg,image/webp"
        onChange={(e) => {
          insertPicture(e.target.files?.[0]);
          e.target.value = "";
        }}
      />
      {picker && (
        <Dialog
          title="Simple shapes, lovely possibilities."
          onClose={() => setPicker(null)}
        >
          <p>
            Choose something to add to your page. You can change its colour and
            size.
          </p>
          <div className="decoration-picker">
            {["rectangle", "ellipse", "line", "arrow"].map((kind) => (
              <button
                key={kind}
                onClick={() =>
                  addObject("shape", {
                    shape: kind as PaperObject["shape"],
                    label: `${kind} shape`,
                    ...(kind === "arrow"
                      ? { width: 2.5, height: 25, fill: "#707770" }
                      : {}),
                  })
                }
              >
                <ObjectArtwork
                  assets={{}}
                  object={createObject("shape", {
                    shape: kind as PaperObject["shape"],
                    ...(kind === "arrow"
                      ? { width: 2.5, height: 25, fill: "#707770" }
                      : {}),
                  })}
                />
                <span>{kind}</span>
              </button>
            ))}
          </div>
        </Dialog>
      )}
      {help && (
        <Dialog
          title="Create with your keyboard."
          onClose={() => setHelp(false)}
        >
          <ul className="guidance-list">
            <li>Tab moves between labelled controls. Enter activates them.</li>
            <li>Type in the page to continue automatically across pages.</li>
            <li>
              Ctrl / ⌘ + Shift + 9 toggles a checklist. Enter adds a task; Enter
              on an empty task finishes the list. Tab / Shift + Tab indent /
              outdent task text. Focus a checkbox and press Space to complete or
              reopen it.
            </li>
            <li>
              Select objects from the Objects list. Arrow keys move them 1 mm;
              Shift + Arrow moves 10 mm.
            </li>
            <li>
              Drag a corner handle to resize an object. Drag its round handle to
              rotate; hold Shift to snap to 15°. Escape cancels a drag.
            </li>
            <li>
              Focused resize handles use arrow keys; Shift uses 10 mm. The
              rotation handle uses Left / Right, or Shift for 15°. Sidebar
              fields remain available for exact values.
            </li>
            <li>Ctrl / ⌘ + Z undoes changes. Shift + Ctrl / ⌘ + Z redoes.</li>
            <li>
              Pictures and objects can overlap text. Preview before printing.
            </li>
          </ul>
          <button className="button primary" onClick={() => setHelp(false)}>
            Back to my page
          </button>
        </Dialog>
      )}
    </div>
  );
}
function BookSpread() {
  return (
    <svg width="15" height="14" viewBox="0 0 15 14" aria-hidden="true">
      <rect
        x="1"
        y="2"
        width="5"
        height="10"
        rx="1"
        fill="none"
        stroke="currentColor"
      />
      <rect
        x="9"
        y="2"
        width="5"
        height="10"
        rx="1"
        fill="none"
        stroke="currentColor"
      />
    </svg>
  );
}
