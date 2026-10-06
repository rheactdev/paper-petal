import { z } from "zod";
import type { PaperDocument } from "./model";

export const printSearch = z.object({
  mode: z.enum(["document", "letter"]).catch("document"),
  inset: z.coerce.number().finite().min(0).max(25).catch(6),
  background: z.enum(["content", "paper"]).catch("content"),
});
export type PrintSettings = z.infer<typeof printSearch>;
export type PrintRect = { x: number; y: number; width: number; height: number };
export type PageCrop = {
  pageId: string;
  pageIndex: number;
  rect: PrintRect;
  empty: boolean;
};
export type LetterEntry = {
  crop: PageCrop | null;
  slot: PrintRect;
  position: { x: number; y: number } | null;
};
export type LetterFitError = {
  pageIndex: number;
  excessWidth: number;
  excessHeight: number;
};
export type LetterLayout = {
  width: number;
  height: number;
  orientation: "portrait" | "landscape";
  sheets: { entries: LetterEntry[] }[];
  errors: LetterFitError[];
};
export const LETTER_GAP = 6;
export const CROP_PADDING = 2;

export function intersectRects(a: PrintRect, b: PrintRect): PrintRect | null {
  const x = Math.max(a.x, b.x),
    y = Math.max(a.y, b.y);
  const width = Math.min(a.x + a.width, b.x + b.width) - x;
  const height = Math.min(a.y + a.height, b.y + b.height) - y;
  return width > 0 && height > 0 ? { x, y, width, height } : null;
}

// Bounds come from the already paginated, unscaled DOM. No document reflow or
// bitmap pixel inspection is performed when trimming blank outer paper.
export function cropPage(
  pageId: string,
  pageIndex: number,
  paper: Pick<PaperDocument["paper"], "width" | "height">,
  bounds: PrintRect[],
): PageCrop {
  const page = { x: 0, y: 0, width: paper.width, height: paper.height };
  const visible = bounds
    .map((bound) => intersectRects(bound, page))
    .filter((bound): bound is PrintRect => bound !== null);
  if (!visible.length)
    return {
      pageId,
      pageIndex,
      rect: { x: 0, y: 0, width: 0, height: 0 },
      empty: true,
    };
  const left = Math.max(0, Math.min(...visible.map((r) => r.x)) - CROP_PADDING);
  const top = Math.max(0, Math.min(...visible.map((r) => r.y)) - CROP_PADDING);
  const right = Math.min(
    paper.width,
    Math.max(...visible.map((r) => r.x + r.width)) + CROP_PADDING,
  );
  const bottom = Math.min(
    paper.height,
    Math.max(...visible.map((r) => r.y + r.height)) + CROP_PADDING,
  );
  return {
    pageId,
    pageIndex,
    rect: { x: left, y: top, width: right - left, height: bottom - top },
    empty: false,
  };
}

export function buildLetterLayout(
  paper: Pick<PaperDocument["paper"], "width" | "height">,
  crops: PageCrop[],
  inset = 6,
): LetterLayout {
  const stacked = paper.width > paper.height;
  const width = stacked ? 215.9 : 279.4,
    height = stacked ? 279.4 : 215.9;
  const slotWidth = stacked
    ? width - inset * 2
    : (width - inset * 2 - LETTER_GAP) / 2;
  const slotHeight = stacked
    ? (height - inset * 2 - LETTER_GAP) / 2
    : height - inset * 2;
  const errors: LetterFitError[] = [];
  const sheets: LetterLayout["sheets"] = [];
  for (let page = 0; page < crops.length; page += 2) {
    const entries = [0, 1].map((slotIndex): LetterEntry => {
      const crop = crops[page + slotIndex] ?? null;
      const slot = {
        x: inset + (stacked ? 0 : slotIndex * (slotWidth + LETTER_GAP)),
        y: inset + (stacked ? slotIndex * (slotHeight + LETTER_GAP) : 0),
        width: slotWidth,
        height: slotHeight,
      };
      if (crop && !crop.empty) {
        const excessWidth = Math.max(0, crop.rect.width - slotWidth);
        const excessHeight = Math.max(0, crop.rect.height - slotHeight);
        // A tiny tolerance absorbs sub-pixel DOM rounding, not real overflow.
        if (excessWidth > 0.01 || excessHeight > 0.01)
          errors.push({ pageIndex: crop.pageIndex, excessWidth, excessHeight });
      }
      return {
        crop,
        slot,
        position: crop
          ? {
              x: slot.x + (slot.width - crop.rect.width) / 2,
              y: slot.y + (slot.height - crop.rect.height) / 2,
            }
          : null,
      };
    });
    sheets.push({ entries });
  }
  return {
    width,
    height,
    orientation: stacked ? "portrait" : "landscape",
    sheets,
    errors,
  };
}
