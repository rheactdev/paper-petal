import { Link, useRouter } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { LogOut, UserRound } from "lucide-react";
import { useAuth } from "../../auth/provider";
import { signOut } from "../../auth/functions";
export function AccountControls({ onSignIn }: { onSignIn?: () => void } = {}) {
  const { session, update, refresh } = useAuth();
  const router = useRouter();
  const [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const [hydrated, setHydrated] = useState(false);
  useEffect(() => {
    setHydrated(true);
  }, []);
  async function logout() {
    setBusy(true);
    setError("");
    try {
      update(await signOut());
      await router.invalidate();
    } catch {
      setError("Couldn’t sign out. Please try again.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="account-controls">
      {session.unavailable ? (
        <button
          className="account-link"
          disabled={!hydrated}
          onClick={() => void refresh()}
        >
          Account unavailable · Retry
        </button>
      ) : session.user ? (
        <>
          <span className="account-person" title={session.user.email}>
            <UserRound size={15} />
            <span>{session.user.name || session.user.email}</span>
          </span>
          <button
            className="account-link"
            aria-label="Sign out"
            disabled={busy || !hydrated}
            onClick={logout}
          >
            <LogOut size={15} />
            <span>{busy ? "Signing out…" : "Sign out"}</span>
          </button>
        </>
      ) : (
        <Link
          className="account-link"
          to="/sign-in"
          onClick={
            onSignIn
              ? (event) => {
                  event.preventDefault();
                  onSignIn();
                }
              : undefined
          }
        >
          <UserRound size={15} /> Sign in
        </Link>
      )}
      {error && (
        <span role="alert" className="account-error">
          {error}
        </span>
      )}
    </div>
  );
}
