import { Node } from "@tiptap/core";
import type { DOMOutputSpec } from "@tiptap/pm/model";
import imports from "lucide-react/dynamicIconImports.mjs";
import type { RichNode } from "../data/model";

type IconName = keyof typeof imports;
type IconData = Awaited<ReturnType<(typeof imports)[IconName]>>["__iconData"];
const names = new Map(
  Object.keys(imports).map((name) => [
    name.replace(/-/g, "").toLowerCase(),
    name as IconName,
  ]),
);
const data = new Map<string, IconData>();
const pending = new Map<string, Promise<void>>();

export function iconName(shortcode: string): IconName | undefined {
  return names.get(
    shortcode
      .replace(/^:?li/i, "")
      .replace(/:$/, "")
      .replace(/-/g, "")
      .toLowerCase(),
  );
}
export function validIcon(name: string) {
  return Object.hasOwn(imports, name);
}
export async function loadFlowIcons(flow: RichNode) {
  const used = new Set<string>();
  const visit = (node: RichNode) => {
    if (node.type === "lucideIcon" && node.attrs?.iconName)
      used.add(node.attrs.iconName);
    node.content?.forEach(visit);
  };
  visit(flow);
  await Promise.all(
    [...used].map((name) => {
      if (data.has(name)) return;
      if (!validIcon(name)) throw new Error(`Unknown Lucide icon: ${name}`);
      let request = pending.get(name);
      if (!request) {
        request = imports[name as IconName]()
          .then((module) => {
            data.set(name, module.__iconData);
          })
          .catch((error) => {
            pending.delete(name);
            throw error;
          });
        pending.set(name, request);
      }
      return request;
    }),
  );
}
function svgNode(node: IconData["node"][number]): DOMOutputSpec {
  const [tag, attributes, children] = node;
  const { key: _key, ...attrs } = attributes;
  return [tag, attrs, ...(children?.map(svgNode) || [])] as DOMOutputSpec;
}
export const InlineIcon = Node.create({
  name: "lucideIcon",
  group: "inline",
  inline: true,
  atom: true,
  addAttributes: () => ({ iconName: { default: "layout-list" } }),
  parseHTML: () => [
    {
      tag: "span[data-lucide-icon]",
      getAttrs: (element) => {
        const name = element.getAttribute("data-lucide-icon");
        return name && validIcon(name) ? { iconName: name } : false;
      },
    },
  ],
  renderHTML({ node }) {
    const name = String(node.attrs.iconName);
    const icon = data.get(name);
    return [
      "span",
      {
        "data-lucide-icon": name,
        class: "inline-lucide",
        role: "img",
        "aria-label": name.replace(/-/g, " "),
      },
      [
        "http://www.w3.org/2000/svg svg",
        {
          xmlns: "http://www.w3.org/2000/svg",
          viewBox: "0 0 24 24",
          width: "1em",
          height: "1em",
          fill: "none",
          stroke: "currentColor",
          "stroke-width": 2,
          "stroke-linecap": "round",
          "stroke-linejoin": "round",
          "aria-hidden": "true",
        },
        ...(icon
          ? icon.node.map(svgNode)
          : [
              [
                "rect",
                { x: 4, y: 4, width: 16, height: 16, rx: 2 },
              ] as DOMOutputSpec,
            ]),
      ],
    ] as DOMOutputSpec;
  },
  markdownTokenizer: {
    name: "lucideIcon",
    level: "inline",
    start: (source) => {
      for (const match of source.matchAll(/:Li[A-Za-z0-9]+:/gi))
        if (iconName(match[0])) return match.index;
      return -1;
    },
    tokenize(source) {
      const match = source.match(/^:Li[A-Za-z0-9]+:/i);
      const name = match && iconName(match[0]);
      return name
        ? { type: "lucideIcon", raw: match![0], iconName: name }
        : undefined;
    },
  },
  parseMarkdown: (token) => ({
    type: "lucideIcon",
    attrs: { iconName: token.iconName },
  }),
  renderMarkdown: (node) =>
    `:Li${String(node.attrs?.iconName)
      .split("-")
      .map((part) => part[0].toUpperCase() + part.slice(1))
      .join("")}:`,
});
