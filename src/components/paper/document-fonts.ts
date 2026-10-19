import { useEffect, useState } from "react";
import type { PaperDocument } from "../../data/model";
import type { DocumentFont } from "../../data/fonts";
import { createClientOnlyFn } from "@tanstack/react-start";

export const loadCustomFont = createClientOnlyFn(async (font: DocumentFont) => {
  const { loadDocumentFont } = await import("../../editor/fonts.client");
  await loadDocumentFont(font);
});

export function useDocumentFonts(doc: PaperDocument) {
  const key = JSON.stringify(doc.customFonts ?? []);
  const [state, setState] = useState({ key: "", error: "" });
  const [revision, setRevision] = useState(0);
  useEffect(() => {
    let active = true;
    setState({ key: "", error: "" });
    Promise.all((doc.customFonts ?? []).map(loadCustomFont))
      .then(() => {
        if (active) setState({ key, error: "" });
      })
      .catch((error) => {
        if (active)
          setState({
            key: "",
            error:
              error instanceof Error
                ? error.message
                : "Fonts could not be loaded.",
          });
      });
    return () => {
      active = false;
    };
  }, [key, revision]);
  return {
    ready: state.key === key,
    error: state.error,
    retry: () => setRevision((value) => value + 1),
  };
}
