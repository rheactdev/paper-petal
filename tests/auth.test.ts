import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { authSearch, signInSchema, signUpSchema } from "../src/auth/model";

const cookies = vi.hoisted(() => ({
  value: undefined as string | undefined,
  set: vi.fn(),
  remove: vi.fn(),
  header: vi.fn(),
}));
vi.mock("@tanstack/react-start/server-only", () => ({}));
vi.mock("@tanstack/react-start/server", () => ({
  getCookie: () => cookies.value,
  setCookie: cookies.set,
  deleteCookie: cookies.remove,
  setResponseHeader: cookies.header,
}));
import {
  authenticate,
  clearSession,
  readSession,
  register,
} from "../src/auth/pocketbase.server";

const token = (id = "alice", exp = Math.floor(Date.now() / 1000) + 3600) =>
  `${Buffer.from("{}").toString("base64url")}.${Buffer.from(JSON.stringify({ id, exp })).toString("base64url")}.test-signature`;
const record = (id = "alice") => ({
  id,
  email: `${id}@example.com`,
  name: id,
  collectionName: "users",
  collectionId: "test",
  verified: false,
  tokenKey: "must-not-leak",
});
const reply = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });
const input = { email: "alice@example.com", password: "example-password" };
let fetchMock: ReturnType<typeof vi.fn>;
beforeEach(() => {
  cookies.value = undefined;
  cookies.set.mockReset();
  cookies.remove.mockReset();
  cookies.header.mockReset();
  fetchMock = vi.fn();
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe("account validation", () => {
  it("returns calendar sign-ins to an allowed local route and rejects arbitrary redirect targets", () => {
    expect(authSearch.parse({ returnTo: "/calendar" })).toEqual({
      returnTo: "/calendar",
    });
    expect(authSearch.parse({ returnTo: "https://evil.example" })).toEqual({
      returnTo: undefined,
    });
  });
  it("normalizes email and names without altering the password", () => {
    expect(
      signUpSchema.parse({
        ...input,
        email: " Alice@Example.COM ",
        name: " Alice ",
        password: " eight spaces ",
        passwordConfirm: " eight spaces ",
      }),
    ).toEqual({
      email: "alice@example.com",
      name: "Alice",
      password: " eight spaces ",
      passwordConfirm: " eight spaces ",
    });
  });
  it("rejects invalid emails, short passwords, mismatches and UTF-8 passwords beyond PocketBase's limit", () => {
    const base = { ...input, name: "", passwordConfirm: input.password };
    expect(signInSchema.safeParse({ ...input, email: "bad" }).success).toBe(
      false,
    );
    expect(
      signUpSchema.safeParse({
        ...base,
        password: "short",
        passwordConfirm: "short",
      }).success,
    ).toBe(false);
    expect(
      signUpSchema.safeParse({ ...base, passwordConfirm: "different" }).success,
    ).toBe(false);
    expect(
      signUpSchema.safeParse({
        ...base,
        password: "🌸".repeat(18),
        passwordConfirm: "🌸".repeat(18),
      }).success,
    ).toBe(false);
    expect(
      signUpSchema.safeParse({
        ...base,
        password: "a".repeat(71),
        passwordConfirm: "a".repeat(71),
      }).success,
    ).toBe(true);
  });
  it("strips privilege fields before they can reach PocketBase", () => {
    const parsed = signUpSchema.parse({
      ...input,
      name: "",
      passwordConfirm: input.password,
      verified: true,
      role: "admin",
    });
    expect(parsed).not.toHaveProperty("verified");
    expect(parsed).not.toHaveProperty("role");
  });
});
describe("server-managed PocketBase sessions", () => {
  it("doesn't contact PocketBase for guests or expired cookies", async () => {
    expect(await readSession()).toEqual({ user: null, unavailable: false });
    cookies.value = token("alice", 1);
    expect(await readSession()).toEqual({ user: null, unavailable: false });
    expect(fetchMock).not.toHaveBeenCalled();
    expect(cookies.header).toHaveBeenCalledWith(
      "Cache-Control",
      "private, no-store",
    );
  });
  it("returns only public user fields and sets an HttpOnly cookie matching token expiry", async () => {
    const issuedToken = token();
    fetchMock.mockResolvedValue(
      reply({ token: issuedToken, record: record() }),
    );
    expect(await authenticate(input)).toEqual({
      ok: true,
      user: { id: "alice", email: input.email, name: "alice" },
    });
    expect(cookies.set).toHaveBeenCalledWith(
      "paper_petal_session",
      issuedToken,
      expect.objectContaining({
        httpOnly: true,
        sameSite: "lax",
        path: "/",
        expires: expect.any(Date),
      }),
    );
  });
  it("uses Secure cookies for production and clears them with matching attributes", async () => {
    vi.stubEnv("NODE_ENV", "production");
    fetchMock.mockResolvedValue(reply({ token: token(), record: record() }));
    await authenticate(input);
    clearSession();
    expect(cookies.set.mock.calls[0][2].secure).toBe(true);
    expect(cookies.remove).toHaveBeenCalledWith(
      "paper_petal_session",
      expect.objectContaining({ secure: true, httpOnly: true, path: "/" }),
    );
  });
  it("verifies cookies with PocketBase and never trusts a forged unexpired token", async () => {
    cookies.value = token("forged");
    fetchMock.mockResolvedValue(reply({ message: "Invalid token" }, 401));
    expect(await readSession()).toEqual({ user: null, unavailable: false });
    expect(fetchMock).toHaveBeenCalledOnce();
    expect(cookies.set).not.toHaveBeenCalled();
  });
  it("keeps read requests from overwriting a cookie after concurrent sign-out", async () => {
    cookies.value = token();
    fetchMock.mockResolvedValue(
      reply({ token: token("new"), record: record() }),
    );
    expect((await readSession()).user?.id).toBe("alice");
    expect(cookies.set).not.toHaveBeenCalled();
    expect(cookies.remove).not.toHaveBeenCalled();
  });
  it("doesn't share authorization between different requests", async () => {
    fetchMock.mockResolvedValue(reply({ token: token(), record: record() }));
    await authenticate(input);
    await authenticate({ email: "bob@example.com", password: input.password });
    expect(
      fetchMock.mock.calls.every(
        ([, options]) => !options.headers.Authorization,
      ),
    ).toBe(true);
    cookies.value = token("bob");
    await readSession();
    expect(fetchMock.mock.lastCall?.[1].headers.Authorization).toBe(
      token("bob"),
    );
  });
  it("preserves the cookie during backend outages and distinguishes rejected sessions", async () => {
    cookies.value = token();
    fetchMock.mockRejectedValue(new Error("offline"));
    expect(await readSession()).toEqual({ user: null, unavailable: true });
    expect(cookies.remove).not.toHaveBeenCalled();
    expect(await authenticate(input)).toEqual({
      ok: false,
      message: expect.stringContaining("account service"),
    });
  });
  it("handles wrong credentials and rate limits without exposing backend error data", async () => {
    fetchMock
      .mockResolvedValueOnce(reply({ message: "secret backend detail" }, 400))
      .mockResolvedValueOnce(reply({}, 429));
    expect(await authenticate(input)).toEqual({
      ok: false,
      message: expect.stringContaining("email or password"),
    });
    expect(await authenticate(input)).toEqual({
      ok: false,
      message: expect.stringContaining("Too many attempts"),
    });
    expect(cookies.set).not.toHaveBeenCalled();
  });
  it("creates an account with a private email before signing it in", async () => {
    fetchMock
      .mockResolvedValueOnce(reply(record()))
      .mockResolvedValueOnce(reply({ token: token(), record: record() }));
    expect(
      (
        await register({
          ...input,
          name: "Alice",
          passwordConfirm: input.password,
        })
      ).ok,
    ).toBe(true);
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toMatchObject({
      emailVisibility: false,
      passwordConfirm: input.password,
    });
    expect(cookies.set).toHaveBeenCalledOnce();
  });
  it("reports duplicate registration and partial account creation clearly", async () => {
    fetchMock.mockResolvedValueOnce(reply({}, 400));
    expect(
      await register({ ...input, name: "", passwordConfirm: input.password }),
    ).toEqual({
      ok: false,
      message: expect.stringContaining("already have an account"),
    });
    fetchMock
      .mockResolvedValueOnce(reply(record()))
      .mockResolvedValueOnce(reply({}, 503));
    expect(
      await register({ ...input, name: "", passwordConfirm: input.password }),
    ).toEqual({
      ok: false,
      message: expect.stringContaining("account was created"),
    });
  });
});
