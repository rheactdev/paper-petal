import "@tanstack/react-start/client-only";
import { MM, type PaperDocument } from "../../data/model";
import {
  cropPage,
  intersectRects,
  type PageCrop,
  type PrintRect,
} from "../../data/print-layout";

function rectInPage(rect: DOMRect, page: DOMRect): PrintRect {
  return {
    x: (rect.left - page.left) / MM,
    y: (rect.top - page.top) / MM,
    width: rect.width / MM,
    height: rect.height / MM,
  };
}

export function measurePageCrops(
  root: HTMLElement,
  doc: PaperDocument,
): PageCrop[] {
  return doc.pages.map((page, index) => {
    const element = root.querySelector<HTMLElement>(
      `[data-measure-page="${index}"]`,
    );
    if (!element) throw new Error("A page is still being prepared.");
    const pageRect = element.getBoundingClientRect();
    const bounds: PrintRect[] = [];
    const header = doc.header
      ? element.querySelector<HTMLElement>(".page-header")
      : null;
    if (header)
      bounds.push(rectInPage(header.getBoundingClientRect(), pageRect));
    const clip = element.querySelector<HTMLElement>(".flow-clip");
    const text = clip?.querySelector<HTMLElement>(".flow-text");
    if (clip && text) {
      const clipRect = rectInPage(clip.getBoundingClientRect(), pageRect);
      const walker = document.createTreeWalker(text, NodeFilter.SHOW_TEXT);
      const range = document.createRange();
      for (let node = walker.nextNode(); node; node = walker.nextNode()) {
        if (!node.textContent?.trim()) continue;
        range.selectNodeContents(node);
        for (const rect of range.getClientRects()) {
          const visible = intersectRects(rectInPage(rect, pageRect), clipRect);
          if (visible) bounds.push(visible);
        }
      }
      // List markers are painted outside their text ranges. Include the list
      // item's fragment box so bullets and multi-digit numbers remain intact.
      for (const item of text.querySelectorAll(
        'li:not([data-type="taskItem"])',
      )) {
        for (const rect of item.getClientRects()) {
          const box = rectInPage(rect, pageRect);
          box.x -= 6;
          box.width += 6;
          const visible = intersectRects(box, clipRect);
          if (visible) bounds.push(visible);
        }
      }
      // Task checkboxes are CSS artwork, outside the task's text ranges.
      // Their labels occupy the same physical gutter in the editor and print.
      for (const label of text.querySelectorAll(
        'li[data-type="taskItem"] > label',
      )) {
        for (const rect of label.getClientRects()) {
          const visible = intersectRects(rectInPage(rect, pageRect), clipRect);
          if (visible) bounds.push(visible);
        }
      }
      // Inline artwork and dividers have no text range. Include their visible
      // column fragments so an icon-only line is never cropped to a blank page.
      for (const artwork of text.querySelectorAll(".inline-lucide, hr")) {
        for (const rect of artwork.getClientRects()) {
          const visible = intersectRects(rectInPage(rect, pageRect), clipRect);
          if (visible) bounds.push(visible);
        }
      }
    }
    for (const object of element.querySelectorAll<HTMLElement>(
      ".paper-object",
    )) {
      if (Number(object.style.opacity) === 0) continue;
      // Browser bounds include CSS rotation. Using full image/text-box bounds
      // is conservative and avoids cutting transparent pixels or clipped text.
      bounds.push(rectInPage(object.getBoundingClientRect(), pageRect));
      const svg = object.querySelector("svg");
      if (svg) {
        const bbox = svg.getBBox(),
          matrix = svg.getScreenCTM();
        if (matrix) {
          // SVG artwork can extend beyond its viewBox. Include it, plus stroke.
          const points = [
            [bbox.x - 1, bbox.y - 1],
            [bbox.x + bbox.width + 1, bbox.y - 1],
            [bbox.x - 1, bbox.y + bbox.height + 1],
            [bbox.x + bbox.width + 1, bbox.y + bbox.height + 1],
          ].map(([x, y]) => new DOMPoint(x, y).matrixTransform(matrix));
          const left = Math.min(...points.map((p) => p.x)),
            top = Math.min(...points.map((p) => p.y));
          const right = Math.max(...points.map((p) => p.x)),
            bottom = Math.max(...points.map((p) => p.y));
          bounds.push(
            rectInPage(
              new DOMRect(left, top, right - left, bottom - top),
              pageRect,
            ),
          );
        }
      }
    }
    return cropPage(page.id, index, doc.paper, bounds);
  });
}
