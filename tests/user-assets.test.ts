import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { ClientResponseError } from "pocketbase";
import { detectAssetType, validateAssetBytes } from "../src/data/user-assets";
import { fontFamilyForHash } from "../src/data/fonts";
import { cleanRich, createObject, normaliseDocument } from "../src/data/model";
import { newDocument } from "../src/data/templates";
import { authSearch } from "../src/auth/model";

const mocks = vi.hoisted(() => ({ account: vi.fn() }));
vi.mock("@tanstack/react-start/server-only", () => ({}));
vi.mock("../src/auth/pocketbase.server", () => ({
  requireAccount: mocks.account,
}));
import {
  downloadUserAsset,
  listUserAssets,
  uploadUserAsset,
} from "../src/data/user-assets.server";

const service = {
  getList: vi.fn(),
  getFullList: vi.fn(),
  getOne: vi.fn(),
  create: vi.fn(),
};
const pb = {
  collection: vi.fn(() => service),
  filter: vi.fn((_filter, values) => JSON.stringify(values)),
  files: {
    getToken: vi.fn(async () => "private-token"),
    getURL: vi.fn(() => "https://private.invalid/file"),
  },
};
const bytes = new Uint8Array([79, 84, 84, 79, 0, 0, 0, 0, 0, 0, 0, 0]);
const hash = createHash("sha256").update(bytes).digest("hex");
const record = {
  id: "abcdefghijklmno",
  owner: "alice",
  kind: "font",
  name: "my.otf",
  mimeType: "font/otf",
  size: 12,
  hash,
  file: "private.otf",
};
function upload(
  file: Blob = new File([bytes], "my.otf"),
  kind = "font",
  origin = "http://localhost:3000",
) {
  const form = new FormData();
  form.append("file", file, "my.otf");
  form.append("kind", kind);
  return new Request("http://localhost:3000/api/assets", {
    method: "POST",
    body: form,
    headers: { Origin: origin },
  });
}
beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("APP_URL", "http://localhost:3000");
  mocks.account.mockResolvedValue({ pb, user: { id: "alice" } });
  service.getList.mockResolvedValue({ items: [] });
  service.create.mockResolvedValue(record);
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("uploaded asset validation and document references", () => {
  it("detects real bundled fonts and PNG bytes regardless of filename/MIME", async () => {
    const font = new Uint8Array(
      await readFile(
        new URL("../src/assets/fonts/Minuet.otf", import.meta.url),
      ),
    );
    const png = new Uint8Array(
      await readFile(
        new URL(
          "../src/assets/stickers/MochiKichiGift/clover.png",
          import.meta.url,
        ),
      ),
    );
    expect(validateAssetBytes("font", font)).toBe("font/otf");
    expect(validateAssetBytes("sticker", png)).toBe("image/png");
    expect(() => validateAssetBytes("sticker", font)).toThrow("PNG");
    expect(() => validateAssetBytes("font", png)).toThrow("TTF");
    expect(detectAssetType(new Uint8Array(12))).toBeNull();
    expect(() =>
      validateAssetBytes("font", new Uint8Array(10 * 1024 * 1024 + 1)),
    ).toThrow("10 MB");
    expect(() =>
      validateAssetBytes("sticker", new Uint8Array(20 * 1024 * 1024 + 1)),
    ).toThrow("20 MB");
    expect(() => validateAssetBytes("font", new Uint8Array())).toThrow();
  });
  it.each([
    ["wOFF", "font/woff"],
    ["wOF2", "font/woff2"],
    ["true", "font/ttf"],
  ])("recognizes %s font signatures", (signature, mime) => {
    const file = new Uint8Array(12);
    file.set(new TextEncoder().encode(signature));
    expect(validateAssetBytes("font", file)).toBe(mime);
  });
  it("preserves generated families in typography, objects and rich text and requires a font asset", () => {
    const family = fontFamilyForHash(hash);
    const doc = newDocument("blank");
    doc.customFonts = [{ family, name: "my.otf", assetId: "local-font" }];
    doc.typography.font = family;
    doc.pages[0].objects.push(createObject("text", { font: family }));
    doc.flow = cleanRich({
      type: "doc",
      content: [
        {
          type: "paragraph",
          content: [
            {
              type: "text",
              text: "Hello",
              marks: [{ type: "textStyle", attrs: { fontFamily: family } }],
            },
          ],
        },
      ],
    });
    expect(normaliseDocument(doc)).toEqual(doc);
    const missing = { ...doc, customFonts: [] };
    expect(() => normaliseDocument(missing)).toThrow(
      "missing its document asset",
    );
    expect(() => createObject("text", { font: "url(evil)" })).toThrow();
    expect(() =>
      normaliseDocument({
        ...doc,
        customFonts: [...doc.customFonts, ...doc.customFonts],
      }),
    ).toThrow("Duplicate custom font");
  });
  it("accepts internal document sign-in targets and rejects external or unrelated destinations", () => {
    const target = "/documents/abc-def?page=2&view=spread&zoom=0.8";
    expect(authSearch.parse({ returnTo: target }).returnTo).toBe(target);
    for (const returnTo of [
      "//evil.example",
      "/\\evil.example",
      "javascript:alert(1)",
      "/api/assets",
      "https://evil.example",
      "/documents/%2f%2fevil",
    ]) {
      expect(authSearch.parse({ returnTo }).returnTo).toBeUndefined();
    }
  });
});

describe("account asset service", () => {
  it("requires sign-in and rejects untrusted upload origins before accessing the account", async () => {
    const foreign = await uploadUserAsset(
      upload(undefined, "font", "https://foreign.invalid"),
    );
    expect(foreign.status).toBe(403);
    expect(mocks.account).not.toHaveBeenCalled();
    mocks.account.mockRejectedValue(
      new Error("Sign in to upload fonts and stickers."),
    );
    expect((await uploadUserAsset(upload())).status).toBe(401);
    expect(service.create).not.toHaveBeenCalled();
    expect((await listUserAssets()).status).toBe(401);
  });
  it("stores the authenticated owner and detected MIME and excludes storage paths from responses", async () => {
    const response = await uploadUserAsset(upload());
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toContain("no-store");
    expect(service.create.mock.calls[0][0]).toMatchObject({
      owner: "alice",
      mimeType: "font/otf",
      hash,
      size: 12,
    });
    expect(await response.json()).not.toHaveProperty("file");
  });
  it("returns an existing upload on retries and recovers from simultaneous duplicate creates", async () => {
    service.getList.mockResolvedValueOnce({ items: [record] });
    expect((await uploadUserAsset(upload())).status).toBe(200);
    expect(service.create).not.toHaveBeenCalled();
    service.create.mockRejectedValueOnce(new Error("unique index"));
    service.getList
      .mockResolvedValueOnce({ items: [] })
      .mockResolvedValueOnce({ items: [record] });
    expect((await uploadUserAsset(upload())).status).toBe(200);
  });
  it("rejects invalid contents and oversized request bodies before saving anything", async () => {
    expect(
      (await uploadUserAsset(upload(new Blob(["invalid font"]), "font")))
        .status,
    ).toBe(400);
    const oversized = upload();
    oversized.headers.set("Content-Length", String(25 * 1024 * 1024));
    expect((await uploadUserAsset(oversized)).status).toBe(413);
    expect(service.create).not.toHaveBeenCalled();
  });
  it("downloads only accessible records and keeps protected-file tokens server-side", async () => {
    service.getOne.mockRejectedValueOnce(
      new ClientResponseError({ status: 404 }),
    );
    expect((await downloadUserAsset(record.id)).status).toBe(404);
    service.getOne.mockResolvedValue(record);
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(bytes)),
    );
    const response = await downloadUserAsset(record.id);
    expect(response.headers.get("content-type")).toBe("font/otf");
    expect(pb.files.getURL).toHaveBeenCalledWith(record, record.file, {
      token: "private-token",
    });
    expect(new Uint8Array(await response.arrayBuffer())).toEqual(bytes);
  });
});
