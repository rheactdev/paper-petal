import { createFileRoute } from "@tanstack/react-router";
export const Route = createFileRoute("/api/assets/$assetId")({
  server: {
    handlers: {
      GET: async ({ params }) =>
        (await import("../data/user-assets.server")).downloadUserAsset(
          params.assetId,
        ),
    },
  },
});
