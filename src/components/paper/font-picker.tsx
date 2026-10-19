import { useEffect, useRef, useState } from "react";
import {
  paperFonts,
  fontFamilyForHash,
  type DocumentFont,
  type PaperFont,
} from "../../data/fonts";
import type { PaperDocument } from "../../data/model";
import { saveFontAsset } from "../../data/storage";
import { useAssetLibrary } from "./asset-library";
import { AssetUploader } from "./asset-uploader";
import { Dialog } from "./library";
import { loadCustomFont } from "./document-fonts";

export function attachDocumentFont(
  doc: PaperDocument,
  font?: DocumentFont,
): PaperDocument {
  if (
    !font ||
    doc.customFonts?.some((existing) => existing.family === font.family)
  )
    return doc;
  return { ...doc, customFonts: [...(doc.customFonts ?? []), font] };
}

export function FontPicker({
  value,
  fonts = [],
  onChange,
  label,
  beforeSignIn,
}: {
  value: PaperFont;
  fonts?: DocumentFont[];
  onChange: (font: PaperFont, definition?: DocumentFont) => void;
  label: string;
  beforeSignIn?: () => Promise<void>;
}) {
  const library = useAssetLibrary();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const revision = useRef(0);
  useEffect(
    () => () => {
      revision.current++;
    },
    [],
  );
  const choices = new Map(
    paperFonts.map((name) => [name as string, name as string]),
  );
  library.assets
    .filter((asset) => asset.kind === "font")
    .forEach((asset) => choices.set(fontFamilyForHash(asset.hash), asset.name));
  fonts.forEach((font) => choices.set(font.family, font.name));
  async function choose(family: string) {
    const version = ++revision.current;
    setBusy(true);
    setError("");
    try {
      let definition = fonts.find((font) => font.family === family);
      if (family.startsWith("petal-font-")) {
        if (!definition) {
          const asset = library.assets.find(
            (asset) =>
              asset.kind === "font" && fontFamilyForHash(asset.hash) === family,
          );
          if (!asset)
            throw new Error(
              "This font is no longer available. Reload your library.",
            );
          const blob = await library.fetchAsset(asset);
          definition = {
            family,
            name: asset.name,
            assetId: await saveFontAsset(blob),
          };
        }
        await loadCustomFont(definition);
        library.signal?.throwIfAborted();
      }
      if (version === revision.current) onChange(family, definition);
    } catch (error) {
      if (version === revision.current)
        setError(
          error instanceof Error
            ? error.message
            : "This font couldn’t be loaded.",
        );
    } finally {
      if (version === revision.current) setBusy(false);
    }
  }
  return (
    <div className="font-picker">
      <select
        aria-label={label}
        value={value}
        disabled={busy}
        onChange={(event) => void choose(event.target.value)}
      >
        {[...choices].map(([family, name]) => (
          <option value={family} key={family}>
            {name}
          </option>
        ))}
      </select>
      <button
        type="button"
        className="upload-fonts-button"
        onClick={() => setOpen(true)}
      >
        Upload fonts
      </button>
      {busy && <span role="status">Loading font…</span>}
      {error && (
        <span className="asset-error" role="alert">
          {error}
        </span>
      )}
      {open && (
        <Dialog title="Your fonts" onClose={() => setOpen(false)}>
          <p>
            Upload font files to use them in your documents and calendar
            spreads.
          </p>
          <AssetUploader kind="font" beforeSignIn={beforeSignIn} />
          {library.loading && <p role="status">Loading your fonts…</p>}
          <ul className="uploaded-font-list">
            {library.assets
              .filter((asset) => asset.kind === "font")
              .map((asset) => (
                <li key={asset.id}>{asset.name}</li>
              ))}
          </ul>
        </Dialog>
      )}
    </div>
  );
}
