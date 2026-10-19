# Development

[Back to README](../README.md)

## PocketBase

The repository pins PocketBase 0.40.4. `npm run pocketbase:setup` downloads the
official macOS/Linux arm64/amd64 binary, verifies its SHA-256 checksum, and installs
it under `.pocketbase/bin`. The setup script requires `curl` and `unzip`. On other
platforms, install the official binary and set `POCKETBASE_BINARY` to its path.

`npm run pocketbase:dev` binds to `127.0.0.1:8090`, uses `.pocketbase/data`, and
applies migrations from `pocketbase/pb_migrations`. The app needs the `users` auth
collection and, for Calendar linking, `google_calendar_links`.

If you previously ran the binary directly, it may have created a different
database under `.pocketbase/bin/pb_data`. To use that database with the launcher,
stop the existing PocketBase process yourself, then run:

```sh
POCKETBASE_DATA_DIR=.pocketbase/bin/pb_data npm run pocketbase:dev
```

Keep the same data directory on later starts. If applying migrations manually to
a running database, restart PocketBase so it reloads the collection schema.

The administrator dashboard is at [127.0.0.1:8090/_/](http://127.0.0.1:8090/_/).
An administrator is not required for application sign-up. If you need one, use
PocketBase's `superuser create` command with `--dir=.pocketbase/data` (or your
selected data directory). The launcher suppresses the initial administrator setup
link in logs. Keep administrator credentials separate from app accounts; the
application does not use them.

See [PocketBase documentation](https://pocketbase.io/docs/) for administration.

## Accounts and data

Accounts provide identity, a private uploaded font/sticker library and an optional Google Calendar connection. Documents
and images remain in a shared browser collection, accessible to anyone using that
profile. Sign-out does not remove local documents. Cloud document sync, email
verification and password-reset email flows are not included.

Each server request uses its own PocketBase SDK/auth store. Session cookies are
HttpOnly and SameSite=Lax, with Secure enabled in production. Server-side session
reads verify the token; account responses are private and uncached. Validated
server functions and same-origin POST checks handle mutations. Backend outages
preserve the session cookie and expose retry states.

## Architecture

| Path                       | Responsibility                                                      |
| -------------------------- | ------------------------------------------------------------------- |
| `src/routes`               | File-based TanStack Router routes and full-document root shell.     |
| `src/components/paper`     | Library, editor, calendar studio and shared artwork.                |
| `src/data`                 | Versioned document schema, templates, IndexedDB and print geometry. |
| `src/editor`               | Tiptap, Markdown parsing, CodeMirror and pagination.                |
| `src/auth`                 | PocketBase sessions and account server functions.                   |
| `src/calendar`             | Google OAuth, read-only Calendar access and token encryption.       |
| `src/weather`              | Validated city/weather requests and server-side provider access.    |
| `pocketbase/pb_migrations` | Account and calendar-link collection migrations.                    |

The root route renders the complete HTML document and hydration assets. `/`
server-renders the library shell and public template metadata; local documents
load after hydration. `/sign-in` and `/sign-up` are server-rendered account pages.

`/documents/$documentId`, `/print/$documentId` and `/calendar` use browser-only
rendering. Document/print loaders read IndexedDB on entry and validate their
search settings. Missing records show a recovery screen.

Public metadata, authentication, Google API access, encryption and weather fetches
use typed server functions with Zod validation and explicit server-only modules.
Browser measurement lives behind client-only boundaries. `/api/google-calendar/callback`
handles OAuth redirects; `/api/health` supplies a JSON health check.

Document versions, rich-text nodes, geometry and backups are validated. Markdown
source remains authoritative; cached flow is regenerated on load/import.
Pagination uses measured CSS columns without rewriting the source editor state.
Canvas and print share artwork and physical geometry.

## Checks

```sh
npm test
npm run typecheck
npm run build
```

Tests cover document/schema compatibility, templates, editor commands and
checklists, storage/backups, calendar dates and time zones, weather, account/OAuth
logic, sticker artwork and print layout. Remote services are mocked in unit tests.
Run the suite for current results; historical test counts are not maintained here.

A separate production HTTP authentication check is available:

```sh
npm run build
npm run test:auth
```

It needs the installed PocketBase binary and permission to bind local ports 8091
and 3001. It starts temporary servers with synthetic accounts and a disposable
database, checks authentication/security boundaries, then cleans up. It is not
part of `npm test`; run it separately rather than assuming unit tests establish
integration success.

Manual acceptance checks include:

- Long typing/paste, native IME composition, Undo/Redo, manual breaks and reflow
  after font, dimension or margin changes.
- Keyboard-only document creation, checklist completion, sticker insertion and
  object positioning; verify focus and overflow feedback.
- Reload, backup round trips and preservation of decorated pages.
- A real Google consent flow, including the configured callback and permissions.
- [PDF and physical printer calibration](printing.md#calibration-and-manual-checks),
  performed by the user without automatically opening print dialogs or jobs.

## Node deployment

`npm run build` produces `.output/server/index.mjs` and bundled public assets.
Deploy the complete `.output` directory, provide runtime variables from
[.env.example](../.env.example), and run `node .output/server/index.mjs`. Set
`HOST` and `PORT` as needed. From the repository, `npm start` runs the same entry
point; it does not start PocketBase or load a development `.env` for you.

Run PocketBase as a separate persistent service with the committed migrations.
Keep its data and the stable calendar token key backed up. Use HTTPS in production
and configure proxy trust/rate limits for the host. IndexedDB remains tied to the
browser and public origin.

The runtime target is Nitro's `node-server` preset in
[vite.config.ts](../vite.config.ts). The [Dockerfile](../Dockerfile) uses Node 24;
[Coolify Compose](coolify.md) packages the same application model with a private
PocketBase service.
