import "@tanstack/react-start/server-only";
import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

function key() {
  const value = process.env.GOOGLE_CALENDAR_TOKEN_KEY || "";
  if (!/^[a-f0-9]{64}$/i.test(value))
    throw new Error("Calendar encryption is not configured.");
  return Buffer.from(value, "hex");
}
export function sealSecret(value: unknown, context: string) {
  const iv = randomBytes(12),
    cipher = createCipheriv("aes-256-gcm", key(), iv);
  cipher.setAAD(Buffer.from(context));
  const encrypted = Buffer.concat([
    cipher.update(JSON.stringify(value), "utf8"),
    cipher.final(),
  ]);
  return [
    "v1",
    iv.toString("base64url"),
    cipher.getAuthTag().toString("base64url"),
    encrypted.toString("base64url"),
  ].join(".");
}
export function openSecret(value: string, context: string): unknown {
  const [version, iv, tag, content, extra] = value.split(".");
  if (version !== "v1" || !iv || !tag || !content || extra)
    throw new Error("Invalid calendar credentials.");
  const decipher = createDecipheriv(
    "aes-256-gcm",
    key(),
    Buffer.from(iv, "base64url"),
  );
  decipher.setAAD(Buffer.from(context));
  decipher.setAuthTag(Buffer.from(tag, "base64url"));
  return JSON.parse(
    Buffer.concat([
      decipher.update(Buffer.from(content, "base64url")),
      decipher.final(),
    ]).toString("utf8"),
  );
}
