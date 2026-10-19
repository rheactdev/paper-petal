import "@tanstack/react-start/server-only";
import { createHash } from "node:crypto";
import { ClientResponseError, type RecordModel } from "pocketbase";
import { requireAccount } from "../auth/pocketbase.server";
import { validateAssetBytes, type UserAsset } from "./user-assets";

const headers = {
  "Cache-Control": "private, no-store",
  Vary: "Cookie",
  "X-Content-Type-Options": "nosniff",
};
const publicAsset = (record: RecordModel): UserAsset => ({
  id: record.id,
  kind: record.kind,
  name: record.name,
  mimeType: record.mimeType,
  size: record.size,
  hash: record.hash,
});

function failure(error: unknown) {
  const message =
    error instanceof Error
      ? error.message
      : "The asset library is unavailable. Please try again.";
  const status = /[Ss]ign in|session has expired/.test(message)
    ? 401
    : error instanceof ClientResponseError
      ? error.status === 404
        ? 404
        : 503
      : 400;
  return Response.json({ message }, { status, headers });
}

export async function listUserAssets() {
  try {
    const { pb } = await requireAccount("Sign in to use your asset library.");
    const records = await pb
      .collection("user_assets")
      .getFullList({ sort: "-created" });
    return Response.json(records.map(publicAsset), { headers });
  } catch (error) {
    return failure(error);
  }
}

export async function uploadUserAsset(request: Request) {
  try {
    const expected = new URL(process.env.APP_URL || request.url).origin;
    if (
      request.headers.get("Origin") !== expected ||
      request.headers.get("Sec-Fetch-Site") === "cross-site"
    )
      return Response.json(
        { message: "Upload files from the application’s own page." },
        { status: 403, headers },
      );
    const { pb, user } = await requireAccount(
      "Sign in to upload fonts and stickers.",
    );
    // Bound the body before parsing multipart data, including chunked requests.
    const maximum = 20 * 1024 * 1024 + 64 * 1024;
    if (Number(request.headers.get("Content-Length")) > maximum)
      return Response.json(
        { message: "This upload is too large." },
        { status: 413, headers },
      );
    const reader = request.body?.getReader();
    if (!reader) throw new Error("Choose a file to upload.");
    const chunks: Uint8Array[] = [];
    let length = 0;
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      length += value.length;
      if (length > maximum) {
        await reader.cancel();
        return Response.json(
          { message: "This upload is too large." },
          { status: 413, headers },
        );
      }
      chunks.push(value);
    }
    const body = new Uint8Array(length);
    let offset = 0;
    for (const chunk of chunks) {
      body.set(chunk, offset);
      offset += chunk.length;
    }
    const form = await new Response(body, {
      headers: { "Content-Type": request.headers.get("Content-Type") || "" },
    }).formData();
    const kind = form.get("kind");
    if (kind !== "font" && kind !== "sticker")
      throw new Error("Choose fonts or stickers to upload.");
    const file = form.get("file");
    if (!(file instanceof File)) throw new Error("Choose a file to upload.");
    const bytes = new Uint8Array(await file.arrayBuffer());
    const mimeType = validateAssetBytes(kind, bytes);
    const hash = createHash("sha256").update(bytes).digest("hex");
    const filter = pb.filter(
      "owner = {:owner} && kind = {:kind} && hash = {:hash}",
      { owner: user.id, kind, hash },
    );
    const existing = async () =>
      (await pb.collection("user_assets").getList(1, 1, { filter })).items[0];
    let record = await existing();
    if (!record) {
      const name =
        file.name.split(/[\\/]/).pop()?.slice(0, 200) || `My ${kind}`;
      try {
        record = await pb.collection("user_assets").create({
          owner: user.id,
          kind,
          name,
          mimeType,
          size: bytes.length,
          hash,
          file: new File([bytes], name, { type: mimeType }),
        });
      } catch (error) {
        // A retry or simultaneous upload may have won the unique-index race.
        record = await existing();
        if (!record) throw error;
      }
    }
    return Response.json(publicAsset(record), { headers });
  } catch (error) {
    return failure(error);
  }
}

export async function downloadUserAsset(id: string) {
  try {
    if (!/^[a-z0-9]{15}$/.test(id))
      return new Response(null, { status: 404, headers });
    const { pb } = await requireAccount("Sign in to use your asset library.");
    const record = await pb.collection("user_assets").getOne(id);
    const token = await pb.files.getToken();
    const response = await fetch(
      pb.files.getURL(record, record.file, { token }),
      { signal: AbortSignal.timeout(30000) },
    );
    if (!response.ok)
      throw new Error("This asset couldn’t be downloaded. Please try again.");
    return new Response(response.body, {
      headers: { ...headers, "Content-Type": record.mimeType },
    });
  } catch (error) {
    return failure(error);
  }
}
