import { Link, useNavigate, useRouter } from "@tanstack/react-router";
import { useEffect, useRef, useState, type FormEvent } from "react";
import {
  ArrowLeft,
  ArrowRight,
  Eye,
  EyeOff,
  Flower2,
  ShieldCheck,
} from "lucide-react";
import { signIn, signUp } from "../../auth/functions";
import { signInSchema, signUpSchema } from "../../auth/model";
import { useAuth } from "../../auth/provider";
import { Brand } from "./library";
export function AuthForm({
  mode,
  returnTo = "/",
}: {
  mode: "sign-in" | "sign-up";
  returnTo?: "/" | "/calendar";
}) {
  const signup = mode === "sign-up";
  const { session, update } = useAuth();
  const navigate = useNavigate(),
    router = useRouter();
  const [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const [visible, setVisible] = useState(false);
  const [hydrated, setHydrated] = useState(false);
  useEffect(() => {
    setHydrated(true);
  }, []);
  const errorRef = useRef<HTMLDivElement>(null);
  function showError(message: string) {
    setError(message);
    requestAnimationFrame(() => errorRef.current?.focus());
  }
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    const form = new FormData(event.currentTarget);
    const values = {
      email: String(form.get("email") || ""),
      password: String(form.get("password") || ""),
      name: String(form.get("name") || ""),
      passwordConfirm: String(form.get("passwordConfirm") || ""),
    };
    const validation = signup
      ? signUpSchema.safeParse(values)
      : signInSchema.safeParse(values);
    if (!validation.success) {
      showError(validation.error.issues[0].message);
      return;
    }
    setBusy(true);
    setError("");
    try {
      const result = signup
        ? await signUp({ data: signUpSchema.parse(values) })
        : await signIn({ data: signInSchema.parse(values) });
      if (!result.ok) {
        showError(result.message);
        return;
      }
      update({ user: result.user, unavailable: false });
      await router.invalidate();
      await navigate({ to: returnTo });
    } catch {
      showError("We couldn’t complete that request. Please try again.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="auth-shell">
      <header className="auth-header">
        <Brand />
        <Link to="/" className="back-library">
          <ArrowLeft size={15} /> Back to your studio
        </Link>
      </header>
      <main className="auth-layout">
        <aside className="auth-story">
          <div className="overline">
            <span /> A LITTLE SPACE FOR YOU
          </div>
          <h1>
            Make room
            <br />
            for <em>lovely things.</em>
          </h1>
          <p>A few words. A favourite photo. A page that feels like you.</p>
          <div className="auth-paper" aria-hidden="true">
            <span className="auth-tape" />
            <Flower2 size={38} strokeWidth={1} />
            <span>
              little moments,
              <br />
              <i>beautifully kept.</i>
            </span>
            <div className="auth-paper-lines" />
          </div>
          <div className="auth-local-note">
            <ShieldCheck size={19} />
            <p>
              Your pages stay on this device.
              <br />
              Keep .petal backups to take them with you.
            </p>
          </div>
        </aside>
        <section className="auth-card" aria-labelledby="auth-title">
          <div className="overline">YOUR PAPER & PETAL ACCOUNT</div>
          <h2 id="auth-title">
            {session.user
              ? "You’re signed in."
              : signup
                ? "A fresh beginning."
                : "Welcome back."}
          </h2>
          {session.user ? (
            <>
              <p>
                Signed in as <strong>{session.user.email}</strong>.
              </p>
              <Link to={returnTo} className="button primary auth-submit">
                {returnTo === "/calendar"
                  ? "Go to calendar spreads"
                  : "Go to your studio"}{" "}
                <ArrowRight size={16} />
              </Link>
            </>
          ) : (
            <>
              <p>
                {signup
                  ? "Create an account. Make a little space for yourself."
                  : "Sign in with your email and password."}
              </p>
              <form
                method="post"
                onSubmit={submit}
                noValidate
                aria-busy={busy || !hydrated}
              >
                {!hydrated && (
                  <p role="status" className="auth-hint">
                    Preparing secure sign-in…
                  </p>
                )}
                {error && (
                  <div
                    ref={errorRef}
                    tabIndex={-1}
                    className="auth-error"
                    role="alert"
                  >
                    {error}
                  </div>
                )}
                {signup && (
                  <label>
                    Your name <span className="auth-optional">(optional)</span>
                    <input
                      name="name"
                      autoComplete="name"
                      maxLength={80}
                      disabled={busy || !hydrated}
                      placeholder="What should we call you?"
                    />
                  </label>
                )}
                <label>
                  Email address
                  <input
                    name="email"
                    type="email"
                    autoComplete="email"
                    inputMode="email"
                    required
                    maxLength={254}
                    disabled={busy || !hydrated}
                    placeholder="you@example.com"
                  />
                </label>
                <div>
                  <label htmlFor="account-password">Password</label>
                  <div className="auth-password">
                    <input
                      id="account-password"
                      name="password"
                      type={visible ? "text" : "password"}
                      autoComplete={
                        signup ? "new-password" : "current-password"
                      }
                      required
                      minLength={signup ? 8 : 1}
                      maxLength={71}
                      disabled={busy || !hydrated}
                      aria-describedby={
                        signup ? "password-guidance" : undefined
                      }
                    />
                    <button
                      type="button"
                      aria-label={visible ? "Hide password" : "Show password"}
                      aria-pressed={visible}
                      onClick={() => setVisible(!visible)}
                    >
                      {visible ? <EyeOff size={18} /> : <Eye size={18} />}
                    </button>
                  </div>
                  {signup && (
                    <span className="auth-hint" id="password-guidance">
                      8–71 characters. Spaces are welcome.
                    </span>
                  )}
                </div>
                {signup && (
                  <label>
                    Confirm password
                    <input
                      name="passwordConfirm"
                      type={visible ? "text" : "password"}
                      autoComplete="new-password"
                      required
                      maxLength={71}
                      disabled={busy || !hydrated}
                    />
                  </label>
                )}
                <button
                  className="button primary auth-submit"
                  type="submit"
                  disabled={busy || !hydrated}
                >
                  {busy
                    ? signup
                      ? "Creating your account…"
                      : "Signing in…"
                    : signup
                      ? "Create account"
                      : "Sign in"}
                  <ArrowRight size={16} />
                </button>
              </form>
              <p className="auth-switch">
                {signup ? "Already have an account?" : "New to Paper & Petal?"}{" "}
                <Link
                  to={signup ? "/sign-in" : "/sign-up"}
                  search={{ returnTo }}
                >
                  {signup ? "Sign in" : "Create an account"}
                </Link>
              </p>
            </>
          )}
          <div className="auth-storage-note">
            <ShieldCheck size={16} />
            <p>
              Signing in is optional. Documents and pictures are saved in this
              browser and aren’t synced to your account. They remain on this
              device after signing out.
            </p>
          </div>
        </section>
      </main>
      <footer className="auth-footer">
        A studio that works at your pace. <Flower2 size={14} />
      </footer>
    </div>
  );
}
