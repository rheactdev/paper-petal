import "@tanstack/react-start/server-only";
import {
  OAuth2Client,
  CodeChallengeMethod,
  type Credentials,
} from "google-auth-library";
import { randomBytes, timingSafeEqual } from "node:crypto";
import { z } from "zod";
import { Temporal } from "@js-temporal/polyfill";
import { ClientResponseError, type RecordModel } from "pocketbase";
import {
  getCookie,
  setCookie,
  deleteCookie,
  setResponseHeader,
} from "@tanstack/react-start/server";
import { readSession, requireAccount } from "../auth/pocketbase.server";
import { openSecret, sealSecret } from "./crypto.server";
import { weekBounds, mondayOf } from "../data/weekly";
import type {
  CalendarChoice,
  CalendarEvent,
  CalendarResult,
  CalendarStatus,
  WeekRequest,
} from "./model";

export const calendarScopes = [
  "https://www.googleapis.com/auth/calendar.events.readonly",
  "https://www.googleapis.com/auth/calendar.calendarlist.readonly",
];
const oauthCookie = "paper_petal_calendar_oauth";
const pendingSchema = z.object({
  state: z.string().length(64),
  userId: z.string(),
  verifier: z.string(),
  created: z.number(),
});
const credentialsSchema = z.object({
  access_token: z.string().optional(),
  refresh_token: z.string().optional(),
  expiry_date: z.number().optional(),
  scope: z.string().optional(),
  token_type: z.string().optional(),
});
const cookieOptions = () => ({
  httpOnly: true,
  sameSite: "lax" as const,
  secure: process.env.NODE_ENV === "production",
  path: "/api/google-calendar/callback",
});
type Account = Awaited<ReturnType<typeof requireAccount>>;
class CalendarError extends Error {
  constructor(
    message: string,
    public reconnect = false,
  ) {
    super(message);
  }
}
function privateResponse() {
  setResponseHeader("Cache-Control", "private, no-store");
  setResponseHeader("Vary", "Cookie");
}
function configuration() {
  const clientId =
      process.env.GOOGLE_CLIENT_ID || process.env.GOOGLE_OAUTH_CLIENT_ID || "",
    clientSecret =
      process.env.GOOGLE_CLIENT_SECRET ||
      process.env.GOOGLE_OAUTH_CLIENT_SECRET ||
      "";
  const key = process.env.GOOGLE_CALENDAR_TOKEN_KEY || "";
  const url = new URL(process.env.APP_URL || "http://localhost:3000");
  if (
    url.username ||
    url.password ||
    url.pathname !== "/" ||
    url.search ||
    url.hash ||
    !["http:", "https:"].includes(url.protocol)
  )
    throw new Error("Set APP_URL to the application’s origin.");
  if (process.env.NODE_ENV === "production" && url.protocol !== "https:")
    throw new Error("Production calendar linking requires an HTTPS APP_URL.");
  return {
    clientId,
    clientSecret,
    redirectUri: `${url.origin}/api/google-calendar/callback`,
    configured: Boolean(
      clientId && clientSecret && /^[a-f0-9]{64}$/i.test(key),
    ),
  };
}
function oauthClient() {
  const config = configuration();
  if (!config.configured)
    throw new CalendarError(
      "Google Calendar isn’t configured yet. Follow the setup guide to add your Google OAuth credentials.",
    );
  return new OAuth2Client({
    transporterOptions: { timeout: 12000, retry: false },
    clientId: config.clientId,
    clientSecret: config.clientSecret,
    redirectUri: config.redirectUri,
  });
}
async function findLink(account: Account): Promise<RecordModel | null> {
  try {
    return await account.pb
      .collection("google_calendar_links")
      .getFirstListItem(
        account.pb.filter("owner = {:owner}", { owner: account.user.id }),
      );
  } catch (error) {
    if (error instanceof ClientResponseError && error.status === 404)
      return null;
    throw new CalendarError(
      "Your calendar connection couldn’t be loaded. Check PocketBase and its calendar migration.",
    );
  }
}
async function saveCredentials(
  account: Account,
  link: RecordModel | null,
  credentials: Credentials,
) {
  const data = {
    owner: account.user.id,
    credentials: sealSecret(
      credentialsSchema.parse(credentials),
      `google-calendar:${account.user.id}`,
    ),
  };
  if (link)
    await account.pb.collection("google_calendar_links").update(link.id, data);
  else await account.pb.collection("google_calendar_links").create(data);
}
function failure(error: unknown): {
  ok: false;
  message: string;
  reconnect?: boolean;
} {
  if (error instanceof CalendarError)
    return { ok: false, message: error.message, reconnect: error.reconnect };
  const response = (
    error as {
      response?: {
        status?: number;
        data?: { error?: string | { status?: string } };
      };
    }
  )?.response;
  if (response?.status === 401 || response?.data?.error === "invalid_grant")
    return {
      ok: false,
      reconnect: true,
      message:
        "Google needs you to reconnect your calendar. Your existing spreads are safe.",
    };
  if (response?.status === 403)
    return {
      ok: false,
      message:
        "Google couldn’t allow calendar access. Check the Calendar API and the read-only permissions, then reconnect.",
      reconnect: true,
    };
  if (response?.status === 429)
    return {
      ok: false,
      message: "Google Calendar is busy. Wait a moment and try again.",
    };
  if (
    error instanceof Error &&
    /^(Sign in|Your session|We can’t reach the account service)/.test(
      error.message,
    )
  )
    return { ok: false, message: error.message };
  return {
    ok: false,
    message: "Your calendar couldn’t be loaded. Please try again shortly.",
  };
}
export async function calendarStatus(): Promise<CalendarStatus> {
  privateResponse();
  let configured = false;
  try {
    configured = configuration().configured;
  } catch {}
  const session = await readSession();
  if (!session.user)
    return {
      configured,
      connected: false,
      signedIn: false,
      ...(session.unavailable
        ? { error: "Your account service is unavailable. Please try again." }
        : {}),
    };
  try {
    const account = await requireAccount();
    return {
      configured,
      connected: Boolean(await findLink(account)),
      signedIn: true,
    };
  } catch (error) {
    return {
      configured,
      connected: false,
      signedIn: true,
      error: failure(error).message,
    };
  }
}
export async function beginCalendarLink(): Promise<CalendarResult<string>> {
  privateResponse();
  try {
    const account = await requireAccount(),
      client = oauthClient();
    const codes = await client.generateCodeVerifierAsync();
    const state = randomBytes(32).toString("hex");
    setCookie(
      oauthCookie,
      sealSecret(
        {
          state,
          userId: account.user.id,
          verifier: codes.codeVerifier,
          created: Date.now(),
        },
        "google-calendar-oauth",
      ),
      { ...cookieOptions(), maxAge: 600 },
    );
    return {
      ok: true,
      data: client.generateAuthUrl({
        access_type: "offline",
        scope: calendarScopes,
        prompt: "consent",
        include_granted_scopes: true,
        state,
        code_challenge: codes.codeChallenge,
        code_challenge_method: CodeChallengeMethod.S256,
      }),
    };
  } catch (error) {
    return failure(error);
  }
}
export async function finishCalendarLink(request: Request): Promise<Response> {
  privateResponse();
  setResponseHeader("Referrer-Policy", "no-referrer");
  const url = new URL(request.url),
    cookie = getCookie(oauthCookie);
  deleteCookie(oauthCookie, cookieOptions());
  const back = (connection: string) =>
    new Response(null, {
      status: 303,
      headers: {
        Location: `/calendar?connection=${connection}`,
        "Cache-Control": "no-store",
        "Referrer-Policy": "no-referrer",
      },
    });
  if (!cookie) return back("expired");
  try {
    const pending = pendingSchema.parse(
      openSecret(cookie, "google-calendar-oauth"),
    );
    const state = url.searchParams.get("state") || "";
    if (
      state.length !== pending.state.length ||
      !timingSafeEqual(Buffer.from(state), Buffer.from(pending.state)) ||
      Date.now() - pending.created > 600000 ||
      pending.created > Date.now()
    )
      return back("expired");
    const account = await requireAccount();
    if (account.user.id !== pending.userId) return back("expired");
    if (url.searchParams.has("error"))
      return back(
        url.searchParams.get("error") === "access_denied"
          ? "cancelled"
          : "failed",
      );
    const code = url.searchParams.get("code");
    if (!code || code.length > 4096) return back("failed");
    const client = oauthClient(),
      { tokens } = await client.getToken({
        code,
        codeVerifier: pending.verifier,
      });
    const granted =
      tokens.scope?.split(" ") ||
      (tokens.access_token
        ? (await client.getTokenInfo(tokens.access_token)).scopes
        : []);
    if (
      !calendarScopes.every(
        (scope) =>
          granted.includes(scope) ||
          granted.includes(
            "https://www.googleapis.com/auth/calendar.readonly",
          ) ||
          granted.includes("https://www.googleapis.com/auth/calendar"),
      )
    )
      return back("permissions");
    const link = await findLink(account);
    // A new Google account must never inherit the previous account's refresh token.
    if (!tokens.refresh_token) return back("permissions");
    tokens.scope = granted.join(" ");
    await saveCredentials(account, link, tokens);
    return back("linked");
  } catch {
    return back("failed");
  }
}
async function linkedClient() {
  const account = await requireAccount(),
    link = await findLink(account);
  if (!link)
    throw new CalendarError(
      "Link Google Calendar first to bring in your events.",
      true,
    );
  const client = oauthClient();
  try {
    client.setCredentials(
      credentialsSchema.parse(
        openSecret(link.credentials, `google-calendar:${account.user.id}`),
      ),
    );
  } catch {
    throw new CalendarError(
      "Your saved calendar connection can’t be opened. Reconnect Google Calendar.",
      true,
    );
  }
  await client.getAccessToken();
  return { account, link, client };
}
type Linked = Awaited<ReturnType<typeof linkedClient>>;
const googleListSchema = z.object({
  nextPageToken: z.string().optional(),
  items: z
    .array(
      z.object({
        id: z.string(),
        summary: z.string().optional(),
        summaryOverride: z.string().optional(),
        primary: z.boolean().optional(),
        timeZone: z.string().optional(),
        accessRole: z.string().optional(),
        deleted: z.boolean().optional(),
      }),
    )
    .default([]),
});
async function calendarChoices(linked: Linked): Promise<CalendarChoice[]> {
  const calendars: CalendarChoice[] = [];
  let pageToken: string | undefined;
  for (let page = 0; page < 20; page++) {
    const { data } = await linked.client.request({
      url: "https://www.googleapis.com/calendar/v3/users/me/calendarList",
      params: {
        maxResults: 250,
        pageToken,
        fields:
          "items(id,summary,summaryOverride,primary,timeZone,accessRole,deleted),nextPageToken",
      },
      timeout: 12000,
      retry: false,
    });
    const list = googleListSchema.parse(data);
    calendars.push(
      ...list.items
        .filter((item) => !item.deleted && item.accessRole !== "freeBusyReader")
        .map((item) => ({
          id: item.id,
          name: item.summaryOverride || item.summary || "Untitled calendar",
          primary: item.primary || false,
          timeZone: item.timeZone || "UTC",
        })),
    );
    pageToken = list.nextPageToken;
    if (!pageToken) return calendars;
  }
  throw new CalendarError(
    "There are too many calendars to list. Please reduce the calendars subscribed to this account.",
  );
}
export async function listGoogleCalendars(): Promise<
  CalendarResult<CalendarChoice[]>
> {
  privateResponse();
  try {
    const linked = await linkedClient();
    const data = await calendarChoices(linked);
    await saveCredentials(
      linked.account,
      linked.link,
      linked.client.credentials,
    );
    return { ok: true, data };
  } catch (error) {
    return failure(error);
  }
}
const googleEventSchema = z.object({
  id: z.string(),
  summary: z.string().optional(),
  location: z.string().optional(),
  status: z.string().optional(),
  start: z
    .object({
      date: z.string().optional(),
      dateTime: z.string().optional(),
      timeZone: z.string().optional(),
    })
    .optional(),
  end: z
    .object({
      date: z.string().optional(),
      dateTime: z.string().optional(),
      timeZone: z.string().optional(),
    })
    .optional(),
  attendees: z
    .array(
      z.object({
        self: z.boolean().optional(),
        responseStatus: z.string().optional(),
      }),
    )
    .optional(),
});
export function normaliseGoogleEvent(
  raw: unknown,
  calendar: CalendarChoice,
): CalendarEvent | null {
  const event = googleEventSchema.parse(raw);
  if (
    event.status === "cancelled" ||
    event.attendees?.some(
      (attendee) => attendee.self && attendee.responseStatus === "declined",
    )
  )
    return null;
  if (!event.start || !event.end)
    throw new CalendarError(
      "Google returned an event without dates. Please try again.",
    );
  const allDay = Boolean(event.start.date);
  const parseTime = (boundary: NonNullable<typeof event.start>) => {
    if (!boundary.dateTime)
      throw new CalendarError("Google returned an event without a time.");
    try {
      return Temporal.Instant.from(boundary.dateTime).toString();
    } catch {
      return Temporal.PlainDateTime.from(boundary.dateTime)
        .toZonedDateTime(boundary.timeZone || calendar.timeZone)
        .toInstant()
        .toString();
    }
  };
  const start = allDay
    ? Temporal.PlainDate.from(event.start.date!).toString()
    : parseTime(event.start);
  const end = allDay
    ? Temporal.PlainDate.from(event.end.date!).toString()
    : parseTime(event.end);
  if (
    allDay
      ? end <= start
      : Temporal.Instant.compare(
          Temporal.Instant.from(end),
          Temporal.Instant.from(start),
        ) <= 0
  )
    throw new CalendarError(
      "Google returned an event with an invalid date range.",
    );
  return {
    id: `${calendar.id}:${event.id}`,
    calendarId: calendar.id,
    calendarName: calendar.name.slice(0, 200),
    title: (event.summary || "Untitled event").slice(0, 2000),
    location: (event.location || "").slice(0, 2000),
    allDay,
    start,
    end,
  };
}
export async function fetchGoogleWeek(
  input: WeekRequest,
): Promise<CalendarResult<CalendarEvent[]>> {
  privateResponse();
  try {
    const linked = await linkedClient(),
      choices = await calendarChoices(linked);
    const selected = input.calendarIds.map((id) =>
      choices.find((choice) => choice.id === id),
    );
    if (selected.some((calendar) => !calendar))
      throw new CalendarError(
        "A selected calendar is no longer available. Refresh the calendar list.",
      );
    const bounds = weekBounds(mondayOf(input.week), input.timeZone),
      events: CalendarEvent[] = [];
    for (const calendar of selected as CalendarChoice[]) {
      let pageToken: string | undefined;
      for (let page = 0; page < 20; page++) {
        const { data } = await linked.client.request({
          url: `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendar.id)}/events`,
          params: {
            timeMin: bounds.start,
            timeMax: bounds.end,
            timeZone: input.timeZone,
            singleEvents: true,
            showDeleted: false,
            orderBy: "startTime",
            maxResults: 250,
            pageToken,
            fields:
              "items(id,summary,location,status,start,end,attendees(self,responseStatus)),nextPageToken",
          },
          timeout: 12000,
          retry: false,
        });
        const list = z
          .object({
            items: z.array(z.unknown()).default([]),
            nextPageToken: z.string().optional(),
          })
          .parse(data);
        for (const raw of list.items) {
          const event = normaliseGoogleEvent(raw, calendar);
          if (event) events.push(event);
        }
        if (events.length > 500)
          throw new CalendarError(
            "That week has more than 500 events. Choose fewer calendars to create a manageable spread.",
          );
        pageToken = list.nextPageToken;
        if (!pageToken) break;
        if (page === 19)
          throw new CalendarError(
            "That calendar returned too many pages of events. Choose fewer calendars.",
          );
      }
    }
    await saveCredentials(
      linked.account,
      linked.link,
      linked.client.credentials,
    );
    return {
      ok: true,
      data: events.sort(
        (a, b) => a.start.localeCompare(b.start) || a.id.localeCompare(b.id),
      ),
    };
  } catch (error) {
    return failure(error);
  }
}
export async function unlinkGoogleCalendar(): Promise<
  CalendarResult<{ revoked: boolean }>
> {
  privateResponse();
  try {
    const account = await requireAccount(),
      link = await findLink(account);
    if (!link) return { ok: true, data: { revoked: true } };
    let revoked = false;
    try {
      const credentials = credentialsSchema.parse(
        openSecret(link.credentials, `google-calendar:${account.user.id}`),
      );
      const token = credentials.refresh_token || credentials.access_token;
      if (token) {
        const response = await fetch("https://oauth2.googleapis.com/revoke", {
          method: "POST",
          headers: { "Content-Type": "application/x-www-form-urlencoded" },
          body: new URLSearchParams({ token }),
          signal: AbortSignal.timeout(10000),
        });
        revoked = response.ok || response.status === 400;
      }
    } catch {}
    await account.pb.collection("google_calendar_links").delete(link.id);
    return { ok: true, data: { revoked } };
  } catch (error) {
    return failure(error);
  }
}
