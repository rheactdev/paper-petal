import { openDB } from "idb";
import { normaliseDocument, type PaperDocument } from "./model";
import { prepareDocument } from "../editor/markdown";
import { fontTypes, validateAssetBytes } from "./user-assets";
export function documentAssetIds(doc: PaperDocument) {
  return new Set([
    ...doc.pages.flatMap((p) =>
      p.objects.map((o) => o.assetId).filter((id): id is string => !!id),
    ),
    ...(doc.customFonts?.map((font) => font.assetId) ?? []),
  ]);
}
const database = () =>
  openDB("paper-and-petal", 1, {
    upgrade(db) {
      db.createObjectStore("documents", { keyPath: "id" });
      db.createObjectStore("assets", { keyPath: "id" });
    },
  });
export async function listDocuments(): Promise<PaperDocument[]> {
  const db = await database();
  return (
    await Promise.all((await db.getAll("documents")).map(prepareDocument))
  ).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}
export async function getDocument(id: string): Promise<PaperDocument | null> {
  const doc = await (await database()).get("documents", id);
  return doc ? prepareDocument(doc) : null;
}
export async function saveDocument(doc: PaperDocument) {
  await (await database()).put("documents", await prepareDocument(doc));
}
export async function deleteDocument(id: string) {
  const db = await database();
  const tx = db.transaction(["documents", "assets"], "readwrite");
  await tx.objectStore("documents").delete(id);
  const docs = (await tx.objectStore("documents").getAll()) as PaperDocument[];
  const used = new Set(docs.flatMap((d) => [...documentAssetIds(d)]));
  for (const key of await tx.objectStore("assets").getAllKeys())
    if (!used.has(String(key))) await tx.objectStore("assets").delete(key);
  await tx.done;
}
export async function saveAsset(file: Blob) {
  if (!["image/png", "image/jpeg", "image/webp"].includes(file.type))
    throw new Error("Choose a PNG, JPEG or WebP picture.");
  if (file.size > 20 * 1024 * 1024)
    throw new Error("Please choose a picture smaller than 20 MB.");
  const id = crypto.randomUUID();
  await (await database()).put("assets", { id, blob: file });
  return id;
}
export async function getAsset(id: string): Promise<Blob | null> {
  return (await (await database()).get("assets", id))?.blob || null;
}
export async function saveFontAsset(file: Blob) {
  const mime = validateAssetBytes(
    "font",
    new Uint8Array(await file.arrayBuffer()),
  );
  const id = crypto.randomUUID();
  await (
    await database()
  ).put("assets", { id, blob: file.slice(0, file.size, mime) });
  return id;
}
export async function assetURLs(doc: PaperDocument) {
  const result: Record<string, string> = {};
  for (const id of new Set(
    doc.pages.flatMap((p) => p.objects.map((o) => o.assetId).filter(Boolean)),
  )) {
    if (id) {
      const blob = await getAsset(id);
      if (blob) result[id] = URL.createObjectURL(blob);
      else {
        revokeAssets(result);
        throw new Error(
          "A picture is missing from local storage. Restore it before printing.",
        );
      }
    }
  }
  return result;
}
export function revokeAssets(urls: Record<string, string>) {
  Object.values(urls).forEach((url) => URL.revokeObjectURL(url));
}
export function download(name: string, blob: Blob) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
export async function exportDocument(doc: PaperDocument) {
  const assets: Record<string, { type: string; data: string }> = {};
  for (const id of documentAssetIds(doc)) {
    if (id) {
      const blob = await getAsset(id);
      if (!blob)
        throw new Error(
          "A picture or font is missing. Restore it before exporting.",
        );
      const data = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result).split(",")[1]);
        reader.onerror = reject;
        reader.readAsDataURL(blob);
      });
      assets[id] = { type: blob.type, data };
    }
  }
  download(
    `${doc.title || "document"}.petal`,
    new Blob(
      [JSON.stringify({ format: "paper-and-petal", document: doc, assets })],
      { type: "application/json" },
    ),
  );
}
export async function importDocument(file: File) {
  if (file.size > 150 * 1024 * 1024)
    throw new Error("This backup is too large.");
  const input = JSON.parse(await file.text());
  if (input.format !== "paper-and-petal")
    throw new Error("Choose a .petal document backup.");
  const doc = await prepareDocument(input.document);
  const assets = input.assets || {};
  const replacements = new Map<string, string>();
  const prepared: { id: string; blob: Blob }[] = [];
  const fonts = new Set(doc.customFonts?.map((font) => font.assetId));
  if (
    doc.pages.some((page) =>
      page.objects.some(
        (object) => object.assetId && fonts.has(object.assetId),
      ),
    )
  )
    throw new Error("The backup uses a font as a picture.");
  for (const id of documentAssetIds(doc)) {
    if (!id) continue;
    const asset = assets[id];
    if (
      !asset ||
      !(
        fonts.has(id)
          ? (fontTypes as readonly string[])
          : ["image/png", "image/jpeg", "image/webp"]
      ).includes(asset.type) ||
      typeof asset.data !== "string"
    )
      throw new Error(
        "The backup contains a missing or invalid picture or font.",
      );
    const bytes = Uint8Array.from(atob(asset.data), (c) => c.charCodeAt(0));
    if (fonts.has(id) && validateAssetBytes("font", bytes) !== asset.type)
      throw new Error("The backup contains an invalid font.");
    if (fonts.has(id)) {
      const hash = Array.from(
        new Uint8Array(await crypto.subtle.digest("SHA-256", bytes)),
        (byte) => byte.toString(16).padStart(2, "0"),
      ).join("");
      if (
        doc.customFonts?.some(
          (font) => font.assetId === id && font.family !== `petal-font-${hash}`,
        )
      )
        throw new Error(
          "A font in this backup does not match its document definition.",
        );
    }
    if (bytes.length > 20 * 1024 * 1024)
      throw new Error("A picture in this backup is too large.");
    const newId = crypto.randomUUID();
    replacements.set(id, newId);
    prepared.push({ id: newId, blob: new Blob([bytes], { type: asset.type }) });
  }
  doc.id = crypto.randomUUID();
  doc.updatedAt = new Date().toISOString();
  doc.customFonts?.forEach((font) => {
    font.assetId = replacements.get(font.assetId)!;
  });
  doc.pages.forEach((p) =>
    p.objects.forEach((o) => {
      if (o.assetId) o.assetId = replacements.get(o.assetId);
    }),
  );
  const db = await database(),
    tx = db.transaction(["documents", "assets"], "readwrite");
  for (const asset of prepared) await tx.objectStore("assets").put(asset);
  await tx.objectStore("documents").put(doc);
  await tx.done;
  return doc;
}
