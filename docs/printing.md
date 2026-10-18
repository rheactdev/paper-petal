# Printing

[Back to README](../README.md)

**Print document** opens preparation and preview. It does not submit a printer
job. **Open print dialog** waits for fonts, images and layout, then opens the
browser's dialog; you choose whether to print.

Canvas and print preparation share pagination, typography and object geometry.
Editor controls, selections, margin guides and preview annotations do not print.

## Choose an output mode

| Mode                         | Paper and order                                                       | Intended use                             |
| ---------------------------- | --------------------------------------------------------------------- | ---------------------------------------- |
| Document                     | A5 or the document's custom size; one page per side in reading order. | Duplex journal pages.                    |
| Letter · 2 entries per sheet | Two sequential cropped entries per Letter sheet, single-sided.        | Trimmed inserts or clear adhesive paper. |

## A5 and custom paper

Match the document's paper size and choose:

- 100% / actual-size scale, with no additional browser margins.
- Headers and footers off; background graphics on.
- Duplex enabled in the printer dialog.
- Long-edge flipping for portrait; short-edge flipping for landscape.

Odd page counts receive a blank final reverse side, shown in preparation. A4
imposition and booklet printing are not included.

## Letter sticker sheets

Select **Letter · 2 entries per sheet** in print preparation. Pages pair as 1–2,
3–4 and so on. An odd final entry leaves an empty second slot.

- Portrait entries sit side by side on landscape Letter, 279.4 × 215.9 mm.
- Landscape entries stack on portrait Letter, 215.9 × 279.4 mm.
- The printer inset defaults to 6 mm and accepts 0–25 mm. The entry gap is 6 mm.
- Printing is single-sided, at 100% scale, with headers/footers off and background
  graphics enabled for coloured artwork.

Two complete A5 pages cannot fit on Letter at actual size. The app instead trims
blank outer paper around the existing text and decorations, adds 2 mm padding,
and centres each crop in its slot. It preserves font sizes, image dimensions,
internal spacing and pagination.

Rotated objects and SVG extents are included. Image/text-box rectangles are
measured conservatively; transparent pixels are not inspected. Content clipped
by the original paper or text box remains clipped.

If an entry does not fit, preparation reports its excess width/height and links
to that editor page. Printing stays disabled until it fits; there is no automatic
shrinking. [Calendar spreads](calendar.md#weekly-layout) need an inset of 5.5 mm or
less to retain their 1.25-inch day columns.

Paper colour, lines and dots are omitted by default for clear adhesive paper.
**Include paper colour and pattern** restores them within the crop. Crop outlines,
slot boundaries, dimensions and page labels appear only in the preview.

## Calibration and manual checks

The browser/printer dialog controls duplex, paper size, scale and printable area;
the application cannot force them. Preview geometry does not establish a
particular printer's alignment or adhesive-paper compatibility.

Calibration previews include a 100 mm ruler. Document calibration also labels
front/back orientation and registration crosses; Letter calibration shows the
printable inset. The document calibration sheet needs paper at least 124 mm wide.

Before relying on a printing workflow:

1. Save PDFs manually from Chromium and Firefox. Check physical dimensions, page
   count, font/image placement, omitted guides and blank backs/slots.
2. For Letter, confirm sequential pairing and actual-size crops on each complete
   sheet. For document mode, confirm the selected A5/custom dimensions.
3. When you choose to use a physical printer, measure the calibration ruler and
   check front/back alignment in both orientations.

Printer submission, PDF export and physical calibration are user-run acceptance
checks, separate from automated layout tests.
