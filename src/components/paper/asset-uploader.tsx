import { lazy, Suspense } from "react";
import {
  ClientOnly,
  Link,
  useNavigate,
  useRouterState,
} from "@tanstack/react-router";
import { useAuth } from "../../auth/provider";
import type { AssetKind } from "../../data/user-assets";
import { useAssetLibrary } from "./asset-library";
import { createClientOnlyFn } from "@tanstack/react-start";

const loadPond = createClientOnlyFn(() => import("./asset-uploader.client"));
const Pond = lazy(loadPond);
export function AssetUploader({
  kind,
  beforeSignIn,
}: {
  kind: AssetKind;
  beforeSignIn?: () => Promise<void>;
}) {
  const { session } = useAuth();
  const library = useAssetLibrary();
  const navigate = useNavigate();
  const returnTo = useRouterState({ select: (state) => state.location.href });
  return (
    <div className="asset-upload">
      <p className="asset-upload-description">
        {kind === "font"
          ? "TTF, OTF, WOFF or WOFF2 · up to 10 MB each"
          : "PNG, JPEG or WebP · up to 20 MB each"}
      </p>
      {session.unavailable ? (
        <p role="status">Account service unavailable. Try again shortly.</p>
      ) : session.user ? (
        <ClientOnly fallback={<p role="status">Preparing uploader…</p>}>
          <Suspense fallback={<p role="status">Preparing uploader…</p>}>
            <Pond key={session.user.id} kind={kind} />
          </Suspense>
        </ClientOnly>
      ) : (
        <Link
          to="/sign-in"
          search={{ returnTo }}
          onClick={async (event) => {
            event.preventDefault();
            try {
              await beforeSignIn?.();
              await navigate({ to: "/sign-in", search: { returnTo } });
            } catch {
              /* The editor reports save failures without leaving the document. */
            }
          }}
        >
          Sign in to upload {kind === "font" ? "fonts" : "stickers"}
        </Link>
      )}
      {library.error && (
        <p className="asset-error" role="alert">
          {library.error}{" "}
          <button onClick={() => void library.refresh()}>Retry</button>
        </p>
      )}
    </div>
  );
}
