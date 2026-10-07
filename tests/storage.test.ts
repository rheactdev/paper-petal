import "fake-indexeddb/auto";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { newDocument } from "../src/data/templates";
import { createObject } from "../src/data/model";
import { withEditorMode, compileMarkdown } from "../src/editor/markdown";
import {
  getDocument,
  saveDocument,
  listDocuments,
  saveAsset,
  getAsset,
  deleteDocument,
  importDocument,
  exportDocument,
  assetURLs,
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
  it("round trips exact Markdown source, icons, completed tasks and sticker bytes through autosave and backups", async () => {
    const source =
      "##   :LiNotebook: Notes\n\n- [X] **Kept**  \n  - [ ] Child\n\n<!-- pagebreak -->\n\nNext\n";
    const doc = withEditorMode(newDocument("blank"), "markdown");
    doc.markdownSource = source;
    const bytes = new Uint8Array([137, 80, 78, 71, 12, 34]);
    const assetId = await saveAsset(new Blob([bytes], { type: "image/png" }));
    doc.pages[0].objects.push(
      createObject("sticker", { assetId, rotation: 22, width: 25, height: 18 }),
    );
    await saveDocument(doc);
    const loaded = await getDocument(doc.id);
    expect(loaded?.markdownSource).toBe(source);
    expect(loaded?.flow).toEqual(compileMarkdown(source));
    let exported: Blob | undefined;
    vi.spyOn(URL, "createObjectURL").mockImplementation((blob) => {
      exported = blob as Blob;
      return "blob:markdown";
    });
    vi.stubGlobal("document", {
      createElement: () => ({ click: vi.fn(), href: "", download: "" }),
    });
    await exportDocument(loaded!);
    const imported = await importDocument(
      new File([exported!], "markdown.petal"),
    );
    expect(imported.editorMode).toBe("markdown");
    expect(imported.markdownSource).toBe(source);
    expect(imported.flow).toEqual(compileMarkdown(source));
    expect(imported.pages[0].objects[0].rotation).toBe(22);
    expect(
      new Uint8Array(
        await (await getAsset(
          imported.pages[0].objects[0].assetId!,
        ))!.arrayBuffer(),
      ),
    ).toEqual(bytes);
    vi.restoreAllMocks();
  });
  it("rejects backups whose Markdown editor mode has missing or invalid source", async () => {
    for (const markdownSource of [undefined, 123]) {
      const document = {
        ...newDocument(),
        editorMode: "markdown",
        markdownSource,
      };
      await expect(
        importDocument(
          new File(
            [
              JSON.stringify({
                format: "paper-and-petal",
                document,
                assets: {},
              }),
            ],
            "invalid.petal",
          ),
        ),
      ).rejects.toThrow();
    }
  });
  it("persists header snapshots through reload and validated backup import without refreshing the date or weather", async () => {
    const doc = newDocument("blank");
    doc.header = {
      date: "2026-10-07",
      weather: {
        city: "Tokyo, Japan",
        temperature: 20.4,
        unit: "celsius",
        code: 2,
        isDay: true,
        observedAt: "2026-10-07T10:15:00.000Z",
      },
    };
    await saveDocument(doc);
    expect((await getDocument(doc.id))?.header).toEqual(doc.header);
    let exported: Blob | undefined;
    vi.spyOn(URL, "createObjectURL").mockImplementation((blob) => {
      exported = blob as Blob;
      return "blob:header";
    });
    vi.stubGlobal("document", {
      createElement: () => ({ click: vi.fn(), href: "", download: "" }),
    });
    await exportDocument(doc);
    const imported = await importDocument(
      new File([exported!], "header.petal"),
    );
    expect(imported.id).not.toBe(doc.id);
    expect((await getDocument(imported.id))?.header).toEqual(doc.header);
    vi.restoreAllMocks();
  });
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
  it("persists nested checklist completion through reload and backup round trips", async () => {
    const doc = newDocument("blank");
    doc.flow = {
      type: "doc",
      content: [
        {
          type: "taskList",
          content: [
            {
              type: "taskItem",
              attrs: { checked: true },
              content: [
                {
                  type: "paragraph",
                  content: [
                    {
                      type: "text",
                      text: "Finished",
                      marks: [{ type: "italic" }],
                    },
                  ],
                },
                {
                  type: "taskList",
                  content: [
                    {
                      type: "taskItem",
                      attrs: { checked: false },
                      content: [
                        {
                          type: "paragraph",
                          content: [{ type: "text", text: "Still to do" }],
                        },
                      ],
                    },
                  ],
                },
              ],
            },
          ],
        },
      ],
    };
    await saveDocument(doc);
    expect((await getDocument(doc.id))?.flow).toEqual(doc.flow);
    let exported: Blob | undefined;
    vi.spyOn(URL, "createObjectURL").mockImplementation((blob) => {
      exported = blob as Blob;
      return "blob:checklist";
    });
    vi.stubGlobal("document", {
      createElement: () => ({ click: vi.fn(), href: "", download: "" }),
    });
    await exportDocument(doc);
    const imported = await importDocument(new File([exported!], "tasks.petal"));
    expect(imported.id).not.toBe(doc.id);
    expect(imported.flow).toEqual(doc.flow);
    expect((await getDocument(imported.id))?.flow).toEqual(doc.flow);
    vi.restoreAllMocks();
  });
  it("rejects malformed checklist backups before storing a document", async () => {
    const before = (await listDocuments()).length;
    const doc = newDocument("blank");
    doc.flow = {
      type: "doc",
      content: [
        {
          type: "taskList",
          content: [
            {
              type: "taskItem",
              attrs: { checked: "yes" as never },
              content: [{ type: "paragraph" }],
            },
          ],
        },
      ],
    };
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
          "invalid-tasks.petal",
        ),
      ),
    ).rejects.toThrow();
    expect((await listDocuments()).length).toBe(before);
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
  it("preserves PNG stickers, transparency bytes and geometry through backups without a catalogue", async () => {
    const bytes = Uint8Array.from([
      137, 80, 78, 71, 13, 10, 26, 10, 0, 255, 0, 0,
    ]);
    const id = await saveAsset(new Blob([bytes], { type: "image/png" }));
    const doc = newDocument("blank");
    doc.pages[0].objects = [
      createObject("sticker", {
        assetId: id,
        label: "Independent sticker",
        width: 25,
        height: 12.5,
        aspectRatio: 2,
        rotation: 35,
        opacity: 0.75,
      }),
    ];
    await saveDocument(doc);
    expect((await getDocument(doc.id))?.pages[0].objects).toEqual(
      doc.pages[0].objects,
    );
    let exported: Blob | undefined;
    vi.spyOn(URL, "createObjectURL").mockImplementation((blob) => {
      exported = blob as Blob;
      return "blob:sticker";
    });
    vi.stubGlobal("document", {
      createElement: () => ({ click: vi.fn(), href: "", download: "" }),
    });
    await exportDocument(doc);
    const imported = await importDocument(
      new File([exported!], "stickers.petal"),
    );
    const sticker = imported.pages[0].objects[0];
    expect(sticker).toEqual({
      ...doc.pages[0].objects[0],
      assetId: sticker.assetId,
    });
    expect(sticker.assetId).not.toBe(id);
    expect(
      new Uint8Array(await (await getAsset(sticker.assetId!))!.arrayBuffer()),
    ).toEqual(bytes);
    await deleteDocument(doc.id);
    expect(await getAsset(id)).toBeNull();
    expect(await getAsset(sticker.assetId!)).not.toBeNull();
    vi.restoreAllMocks();
  });
  it("reports missing PNG stickers and rejects missing sticker backups", async () => {
    const doc = newDocument();
    doc.pages[0].objects = [
      createObject("sticker", { assetId: "missing-sticker" }),
    ];
    await expect(assetURLs(doc)).rejects.toThrow("missing");
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
          "bad-sticker.petal",
        ),
      ),
    ).rejects.toThrow("invalid picture");
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
