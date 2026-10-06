# Paper & Petal

A desktop-first, keyboard-friendly stationery editor built with TanStack Start. Create journal pages and scrapbook spreads from a blank A5 page or editable templates, type continuously, place pictures and text anywhere, and prepare actual-size sheets for duplex printing.

## Run

```sh
npm install
npm run pocketbase:setup
npm run pocketbase:dev
```

In another terminal:

```sh
npm run dev
```

Open http://localhost:3000. Documents and pictures are stored in this browser's IndexedDB. Accounts use the local PocketBase service at http://127.0.0.1:8090. Browser storage can be cleared by the browser; keep downloadable `.petal` backups for important documents.

```sh
npm run test
npm run typecheck
npm run build
npm start
```

Nitro builds the Node server into `.output/server/index.mjs`. Deploy the complete `.output` directory, including public assets, to a supported Node runtime. Configure `HOST` and `PORT` as needed. The runtime adapter is configured in `vite.config.ts`; document and route code remain independent of the adapter.

## PocketBase accounts

**Sign in** appears in the library, editor and print preparation headers. `/sign-up` creates an email/password account with an optional name and signs it in; `/sign-in` opens an existing account. Passwords require 8–71 characters and at most 71 UTF-8 bytes. Forms support keyboard submission, labelled fields, password visibility, pending states and accessible error messages. They remain disabled until hydration, and use POST even before client handlers are ready.

Signing in is optional. Documents remain in this browser's shared local collection; they are not uploaded, synced, partitioned by account or removed on sign-out. Anyone using the same browser profile can access that local collection, including calendar snapshots. Accounts provide identity and an optional Google Calendar connection. Cloud document storage, email verification and password-reset email flows are not included.

PocketBase is pinned to **0.40.4**. The setup script downloads the official release for macOS/Linux (arm64/amd64), checks its SHA-256 release checksum and installs it under ignored `.pocketbase/bin`. Other platforms can install the official binary and set `POCKETBASE_BINARY` to its path. `npm run pocketbase:dev` binds only to `127.0.0.1:8090`, keeps its database under ignored `.pocketbase/data`, and automatically applies the committed `pocketbase/pb_migrations` migration. The `users` auth collection allows registration, limits record access to its owner and prevents client changes to verification status. PocketBase's rate limiter is enabled. The application never uses superuser credentials.

Use `.env.example` as a reference for server configuration; preserve any existing `.env` credentials. Development loads it through Vite. In production, run PocketBase as a separate persistent service with the committed migrations and set `POCKETBASE_URL` in the Node server environment. Keep PocketBase's SQLite data on persistent storage, expose the application over HTTPS and configure rate limits/proxy trust for your deployment's traffic. `npm start` starts the application, not PocketBase, and expects runtime environment variables to be supplied by the host.

Sessions use a fresh PocketBase SDK instance and memory-only auth store per server request. Typed server functions validate inputs with Zod; Start request middleware checks same-origin POST requests. The session cookie contains only the authentication token, with `HttpOnly`, `SameSite=Lax`, path `/`, token expiry and `Secure` in production. Session reads verify the token against PocketBase and return only the user's ID, name and email. Authentication responses are private and uncached. Read requests never rewrite cookies, so a concurrent refresh cannot restore a signed-out session. Backend outages preserve the cookie and show retry states. Account changes refresh other open tabs; returning to a tab also refreshes its session. Sign-out removes the browser cookie, while PocketBase tokens expire according to the collection settings.

The PocketBase administrator dashboard is at http://127.0.0.1:8090/_/. Administrator creation is a user action and isn't required for app sign-up. To create one yourself, use PocketBase's `superuser create` command with `--dir=.pocketbase/data`; keep its credentials separate from application accounts. The development launcher omits the sensitive initial administrator setup link from logs. See the [official PocketBase documentation](https://pocketbase.io/docs/) for service administration.

## Google Calendar weekly spreads

Open **Calendar spreads** in the library or choose **A little week · from your calendar**. `/calendar` provides a two-page, A5, Cousin-inspired vertical weekly layout: Monday–Wednesday on the left and Thursday–Sunday on the right. Compact headings and full-width day columns prioritize the calendar. The timeline defaults to the hours containing events, with one hour of breathing room at either end and a minimum six-hour window; empty/all-day-only weeks use 08:00–20:00. Overnight events can require the full day. **Calendars & style → Timeline** also offers all 24 hours. The all-day band appears only when needed. The workspace defaults to fit-to-width with a keyboard-scrollable preview; Fit spread and Actual size are also available, and settings collapse to leave more space for the paper. Event titles default to 8.5pt with compact line spacing. **Calendars & style** offers event font size (6–24pt), left/center/right text alignment, left/center/right arrow position and end padding (0–10mm). Titles rewrap at the chosen size; all-day rows expand to fit two lines while calendar headings and hour labels keep their original size. Timed appointments have title-only labels and thin downward duration arrows on an uncoloured grid, with each arrow tip stopping above its end-time line by the chosen padding (1mm by default, reduced for very short appointments). Arrows sit beneath the title when there is room, or beside it for short appointments. Event, all-day and weekend background fills are omitted; all-day entries retain subtle separators. Time ranges stay in the optional event key rather than underneath titles in the timeline. Choose the event font under **Calendars & style → Event font**; Lora, DM Sans, Caveat, Elliot Letters Bold and Minuet are bundled locally. The studio waits for the selected face to load and wraps titles using its measured widths before saving. Calendar headings and time labels keep their original fonts. The original artwork offers Soft sage, Rose & oat and Pencil & paper palettes. It is inspired by the [Hobonichi Cousin's vertical weekly layout](https://www.1101.com/store/techo/en/2026/all_about/cousin/), with no affiliation.

Sign in to Paper & Petal, then open **Calendars & style**, choose **Link Google Calendar** and approve Google's read-only calendar permissions yourself. Calendars start selected by default. Use **Select all** under **Your calendar** to restore the full selection after unchecking individual calendars. Preview supports up to 10 selected calendars; choose a week and IANA time zone, then press **Preview my calendar**. The Google Calendar API must be enabled in the OAuth client's Cloud project. In development the exact authorized redirect URI for the **Web application** OAuth client is:

```text
http://localhost:3000/api/google-calendar/callback
```

Server variables in `.env`:

```text
APP_URL=http://localhost:3000
GOOGLE_CLIENT_ID=<existing Web OAuth client ID>
GOOGLE_CLIENT_SECRET=<existing client secret>
GOOGLE_CALENDAR_TOKEN_KEY=<64 hexadecimal characters>
```

The existing aliases `GOOGLE_OAUTH_CLIENT_ID` and `GOOGLE_OAUTH_CLIENT_SECRET` are also supported. Never use `VITE_` prefixes or put secrets in a URL. This workspace's existing credentials were preserved and a private, random encryption key was added locally. For a new installation, generate that key with `node -e 'console.log(require("node:crypto").randomBytes(32).toString("hex"))'` and store it in the server environment. Keep the key stable, secret and backed up separately from PocketBase; changing or losing it requires reconnecting calendars. Restart both development services after setup so the environment and `google_calendar_links` migration load. If the OAuth consent app is in testing, add the intended Google account as a test user. Follow Google's [web server OAuth guide](https://developers.google.com/identity/protocols/oauth2/web-server) for consent and production verification requirements.

Production uses the same routes and Nitro Node target. Set `APP_URL` to the public HTTPS origin, register its exact `/api/google-calendar/callback` URI, and supply these variables to the Node runtime. No Google service account, browser client secret or PocketBase superuser is used. The app requests only `calendar.events.readonly` and `calendar.calendarlist.readonly`, as defined in the [Calendar API authorization reference](https://developers.google.com/workspace/calendar/api/auth). It does not create or modify Google events.

OAuth state, PKCE and an encrypted, short-lived HttpOnly cookie bind the authorization to the signed-in PocketBase user. Access/refresh tokens stay behind explicit server-only modules and are encrypted with AES-256-GCM; authenticated additional data binds each stored ciphertext to its owner. PocketBase rules enforce owner access and one link per account. Typed server functions return only connection status, calendar choices and normalized event details, never tokens. Disconnect asks for confirmation, attempts Google revocation, removes the local link, and reports if revocation could not be confirmed. Saved document snapshots remain on the device.

Calendar reads expand recurring occurrences, paginate responses, omit cancelled or self-declined invitations, respect exclusive all-day end dates and use DST-aware week boundaries. Weeks with more than 500 events are rejected with a visible message. Overlapping timed events occupy separate lanes, overnight events split across days and busy all-day bands gain an event key. The printed grid represents local wall-clock time; repeated autumn hours use a compact block and the event key retains start/end UTC offsets. Full titles, original times and optional locations are retained on editable event-key pages when labels are too small. Turn the key off to keep exactly two pages; a visible warning explains which labels are compact. **Use “Busy” instead of event titles** omits titles, calendar names and locations from the saved document. It doesn't remove details from the source calendar.

**Create this spread** saves an editable local snapshot using the existing document model, autosave, backups and print preparation. It does not keep updating from Google. Every text box and event block can be edited or positioned in the editor; grid rules start locked. Generated pages fit the existing Letter sticker sheets at actual size. Guests can create a blank week or try a clearly labelled fictional sample without linking an account.

## Editor

- A5 portrait and landscape, or custom dimensions (60–420 mm), with top/bottom/inner/outer margins. Facing-page margins mirror. Canvas coordinates and object sizes are stored in millimetres; typography uses points.
- Monthly bullet journal calendar templates generate the current month from the browser's local date when created. Choose one A5 page or a two-page spread, and Monday- or Sunday-start weeks in the library. The spread opens in facing-page view with four weekdays on the left and three weekdays plus weekly notes on the right. Dates, headings and empty daily entries are editable text boxes; select an entry on the canvas or in Objects and type in **Your words**. Grid rules and column tints start locked to keep the layout stable. Existing calendars keep their original month, including after reload or backup import.
- Main text uses open-source Tiptap/ProseMirror. A custom pagination extension measures CSS column fragmentation without splitting or rewriting the source document. This preserves ProseMirror selection, composition and native text history. Paragraphs, headings, lists and manual page breaks flow across columns; each canvas page displays the corresponding clipped column using its own mirrored margins.
- **Checklist** beside Bullet list converts selected text into nested todo lists. Enter adds an unchecked task, Enter on an empty task exits, and Tab / Shift + Tab indent / outdent task text. Ctrl / Cmd + Shift + 9 toggles checklists. Focus a checkbox and use Space to complete or reopen it; Undo / Redo also work while the checkbox has focus. Completion crosses out only that task's own text, preserving its formatting and independent nested tasks. Checked states persist in autosave and backups. Canvas, A5 and Letter previews share physical 4 mm boxes and include checkbox geometry in Letter crops; preview boxes are inert. This applies to continuous text, while positioned text boxes keep their current controls.
- Canvas and print views use the same rich-text HTML, font metrics, column dimensions and object geometry. Lora, DM Sans, Caveat and the supplied Elliot Letters Bold and Minuet fonts are bundled locally and available in **Document font** and **Text box font**. Font choices survive autosave and validated backups. Changing font or paper dimensions updates the existing editor rather than recreating it.
- **Stickers** in the left sidebar opens a searchable thumbnail library. PNG files under `src/assets/stickers` are bundled automatically; each relative subfolder becomes a category, root files use Unsorted, and the original SVG stickers remain in Basics. Drag onto either visible sheet, or click / Enter / Space to insert at the active page’s centre. PNGs start with a 25 mm longest edge and retain transparency and aspect ratio. Escape or a drop outside the paper cancels. Each insertion is one undo operation and focuses the new object for arrow-key nudging. Original image bytes are copied to IndexedDB, so saved stickers and backups work even if catalogue files later change.
- Text boxes, PNG/JPEG/WebP pictures, shapes and PNG and SVG stickers can be positioned, resized, rotated, duplicated, layered and locked. Picture proportions are preserved by default. Use the labelled object list and properties fields instead of dragging. Arrow keys move selected objects 1 mm; Shift + Arrow moves 10 mm. Text fields retain their native arrow-key behavior.
- Overlap is allowed. Layout warnings identify possible overlap with the text area, margins and paper edges. Text boxes support left, center and right alignment and show a warning when their contents overflow. Older documents default to left alignment; alignment is preserved in local storage and backups.
- Documents autosave after 450 ms. Navigation to the library and print preparation flushes pending saves. Failed saves remain visible and offer retry and backup actions. Print and editor loaders reload local records on entry instead of showing stale route-cache data.
- `.petal` backups contain validated document JSON and embedded images. Imports receive new document and image IDs. Unknown nodes, unsafe styles, invalid geometry, missing assets and unsupported versions are rejected. Rich text is rendered through the editor schema, never arbitrary imported HTML.

## Routes and boundaries

- `/`: server-rendered library shell and public template metadata, loaded through a typed GET server function. Local documents load after hydration.
- `/documents/$documentId`: browser-only editor and IndexedDB route loader; validated page/view/zoom search params.
- `/print/$documentId`: browser-only print preparation and IndexedDB route loader; validated `mode` (`document` or `letter`), `inset` (0–25 mm, default 6) and `background` (`content` or `paper`) search settings. DOM measurement lives behind a client-only function and module.
- `/sign-in` and `/sign-up`: server-rendered account screens, with secure interactive forms after hydration. The root loader verifies the account session on the server.
- `/calendar`: browser-only calendar studio, with validated week/connection feedback search params and an authenticated status loader. Calendar sign-in uses an allowlisted return destination.
- `/api/google-calendar/callback`: server-only GET OAuth callback; returns a redirect without rendering authorization codes.
- `/api/health`: server JSON health endpoint.
- The root route owns the complete HTML document, metadata, assets and hydration scripts. Public template, account, Google API and token-encryption modules are protected by Start's explicit server-only import and loaded only inside server handlers. Editor and print routes keep their browser-only document loaders and Nitro Node deployment target.

## Printing

The **Print document** button opens preparation and preview first; it does not send a print job. The **Open print dialog** button waits for fonts, image decoding and layout frames, then opens the browser/printer dialog. You choose whether to submit the job.

Use matching A5/custom paper, 100%/actual-size scale, no extra browser margins, no headers/footers and enabled background graphics. Enable duplex in the printer dialog: long-edge flip for portrait, short-edge for landscape. One document page is printed per side in reading order. Odd page counts receive a blank final reverse side. A4 imposition and booklets are not included.

The app cannot force a printer's paper size, duplex setting, colour handling or printable area. A calibration preview contains labelled front/back orientation, central registration crosses and a 100 mm ruler. The test requires paper at least 124 mm wide. Print submission and physical measurements are manual user actions.

### Letter sticker sheets

Select **Letter · 2 entries per sheet** in print preparation. Portrait entries are placed side by side on landscape Letter (279.4 × 215.9 mm); landscape entries stack on portrait Letter. Pages pair in reading order (1–2, 3–4), with an empty second slot on an odd final sheet. This mode uses single-sided printing.

Two complete A5 pages cannot fit on Letter at actual size. Instead, the app measures the existing paginated text and decorations, trims blank outer paper, adds 2 mm padding, and centres each entry in its slot. Text size, picture dimensions and interior spacing stay unchanged. Rotated objects and SVG artwork extending beyond its viewBox are included in the crop. Image and text-box rectangles are treated conservatively; transparent image pixels are not inspected. Content already clipped by the original document's paper or text box remains clipped.

The printer inset defaults to 6 mm on every edge and can be adjusted from 0–25 mm; the entry gap is 6 mm. Entries that do not fit show the excess width/height and a link to the affected editor page. The print button is disabled until they fit; no automatic shrinking occurs.

Paper colour, lines and dots are omitted by default for clear adhesive paper. **Include paper colour and pattern** fills the cropped entry with its original paper styling. Crop outlines, slot boundaries, dimensions, page labels and blank-slot labels appear only onscreen. The Letter calibration preview contains one sheet with a 100 mm ruler and a printable inset boundary.

Choose Letter in the shown orientation, 100% scale, no added browser margins, disabled headers/footers, single-sided printing and enabled background graphics for coloured shapes/stickers. The preview is an aid to positioning, not proof of a printer's printable area or adhesive-paper handling.

## Verification

Checklist tests exercise actual Tiptap commands and keymaps for paragraph conversion, nesting, Enter/exit, deletion across task boundaries, independent completion, formatting, selection preservation, separate checkbox undo events and composition-tagged Unicode transactions. Storage and crop tests cover checked-state reload and backup round trips, invalid task imports, checkbox-only entries, crop padding and clipped markers. Browser checks verified keyboard completion and Undo/Redo without losing checkbox focus, saved reload, independent nested-task strikethrough, rich-text paste, 8 pt checkbox alignment, manual breaks, long tasks spanning six pages, font/margin reflow to ten pages, and Undo restoring the original text. A5 and Letter preparation retained the original font/checkbox sizes and completed styles. No print dialog or printer job was opened. Native IME input and exported PDFs remain manual acceptance checks.

Weekly unit tests cover search/input validation, local current weeks, year boundaries, DST, timezone conversion, exclusive all-day dates, midnight splitting, overlap lanes, crowded/short/long labels, Unicode event keys, privacy, all palettes, margin/Letter fit, stable decorated pages and backup serialization. Google integration unit tests mock the remote service and cover narrow scopes, PKCE/state/account binding, cookie security, code replay, consent cancellation, missing permissions/refresh tokens, authenticated calendar selection, recurring-query parameters, paging, token refresh persistence, encrypted ownership, corrupt tokens, event limits, revocation and backend failures. Live Google consent and API responses require a user-linked account; mocked tests do not establish that the Cloud client's API, redirect URI and consent configuration are correct.

Weekly unit checks cover shared focused hour windows, full-day mode, sparse weeks, midnight/last-second events, compact headings, complete appointment labels, duration-arrow end gaps (including short/overlapping events), custom-font wrapping and font backup validation, omitted calendar fills, crowded all-day events, privacy and backup compatibility. Browser checks with fictional appointments verified full rendered titles without overflow, keyboard settings and line-spacing edits, and A5/actual-size Letter preparation with matching font sizes. Earlier checks covered Unicode event-key wrapping, sign-in return navigation and client/server credential separation. The local PocketBase calendar migration is applied. All 112 unit tests, TypeScript and the production build pass. Custom-font browser checks verified both faces in the calendar, editing, saved-document reload and A5/Letter previews without text-box overflow; the arrow gap was measured in the rendered preview. Weekly style checks covered font-size and padding validation, all three arrow positions, alignment, larger all-day rows, short/overlapping events and legacy backup defaults. Browser checks verified 12pt centered titles, right arrows with a measured 3mm gap, keyboard padding increments, invalid-size feedback, 24pt titles, and saved A5/Letter previews retaining the selected styles. No print dialog or printer job was opened during verification. Saved spreads retain their layout; create a new spread to use the updated calendar template.

Automated tests cover all templates, validation, mirrored margins, rotated object warnings, preservation of decorated pages, IndexedDB save/reload/delete, shared asset cleanup, storage failures, invalid backups and backup/image round trips. Letter tests cover validated settings, sequential pairing, odd counts, blank and decorated entries, portrait/landscape geometry, crop padding, paper-edge clipping, fit failures, inset changes and immutable source data. Calendar tests cover the current local month at creation, Monday/Sunday weekday placement, four/six-week months, leap years and century rules, year boundaries, editable entries, protected grid rules, stable pages, backup serialization and A5-margin/Letter-sheet fit across every month of 2026.

Account unit tests cover normalized input, password limits including Unicode, privilege-field stripping, cookie attributes, expired/forged sessions, request isolation, outage handling, rate limits, rejected credentials and partial registration. Browser checks passed sign-up and sign-in through keyboard submission, mismatched/incorrect password feedback, reload persistence, sign-out and cross-tab session updates. The four pre-existing local documents remained available after sign-out. No print dialog was opened during account verification.

`npm run build && npm run test:auth` offers production HTTP integration checks using temporary PocketBase and Node servers on ports 8091 and 3001, synthetic accounts and a disposable database. It checks CSRF, SSR identity, cookie flags, account isolation, collection rules and absence of PocketBase/session code from client bundles, then stops the servers and removes test data. It requires the installed PocketBase binary and permission to start local servers. The complete integration run remains unverified: the first run hit a response-decoder error after its CSRF rejection checks; the decoder was fixed, but permission to rerun was declined. Unit tests, TypeScript and the production build pass.

Calendar browser checks verified one-page and two-page creation, Sunday-start selection, keyboard entry editing, no initial text-box overflow, saved entries after reload and two calendars fitting on one Letter sheet. Facing-page view keeps the same pair visible while selecting either page, with the live text editor positioned on the active side. No print dialog was opened during these checks.

In-app browser checks covered multi-page text pasting and Undo, manual page breaks, image insertion and ratio-preserving resizing, keyboard nudging, text-box overflow, local reload, mirrored margins, landscape preparation, calibration preview and missing-document recovery. The native print dialog was opened and canceled during verification; no job was submitted. Further printer use is reserved for the user. Letter verification used only onscreen previews: three entries paired onto two sheets with an empty final slot; a rotated 60 x 40 mm picture retained its dimensions; lists and stickers remained visible; landscape entries stacked on portrait Letter; backgrounds toggled correctly; oversized entries disabled printing; keyboard controls and the 100 mm calibration preview were checked. No native print dialog was opened during Letter verification.

Chromium and Firefox were not available through the connected browser tools. PDF export geometry and cross-browser print output remain manual acceptance checks; no exported PDF or physical printer alignment has been claimed as verified. Validate these before relying on a production printing workflow:

1. Paste a long multi-page document, edit across boundaries, test IME composition, native Undo/Redo and list pagination.
2. Change dimensions, margins and fonts; compare canvas and print preview. Confirm decorated pages survive text shrinkage.
3. Save as PDF manually from Chromium and Firefox, checking A5 dimensions (148 × 210 mm), page count, margins, typography and object placement. For Letter mode, check 279.4 × 215.9 mm or 215.9 × 279.4 mm, one PDF page per complete sheet, sequential pairing, actual-size content, omitted preview guides and the empty final slot.
4. Print the calibration sheet only when desired, checking the 100 mm ruler and front/back cross alignment. Repeat for portrait and landscape.

Cloud sync, collaboration, automatic text wrapping around floating pictures and paid editor extensions are not included.
