# Paper & Petal

A desktop-first, keyboard-friendly stationery editor for printable journals and
scrapbook spreads. Start with an A5 page or template, add text and artwork, and
bring it to paper at actual size.

## What you can make

- Rich-text documents with continuous typing, nested checklists and pagination.
- Markdown documents with a source editor, live paper preview and Lucide icons.
- Spreads with freely positioned pictures, stickers, text boxes and shapes.
- One- or two-page monthly calendars and Google Calendar weekly spreads.
- A5/custom-size duplex pages or two cropped entries per Letter sticker sheet.

**Documents and their assets stay in this browser's IndexedDB.** Your private
font and sticker library syncs through your account. Signing in does not sync
documents or separate local documents by account. Use downloadable `.petal` backups for
important work and when moving to another browser or domain.

## Quick start

Use Node.js 24 and npm. From the repository root:

```sh
npm ci
npm run pocketbase:setup
npm run pocketbase:dev
```

Leave PocketBase running and open another terminal:

```sh
npm run dev
```

- Application: [localhost:3000](http://localhost:3000)
- PocketBase dashboard: [127.0.0.1:8090/_/](http://127.0.0.1:8090/_/)

The setup script installs checksum-verified PocketBase 0.40.4 for macOS/Linux.
The launcher applies the repository migrations and uses `.pocketbase/data`.
Signing in is optional; PocketBase provides accounts, a private font/sticker library and Google Calendar links.
See [development setup](docs/development.md#pocketbase) for other platforms,
existing databases and administrator setup.

## Configuration

Use [.env.example](.env.example) as a reference when creating a local `.env`.
Preserve existing credentials. Vite loads these values in development; production
requires environment variables supplied by the host.

| Variable                    | Purpose                                                                                  |
| --------------------------- | ---------------------------------------------------------------------------------------- |
| `POCKETBASE_URL`            | Server-side PocketBase address; defaults to `http://127.0.0.1:8090`.                     |
| `APP_URL`                   | Public application origin; defaults to `http://localhost:3000`. Use HTTPS in production. |
| `GOOGLE_CLIENT_ID`          | Google Web application OAuth client ID.                                                  |
| `GOOGLE_CLIENT_SECRET`      | Matching Google OAuth secret.                                                            |
| `GOOGLE_CALENDAR_TOKEN_KEY` | Stable 64-character hexadecimal encryption key for calendar tokens.                      |
| `OPEN_METEO_API_KEY`        | Optional commercial weather API key.                                                     |

Google Calendar linking needs all three Google variables and an authorized
callback URI. Follow the [Calendar setup guide](docs/calendar.md#google-oauth-setup).
Credentials stay server-side; do not give them `VITE_` prefixes.

## Development and deployment

```sh
npm test
npm run typecheck
npm run build
npm start
```

The app uses TanStack Start, file-based TanStack Router routes and Nitro's Node
server target. The complete HTML shell is server-rendered; local-document editor,
calendar and print screens run in the browser. Validated server functions handle
accounts, calendar access, public template metadata and weather.

For a Node deployment, ship the complete `.output` directory, supply runtime
variables, and run `node .output/server/index.mjs`. PocketBase runs as a separate
persistent service.
Set `HOST` and `PORT` as needed.

For Coolify, use [docker-compose.yml](docker-compose.yml) and the
[Coolify deployment guide](docs/coolify.md). It builds the Node app and a private
PocketBase service with persistent storage and health checks.

## Guides

- [Editor](docs/editor.md): document types, templates, checklists, stickers and backups.
- [Calendar spreads](docs/calendar.md): Google setup, weekly layouts, weather and troubleshooting.
- [Printing](docs/printing.md): A5 duplex, Letter sticker sheets and calibration.
- [Development](docs/development.md): PocketBase administration, architecture and verification.
- [Coolify deployment](docs/coolify.md): containers, domains, runtime variables and persistence.

Cloud document sync, collaboration, automatic text wrapping around floating
pictures and booklet printing are outside the current version. No paid editor
extension or external printing service is required.
