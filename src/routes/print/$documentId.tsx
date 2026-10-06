import { createFileRoute, Link } from "@tanstack/react-router";
import { getDocument } from "../../data/storage";
import { PrintPreparation } from "../../components/paper/print";
import { printSearch } from "../../data/print-layout";
export const Route = createFileRoute("/print/$documentId")({
  ssr: false,
  gcTime: 0,
  shouldReload: ({ cause }) => cause === "enter",
  validateSearch: printSearch,
  loader: {
    staleReloadMode: "blocking",
    handler: ({ params }) => getDocument(params.documentId),
  },
  component: PrintPage,
});
function PrintPage() {
  const doc = Route.useLoaderData();
  const settings = Route.useSearch();
  const navigate = Route.useNavigate();
  return doc ? (
    <PrintPreparation
      key={doc.id}
      initial={doc}
      settings={settings}
      onSettingsChange={(search) => {
        void navigate({ search, replace: true, resetScroll: false });
      }}
    />
  ) : (
    <div className="recovery">
      <h1>This document isn’t on this device.</h1>
      <Link to="/">Back to your documents</Link>
    </div>
  );
}
