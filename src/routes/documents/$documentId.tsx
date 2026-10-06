import { createFileRoute, Link } from "@tanstack/react-router";
import { getDocument } from "../../data/storage";
import { editorSearch } from "../../data/model";
import { Workspace } from "../../components/paper/workspace";
export const Route = createFileRoute("/documents/$documentId")({
  ssr: false,
  gcTime: 0,
  shouldReload: ({ cause }) => cause === "enter",
  validateSearch: editorSearch,
  loader: {
    staleReloadMode: "blocking",
    handler: ({ params }) => getDocument(params.documentId),
  },
  component: DocumentEditor,
});
function DocumentEditor() {
  const doc = Route.useLoaderData();
  return doc ? (
    <Workspace key={doc.id} initial={doc} search={Route.useSearch()} />
  ) : (
    <div className="recovery">
      <h1>This document isn’t on this device.</h1>
      <p>
        Return to your library to import a .petal backup or start a new page.
      </p>
      <Link to="/">Back to your documents</Link>
    </div>
  );
}
