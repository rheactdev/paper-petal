import { Link, useNavigate } from "@tanstack/react-router";
import { createClientOnlyFn } from "@tanstack/react-start";
import { useEffect, useMemo, useRef, useState } from "react";
import { Temporal } from "@js-temporal/polyfill";
import {
  ArrowLeft,
  ArrowRight,
  CalendarDays,
  Check,
  ChevronLeft,
  ChevronRight,
  SlidersHorizontal,
  Link2,
  RefreshCw,
  Unlink,
  X,
} from "lucide-react";
import { Brand } from "./library";
import { AccountControls } from "./account";
import { ObjectArtwork } from "./art";
import { useAuth } from "../../auth/provider";
import {
  connectGoogleCalendar,
  disconnectGoogleCalendar,
  getGoogleCalendars,
  getGoogleWeek,
} from "../../calendar/functions";
import {
  calendarSearch,
  timeZoneSchema,
  type CalendarChoice,
  type CalendarEvent,
  type CalendarStatus,
} from "../../calendar/model";
import {
  currentWeek,
  mondayOf,
  newWeeklyDocument,
  sampleWeek,
  weeklyThemes,
  weeklyStyleSchema,
  type WeeklyStyle,
  type WeeklyTheme,
} from "../../data/weekly";
import { MM, objectStyle, type PaperDocument } from "../../data/model";
import {
  paperFonts,
  type MeasurePaperText,
  type PaperFont,
} from "../../data/fonts";
import { saveDocument } from "../../data/storage";
import { withEditorMode } from "../../editor/markdown";
import type { EditorMode } from "../../data/model";
import { EditorChoice } from "./editor-choice";
import type { z } from "zod";

const loadPaperFont = createClientOnlyFn(async (font: PaperFont) => {
  const { measurePaperFont } = await import("../../editor/fonts.client");
  return measurePaperFont(font);
});

function WeeklyPreview({
  document,
  sizing,
}: {
  document: PaperDocument;
  sizing: "spread" | "width" | "actual";
}) {
  const container = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(0.7),
    [keyPage, setKeyPage] = useState(2);
  useEffect(() => {
    if (!container.current) return;
    const observer = new ResizeObserver(([entry]) =>
      setScale(
        sizing === "actual"
          ? 1
          : Math.max(
              0.1,
              Math.min(
                entry.contentRect.width / (document.paper.width * MM * 2 + 18),
                sizing === "spread"
                  ? entry.contentRect.height / (document.paper.height * MM)
                  : Infinity,
              ),
            ),
      ),
    );
    observer.observe(container.current);
    return () => observer.disconnect();
  }, [document.paper.width, document.paper.height, sizing]);
  const page = (index: number) => (
    <div
      className="weekly-preview-page"
      key={index}
      style={{
        width: document.paper.width * MM * scale,
        height: document.paper.height * MM * scale,
      }}
    >
      <div
        className="weekly-preview-paper"
        aria-hidden="true"
        style={{
          width: document.paper.width * MM,
          height: document.paper.height * MM,
          background: document.paper.background,
          transform: `scale(${scale})`,
        }}
      >
        {document.pages[index].objects.map((object) => (
          <div
            key={object.id}
            className="paper-object preview-object"
            style={objectStyle(object)}
          >
            <ObjectArtwork object={object} assets={{}} />
          </div>
        ))}
      </div>
    </div>
  );
  return (
    <div className="weekly-preview-container">
      <div
        ref={container}
        className={`weekly-preview-viewport weekly-sizing-${sizing}`}
        tabIndex={0}
        role="region"
        aria-label="Scrollable weekly spread preview"
      >
        <div
          className="weekly-preview-pair"
          role="img"
          aria-label={`Two A5 pages with seven day columns, appointment titles and downward duration arrows with a small gap above the end-time line. ${document.pages.length - 2} event-key pages.`}
          style={{ gap: 18 * scale }}
        >
          {[0, 1].map(page)}
        </div>
      </div>
      {document.pages.length > 2 && (
        <details className="weekly-key-preview">
          <summary>
            View the editable event key · {document.pages.length - 2}{" "}
            {document.pages.length === 3 ? "page" : "pages"}
          </summary>
          <label>
            Event-key page
            <select
              aria-label="Event-key preview page"
              value={Math.min(keyPage, document.pages.length - 1)}
              onChange={(event) => setKeyPage(Number(event.target.value))}
            >
              {document.pages.slice(2).map((_, index) => (
                <option key={index} value={index + 2}>
                  {index + 1}
                </option>
              ))}
            </select>
          </label>
          {page(Math.min(keyPage, document.pages.length - 1))}
        </details>
      )}
    </div>
  );
}
const feedback = {
  linked:
    "Google Calendar is linked. Choose your calendars to bring this week to paper.",
  cancelled:
    "Calendar linking was cancelled. You can try again whenever you’re ready.",
  failed:
    "We couldn’t finish linking Google Calendar. Check the setup and try again.",
  expired:
    "That calendar link expired or your account changed. Start linking again.",
  permissions:
    "Google didn’t provide both read-only permissions and offline access. Reconnect and allow the calendar permissions.",
};
export function CalendarStudio({
  initialStatus,
  search,
}: {
  initialStatus: CalendarStatus;
  search: z.infer<typeof calendarSearch>;
}) {
  const { session } = useAuth(),
    navigate = useNavigate();
  const [status, setStatus] = useState(initialStatus);
  const [creating, setCreating] = useState<boolean | null>(null);
  const [timeZone, setTimeZone] = useState(
    Intl.DateTimeFormat().resolvedOptions().timeZone,
  );
  const [week, setWeek] = useState(mondayOf(search.week || currentWeek()));
  const [theme, setTheme] = useState<WeeklyTheme>("botanical");
  const [font, setFont] = useState<PaperFont>("DM Sans");
  const [style, setStyle] = useState<WeeklyStyle>(() =>
    weeklyStyleSchema.parse({}),
  );
  const [fontSizeInput, setFontSizeInput] = useState("8.5"),
    [arrowPaddingInput, setArrowPaddingInput] = useState("1");
  const numericValue = (input: string) =>
    input.trim() === "" ? NaN : Number(input);
  const styleInput = weeklyStyleSchema.safeParse({
    ...style,
    fontSize: numericValue(fontSizeInput),
    arrowPadding: numericValue(arrowPaddingInput),
  });
  function updateStyleNumber(
    field: "fontSize" | "arrowPadding",
    value: string,
  ) {
    if (field === "fontSize") setFontSizeInput(value);
    else setArrowPaddingInput(value);
    const result = weeklyStyleSchema.shape[field].safeParse(
      numericValue(value),
    );
    if (result.success)
      setStyle((previous) => ({ ...previous, [field]: result.data }));
  }
  const [loadedFont, setLoadedFont] = useState<{
    font: PaperFont;
    measureText: MeasurePaperText;
  }>();
  const [fontError, setFontError] = useState("");
  useEffect(() => {
    let active = true;
    setFontError("");
    loadPaperFont(font)
      .then((measureText) => {
        if (active) setLoadedFont({ font, measureText });
      })
      .catch(() => {
        if (active)
          setFontError(
            "This font couldn’t be loaded. Choose another font or reload to try again.",
          );
      });
    return () => {
      active = false;
    };
  }, [font]);
  const fontReady = loadedFont?.font === font;
  const [privateTitles, setPrivateTitles] = useState(false),
    [locations, setLocations] = useState(false),
    [eventKey, setEventKey] = useState(true);
  const [hours, setHours] = useState<"events" | "full">("events"),
    [settingsOpen, setSettingsOpen] = useState(false),
    [sizing, setSizing] = useState<"spread" | "width" | "actual">("width");
  const [choices, setChoices] = useState<CalendarChoice[]>([]),
    [selected, setSelected] = useState<string[]>([]);
  const [events, setEvents] = useState<CalendarEvent[]>([]),
    [source, setSource] = useState<"sample" | "blank" | "google">("sample");
  const [busy, setBusy] = useState(""),
    [error, setError] = useState(""),
    [message, setMessage] = useState(
      search.connection ? feedback[search.connection] : "",
    ),
    [reconnect, setReconnect] = useState(false),
    [confirmUnlink, setConfirmUnlink] = useState(false);
  const requestRevision = useRef(0),
    identity = session.user?.id;
  const selectionKey = selected.join("\n");
  useEffect(() => {
    setStatus(initialStatus);
  }, [initialStatus]);
  useEffect(() => {
    requestRevision.current++;
    setChoices([]);
    setSelected([]);
    setEvents([]);
    setSource("sample");
    setReconnect(false);
  }, [identity]);
  useEffect(() => {
    if (!identity || !status.connected || !status.configured) return;
    let active = true;
    setBusy("calendars");
    getGoogleCalendars()
      .then((result) => {
        if (!active) return;
        if (result.ok) {
          setChoices(result.data);
          setSelected(result.data.map((choice) => choice.id));
        } else {
          setError(result.message);
          setReconnect(Boolean(result.reconnect));
        }
      })
      .catch(() => {
        if (active)
          setError("Your calendar list couldn’t be loaded. Please try again.");
      })
      .finally(() => {
        if (active) setBusy("");
      });
    return () => {
      active = false;
    };
  }, [identity, status.connected, status.configured]);
  useEffect(() => {
    requestRevision.current++;
    setEvents([]);
    setSource((previous) => (previous === "google" ? "blank" : previous));
    setBusy((previous) => (previous === "events" ? "" : previous));
  }, [week, timeZone, selectionKey]);
  const validZone = timeZoneSchema.safeParse(timeZone).success;
  const shownEvents =
    source === "sample" && validZone ? sampleWeek(week, timeZone) : events;
  const preview = useMemo(() => {
    const options = {
      week,
      timeZone: validZone ? timeZone : "UTC",
      theme,
      privateTitles,
      locations,
      eventKey,
      hours,
      ...style,
      font: loadedFont?.font,
      measureText: loadedFont?.measureText,
    };
    try {
      return {
        result: newWeeklyDocument(validZone ? shownEvents : [], options),
        error: "",
      };
    } catch (error) {
      return {
        result: newWeeklyDocument([], { ...options, eventKey: false }),
        error:
          error instanceof Error
            ? error.message
            : "This week couldn’t be laid out. Choose fewer calendars and try again.",
      };
    }
  }, [
    week,
    timeZone,
    theme,
    privateTitles,
    locations,
    eventKey,
    hours,
    source,
    events,
    loadedFont,
    style,
  ]);
  const result = preview.result;
  async function linkCalendar() {
    setBusy("linking");
    setError("");
    try {
      const response = await connectGoogleCalendar();
      if (response.ok) window.location.assign(response.data);
      else setError(response.message);
    } catch {
      setError(
        "Google Calendar linking couldn’t be started. Please try again.",
      );
    } finally {
      setBusy("");
    }
  }
  async function loadWeek() {
    if (!validZone) {
      setError("Choose a valid IANA time zone, such as America/New_York.");
      return;
    }
    const revision = ++requestRevision.current;
    setBusy("events");
    setError("");
    setMessage("");
    try {
      const response = await getGoogleWeek({
        data: { week, timeZone, calendarIds: selected },
      });
      if (revision !== requestRevision.current) return;
      if (response.ok) {
        setEvents(response.data);
        setSource("google");
        setReconnect(false);
        setMessage(
          response.data.length
            ? "Your calendar is ready. This spread is an editable snapshot."
            : "No events this week. There’s a little more room for you.",
        );
      } else {
        setError(response.message);
        setReconnect(Boolean(response.reconnect));
      }
    } catch {
      if (revision === requestRevision.current)
        setError("Your week couldn’t be loaded. Please try again.");
    } finally {
      if (revision === requestRevision.current) setBusy("");
    }
  }
  async function unlink() {
    setBusy("unlinking");
    setError("");
    try {
      const response = await disconnectGoogleCalendar();
      if (!response.ok) {
        setError(response.message);
        return;
      }
      setStatus((previous) => ({ ...previous, connected: false }));
      setChoices([]);
      setSelected([]);
      setEvents([]);
      setSource("sample");
      setConfirmUnlink(false);
      setMessage(
        response.data.revoked
          ? "Google Calendar is disconnected. Your saved spreads stay on this device."
          : "The link was removed here. Google couldn’t confirm revocation; remove Paper & Petal in your Google Account permissions too.",
      );
    } catch {
      setError("The calendar link couldn’t be removed. Please try again.");
    } finally {
      setBusy("");
    }
  }
  async function create(blank = false, mode?: EditorMode) {
    if (!fontReady || !styleInput.success) return;
    if (!mode) {
      setCreating(blank);
      return;
    }
    setBusy("saving");
    setError("");
    try {
      const document = blank
        ? newWeeklyDocument([], {
            week,
            timeZone: validZone ? timeZone : "UTC",
            theme,
            privateTitles,
            locations,
            eventKey,
            hours,
            ...style,
            font,
            measureText: loadedFont.measureText,
          }).document
        : result.document;
      const chosen = withEditorMode(document, mode);
      await saveDocument(chosen);
      await navigate({
        to: "/documents/$documentId",
        params: { documentId: chosen.id },
        search: { page: 1, view: "spread", zoom: 0.65 },
      });
    } catch {
      setError(
        "This spread couldn’t be saved. Check browser storage and try again.",
      );
    } finally {
      setBusy("");
    }
  }
  return (
    <div className="calendar-studio">
      {creating !== null && (
        <EditorChoice
          busy={Boolean(busy)}
          onClose={() => {
            if (!busy) setCreating(null);
          }}
          onChoose={(mode) => void create(creating, mode)}
        />
      )}
      <header className="library-header calendar-studio-header">
        <Brand />
        <Link to="/" className="back-library">
          <ArrowLeft size={15} /> Your studio
        </Link>
        <div className="library-account-area">
          <AccountControls />
        </div>
      </header>
      <main className="calendar-studio-main">
        <div className="weekly-toolbar">
          <h1>
            <CalendarDays size={18} /> Weekly calendar
          </h1>
          <div className="weekly-date-controls">
            <button
              aria-label="Previous week"
              onClick={() =>
                setWeek(
                  Temporal.PlainDate.from(week)
                    .subtract({ days: 7 })
                    .toString(),
                )
              }
            >
              <ChevronLeft size={16} />
            </button>
            <input
              type="date"
              value={week}
              aria-label="Week containing"
              onChange={(event) => {
                if (event.target.value) setWeek(mondayOf(event.target.value));
              }}
            />
            <button
              aria-label="Next week"
              onClick={() =>
                setWeek(
                  Temporal.PlainDate.from(week).add({ days: 7 }).toString(),
                )
              }
            >
              <ChevronRight size={16} />
            </button>
          </div>
          <button
            className="button secondary"
            aria-expanded={settingsOpen}
            aria-controls="weekly-settings"
            onClick={() => setSettingsOpen(!settingsOpen)}
          >
            <SlidersHorizontal size={15} /> Calendars & style
          </button>
          {identity && status.connected && (
            <button
              className="button secondary"
              onClick={loadWeek}
              disabled={
                Boolean(busy) ||
                !selected.length ||
                selected.length > 10 ||
                !validZone
              }
            >
              <RefreshCw size={14} />
              {busy === "events" ? "Reading your week…" : "Preview my calendar"}
            </button>
          )}
          <button
            className="button primary weekly-create"
            disabled={
              Boolean(busy) ||
              !validZone ||
              Boolean(preview.error) ||
              !fontReady ||
              !styleInput.success
            }
            onClick={() => create()}
          >
            {busy === "saving"
              ? "Saving…"
              : source === "sample"
                ? "Create sample spread"
                : "Create this spread"}
            <ArrowRight size={15} />
          </button>
        </div>
        {error && (
          <div className="notice error" role="alert">
            {error}
            <button
              aria-label="Dismiss calendar error"
              onClick={() => setError("")}
            >
              <X size={16} />
            </button>
          </div>
        )}
        {message && (
          <div className="weekly-message" role="status">
            <Check size={16} />
            {message}
            <button
              aria-label="Dismiss calendar message"
              onClick={() => setMessage("")}
            >
              <X size={16} />
            </button>
          </div>
        )}
        <div
          className={`weekly-studio-layout ${settingsOpen ? "with-settings" : ""}`}
        >
          <aside
            id="weekly-settings"
            hidden={!settingsOpen}
            className="weekly-controls"
            aria-label="Weekly spread settings"
          >
            <section className="weekly-control-section">
              <div className="weekly-section-title">
                <h2>Your calendar</h2>
                {status.connected && (
                  <span className="calendar-connected">
                    <span /> Linked
                  </span>
                )}
              </div>
              {!identity ? (
                <>
                  <p>
                    Sign in to keep a Google Calendar connection with your
                    account.
                  </p>
                  <Link
                    to="/sign-in"
                    search={{ returnTo: "/calendar" }}
                    className="button secondary weekly-wide"
                  >
                    Sign in to link <ArrowRight size={14} />
                  </Link>
                </>
              ) : status.connected ? (
                <>
                  <div className="calendar-selection-actions">
                    <button
                      type="button"
                      className="button secondary"
                      disabled={Boolean(busy) || !choices.length}
                      onClick={() =>
                        setSelected(choices.map((choice) => choice.id))
                      }
                    >
                      Select all
                    </button>
                    <span aria-live="polite">
                      {selected.length} of {choices.length} selected
                    </span>
                  </div>
                  <fieldset className="calendar-choices">
                    <legend className="sr-only">Calendars to include</legend>
                    {choices.map((choice) => (
                      <label key={choice.id}>
                        <input
                          type="checkbox"
                          checked={selected.includes(choice.id)}
                          disabled={Boolean(busy)}
                          onChange={(event) =>
                            setSelected((previous) =>
                              event.target.checked
                                ? [...previous, choice.id]
                                : previous.filter((id) => id !== choice.id),
                            )
                          }
                        />
                        <span>
                          {choice.name}
                          {choice.primary && <small>Primary calendar</small>}
                        </span>
                      </label>
                    ))}
                    {busy === "calendars" && (
                      <p role="status">Opening your calendars…</p>
                    )}
                  </fieldset>
                  {selected.length > 10 && (
                    <p className="weekly-hint">Choose up to 10 calendars.</p>
                  )}
                  {!confirmUnlink ? (
                    <button
                      className="calendar-disconnect"
                      onClick={() => setConfirmUnlink(true)}
                      disabled={Boolean(busy)}
                    >
                      <Unlink size={13} /> Disconnect calendar
                    </button>
                  ) : (
                    <div className="calendar-unlink-confirm">
                      <p>
                        Disconnect and revoke Google access? Saved spreads will
                        stay here.
                      </p>
                      <button onClick={unlink} disabled={Boolean(busy)}>
                        Disconnect
                      </button>
                      <button
                        onClick={() => setConfirmUnlink(false)}
                        disabled={Boolean(busy)}
                      >
                        Keep linked
                      </button>
                    </div>
                  )}
                </>
              ) : (
                <>
                  <p>
                    Link Google Calendar to turn your plans into a lovely,
                    editable spread.
                  </p>
                  <button
                    className="button secondary weekly-wide"
                    disabled={Boolean(busy) || !status.configured}
                    onClick={linkCalendar}
                  >
                    <span className="google-letter" aria-hidden="true">
                      G
                    </span>
                    {busy === "linking"
                      ? "Opening Google…"
                      : "Link Google Calendar"}
                    <Link2 size={14} />
                  </button>
                </>
              )}
              {reconnect && identity && (
                <button
                  className="calendar-reconnect"
                  onClick={linkCalendar}
                  disabled={Boolean(busy)}
                >
                  Reconnect Google Calendar <ArrowRight size={13} />
                </button>
              )}
              {!status.configured && (
                <details className="calendar-setup">
                  <summary>Google Calendar setup needed</summary>
                  <p>
                    The app owner needs a Google Cloud Web OAuth client, the
                    Calendar API enabled, and server credentials. The callback
                    URL is <code>/api/google-calendar/callback</code>. Setup is
                    documented in the project README.
                  </p>
                  <p>You can try the sample or make a blank week below.</p>
                </details>
              )}
              {status.error && (
                <p className="weekly-hint" role="alert">
                  {status.error}
                </p>
              )}
            </section>
            <section className="weekly-control-section">
              <div className="weekly-section-title">
                <h2>Time & layout</h2>
              </div>
              <label className="weekly-field">
                Timeline
                <select
                  aria-label="Timeline hours"
                  value={hours}
                  onChange={(event) =>
                    setHours(event.target.value as "events" | "full")
                  }
                >
                  <option value="events">Focus on event hours</option>
                  <option value="full">All 24 hours</option>
                </select>
              </label>
              <label className="weekly-field">
                Time zone
                <input
                  value={timeZone}
                  aria-label="Calendar time zone"
                  aria-invalid={!validZone}
                  onChange={(event) => setTimeZone(event.target.value)}
                  list="weekly-time-zones"
                  spellCheck={false}
                />
              </label>
              <datalist id="weekly-time-zones">
                {[
                  ...new Set([
                    Intl.DateTimeFormat().resolvedOptions().timeZone,
                    "UTC",
                    "America/New_York",
                    "America/Los_Angeles",
                    "Europe/London",
                    "Europe/Paris",
                    "Asia/Tokyo",
                    "Australia/Sydney",
                  ]),
                ].map((zone) => (
                  <option key={zone} value={zone} />
                ))}
              </datalist>
              {!validZone && (
                <p className="weekly-hint" role="alert">
                  Enter a valid IANA time zone.
                </p>
              )}
            </section>
            <section className="weekly-control-section">
              <div className="weekly-section-title">
                <h2>Style & details</h2>
              </div>
              <label className="weekly-field">
                Event font
                <select
                  aria-label="Weekly event font"
                  value={font}
                  onChange={(event) => setFont(event.target.value as PaperFont)}
                >
                  {paperFonts.map((name) => (
                    <option key={name}>{name}</option>
                  ))}
                </select>
              </label>
              {fontError ? (
                <p className="weekly-hint" role="alert">
                  {fontError}
                </p>
              ) : (
                !fontReady && (
                  <p className="weekly-hint" role="status">
                    Loading font…
                  </p>
                )
              )}
              <div className="weekly-field-grid">
                <label className="weekly-field">
                  Font size · pt
                  <input
                    type="number"
                    aria-label="Weekly event font size"
                    min={6}
                    max={24}
                    step={0.5}
                    value={fontSizeInput}
                    aria-invalid={
                      !weeklyStyleSchema.shape.fontSize.safeParse(
                        numericValue(fontSizeInput),
                      ).success
                    }
                    onChange={(event) =>
                      updateStyleNumber("fontSize", event.target.value)
                    }
                  />
                </label>
                <label className="weekly-field">
                  Text alignment
                  <select
                    aria-label="Weekly text alignment"
                    value={style.textAlign}
                    onChange={(event) =>
                      setStyle((previous) => ({
                        ...previous,
                        textAlign: event.target
                          .value as WeeklyStyle["textAlign"],
                      }))
                    }
                  >
                    <option value="left">Left</option>
                    <option value="center">Center</option>
                    <option value="right">Right</option>
                  </select>
                </label>
                <label className="weekly-field">
                  Arrow position
                  <select
                    aria-label="Weekly arrow position"
                    value={style.arrowPosition}
                    onChange={(event) =>
                      setStyle((previous) => ({
                        ...previous,
                        arrowPosition: event.target
                          .value as WeeklyStyle["arrowPosition"],
                      }))
                    }
                  >
                    <option value="left">Left</option>
                    <option value="center">Center</option>
                    <option value="right">Right</option>
                  </select>
                </label>
                <label className="weekly-field">
                  Arrow padding · mm
                  <input
                    type="number"
                    aria-label="Weekly arrow padding"
                    aria-describedby="weekly-arrow-padding-help"
                    min={0}
                    max={10}
                    step={0.5}
                    value={arrowPaddingInput}
                    aria-invalid={
                      !weeklyStyleSchema.shape.arrowPadding.safeParse(
                        numericValue(arrowPaddingInput),
                      ).success
                    }
                    onChange={(event) =>
                      updateStyleNumber("arrowPadding", event.target.value)
                    }
                  />
                </label>
              </div>
              <p id="weekly-arrow-padding-help" className="weekly-hint">
                Gap above the end-time line; reduced for very short events.
              </p>
              {!styleInput.success && (
                <p className="weekly-hint" role="alert">
                  Use 6–24 pt for font size and 0–10 mm for arrow padding.
                </p>
              )}
              <label className="weekly-field">
                Palette
                <select
                  aria-label="Weekly spread palette"
                  value={theme}
                  onChange={(event) =>
                    setTheme(event.target.value as WeeklyTheme)
                  }
                >
                  {Object.entries(weeklyThemes).map(([key, value]) => (
                    <option key={key} value={key}>
                      {value.label}
                    </option>
                  ))}
                </select>
              </label>
              <label className="weekly-check">
                <input
                  type="checkbox"
                  checked={privateTitles}
                  onChange={(event) => setPrivateTitles(event.target.checked)}
                />
                <span>Use “Busy” instead of event titles</span>
              </label>
              <label className="weekly-check">
                <input
                  type="checkbox"
                  checked={locations}
                  disabled={privateTitles}
                  onChange={(event) => setLocations(event.target.checked)}
                />
                <span>Include locations in the event key</span>
              </label>
              <label className="weekly-check">
                <input
                  type="checkbox"
                  checked={eventKey}
                  onChange={(event) => setEventKey(event.target.checked)}
                />
                <span>Add an event key when blocks are short or crowded</span>
              </label>
              <p className="weekly-hint">
                Every event and heading is editable afterward.
              </p>
            </section>
            <div className="weekly-alternatives">
              <button
                disabled={Boolean(busy)}
                onClick={() => {
                  requestRevision.current++;
                  setEvents([]);
                  setSource("sample");
                  setMessage("");
                }}
              >
                Try a sample week
              </button>
              <button
                disabled={Boolean(busy) || !fontReady || !styleInput.success}
                onClick={() => create(true)}
              >
                Start a blank week
              </button>
            </div>
            <p className="weekly-local-note">
              Read-only calendar access · Spreads saved on this device
            </p>
          </aside>
          <section
            className="weekly-preview-section"
            aria-labelledby="weekly-preview-title"
          >
            <div className="weekly-preview-top">
              <h2 id="weekly-preview-title" className="sr-only">
                Weekly spread preview
              </h2>
              <p>
                {source === "sample"
                  ? "Sample · fictional events"
                  : source === "google"
                    ? `${result.eventCount} events · Google Calendar`
                    : "Blank week"}
                <span>
                  {" "}
                  · {String(result.hourRange.start).padStart(2, "0")}:00–
                  {String(result.hourRange.end).padStart(2, "0")}:00 · 2 A5
                  pages
                </span>
              </p>
              <label className="weekly-preview-size">
                Preview size
                <select
                  aria-label="Weekly preview size"
                  value={sizing}
                  onChange={(event) =>
                    setSizing(event.target.value as typeof sizing)
                  }
                >
                  <option value="spread">Fit spread</option>
                  <option value="width">Fit width</option>
                  <option value="actual">Actual size</option>
                </select>
              </label>
            </div>
            <WeeklyPreview document={result.document} sizing={sizing} />
            {preview.error && (
              <p className="weekly-key-note" role="alert">
                {preview.error}
              </p>
            )}
            {result.needsKey && (
              <p className="weekly-key-note">
                {eventKey
                  ? `${result.keyPages} editable event-key ${result.keyPages === 1 ? "page is" : "pages are"} included for short appointments, crowded all-day sections and long titles.`
                  : "Short or crowded blocks have compact labels. Turn on the event key to print their complete titles and times."}
              </p>
            )}
            <div className="weekly-events-list">
              <details>
                <summary>
                  {source === "sample"
                    ? "Sample events"
                    : "Events in this preview"}{" "}
                  · {result.eventCount}
                </summary>
                <ul>
                  {shownEvents.map((event) => (
                    <li key={event.id}>
                      <strong>{privateTitles ? "Busy" : event.title}</strong>
                      <span>
                        {event.allDay
                          ? `All day · ${event.start}`
                          : new Intl.DateTimeFormat("en-US", {
                              timeZone: validZone ? timeZone : "UTC",
                              weekday: "short",
                              hour: "numeric",
                              minute: "2-digit",
                            }).format(new Date(event.start))}
                        {!privateTitles && ` · ${event.calendarName}`}
                      </span>
                    </li>
                  ))}
                </ul>
              </details>
            </div>
          </section>
        </div>
      </main>
    </div>
  );
}
