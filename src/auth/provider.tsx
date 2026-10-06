import {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { getSession } from "./functions";
import type { AuthSession } from "./model";
const AuthContext = createContext<{
  session: AuthSession;
  update: (session: AuthSession) => void;
  refresh: () => Promise<void>;
} | null>(null);
export function AuthProvider({
  initialSession,
  children,
}: {
  initialSession: AuthSession;
  children: ReactNode;
}) {
  const [session, setSession] = useState(initialSession);
  const channel = useRef<BroadcastChannel | null>(null);
  const revision = useRef(0);
  useEffect(() => {
    revision.current++;
    setSession(initialSession);
  }, [initialSession]);
  async function refresh() {
    const current = ++revision.current;
    try {
      const next = await getSession();
      if (current === revision.current) setSession(next);
    } catch {
      if (current === revision.current)
        setSession((previous) => ({ ...previous, unavailable: true }));
    }
  }
  useEffect(() => {
    const onFocus = () => {
      void refresh();
    };
    window.addEventListener("focus", onFocus);
    if (typeof BroadcastChannel !== "undefined") {
      const authChannel = new BroadcastChannel("paper-petal-account");
      channel.current = authChannel;
      authChannel.onmessage = onFocus;
    }
    return () => {
      window.removeEventListener("focus", onFocus);
      channel.current?.close();
      channel.current = null;
    };
  }, []);
  function update(next: AuthSession) {
    revision.current++;
    setSession(next);
    channel.current?.postMessage("session-changed");
  }
  return (
    <AuthContext.Provider value={{ session, update, refresh }}>
      {children}
    </AuthContext.Provider>
  );
}
export function useAuth() {
  const auth = useContext(AuthContext);
  if (!auth) throw new Error("Account controls require AuthProvider.");
  return auth;
}
