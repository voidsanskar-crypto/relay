import { Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState, type FormEvent } from "react";
import {
  ArrowRight,
  Eye,
  EyeOff,
  Globe2,
  LockKeyhole,
  Mail,
  MessageSquare,
  MonitorUp,
  Pencil,
  Users,
  NotebookText,
} from "lucide-react";
import { RelayLogo, RelayMark } from "@/components/relay/RelayLogo";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { supabase } from "@/integrations/supabase/client";
import { useAccountSession } from "@/hooks/use-account-session";

const benefits = [
  { icon: Users, text: "Meet your team in a private room" },
  { icon: MonitorUp, text: "Share your screen and collaborate" },
  { icon: Pencil, text: "Sketch together on a shared whiteboard" },
  { icon: MessageSquare, text: "Chat during your meeting" },
  { icon: NotebookText, text: "Revisit notes and action items" },
];

function GoogleMark() {
  return (
    <svg viewBox="0 0 48 48" aria-hidden="true" width="28" height="28">
      <path
        fill="#4285f4"
        d="M43.6 24.5c0-1.4-.1-2.8-.4-4.2H24v8h11a9.5 9.5 0 0 1-4.1 6.2v5.1h6.6c3.9-3.6 6.1-8.8 6.1-15.1Z"
      />
      <path
        fill="#34a853"
        d="M24 44c5.5 0 10.1-1.8 13.5-4.9l-6.6-5.1c-1.8 1.2-4.1 2-6.9 2-5.3 0-9.8-3.6-11.4-8.4H5.8v5.2A20.4 20.4 0 0 0 24 44Z"
      />
      <path fill="#fbbc05" d="M12.6 27.6a12 12 0 0 1 0-7.2v-5.2H5.8a20 20 0 0 0 0 17.6Z" />
      <path
        fill="#ea4335"
        d="M24 12c3 0 5.6 1 7.6 3l5.8-5.7A19.5 19.5 0 0 0 24 4a20.4 20.4 0 0 0-18.2 11.2l6.8 5.2C14.2 15.6 18.7 12 24 12Z"
      />
    </svg>
  );
}

export function AccountPage({ mode }: { mode: "login" | "signup" }) {
  const signup = mode === "signup";
  const session = useAccountSession();
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [visible, setVisible] = useState(false);
  const [pending, setPending] = useState<"email" | "google" | null>(null);
  const [error, setError] = useState("");
  const [sentTo, setSentTo] = useState("");

  useEffect(() => {
    if (session) void navigate({ to: "/", replace: true });
  }, [session, navigate]);
  useEffect(() => {
    const url = new URL(window.location.href);
    const hash = new URLSearchParams(url.hash.slice(1));
    const failure = hash.get("error_description") || url.searchParams.get("error_description");
    if (failure) setError(failure);
  }, []);

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (pending) return;
    setPending("email");
    setError("");
    const address = email.trim();
    try {
      const response = signup
        ? await supabase.auth.signUp({
            email: address,
            password,
            options: { emailRedirectTo: window.location.origin + "/login" },
          })
        : await supabase.auth.signInWithPassword({ email: address, password });
      if (response.error) throw response.error;
      setPassword("");
      if (signup && !response.data.session) setSentTo(address);
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "We couldn't reach Relay. Please try again.",
      );
    } finally {
      setPending(null);
    }
  };

  const google = async () => {
    if (pending) return;
    setPending("google");
    setError("");
    try {
      const { error: failure } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: { redirectTo: window.location.origin + "/login" },
      });
      if (failure) throw failure;
    } catch (cause) {
      setPending(null);
      setError(
        cause instanceof Error
          ? cause.message
          : "Google sign-in is unavailable. Try email instead.",
      );
    }
  };

  return (
    <div className="account-page">
      <header className="account-header">
        <Link to="/" aria-label="Relay home">
          <RelayLogo />
        </Link>
        <nav aria-label="Account navigation">
          <span className="account-switch">
            <span>{signup ? "Already have an account?" : "New to Relay?"}</span>{" "}
            <Link to={signup ? "/login" : "/signup"}>{signup ? "Sign In" : "Sign Up"}</Link>
          </span>
          <Dialog>
            <DialogTrigger asChild>
              <button type="button" className="support-trigger">
                Support
              </button>
            </DialogTrigger>
            <DialogContent>
              <DialogTitle>Account help</DialogTitle>
              <DialogDescription>
                Sign in with the method you used to create your account. If you signed up with
                email, check your inbox and spam folder for your confirmation link. You can also
                join a meeting from the homepage with an invite link or room code.
              </DialogDescription>
            </DialogContent>
          </Dialog>
          <span className="account-language" lang="en">
            <Globe2 size={16} /> English
          </span>
        </nav>
      </header>
      <main className="account-layout">
        <aside className="account-aside" aria-label="Relay features">
          <div className="account-aside-inner">
            <img
              src="/relay/account-studio.webp"
              width="585"
              height="381"
              alt="Illustrated laptop with four Relay participants beside a plant."
            />
            <section className="account-benefits">
              <h2>{signup ? "Create your free Relay account" : "Your Relay workspace"}</h2>
              <ul>
                {benefits.map(({ icon: Icon, text }) => (
                  <li key={text}>
                    <span>
                      <Icon aria-hidden="true" />
                    </span>
                    {text}
                  </li>
                ))}
              </ul>
            </section>
          </div>
        </aside>
        <section className="account-main" aria-labelledby="account-title">
          <div className="account-content">
            <RelayMark className="account-mark" />
            {sentTo ? (
              <div className="confirmation" role="status">
                <h1 id="account-title">
                  Check your <em>inbox.</em>
                </h1>
                <p>
                  Open the confirmation link sent to <strong>{sentTo}</strong> to finish signing up.
                </p>
                <Link className="account-submit" to="/login">
                  Go to sign in <ArrowRight />
                </Link>
              </div>
            ) : (
              <>
                <h1 id="account-title">
                  {signup ? "Sign Up for" : "Sign In to"} <em>Relay</em>
                </h1>
                <p className="account-intro">
                  {signup
                    ? "Create your free account and start meeting, collaborating, and sharing instantly."
                    : "Welcome back. Sign in to start your next meeting or join your team."}
                </p>
                <button
                  className="google-button"
                  type="button"
                  onClick={google}
                  disabled={!!pending}
                >
                  <GoogleMark /> {pending === "google" ? "Opening Google…" : "Continue with Google"}
                </button>
                <div className="account-divider">
                  <span />
                  or
                  <span />
                </div>
                <form onSubmit={submit}>
                  <label className="credential">
                    <Mail aria-hidden="true" />
                    <span className="sr-only">Email address</span>
                    <input
                      type="email"
                      autoComplete="email"
                      placeholder="Enter your email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      required
                    />
                  </label>
                  <div className="credential">
                    <LockKeyhole aria-hidden="true" />
                    <label className="sr-only" htmlFor="account-password">
                      Password
                    </label>
                    <input
                      id="account-password"
                      type={visible ? "text" : "password"}
                      autoComplete={signup ? "new-password" : "current-password"}
                      placeholder={signup ? "Create a password" : "Enter your password"}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      required
                      minLength={signup ? 6 : undefined}
                    />
                    <button
                      type="button"
                      className="password-toggle"
                      aria-label={visible ? "Hide password" : "Show password"}
                      aria-pressed={visible}
                      onClick={() => setVisible(!visible)}
                    >
                      {visible ? <EyeOff /> : <Eye />}
                    </button>
                  </div>
                  {error && (
                    <p className="account-error" role="alert">
                      {error}
                    </p>
                  )}
                  <button className="account-submit" disabled={!!pending}>
                    {pending === "email" ? "Please wait…" : signup ? "Sign Up" : "Sign In"}{" "}
                    <ArrowRight />
                  </button>
                </form>
                <p className="account-footer">
                  Have a meeting link?{" "}
                  <Link to="/" hash="invite-code">
                    Join as a guest
                  </Link>
                </p>
              </>
            )}
          </div>
        </section>
      </main>
    </div>
  );
}
