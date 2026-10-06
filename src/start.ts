import { createStart, createCsrfMiddleware } from "@tanstack/react-start";

export const startInstance = createStart(() => ({
  requestMiddleware: [
    createCsrfMiddleware({
      filter: ({ request }) =>
        !["GET", "HEAD", "OPTIONS"].includes(request.method),
    }),
  ],
}));
