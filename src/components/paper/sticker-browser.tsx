import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Search } from "lucide-react";
import { stickerCatalogue } from "../../data/sticker-catalogue";
import {
  filterStickers,
  type StickerDrop,
  type StickerEntry,
} from "../../data/stickers";
import { trackStickerDrag } from "./sticker-drag";
import { Sticker } from "./art";

function Thumbnail({ entry }: { entry: StickerEntry }) {
  return entry.kind === "png" ? (
    <img src={entry.assetURL} alt="" draggable={false} />
  ) : (
    <Sticker kind={entry.sticker} />
  );
}

export function StickerBrowser({
  onInsert,
  findTarget,
  onTarget,
  previewSize,
}: {
  onInsert: (entry: StickerEntry, target?: StickerDrop) => Promise<void>;
  findTarget: (x: number, y: number) => StickerDrop | null;
  onTarget: (pageId: string | null) => void;
  previewSize: number;
}) {
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("All");
  const [busy, setBusy] = useState<string | null>(null);
  const [ghost, setGhost] = useState<{
    entry: StickerEntry;
    x: number;
    y: number;
    valid: boolean;
  } | null>(null);
  const cancel = useRef<(() => void) | null>(null);
  const suppressClick = useRef(false);
  const inserting = useRef(false);
  const categories = useMemo(
    () => ["All", ...new Set(stickerCatalogue.map((entry) => entry.category))],
    [],
  );
  const entries = filterStickers(stickerCatalogue, query, category);
  useEffect(
    () => () => {
      cancel.current?.();
    },
    [],
  );

  async function insert(entry: StickerEntry, target?: StickerDrop) {
    if (inserting.current) return;
    inserting.current = true;
    setBusy(entry.id);
    try {
      await onInsert(entry, target);
    } finally {
      inserting.current = false;
      setBusy(null);
    }
  }
  return (
    <div
      className="sticker-browser"
      role="tabpanel"
      id="sticker-panel"
      aria-labelledby="sticker-tab"
    >
      <label className="sticker-search">
        <Search size={17} aria-hidden="true" />
        <input
          aria-label="Search stickers"
          placeholder="Search stickers…"
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
        />
      </label>
      <div className="sticker-categories" aria-label="Sticker categories">
        {categories.map((name) => (
          <button
            key={name}
            aria-pressed={category === name}
            onClick={() => setCategory(name)}
          >
            {name}
          </button>
        ))}
      </div>
      <p className="sticker-instructions">Drag onto a page, or click to add.</p>
      <div className="sticker-results" aria-busy={!!busy}>
        <div className="sticker-result-count">
          {entries.length} {entries.length === 1 ? "sticker" : "stickers"}
        </div>
        {entries.length ? (
          <div className="sticker-grid">
            {entries.map((entry) => (
              <button
                key={entry.id}
                className="sticker-tile"
                aria-label={`Add ${entry.name} sticker`}
                title={`${entry.name} · ${entry.category}`}
                disabled={!!busy}
                onPointerDown={(event) => {
                  if (event.button !== 0 || busy) return;
                  cancel.current?.();
                  suppressClick.current = false;
                  event.currentTarget.setPointerCapture(event.pointerId);
                  cancel.current = trackStickerDrag(window, event.nativeEvent, {
                    target: findTarget,
                    preview: (point) => {
                      setGhost(
                        point
                          ? {
                              entry,
                              x: point.x,
                              y: point.y,
                              valid: !!point.target,
                            }
                          : null,
                      );
                      onTarget(point?.target?.pageId ?? null);
                    },
                    finish: (target, suppress) => {
                      cancel.current = null;
                      suppressClick.current = suppress;
                      if (target) void insert(entry, target);
                    },
                  });
                }}
                onKeyDown={(event) => {
                  if (event.key === "Enter" || event.key === " ")
                    suppressClick.current = false;
                }}
                onClick={() => {
                  if (!suppressClick.current) void insert(entry);
                  suppressClick.current = false;
                }}
              >
                <span className="sticker-tile-art">
                  <Thumbnail entry={entry} />
                </span>
                <span className="sticker-name">{entry.name}</span>
              </button>
            ))}
          </div>
        ) : (
          <p className="sticker-empty">
            No stickers found. Try another name or category.
          </p>
        )}
      </div>
      <p className="sticker-footer" role="status">
        {busy
          ? "Adding your sticker…"
          : "PNG stickers keep their original colours."}
      </p>
      {ghost &&
        createPortal(
          <div
            className={`sticker-drag-preview ${ghost.valid ? "valid" : ""}`}
            style={{
              left: ghost.x,
              top: ghost.y,
              width: previewSize,
              height: previewSize,
            }}
            aria-hidden="true"
          >
            <Thumbnail entry={ghost.entry} />
          </div>,
          document.body,
        )}
    </div>
  );
}
