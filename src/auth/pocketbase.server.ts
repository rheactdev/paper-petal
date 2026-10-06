import "@tanstack/react-start/server-only";
import PocketBase, {
  BaseAuthStore,
  ClientResponseError,
  type RecordModel,
} from "pocketbase";
import {
  getCookie,
  setCookie,
  deleteCookie,
  setResponseHeader,
} from "@tanstack/react-start/server";
import type {
  AuthResult,
  AuthSession,
  AuthUser,
  SignInInput,
  SignUpInput,
} from "./model";

const cookieName = "paper_petal_session";
const cookieOptions = () => ({
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: "lax" as const,
  path: "/",
});
// A fresh memory-only auth store per request prevents sessions leaking between users.
function client() {
  const pb = new PocketBase(
    process.env.POCKETBASE_URL || "http://127.0.0.1:8090",
    new BaseAuthStore(),
  );
  pb.beforeSend = (url, options) => ({
    url,
    options: {
      ...options,
      cache: "no-store",
      signal: AbortSignal.timeout(8000),
    },
  });
  return pb;
}
function privateResponse() {
  setResponseHeader("Cache-Control", "private, no-store");
  setResponseHeader("Vary", "Cookie");
}
function publicUser(record: RecordModel): AuthUser {
  return {
    id: record.id,
    email: String(record.email || ""),
    name: String(record.name || ""),
  };
}
function saveSession(pb: PocketBase) {
  // Only the token is stored, never exposed to JavaScript or route data.
  const claims = JSON.parse(
    Buffer.from(pb.authStore.token.split(".")[1], "base64url").toString(),
  );
  setCookie(cookieName, pb.authStore.token, {
    ...cookieOptions(),
    expires: new Date(claims.exp * 1000),
  });
}
function failure(error: unknown, action: "signIn" | "signUp"): AuthResult {
  if (error instanceof ClientResponseError && error.status === 429)
    return {
      ok: false,
      message: "Too many attempts. Give it a moment, then try again.",
    };
  if (
    !(error instanceof ClientResponseError) ||
    error.status === 0 ||
    error.status >= 500
  )
    return {
      ok: false,
      message:
        "We can’t reach the account service right now. Please try again shortly.",
    };
  return {
    ok: false,
    message:
      action === "signIn"
        ? "The email or password isn’t correct. Please try again."
        : "We couldn’t create an account with those details. If you already have an account, sign in.",
  };
}
export async function readSession(): Promise<AuthSession> {
  privateResponse();
  const token = getCookie(cookieName);
  if (!token) return { user: null, unavailable: false };
  const pb = client();
  pb.authStore.save(token);
  if (!pb.authStore.isValid) return { user: null, unavailable: false };
  try {
    const { record } = await pb.collection("users").authRefresh();
    // Verify against PocketBase, not the untrusted cookie's claims. The original
    // token stays valid until expiry; read requests never rewrite the cookie.
    return { user: publicUser(record), unavailable: false };
  } catch (error) {
    const unavailable =
      !(error instanceof ClientResponseError) ||
      error.status === 0 ||
      error.status >= 500 ||
      error.status === 429;
    return { user: null, unavailable };
  }
}
export async function authenticate(input: SignInInput): Promise<AuthResult> {
  privateResponse();
  const pb = client();
  try {
    const { record } = await pb
      .collection("users")
      .authWithPassword(input.email, input.password);
    saveSession(pb);
    return { ok: true, user: publicUser(record) };
  } catch (error) {
    return failure(error, "signIn");
  }
}
export async function register(input: SignUpInput): Promise<AuthResult> {
  privateResponse();
  const pb = client();
  try {
    await pb.collection("users").create({ ...input, emailVisibility: false });
  } catch (error) {
    return failure(error, "signUp");
  }
  const result = await authenticate(input);
  return result.ok
    ? result
    : {
        ok: false,
        message:
          "Your account was created, but we couldn’t sign you in. Try signing in with your new account.",
      };
}
export function clearSession() {
  privateResponse();
  deleteCookie(cookieName, cookieOptions());
  return { user: null, unavailable: false } satisfies AuthSession;
}
export async function requireAccount() {
  privateResponse();
  const token = getCookie(cookieName);
  const pb = client();
  if (token) pb.authStore.save(token);
  if (!pb.authStore.isValid) throw new Error("Sign in to link your calendar.");
  try {
    const { record } = await pb.collection("users").authRefresh();
    return { pb, user: publicUser(record) };
  } catch (error) {
    if (
      error instanceof ClientResponseError &&
      [400, 401, 403].includes(error.status)
    )
      throw new Error("Your session has expired. Sign in again.");
    throw new Error("We can’t reach the account service. Please try again.");
  }
}
