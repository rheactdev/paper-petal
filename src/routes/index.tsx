import { createFileRoute } from "@tanstack/react-router";
import { getTemplates } from "../data/functions";
import { Library } from "../components/paper/library";
export const Route = createFileRoute("/")({
  ssr: true,
  loader: () => getTemplates(),
  component: () => <Library templates={Route.useLoaderData()} />,
});
