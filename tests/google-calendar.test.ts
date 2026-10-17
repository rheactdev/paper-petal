import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { OAuth2Client } from "google-auth-library";
import { ClientResponseError } from "pocketbase";
const mocks = vi.hoisted(() => ({
  cookie: undefined as string | undefined,
  linkError: undefined as string | undefined,
  set: vi.fn(),
  remove: vi.fn(),
  header: vi.fn(),
  account: vi.fn(),
  session: vi.fn(),
}));
vi.mock("@tanstack/react-start/server-only", () => ({}));
vi.mock("@tanstack/react-start/server", () => ({
  getCookie: (name: string) =>
    name === "paper_petal_calendar_error" ? mocks.linkError : mocks.cookie,
  setCookie: mocks.set,
  deleteCookie: mocks.remove,
  setResponseHeader: mocks.header,
}));
vi.mock("../src/auth/pocketbase.server", () => ({
  readSession: mocks.session,
  requireAccount: mocks.account,
}));
import { sealSecret, openSecret } from "../src/calendar/crypto.server";
import {
  beginCalendarLink,
  calendarScopes,
  calendarStatus,
  fetchGoogleWeek,
  finishCalendarLink,
  listGoogleCalendars,
  normaliseGoogleEvent,
  unlinkGoogleCalendar,
} from "../src/calendar/google.server";

const user = { id: "alice", email: "alice@example.com", name: "Alice" };
const choice = {
  id: "work@example.com",
  name: "Work",
  primary: true,
  timeZone: "America/New_York",
};
const service = {
  getList: vi.fn(),
  create: vi.fn(),
  update: vi.fn(),
  delete: vi.fn(),
};
const pb = {
  collection: vi.fn(() => service),
  filter: vi.fn(
    (_expression: string, params: { owner: string }) =>
      `owner = "${params.owner}"`,
  ),
};
const credentials = {
  access_token: "test-access",
  refresh_token: "test-refresh",
  expiry_date: Date.now() + 3600000,
  scope: calendarScopes.join(" "),
  token_type: "Bearer",
};
let requestSpy: ReturnType<typeof vi.spyOn<OAuth2Client, "request">>;
let tokenSpy: ReturnType<typeof vi.spyOn<OAuth2Client, "getToken">>;
let accessSpy: ReturnType<typeof vi.spyOn<OAuth2Client, "getAccessToken">>;
const rawEvent = (id = "event") => ({
  id,
  summary: "A little appointment",
  start: { dateTime: "2026-10-05T09:00:00-04:00" },
  end: { dateTime: "2026-10-05T10:00:00-04:00" },
});
const link = () => ({
  id: "link",
  owner: user.id,
  credentials: sealSecret(credentials, `google-calendar:${user.id}`),
});
const missing = () =>
  new ClientResponseError({ status: 404, response: { message: "Not found" } });
const request = (query: string) =>
  new Request(`http://localhost:3000/api/google-calendar/callback?${query}`);
async function pending() {
  const result = await beginCalendarLink();
  expect(result.ok).toBe(true);
  if (!result.ok) throw new Error(result.message);
  const url = new URL(result.data);
  return { url, state: url.searchParams.get("state")! };
}
beforeEach(() => {
  vi.stubEnv("GOOGLE_CLIENT_ID", "test-client.apps.googleusercontent.com");
  vi.stubEnv("GOOGLE_CLIENT_SECRET", "test-client-secret");
  vi.stubEnv("GOOGLE_OAUTH_CLIENT_ID", "");
  vi.stubEnv("GOOGLE_OAUTH_CLIENT_SECRET", "");
  vi.stubEnv("GOOGLE_CALENDAR_TOKEN_KEY", "ab".repeat(32));
  vi.stubEnv("APP_URL", "http://localhost:3000");
  vi.stubEnv("NODE_ENV", "test");
  mocks.cookie = undefined;
  mocks.linkError = undefined;
  mocks.set.mockReset().mockImplementation((name: string, value: string) => {
    if (name === "paper_petal_calendar_error") mocks.linkError = value;
    else mocks.cookie = value;
  });
  mocks.remove.mockReset().mockImplementation((name: string) => {
    if (name === "paper_petal_calendar_error") mocks.linkError = undefined;
    else mocks.cookie = undefined;
  });
  mocks.header.mockReset();
  mocks.account.mockReset().mockResolvedValue({ pb, user });
  mocks.session
    .mockReset()
    .mockResolvedValue({ user: null, unavailable: false });
  service.getList.mockReset().mockResolvedValue({ items: [] });
  service.create.mockReset().mockResolvedValue({ id: "link" });
  service.update.mockReset().mockResolvedValue({ id: "link" });
  service.delete.mockReset().mockResolvedValue(true);
  pb.collection.mockClear();
  pb.filter.mockClear();
  requestSpy = vi.spyOn(OAuth2Client.prototype, "request");
  tokenSpy = vi
    .spyOn(OAuth2Client.prototype, "getToken")
    .mockResolvedValue({ tokens: { ...credentials }, res: null });
  accessSpy = vi
    .spyOn(OAuth2Client.prototype, "getAccessToken")
    .mockImplementation(async function (this: OAuth2Client) {
      this.credentials.access_token = "fresh-access";
      return { token: "fresh-access" };
    });
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("encrypted account-bound calendar credentials", () => {
  it("round trips secrets with unique nonces and rejects another account or modified ciphertext", () => {
    const a = sealSecret(credentials, "google-calendar:alice"),
      b = sealSecret(credentials, "google-calendar:alice");
    expect(a).not.toBe(b);
    expect(a).not.toContain(credentials.refresh_token);
    expect(openSecret(a, "google-calendar:alice")).toEqual(credentials);
    expect(() => openSecret(a, "google-calendar:bob")).toThrow();
    const parts = a.split(".");
    parts[2] = (parts[2][0] === "A" ? "B" : "A") + parts[2].slice(1);
    expect(() =>
      openSecret(parts.join("."), "google-calendar:alice"),
    ).toThrow();
    expect(() =>
      openSecret("v2.bad.format", "google-calendar:alice"),
    ).toThrow();
    vi.stubEnv("GOOGLE_CALENDAR_TOKEN_KEY", "cd".repeat(32));
    expect(() => openSecret(a, "google-calendar:alice")).toThrow();
  });
  it("refuses an absent or malformed encryption key", () => {
    vi.stubEnv("GOOGLE_CALENDAR_TOKEN_KEY", "short");
    expect(() => sealSecret(credentials, "test")).toThrow("encryption");
  });
});
describe("Google OAuth linking", () => {
  it("uses narrow read-only scopes, offline access, state and PKCE with a sealed HttpOnly cookie", async () => {
    const { url, state } = await pending();
    expect(url.origin).toBe("https://accounts.google.com");
    expect(url.searchParams.get("scope")?.split(" ")).toEqual(calendarScopes);
    expect(url.searchParams.get("access_type")).toBe("offline");
    expect(url.searchParams.get("redirect_uri")).toBe(
      "http://localhost:3000/api/google-calendar/callback",
    );
    expect(url.searchParams.get("code_challenge_method")).toBe("S256");
    expect(url.searchParams.get("code_challenge")).toBeTruthy();
    expect(state).toMatch(/^[a-f0-9]{64}$/);
    expect(mocks.set.mock.calls[0][2]).toMatchObject({
      httpOnly: true,
      sameSite: "lax",
      secure: false,
      maxAge: 600,
      path: "/api/google-calendar/callback",
    });
    expect(openSecret(mocks.cookie!, "google-calendar-oauth")).toMatchObject({
      state,
      userId: "alice",
    });
    expect(url.href).not.toContain("test-client-secret");
    expect(tokenSpy).not.toHaveBeenCalled();
  });
  it("supports the existing GOOGLE_OAUTH names and requires HTTPS in production", async () => {
    vi.stubEnv("GOOGLE_CLIENT_ID", "");
    vi.stubEnv("GOOGLE_CLIENT_SECRET", "");
    vi.stubEnv("GOOGLE_OAUTH_CLIENT_ID", "existing-client");
    vi.stubEnv("GOOGLE_OAUTH_CLIENT_SECRET", "existing-secret");
    expect((await pending()).url.searchParams.get("client_id")).toBe(
      "existing-client",
    );
    vi.stubEnv("NODE_ENV", "production");
    expect((await beginCalendarLink()).ok).toBe(false);
    vi.stubEnv("APP_URL", "https://paper.example");
    expect((await pending()).url.searchParams.get("redirect_uri")).toBe(
      "https://paper.example/api/google-calendar/callback",
    );
    expect(mocks.set.mock.calls.at(-1)?.[2].secure).toBe(true);
  });
  it("requires a signed-in app account and reports configured status without leaking secrets", async () => {
    expect(await calendarStatus()).toEqual({
      configured: true,
      connected: false,
      signedIn: false,
    });
    mocks.account.mockRejectedValue(
      new Error("Sign in to link your calendar."),
    );
    expect(await beginCalendarLink()).toEqual({
      ok: false,
      message: "Sign in to link your calendar.",
    });
    expect(mocks.set).not.toHaveBeenCalled();
  });
  it("exchanges the code once, passes the verifier and saves only encrypted credentials for that owner", async () => {
    const { state } = await pending();
    const sealed = mocks.cookie!,
      pendingData = openSecret(sealed, "google-calendar-oauth") as {
        verifier: string;
      };
    const response = await finishCalendarLink(
      request(`state=${state}&code=test-code`),
    );
    expect(response.status).toBe(303);
    expect(response.headers.get("Location")).toBe(
      "/calendar?connection=linked",
    );
    expect(response.headers.get("Referrer-Policy")).toBe("no-referrer");
    expect(tokenSpy).toHaveBeenCalledWith({
      code: "test-code",
      codeVerifier: pendingData.verifier,
    });
    const saved = service.create.mock.calls[0][0];
    expect(saved.owner).toBe("alice");
    expect(openSecret(saved.credentials, "google-calendar:alice")).toEqual(
      credentials,
    );
    expect(JSON.stringify(saved)).not.toContain("test-refresh");
    expect(
      (
        await finishCalendarLink(request(`state=${state}&code=test-code`))
      ).headers.get("Location"),
    ).toBe("/calendar?connection=expired");
    expect(tokenSpy).toHaveBeenCalledOnce();
  });
  it("rejects missing/tampered state, expired requests and changed accounts before exchanging a code", async () => {
    const cases = [
      "wrong-state",
      "expired",
      "changed-account",
      "tampered-cookie",
    ];
    for (const kind of cases) {
      const { state } = await pending();
      if (kind === "expired") {
        const data = openSecret(
          mocks.cookie!,
          "google-calendar-oauth",
        ) as object;
        mocks.cookie = sealSecret(
          { ...data, created: Date.now() - 600001 },
          "google-calendar-oauth",
        );
      }
      if (kind === "changed-account")
        mocks.account.mockResolvedValueOnce({
          pb,
          user: { ...user, id: "bob" },
        });
      if (kind === "tampered-cookie")
        mocks.cookie = "v1.invalid.invalid.invalid";
      const response = await finishCalendarLink(
        request(`state=${kind === "wrong-state" ? "x" : state}&code=test-code`),
      );
      expect(response.headers.get("Location")).toBe(
        kind === "tampered-cookie"
          ? "/calendar?connection=failed"
          : "/calendar?connection=expired",
      );
    }
    expect(tokenSpy).not.toHaveBeenCalled();
    expect(service.create).not.toHaveBeenCalled();
  });
  it("handles consent cancellation, incomplete permissions and missing fresh refresh tokens without replacing a link", async () => {
    let { state } = await pending();
    expect(
      (
        await finishCalendarLink(request(`state=${state}&error=access_denied`))
      ).headers.get("Location"),
    ).toBe("/calendar?connection=cancelled");
    for (const tokens of [
      { ...credentials, scope: calendarScopes[0] },
      { ...credentials, refresh_token: undefined },
    ]) {
      ({ state } = await pending());
      service.getList.mockResolvedValue({ items: [link()] });
      tokenSpy.mockResolvedValueOnce({ tokens, res: null });
      expect(
        (
          await finishCalendarLink(request(`state=${state}&code=test-code`))
        ).headers.get("Location"),
      ).toBe("/calendar?connection=permissions");
    }
    expect(service.update).not.toHaveBeenCalled();
    expect(service.create).not.toHaveBeenCalled();
  });
  it("verifies actual granted scopes when the token exchange omits its optional scope field", async () => {
    const info = vi
      .spyOn(OAuth2Client.prototype, "getTokenInfo")
      .mockResolvedValue({
        scopes: calendarScopes,
        expiry_date: Date.now() + 3600000,
      });
    tokenSpy.mockResolvedValueOnce({
      tokens: { ...credentials, scope: undefined },
      res: null,
    });
    const { state } = await pending();
    expect(
      (
        await finishCalendarLink(request(`state=${state}&code=test-code`))
      ).headers.get("Location"),
    ).toBe("/calendar?connection=linked");
    expect(info).toHaveBeenCalledWith("test-access");
    expect(
      openSecret(
        service.create.mock.calls[0][0].credentials,
        "google-calendar:alice",
      ),
    ).toMatchObject({ scope: calendarScopes.join(" ") });
  });
  it("shows Google's token-exchange error and description without exposing the request or putting details in the URL", async () => {
    const { state } = await pending();
    tokenSpy.mockRejectedValueOnce({
      response: {
        status: 401,
        data: { error: "invalid_client", error_description: "Unauthorized" },
      },
      config: { data: "client_secret=do-not-show&code=private-code" },
      message: "Request failed: client_secret=do-not-show",
    });
    const response = await finishCalendarLink(
      request(`state=${state}&code=test-code`),
    );
    expect(response.headers.get("Location")).toBe(
      "/calendar?connection=failed",
    );
    expect(mocks.linkError).toBeTruthy();
    expect(mocks.linkError).not.toContain("invalid_client");
    expect(mocks.set.mock.calls.at(-1)?.[2]).toMatchObject({
      path: "/",
      httpOnly: true,
      sameSite: "lax",
      maxAge: 600,
    });
    mocks.session.mockResolvedValue({ user, unavailable: false });
    const status = await calendarStatus();
    expect(status.linkError).toBe("invalid_client — Unauthorized");
    expect(JSON.stringify(status)).not.toMatch(/do-not-show|private-code/);
    expect(service.create).not.toHaveBeenCalled();
  });
  it("shows errors Google returns directly to the callback", async () => {
    const { state } = await pending();
    const response = await finishCalendarLink(
      request(
        `state=${state}&error=temporarily_unavailable&error_description=${encodeURIComponent("Please try again later.")}`,
      ),
    );
    expect(response.headers.get("Location")).toBe(
      "/calendar?connection=failed",
    );
    mocks.session.mockResolvedValue({ user, unavailable: false });
    expect((await calendarStatus()).linkError).toBe(
      "temporarily_unavailable — Please try again later.",
    );
    expect(tokenSpy).not.toHaveBeenCalled();
  });
  it("handles Google's nested error format and redacts configured secrets", async () => {
    const { state } = await pending();
    tokenSpy.mockRejectedValueOnce({
      response: {
        data: {
          error: {
            status: "INVALID_ARGUMENT",
            message: "Rejected test-client-secret and " + "ab".repeat(32),
          },
        },
      },
    });
    await finishCalendarLink(request(`state=${state}&code=test-code`));
    mocks.session.mockResolvedValue({ user, unavailable: false });
    expect((await calendarStatus()).linkError).toBe(
      "INVALID_ARGUMENT — Rejected [redacted] and [redacted]",
    );
  });
  it("bounds provider details and leaves unexpected exceptions private", async () => {
    let { state } = await pending();
    tokenSpy.mockRejectedValueOnce({
      response: {
        data: { error: "invalid_grant", error_description: "x".repeat(3000) },
      },
    });
    await finishCalendarLink(request(`state=${state}&code=test-code`));
    mocks.session.mockResolvedValue({ user, unavailable: false });
    expect((await calendarStatus()).linkError).toHaveLength(1200);
    ({ state } = await pending());
    expect(mocks.linkError).toBeUndefined();
    tokenSpy.mockRejectedValueOnce(new Error("private request dump"));
    await finishCalendarLink(request(`state=${state}&code=test-code`));
    expect((await calendarStatus()).linkError).toBeUndefined();
  });
  it("does not expose another account's error or accept an expired/tampered diagnostic", async () => {
    const { state } = await pending();
    tokenSpy.mockRejectedValueOnce({
      response: { data: { error: "invalid_client" } },
    });
    await finishCalendarLink(request(`state=${state}&code=test-code`));
    mocks.session.mockResolvedValue({
      user: { ...user, id: "bob" },
      unavailable: false,
    });
    expect((await calendarStatus()).linkError).toBeUndefined();
    mocks.session.mockResolvedValue({ user, unavailable: false });
    mocks.linkError = sealSecret(
      { message: "Old error", created: Date.now() - 600001 },
      "google-calendar-error:alice",
    );
    expect((await calendarStatus()).linkError).toBeUndefined();
    mocks.linkError = "v1.invalid.invalid.invalid";
    expect((await calendarStatus()).linkError).toBeUndefined();
  });
  it("distinguishes an empty calendar collection from a missing collection", async () => {
    mocks.session.mockResolvedValue({ user, unavailable: false });
    expect(await calendarStatus()).toMatchObject({
      signedIn: true,
      connected: false,
    });
    expect((await calendarStatus()).error).toBeUndefined();
    service.getList.mockRejectedValue(missing());
    expect((await calendarStatus()).error).toContain(
      "google_calendar_links collection is missing",
    );
    const { state } = await pending();
    await finishCalendarLink(request(`state=${state}&code=test-code`));
    expect((await calendarStatus()).linkError).toContain(
      "active data directory",
    );
    expect(service.create).not.toHaveBeenCalled();
  });
});
describe("read-only calendar snapshots", () => {
  beforeEach(() => service.getList.mockResolvedValue({ items: [link()] }));
  it("normalizes all-day exclusive dates, offset timestamps, timezone-only timestamps and declined/cancelled events", () => {
    expect(
      normaliseGoogleEvent(
        {
          id: "day",
          start: { date: "2026-10-05" },
          end: { date: "2026-10-06" },
        },
        choice,
      ),
    ).toMatchObject({
      allDay: true,
      start: "2026-10-05",
      end: "2026-10-06",
      title: "Untitled event",
    });
    expect(normaliseGoogleEvent(rawEvent(), choice)).toMatchObject({
      start: "2026-10-05T13:00:00Z",
      end: "2026-10-05T14:00:00Z",
    });
    expect(
      normaliseGoogleEvent(
        {
          id: "local",
          start: { dateTime: "2026-10-05T09:00:00", timeZone: "Asia/Tokyo" },
          end: { dateTime: "2026-10-05T10:00:00", timeZone: "Asia/Tokyo" },
        },
        choice,
      )?.start,
    ).toBe("2026-10-05T00:00:00Z");
    expect(
      normaliseGoogleEvent({ id: "cancelled", status: "cancelled" }, choice),
    ).toBeNull();
    expect(
      normaliseGoogleEvent(
        {
          ...rawEvent(),
          attendees: [{ self: true, responseStatus: "declined" }],
        },
        choice,
      ),
    ).toBeNull();
    expect(() =>
      normaliseGoogleEvent(
        { ...rawEvent(), end: { dateTime: "2026-10-05T08:00:00-04:00" } },
        choice,
      ),
    ).toThrow("invalid date range");
  });
  it("paginates the calendar list, filters inaccessible/deleted calendars and persists refreshed credentials", async () => {
    requestSpy
      .mockResolvedValueOnce({
        data: {
          items: [
            {
              id: choice.id,
              summary: "Work",
              primary: true,
              timeZone: choice.timeZone,
              accessRole: "owner",
            },
          ],
          nextPageToken: "more",
        },
      } as never)
      .mockResolvedValueOnce({
        data: {
          items: [
            { id: "hidden", deleted: true },
            { id: "busy", accessRole: "freeBusyReader" },
            { id: "shared", summaryOverride: "Family", accessRole: "reader" },
          ],
        },
      } as never);
    expect(await listGoogleCalendars()).toEqual({
      ok: true,
      data: [
        choice,
        { id: "shared", name: "Family", primary: false, timeZone: "UTC" },
      ],
    });
    expect(requestSpy.mock.calls[1][0].params).toMatchObject({
      pageToken: "more",
    });
    const saved = service.update.mock.calls[0][1];
    expect(
      openSecret(saved.credentials, "google-calendar:alice"),
    ).toMatchObject({
      access_token: "fresh-access",
      refresh_token: "test-refresh",
    });
    expect(pb.filter).toHaveBeenCalledWith("owner = {:owner}", {
      owner: "alice",
    });
  });
  it("expands recurring events, paginates a bounded timezone-aware week and omits cancelled or declined entries", async () => {
    requestSpy
      .mockResolvedValueOnce({
        data: {
          items: [
            {
              id: choice.id,
              summary: "Work",
              primary: true,
              timeZone: choice.timeZone,
            },
          ],
        },
      } as never)
      .mockResolvedValueOnce({
        data: {
          items: [
            rawEvent("occurrence-1"),
            { id: "cancelled", status: "cancelled" },
          ],
          nextPageToken: "next-events",
        },
      } as never)
      .mockResolvedValueOnce({
        data: {
          items: [
            rawEvent("occurrence-2"),
            {
              ...rawEvent("declined"),
              attendees: [{ self: true, responseStatus: "declined" }],
            },
          ],
        },
      } as never);
    const result = await fetchGoogleWeek({
      week: "2026-10-07",
      timeZone: choice.timeZone,
      calendarIds: [choice.id],
    });
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error(result.message);
    expect(result.data.map((e) => e.id)).toEqual([
      `${choice.id}:occurrence-1`,
      `${choice.id}:occurrence-2`,
    ]);
    expect(requestSpy.mock.calls[1][0]).toMatchObject({
      url: `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(choice.id)}/events`,
      params: {
        timeMin: "2026-10-05T04:00:00Z",
        timeMax: "2026-10-12T04:00:00Z",
        singleEvents: true,
        showDeleted: false,
        orderBy: "startTime",
        timeZone: choice.timeZone,
      },
    });
    expect(requestSpy.mock.calls[2][0].params).toMatchObject({
      pageToken: "next-events",
    });
    expect(JSON.stringify(result)).not.toContain("test-refresh");
  });
  it("rejects a selected calendar absent from the authenticated calendar list", async () => {
    requestSpy.mockResolvedValueOnce({
      data: { items: [{ id: choice.id }] },
    } as never);
    expect(
      await fetchGoogleWeek({
        week: "2026-10-05",
        timeZone: "UTC",
        calendarIds: ["someone-else"],
      }),
    ).toMatchObject({
      ok: false,
      message: expect.stringContaining("no longer available"),
    });
    expect(requestSpy).toHaveBeenCalledOnce();
  });
  it("reports revoked access and corrupt saved tokens as reconnectable errors", async () => {
    accessSpy.mockRejectedValueOnce({
      response: { status: 400, data: { error: "invalid_grant" } },
    });
    expect(await listGoogleCalendars()).toMatchObject({
      ok: false,
      reconnect: true,
    });
    service.getList.mockResolvedValue({
      items: [
        {
          id: "link",
          credentials: sealSecret(credentials, "google-calendar:bob"),
        },
      ],
    });
    expect(await listGoogleCalendars()).toMatchObject({
      ok: false,
      reconnect: true,
    });
    expect(requestSpy).not.toHaveBeenCalled();
  });
  it("rejects oversized weeks instead of silently discarding events", async () => {
    requestSpy
      .mockResolvedValueOnce({ data: { items: [{ id: choice.id }] } } as never)
      .mockResolvedValueOnce({
        data: {
          items: Array.from({ length: 501 }, (_, i) => rawEvent(String(i))),
        },
      } as never);
    expect(
      await fetchGoogleWeek({
        week: "2026-10-05",
        timeZone: "UTC",
        calendarIds: [choice.id],
      }),
    ).toMatchObject({
      ok: false,
      message: expect.stringContaining("500 events"),
    });
  });
  it("revokes a token in a POST body and removes the owner link even when Google is unavailable", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(new Response(null, { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    expect(await unlinkGoogleCalendar()).toEqual({
      ok: true,
      data: { revoked: true },
    });
    expect(fetchMock.mock.calls[0][0]).toBe(
      "https://oauth2.googleapis.com/revoke",
    );
    expect(fetchMock.mock.calls[0][1].method).toBe("POST");
    expect(fetchMock.mock.calls[0][1].body.get("token")).toBe("test-refresh");
    expect(service.delete).toHaveBeenCalledWith("link");
    fetchMock.mockRejectedValueOnce(new Error("offline"));
    expect(await unlinkGoogleCalendar()).toEqual({
      ok: true,
      data: { revoked: false },
    });
    expect(service.delete).toHaveBeenCalledTimes(2);
  });
});
