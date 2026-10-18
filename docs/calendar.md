# Calendar spreads

[Back to README](../README.md)

The Calendar studio turns a selected week into an editable two-page A5 snapshot.
Guests can try fictional sample events or create a blank week. Linking Google
Calendar requires a Paper & Petal account.

## Google OAuth setup

1. Enable the Google Calendar API in your Google Cloud project.
2. Create or select a **Web application** OAuth client.
3. Register this exact development redirect URI:

   ```text
   http://localhost:3000/api/google-calendar/callback
   ```

4. Configure the server variables in `.env`:

   ```dotenv
   APP_URL=http://localhost:3000
   GOOGLE_CLIENT_ID=<web-application-client-id>
   GOOGLE_CLIENT_SECRET=<matching-client-secret>
   GOOGLE_CALENDAR_TOKEN_KEY=<64-hexadecimal-characters>
   ```

5. For a new installation, generate a token-encryption key:

   ```sh
   node -e 'console.log(require("node:crypto").randomBytes(32).toString("hex"))'
   ```

6. Start PocketBase through `npm run pocketbase:dev` to apply the committed
   migrations, then restart the app after changing its environment. If the OAuth
   consent app is in testing, add the intended Google account as a test user.

Keep the token key stable and back it up separately from PocketBase. Losing or
changing it requires reconnecting calendars. The aliases `GOOGLE_OAUTH_CLIENT_ID`
and `GOOGLE_OAUTH_CLIENT_SECRET` are also supported. Secrets must stay in the
server environment, without `VITE_` prefixes.

In production, set `APP_URL` to the public HTTPS origin and register its exact
`/api/google-calendar/callback` URL. Follow Google's
[web server OAuth guide](https://developers.google.com/identity/protocols/oauth2/web-server)
for consent and verification requirements, or the [Coolify guide](coolify.md) for
this repository's container deployment.

## Link and create a spread

1. Sign in and open **Calendar spreads** from the library.
2. Open **Calendars & style → Link Google Calendar** and complete Google's consent.
3. Select calendars, a week and its IANA time zone, then choose **Preview my calendar**.
4. Adjust the layout and choose **Create this spread**.

Calendars start selected; **Select all** restores the selection. Preview supports
up to 10 selected calendars and 500 events in a week. Access is read-only:
`calendar.events.readonly` and `calendar.calendarlist.readonly`. The app does not
create or modify Google events.

The saved document is a local snapshot and does not keep syncing with Google.
Text and artwork remain editable; structural grid rules start locked. Disconnecting
Google does not remove saved snapshots.

## Weekly layout

- Monday–Wednesday appear on the left page; Thursday–Sunday on the right.
- Every day column prints at 31.75 mm (1.25 inches). The spare left column holds
  a mini month and notes, using the selected palette.
- Dates and hours sit inside the columns. Hour numbers are centered vertically
  in their ruled row. The first event title line sits 0.5 mm above the row's
  lower rule. Wrapped lines continue below with the chosen spacing, even across
  grid rules. Titles only
  shorten before the next event in their lane or the page edge. Duration arrows
  appear when at least two ruled rows remain after the title and end padding.
- The timeline focuses on event hours by default, with an all-24-hours option.
  Displayed event boundaries round to the nearest half hour; original Google
  times stay intact in event details and the optional event key.
- Overlapping events use lanes; overnight events split across days. All-day
  entries have their own band. Recurring events expand, while cancelled and
  self-declined invitations are omitted.

**Calendars & style** controls font, font size, text alignment, arrow position,
end padding and palette. **Use AM/PM time** switches 12/24-hour display; timeline
numbers omit AM/PM suffixes and leading zeros. Explicit event and sunset times
use the selected format.

The optional event key preserves full titles, original times and locations when
labels need shortening. Turn it off for exactly two pages. **Use “Busy” instead
of event titles** keeps private titles, calendar names and locations out of the
saved snapshot.

For [Letter sticker printing](printing.md#letter-sticker-sheets), this layout fits
at actual size with a printer inset of 5.5 mm or less. The default 6 mm inset
reports about 0.5 mm excess width. Reduce it only if your printer supports that
printable area; columns are never automatically shrunk.

The layout is inspired by the
[Hobonichi Cousin](https://www.1101.com/store/techo/en/2026/all_about/cousin/),
without affiliation.

## Weather

Choose a city and temperature unit in **Weather estimates**. These settings are
shared with editor headers. Clearing the city removes calendar weather.

The opening weather band has two rows:

| Row    | Contents                                                                                                 |
| ------ | -------------------------------------------------------------------------------------------------------- |
| Top    | Two mini columns: daytime icon and temperature on the left, nighttime icon and temperature on the right. |
| Bottom | Sunset icon and local sunset time in the selected 12/24-hour format.                                     |

Daytime shows the high during daylight; nighttime shows the low during nighttime
hours, including pre-dawn hours of that calendar date. Hourly `is_day` flags
separate the periods in the calendar time zone. Each condition icon represents
the most severe weather in its period; clear/partly cloudy nights use moon icons.
Unavailable periods and sunset times show `—`.

The weather band uses the unused opening hour in the focused view. A separate
band preserves early appointments and the full-day timeline when needed. Weather
is saved as editable text/vector artwork and remains available offline.

[Open-Meteo](https://open-meteo.com/en/docs) supplies model estimates, with up to
16 forecast days and 92 recent archived days. Partial weeks retain available
values. Requests have an eight-second timeout and a ten-minute server cache.
Failures offer Retry or creation without weather.

The default endpoints require no key and are intended for non-commercial use
under [Open-Meteo's terms](https://open-meteo.com/en/terms). Commercial deployments
can supply the server-only `OPEN_METEO_API_KEY` to use customer endpoints.

## Troubleshooting

| Symptom                                    | Check                                                                                                                                |
| ------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------ |
| `redirect_uri_mismatch`                    | The OAuth client must be a Web application, with an authorized callback matching `APP_URL` exactly, including scheme, host and port. |
| Missing `google_calendar_links` collection | Run the repository launcher against the active PocketBase data directory. See [PocketBase setup](development.md#pocketbase).         |
| Google rejects an account                  | Check the consent app's test-user list and that the Calendar API is enabled.                                                         |
| Existing calendar tokens cannot be read    | Restore the original token-encryption key or reconnect Google.                                                                       |
| Weather still shows an older layout/value  | Reload the preview. Existing documents retain their saved snapshot; create a new spread to use template changes.                     |

Linking errors display Google's returned code and description when available.
Tokens, secrets and request dumps are not shown. Refresh/access tokens stay in
server-only modules and are encrypted in PocketBase with account-bound ownership.
The app never needs PocketBase superuser credentials.
