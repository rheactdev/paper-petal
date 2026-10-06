import { createFileRoute } from "@tanstack/react-router";
export const Route = createFileRoute("/api/google-calendar/callback")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const { finishCalendarLink } =
          await import("../calendar/google.server");
        return finishCalendarLink(request);
      },
    },
  },
});
