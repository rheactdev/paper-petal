import "fake-indexeddb/auto";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { newDocument } from "../src/data/templates";
import { createObject } from "../src/data/model";
import {
  getDocument,
  saveDocument,
  listDocuments,
  saveAsset,
  getAsset,
  deleteDocument,
  importDocument,
  exportDocument,
} from "../src/data/storage";
class Reader {
  result: string | null = null;
  onload: (() => void) | null = null;
  onerror: (() => void) | null = null;
  async readAsDataURL(blob: Blob) {
    this.result = `data:${blob.type};base64,${Buffer.from(await blob.arrayBuffer()).toString("base64")}`;
    this.onload?.();
  }
}
vi.stubGlobal("FileReader", Reader);
describe("local persistence", () => {
  it("propagates storage failures without changing the in-memory document", async () => {
    const doc = newDocument();
    const original = structuredClone(doc);
    const mock = vi.spyOn(indexedDB, "open").mockImplementation(() => {
      throw new DOMException("Storage quota exceeded", "QuotaExceededError");
    });
    await expect(saveDocument(doc)).rejects.toThrow("quota");
    expect(doc).toEqual(original);
    mock.mockRestore();
  });
  it("saves, reloads and removes a document", async () => {
    const doc = newDocument("journal");
    await saveDocument(doc);
    expect(await getDocument(doc.id)).toEqual(doc);
    expect((await listDocuments()).some((d) => d.id === doc.id)).toBe(true);
    await deleteDocument(doc.id);
    expect(await getDocument(doc.id)).toBe(null);
  });
  it("preserves assets shared by another document", async () => {
    const blob = new Blob(["picture"], { type: "image/png" });
    const id = await saveAsset(blob);
    const a = newDocument(),
      b = newDocument();
    a.pages[0].objects = [createObject("image", { assetId: id })];
    b.pages[0].objects = [createObject("image", { assetId: id })];
    await saveDocument(a);
    await saveDocument(b);
    await deleteDocument(a.id);
    expect(await (await getAsset(id))?.text()).toBe("picture");
    await deleteDocument(b.id);
    expect(await getAsset(id)).toBe(null);
  });
  it("rejects unsupported or oversized images", async () => {
    await expect(
      saveAsset(new Blob(["svg"], { type: "image/svg+xml" })),
    ).rejects.toThrow("PNG");
    await expect(
      saveAsset(
        new Blob([new Uint8Array(21 * 1024 * 1024)], { type: "image/png" }),
      ),
    ).rejects.toThrow("20 MB");
  });
  it("imports a complete backup with new document and image IDs", async () => {
    const original = newDocument("journal");
    original.pages[0].objects.push(
      createObject("image", { assetId: "old-image" }),
    );
    const backup = {
      format: "paper-and-petal",
      document: original,
      assets: { "old-image": { type: "image/png", data: btoa("picture") } },
    };
    const imported = await importDocument(
      new File([JSON.stringify(backup)], "journal.petal"),
    );
    expect(imported.id).not.toBe(original.id);
    const asset = imported.pages[0].objects.at(-1)?.assetId;
    expect(asset).not.toBe("old-image");
    expect(await (await getAsset(asset!))?.text()).toBe("picture");
    expect(await getDocument(imported.id)).toEqual(imported);
  });
  it("rejects corrupt backup and missing assets before storage changes", async () => {
    const before = (await listDocuments()).length;
    const doc = newDocument();
    doc.pages[0].objects = [createObject("image", { assetId: "missing" })];
    await expect(
      importDocument(
        new File(
          [
            JSON.stringify({
              format: "paper-and-petal",
              document: doc,
              assets: {},
            }),
          ],
          "bad.petal",
        ),
      ),
    ).rejects.toThrow("invalid picture");
    await expect(
      importDocument(new File(["not JSON"], "bad.petal")),
    ).rejects.toThrow();
    expect((await listDocuments()).length).toBe(before);
  });
  it("exports and reimports the document and its original image bytes", async () => {
    const doc = newDocument("collage"),
      id = await saveAsset(new Blob(["image bytes"], { type: "image/jpeg" }));
    doc.pages[0].objects.push(createObject("image", { assetId: id }));
    let exported: Blob | undefined;
    vi.spyOn(URL, "createObjectURL").mockImplementation((blob) => {
      exported = blob as Blob;
      return "blob:test";
    });
    vi.stubGlobal("document", {
      createElement: () => ({ click: vi.fn(), href: "", download: "" }),
    });
    await exportDocument(doc);
    expect(exported).toBeDefined();
    const imported = await importDocument(
      new File([exported!], "round-trip.petal"),
    );
    expect(imported.flow).toEqual(doc.flow);
    expect(imported.paper).toEqual(doc.paper);
    expect(imported.pages[0].objects.map((o) => o.type)).toEqual(
      doc.pages[0].objects.map((o) => o.type),
    );
    expect(
      await (
        await getAsset(imported.pages[0].objects.at(-1)!.assetId!)
      )?.text(),
    ).toBe("image bytes");
    vi.restoreAllMocks();
  });
});
