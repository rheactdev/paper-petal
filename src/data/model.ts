import { z } from "zod";
import { paperFonts } from "./fonts";
export const MM = 96 / 25.4;
export const colour = z.string().regex(/^#[0-9a-fA-F]{6}$/);
const finite = z.number().finite();
const markSchema = z
  .object({
    type: z.enum(["bold", "italic", "strike", "underline", "textStyle"]),
    attrs: z
      .object({
        color: colour.optional(),
        fontSize: z
          .string()
          .regex(/^\d+(\.\d+)?pt$/)
          .optional(),
        fontFamily: z.enum(paperFonts).optional(),
      })
      .strict()
      .optional(),
  })
  .strict();
export type RichNode = {
  type: string;
  text?: string;
  attrs?: { level?: number; start?: number; textAlign?: string };
  marks?: z.infer<typeof markSchema>[];
  content?: RichNode[];
};
export const richNode: z.ZodType<RichNode> = z.lazy(() =>
  z
    .object({
      type: z.enum([
        "doc",
        "paragraph",
        "heading",
        "text",
        "bulletList",
        "orderedList",
        "listItem",
        "hardBreak",
        "pageBreak",
      ]),
      text: z.string().optional(),
      attrs: z
        .object({
          level: z.number().int().min(1).max(3).optional(),
          start: z.number().int().min(1).optional(),
          textAlign: z.enum(["left", "center", "right", "justify"]).optional(),
        })
        .strict()
        .optional(),
      marks: z.array(markSchema).optional(),
      content: z.array(richNode).optional(),
    })
    .strict(),
);
export const objectSchema = z.object({
  id: z.string().min(1),
  type: z.enum(["text", "image", "shape", "sticker"]),
  label: z.string().max(200),
  x: finite,
  y: finite,
  width: finite.positive().max(1000),
  height: finite.positive().max(1000),
  rotation: finite.min(-360).max(360),
  locked: z.boolean(),
  opacity: finite.min(0).max(1),
  text: z.string().max(100000).default(""),
  font: z.enum(paperFonts).default("Lora"),
  fontSize: finite.min(6).max(144).default(12),
  lineHeight: finite.min(1).max(3).default(1.5),
  textAlign: z.enum(["left", "center", "right"]).default("left"),
  color: colour.default("#485541"),
  fill: colour.default("#e5e9da"),
  shape: z.enum(["rectangle", "ellipse", "line", "arrow"]).default("rectangle"),
  sticker: z
    .enum(["flower", "leaf", "star", "tape", "heart"])
    .default("flower"),
  assetId: z.string().optional(),
  aspectRatio: finite.positive().optional(),
  keepRatio: z.boolean().default(true),
});
export type PaperObject = z.infer<typeof objectSchema>;
export const documentSchema = z
  .object({
    version: z.literal(1),
    id: z.string().min(1),
    title: z.string().max(200),
    createdAt: z.string(),
    updatedAt: z.string(),
    paper: z.object({
      width: finite.min(60).max(420),
      height: finite.min(60).max(420),
      margins: z.object({
        top: finite.min(0),
        bottom: finite.min(0),
        inner: finite.min(0),
        outer: finite.min(0),
      }),
      background: colour,
      pattern: z.enum(["plain", "dots", "lines"]),
    }),
    typography: z.object({
      font: z.enum(paperFonts),
      size: finite.min(8).max(48),
      color: colour,
    }),
    flow: richNode,
    pages: z
      .array(z.object({ id: z.string(), objects: z.array(objectSchema) }))
      .min(1)
      .max(500),
  })
  .strict()
  .superRefine((doc, ctx) => {
    const m = doc.paper.margins;
    if (
      m.inner + m.outer >= doc.paper.width - 15 ||
      m.top + m.bottom >= doc.paper.height - 15
    )
      ctx.addIssue({
        code: "custom",
        message: "Margins must leave at least 15 mm of writing space.",
      });
    if (doc.flow.type !== "doc" || !doc.flow.content?.length)
      ctx.addIssue({ code: "custom", message: "Invalid rich text root." });
    const ids = doc.pages.flatMap((p) => [p.id, ...p.objects.map((o) => o.id)]);
    if (new Set(ids).size !== ids.length)
      ctx.addIssue({
        code: "custom",
        message: "Duplicate page or object identifiers.",
      });
  });
export type PaperDocument = z.infer<typeof documentSchema>;
export type Page = PaperDocument["pages"][number];
export const editorSearch = z.object({
  page: z.coerce.number().int().min(1).catch(1).default(1),
  view: z.enum(["single", "spread"]).catch("single").default("single"),
  zoom: z.coerce.number().min(0.25).max(2).catch(0.8).default(0.8),
});
export function pageMargins(doc: PaperDocument, index: number) {
  return {
    top: doc.paper.margins.top,
    bottom: doc.paper.margins.bottom,
    left: index % 2 === 0 ? doc.paper.margins.inner : doc.paper.margins.outer,
    right: index % 2 === 0 ? doc.paper.margins.outer : doc.paper.margins.inner,
  };
}
export function createObject(
  type: PaperObject["type"],
  changes: Partial<PaperObject> = {},
): PaperObject {
  return objectSchema.parse({
    id: crypto.randomUUID(),
    type,
    label:
      type === "text"
        ? "Text box"
        : type === "image"
          ? "Picture"
          : type === "shape"
            ? "Shape"
            : "Flower sticker",
    x: 20,
    y: 30,
    width: type === "text" ? 80 : 30,
    height: type === "text" ? 30 : 30,
    rotation: 0,
    locked: false,
    opacity: 1,
    ...changes,
  });
}
export function syncPages(pages: Page[], count: number): Page[] {
  let needed = Math.max(1, count);
  pages.forEach((p, i) => {
    if (p.objects.length) needed = Math.max(needed, i + 1);
  });
  return Array.from(
    { length: needed },
    (_, i) => pages[i] || { id: crypto.randomUUID(), objects: [] },
  );
}
export function objectWarnings(
  doc: PaperDocument,
  index: number,
  object: PaperObject,
) {
  const warnings: string[] = [];
  const p = doc.paper,
    m = pageMargins(doc, index);
  const angle = (object.rotation * Math.PI) / 180;
  const width =
    Math.abs(object.width * Math.cos(angle)) +
    Math.abs(object.height * Math.sin(angle));
  const height =
    Math.abs(object.width * Math.sin(angle)) +
    Math.abs(object.height * Math.cos(angle));
  const x = object.x + (object.width - width) / 2,
    y = object.y + (object.height - height) / 2;
  if (x < 0 || y < 0 || x + width > p.width || y + height > p.height)
    warnings.push("Extends beyond the paper");
  else if (
    x < m.left ||
    y < m.top ||
    x + width > p.width - m.right ||
    y + height > p.height - m.bottom
  )
    warnings.push("Outside the margin guide");
  if (
    doc.flow.content?.some((n) => n.content?.length) &&
    x < p.width - m.right &&
    x + width > m.left &&
    y < p.height - m.bottom &&
    y + height > m.top
  )
    warnings.push("May overlap flowing text");
  return warnings;
}
export function normaliseDocument(input: unknown) {
  const result = documentSchema.parse(input);
  const walk = (node: RichNode, depth = 0) => {
    if (depth > 30) throw new Error("Document nesting is too deep.");
    if (
      node.type === "text" &&
      (typeof node.text !== "string" || !node.text || node.content)
    )
      throw new Error("Invalid text content.");
    const children: Record<string, string[]> = {
      doc: ["paragraph", "heading", "bulletList", "orderedList", "pageBreak"],
      paragraph: ["text", "hardBreak"],
      heading: ["text", "hardBreak"],
      bulletList: ["listItem"],
      orderedList: ["listItem"],
      listItem: ["paragraph", "heading", "bulletList", "orderedList"],
    };
    if (
      node.content?.some((child) => !children[node.type]?.includes(child.type))
    )
      throw new Error("Invalid rich text structure.");
    if (node.type === "listItem" && node.content?.[0]?.type !== "paragraph")
      throw new Error("List items must begin with a paragraph.");
    if (
      ["bulletList", "orderedList", "listItem"].includes(node.type) &&
      !node.content?.length
    )
      throw new Error("Empty list structure.");
    node.content?.forEach((n) => walk(n, depth + 1));
  };
  walk(result.flow);
  return result;
}

export function cleanRich(input: unknown): RichNode {
  const node = JSON.parse(
    JSON.stringify(input, (_, value) => (value === null ? undefined : value)),
  );
  const clean = (n: RichNode) => {
    n.marks?.forEach((mark) => {
      if (mark.attrs) {
        if (
          mark.attrs.fontFamily &&
          !paperFonts.includes(mark.attrs.fontFamily)
        )
          delete mark.attrs.fontFamily;
        if (mark.attrs.fontSize && !/^\d+(\.\d+)?pt$/.test(mark.attrs.fontSize))
          delete mark.attrs.fontSize;
        if (mark.attrs.color && !/^#[0-9a-f]{6}$/i.test(mark.attrs.color)) {
          const rgb = mark.attrs.color.match(
            /^rgb\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*\)$/,
          );
          if (rgb)
            mark.attrs.color =
              "#" +
              rgb
                .slice(1)
                .map((v) =>
                  Math.min(255, Number(v)).toString(16).padStart(2, "0"),
                )
                .join("");
          else delete mark.attrs.color;
        }
      }
    });
    n.content?.forEach(clean);
  };
  clean(node);
  return richNode.parse(node);
}

export function objectStyle(o: PaperObject) {
  return {
    left: o.x * MM,
    top: o.y * MM,
    width: o.width * MM,
    height: o.height * MM,
    transform: `rotate(${o.rotation}deg)`,
    opacity: o.opacity,
  };
}
