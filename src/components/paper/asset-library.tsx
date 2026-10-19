import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { useAuth } from "../../auth/provider";
import { assetFileURL, type UserAsset } from "../../data/user-assets";

type Library = {
  assets: UserAsset[];
  error: string;
  loading: boolean;
  refresh: () => Promise<void>;
  fetchAsset: (asset: UserAsset) => Promise<Blob>;
  signal: AbortSignal | undefined;
};
const LibraryContext = createContext<Library | null>(null);
export async function responseError(response: Response) {
  const data = await response.json().catch(() => ({}));
  return new Error(
    data.message || "Your asset library couldn’t be reached. Please try again.",
  );
}
export function AssetLibraryProvider({ children }: { children: ReactNode }) {
  const { session } = useAuth();
  const identity = session.user?.id;
  const currentIdentity = useRef(identity);
  currentIdentity.current = identity;
  const controller = useRef<AbortController | null>(null);
  const revision = useRef(0);
  const [state, setState] = useState<{
    owner?: string;
    assets: UserAsset[];
    loading: boolean;
    error: string;
  }>({ assets: [], loading: false, error: "" });
  const refresh = useCallback(async () => {
    if (!identity) return;
    const version = ++revision.current;
    const signal = controller.current?.signal;
    setState((value) => ({
      ...value,
      owner: identity,
      loading: true,
      error: "",
    }));
    try {
      const response = await fetch("/api/assets", { signal });
      if (!response.ok) throw await responseError(response);
      const assets = (await response.json()) as UserAsset[];
      if (
        currentIdentity.current === identity &&
        version === revision.current &&
        !signal?.aborted
      )
        setState({ owner: identity, assets, loading: false, error: "" });
    } catch (error) {
      if (
        currentIdentity.current === identity &&
        version === revision.current &&
        !signal?.aborted
      )
        setState((value) => ({
          ...value,
          loading: false,
          error:
            error instanceof Error
              ? error.message
              : "Your asset library couldn’t be loaded.",
        }));
    }
  }, [identity]);
  useEffect(() => {
    revision.current++;
    controller.current = new AbortController();
    setState({ owner: identity, assets: [], loading: !!identity, error: "" });
    void refresh();
    window.addEventListener("focus", refresh);
    return () => {
      controller.current?.abort();
      window.removeEventListener("focus", refresh);
    };
  }, [identity, refresh]);
  const fetchAsset = useCallback(
    async (asset: UserAsset) => {
      if (!identity || currentIdentity.current !== identity)
        throw new Error("Sign in to use your asset library.");
      const signal = controller.current?.signal;
      const response = await fetch(assetFileURL(asset.id), { signal });
      if (!response.ok) throw await responseError(response);
      const blob = await response.blob();
      if (currentIdentity.current !== identity || signal?.aborted)
        throw new Error("The account changed. Select this asset again.");
      return blob;
    },
    [identity],
  );
  return (
    <LibraryContext.Provider
      value={{
        assets: state.owner === identity ? state.assets : [],
        error: state.owner === identity ? state.error : "",
        loading: state.owner === identity ? state.loading : !!identity,
        refresh,
        fetchAsset,
        signal: controller.current?.signal,
      }}
    >
      {children}
    </LibraryContext.Provider>
  );
}
export function useAssetLibrary() {
  const library = useContext(LibraryContext);
  if (!library) throw new Error("Asset controls require AssetLibraryProvider.");
  return library;
}
