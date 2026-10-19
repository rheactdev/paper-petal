# Using the editor

[Back to README](../README.md)

## Create a document

Choose a blank page or an editable journal, photo-collage, weekly-planner or
monthly-calendar template. Monthly calendars use the current local month at
creation, with one- or two-page layouts and Monday- or Sunday-start weeks.
[Google Calendar spreads](calendar.md) have their own preview studio.

Choose **Rich text** or **Markdown** when creating a document. Rich text is the
default, and the choice stays fixed afterward. Older documents open as rich text.

Pages default to portrait A5, 148 × 210 mm, with 12 mm margins. Page settings allow
landscape or custom dimensions from 60–420 mm, plus top, bottom, inner and outer
margins. Inner/outer margins mirror in facing-page view.

## Workspace

| Area          | Controls                                                                             |
| ------------- | ------------------------------------------------------------------------------------ |
| Header        | Text formatting, or Markdown insertion and document typography.                      |
| Left sidebar  | My documents, document menu, Pages and Stickers.                                     |
| Canvas        | Single/facing pages, flowing text and freely positioned artwork.                     |
| Right sidebar | Edit, Page and Objects: document actions, headers, page setup and object properties. |
| Footer        | Page navigation, view mode, zoom, Fit and margin guides.                             |

Both sidebars collapse. **Focus on page** hides them and fits the page or spread.
Fonts are bundled locally: Lora, DM Sans, Caveat, Elliot Letters Bold and Minuet.
Choose **Upload fonts** beside a document, text-box or calendar font selector
to add TTF, OTF, WOFF or WOFF2 files (up to 10 MB each). Sign in to upload; each
file appears by filename in font selectors across your account's devices.
Select a font after uploading to apply it. Files are separate selectable faces.
Object geometry uses millimetres; font size uses points.

## Rich text and checklists

The continuous text area uses Tiptap/ProseMirror and flows across pages. It supports
paragraphs, headings, lists, formatting, alignment and manual page breaks.
Decorated pages remain when shortening text removes unused flow pages.

**Checklist**, beside Bullet list, converts selected text into nested tasks.
Completed tasks cross out their own text; nested tasks keep independent states.

| Action                    | Shortcut             |
| ------------------------- | -------------------- |
| Toggle checklist          | Ctrl/Cmd + Shift + 9 |
| Create another task       | Enter                |
| Exit an empty task        | Enter                |
| Indent/outdent a task     | Tab / Shift + Tab    |
| Toggle a focused checkbox | Space                |

Undo/Redo preserves task completion and formatting. Checklist controls apply to
continuous text; positioned text boxes retain their separate controls.

## Markdown

Markdown documents use a resizable, collapsible CodeMirror source pane beside the
paper. Source text is authoritative and survives autosave and backups unchanged.
The paper is read-only for flowing text and checkboxes; edit `[ ]` / `[x]` in the
source to change task completion.

Supported syntax includes headings, emphasis, strikethrough, nested lists/tasks,
dividers, links, blockquotes and inline/fenced code. Recognized Lucide shortcodes,
such as `:LiLayoutList:`, `:LiShowerHead:`, `:LiBrushCleaning:` and `:LiNotebook:`,
render as local SVG icons. Unknown or escaped shortcodes, and those inside code,
remain text.

**Add page** inserts a standalone `<!-- pagebreak -->` marker. HTML, tables,
Obsidian callouts, wiki links and vault attachment embeds remain literal text.
Use picture uploads for images. Stickers, text boxes, headers and printing work
with both document types.

## Pictures, stickers and objects

Upload PNG, JPEG or WebP pictures, or open **Stickers** to browse searchable
categories. Drag onto either visible page, or click / Enter / Space to insert at
the active page's centre. Raster stickers start with a 25 mm longest edge, preserving
transparency and proportions. The browser stays open after insertion.

Open **Upload stickers** in the sticker browser to add PNG, JPEG or WebP files
(up to 20 MB each) with FilePond. Uploads require sign-in and appear under
**My uploads**, where they can be searched, clicked or dragged onto a page.
Uploading adds to the library without inserting onto the page. Progress,
cancellation and retries work per file; identical uploads are reused. This
version has no rename or delete controls for the account library.

To add catalogue stickers, put PNG files under `src/assets/stickers`. Subfolders
become categories; root files appear in Unsorted. Built-in SVG stickers appear in
Basics. Inserted image bytes are saved with the document, so removing a catalogue
file does not break existing work.

Select an object to move, resize or rotate it on the canvas. Numeric properties
and the labelled object list provide the same operations without dragging.

| Action                       | Control                                  |
| ---------------------------- | ---------------------------------------- |
| Nudge selected object        | Arrow keys: 1 mm; Shift + Arrow: 10 mm.  |
| Resize from a focused handle | Arrow keys: 1 mm; Shift + Arrow: 10 mm.  |
| Rotate from a focused handle | Left/Right: 1°; Shift + Left/Right: 15°. |
| Snap pointer rotation        | Hold Shift for 15° increments.           |
| Cancel a pointer operation   | Escape or pointer cancellation.          |

Text fields retain normal arrow-key behaviour. Objects support duplication,
layering, locking and opacity. Images preserve proportions by default; colour
controls apply to SVG stickers. Each completed pointer gesture is one undo step.

Arrow shapes offer **Regular / Hand-drawn** under their object properties.
Hand-drawn arrows use a pen stroke and open arrowhead. Their **Arrow roughness**
slider runs from Smooth (0) to Sketchy (3), starting at 0.6. Changes appear live;
each slider drag is one undo step. Changing style
keeps the arrow's size and position, and its drawing survives reloads, backups
and duplication. Existing arrows default to Regular.

Objects can overlap flowing text. Warnings identify possible text overlap,
content outside margins/paper and text-box overflow; the app keeps your layout.

## Daily headers and weather

Under **Edit → Header**, set a city and Celsius/Fahrenheit preference, then choose
**Set header** to add the current date, weekday and optional weather. Headers
reserve 18 mm above flowing text. **Update header** captures a fresh snapshot;
**Remove header** restores the writing area. Positioned artwork keeps its geometry.

Weather uses Open-Meteo model estimates. City search sends the query to its
geocoding service; weather requests send the selected coordinates through the
server. No browser geolocation permission is needed. Failed requests preserve the
existing header and offer a date-only fallback. See [weather configuration](calendar.md#weather).

## Saving and backups

Documents autosave after edits, with saving, saved and failed states. Navigation
to the library or print preparation flushes pending saves. Failed saves offer
retry and backup actions.

Download a `.petal` backup from the document menu or library. Backups include
content, image bytes and custom fonts. Imports validate the document, allocate new document and
asset IDs, and reject unsafe/unsupported content or missing assets.

Document storage belongs to the browser profile and origin, not the signed-in account.
Your uploaded font/sticker library is private to your account and syncs between
devices. Assets used in documents are copied locally, so those documents can
reopen and print after sign-out or without library access. Backups include those
copies; importing a backup does not upload its assets to an account library.
Signing out does not remove documents; another person using that browser profile
can access them. To move from localhost to a deployed domain, export and import
backups. Clearing browser storage can remove local documents.
