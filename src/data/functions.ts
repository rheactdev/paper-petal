import { createServerFn } from "@tanstack/react-start";
export const getTemplates = createServerFn({ method: "GET" }).handler(
  async () => {
    const { templates } = await import("./templates.server");
    return templates;
  },
);
