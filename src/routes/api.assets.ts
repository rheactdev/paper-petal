import { createFileRoute } from "@tanstack/react-router";
export const Route = createFileRoute("/api/assets")({
  server: {
    handlers: {
      GET: async () =>
        (await import("../data/user-assets.server")).listUserAssets(),
      POST: async ({ request }) =>
        (await import("../data/user-assets.server")).uploadUserAsset(request),
    },
  },
});
