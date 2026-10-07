import { useState } from "react";
import { Code2, Type } from "lucide-react";
import type { EditorMode } from "../../data/model";
import { Dialog } from "./library";

export function EditorChoice({
  onChoose,
  onClose,
  busy,
}: {
  onChoose: (mode: EditorMode) => void;
  onClose: () => void;
  busy: boolean;
}) {
  const [mode, setMode] = useState<EditorMode>("richtext");
  return (
    <Dialog title="How would you like to write?" onClose={onClose}>
      <fieldset className="editor-mode-choice" disabled={busy}>
        <legend>Document editor</legend>
        <label className={mode === "richtext" ? "selected" : ""}>
          <input
            type="radio"
            name="editor-mode"
            value="richtext"
            checked={mode === "richtext"}
            onChange={() => setMode("richtext")}
          />
          <Type size={23} />
          <span>
            <strong>Rich text</strong>
            <small>Write on the paper with full formatting controls.</small>
          </span>
        </label>
        <label className={mode === "markdown" ? "selected" : ""}>
          <input
            type="radio"
            name="editor-mode"
            value="markdown"
            checked={mode === "markdown"}
            onChange={() => setMode("markdown")}
          />
          <Code2 size={23} />
          <span>
            <strong>Markdown</strong>
            <small>
              Paste an Obsidian note and edit source beside your paper.
            </small>
          </span>
        </label>
      </fieldset>
      <p>
        Both include stickers, pictures and printing. This document keeps the
        editor you choose.
      </p>
      <div className="dialog-actions">
        <button className="button secondary" disabled={busy} onClick={onClose}>
          Cancel
        </button>
        <button
          className="button primary"
          disabled={busy}
          onClick={() => onChoose(mode)}
        >
          {busy ? "Creating…" : "Create document"}
        </button>
      </div>
    </Dialog>
  );
}
