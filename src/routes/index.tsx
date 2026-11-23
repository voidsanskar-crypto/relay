import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useRef, useState, type FormEvent } from "react";
import {
  ArrowRight,
  ChevronDown,
  Link as LinkIcon,
  Loader2,
  Menu,
  NotebookText,
  ShieldCheck,
  Users,
  Video,
} from "lucide-react";
import { toast } from "sonner";

import { RelayLogo } from "@/components/relay/RelayLogo";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { createMeeting } from "@/lib/meetings.functions";
import { readRecentRooms, rememberRoom, type RecentRoom } from "@/lib/recent-rooms";
import { extractRoomCode } from "@/lib/room-code";
import { useAccountSession } from "@/hooks/use-account-session";
import { supabase } from "@/integrations/supabase/client";
import landingCss from "@/landing.css?url";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Relay — Less meeting. More momentum." },
      {
        name: "description",
        content:
          "Start a video room in seconds. Share ideas live and let Relay capture the notes, decisions, and next steps.",
      },
      { property: "og:title", content: "Relay — Less meeting. More momentum." },
      { name: "theme-color", content: "#f8f4ed" },
    ],
    links: [{ rel: "stylesheet", href: landingCss }],
  }),
  component: Home,
});

const features = [
  {
    icon: Video,
    title: "Instant rooms",
    text: "Start or join a meeting in seconds, no setup needed.",
  },
  {
    icon: NotebookText,
    title: "Notes, handled",
    text: "Capture key points, decisions, and next steps.",
  },
  {
    icon: Users,
    title: "Share and create",
    text: "Present, brainstorm, and collaborate in real time.",
  },
  {
    icon: ShieldCheck,
    title: "Secure by design",
    text: "Invite your team with a private room link.",
  },
];

const guides = {
  "Why Relay": {
    heading: "A little less meeting admin.",
    intro:
      "Bring your team into one room for the conversation and leave with a record of what comes next.",
    items: [
      ["Gather", "Share a room link. Everyone can join from their browser with a name."],
      ["Collaborate", "Talk face to face, share your screen, or sketch on the same whiteboard."],
      ["Follow through", "Revisit your meeting summary and saved action items after the call."],
    ],
  },
  "How it works": {
    heading: "From invite to action items.",
    intro: "Relay takes you from the first click to your meeting notes in three steps.",
    items: [
      ["Start a room", "Enter an optional meeting name and select Start a room."],
      [
        "Invite your team",
        "Check your camera and microphone in the lobby, then share the room link.",
      ],
      [
        "Meet and review",
        "Use captions and the shared board during the call. Open the summary afterward.",
      ],
    ],
  },
};

function Guide({ label }: { label: keyof typeof guides }) {
  const guide = guides[label];
  return (
    <Dialog>
      <DialogTrigger asChild>
        <button type="button">{label}</button>
      </DialogTrigger>
      <DialogContent className="relay-dialog">
        <DialogTitle>{guide.heading}</DialogTitle>
        <DialogDescription>{guide.intro}</DialogDescription>
        <ol>
          {guide.items.map(([title, copy]) => (
            <li key={title}>
              <strong>{title}</strong>
              <p>{copy}</p>
            </li>
          ))}
        </ol>
      </DialogContent>
    </Dialog>
  );
}

function Home() {
  const navigate = useNavigate();
  const create = useServerFn(createMeeting);
  const session = useAccountSession();
  const signOut = async () => {
    try {
      const { error } = await supabase.auth.signOut({ scope: "local" });
      if (error) throw error;
    } catch {
      toast.error("Couldn't sign out. Please try again.");
    }
  };
  const titleField = useRef<HTMLInputElement>(null);
  const inviteField = useRef<HTMLInputElement>(null);
  const [title, setTitle] = useState("");
  const [joinInput, setJoinInput] = useState("");
  const [creating, setCreating] = useState(false);
  const [recent, setRecent] = useState<RecentRoom[]>([]);
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    setRecent(readRecentRooms());
  }, []);

  const startRoom = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (creating) return;
    setCreating(true);
    try {
      const meeting = await create({ data: { title: title.trim() || undefined } });
      rememberRoom({ code: meeting.code, title: meeting.title });
      await navigate({ to: "/r/$code", params: { code: meeting.code } });
    } catch (err) {
      console.error(err);
      toast.error("Couldn't start a room. Please try again.");
      setCreating(false);
    }
  };

  const join = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const code = extractRoomCode(joinInput);
    if (!code) {
      inviteField.current?.focus();
      toast.error("That doesn't look like a Relay link or room code.");
      return;
    }
    void navigate({ to: "/r/$code", params: { code } });
  };

  return (
    <div className="relay-home">
      <div className="home-frame">
        <header className="home-header">
          <Link to="/" aria-label="Relay home" className="home-logo">
            <RelayLogo />
          </Link>
          <button
            type="button"
            className="menu-toggle"
            aria-label="Navigation menu"
            aria-expanded={menuOpen}
            aria-controls="relay-navigation"
            onClick={() => setMenuOpen(!menuOpen)}
          >
            <Menu />
          </button>
          <nav
            id="relay-navigation"
            className={menuOpen ? "home-nav is-open" : "home-nav"}
            aria-label="Main navigation"
            onKeyDown={(event) => {
              if (event.key === "Escape") {
                setMenuOpen(false);
                document.querySelector<HTMLButtonElement>(".menu-toggle")?.focus();
              }
            }}
          >
            {session ? (
              <button className="mobile-account-link" type="button" onClick={signOut}>
                Sign out
              </button>
            ) : (
              <Link className="mobile-account-link" to="/login">
                Log in
              </Link>
            )}
            <Guide label="Why Relay" />
            <a href="#features" onClick={() => setMenuOpen(false)}>
              Features <ChevronDown size={15} />
            </a>
            <Guide label="How it works" />
            {recent.length > 0 && (
              <a href="#recent-rooms" onClick={() => setMenuOpen(false)}>
                My rooms
              </a>
            )}
          </nav>
          <div className="home-actions">
            {session ? (
              <>
                <button type="button" className="join-shortcut" onClick={signOut}>
                  Sign out
                </button>
                <button
                  type="button"
                  className="get-started"
                  onClick={() => titleField.current?.focus()}
                >
                  Start a room <ArrowRight />
                </button>
              </>
            ) : (
              <>
                <Link className="join-shortcut" to="/login">
                  Log in
                </Link>
                <Link className="get-started" to="/signup">
                  Get started <ArrowRight />
                </Link>
              </>
            )}
          </div>
        </header>

        <main>
          <section className="home-hero" aria-labelledby="hero-title">
            <div className="hero-copy">
              <p className="home-eyebrow">
                <span /> Meetings that move work forward
              </p>
              <h1 id="hero-title">
                Less meeting.
                <br />
                More <mark>momentum.</mark>
              </h1>
              <p className="hero-description">
                Start a room in seconds. Share ideas live, and let Relay capture the notes,
                decisions, and next steps.
              </p>
              <div className="room-forms">
                <form className="start-form" onSubmit={startRoom}>
                  <label className="home-input">
                    <Video />
                    <input
                      ref={titleField}
                      aria-label="Room name"
                      value={title}
                      onChange={(e) => setTitle(e.target.value)}
                      placeholder="Enter meeting name"
                      maxLength={80}
                    />
                  </label>
                  <button type="submit" disabled={creating} className="start-button">
                    {creating ? "Opening…" : "Start a room"}
                    {creating ? <Loader2 className="animate-spin" /> : <ArrowRight />}
                  </button>
                </form>
                <form className="join-form" onSubmit={join}>
                  <label htmlFor="invite-code">Have an invite?</label>
                  <div className="home-input invite-input">
                    <LinkIcon />
                    <input
                      ref={inviteField}
                      id="invite-code"
                      aria-label="Meeting link or code"
                      value={joinInput}
                      onChange={(e) => setJoinInput(e.target.value)}
                      placeholder="Paste meeting link or code"
                      autoCapitalize="none"
                      spellCheck={false}
                    />
                    <button type="submit">Join</button>
                  </div>
                </form>
              </div>
            </div>
            <img
              className="hero-art"
              src="/relay/design-sync.webp"
              width="1132"
              height="765"
              alt="Illustrated four-person Relay design sync with a shared checklist of meeting notes."
              fetchPriority="high"
            />
          </section>

          <section className="home-features" id="features" aria-label="Relay features">
            {features.map(({ icon: Icon, title: name, text }) => (
              <article className="home-feature" key={name}>
                <span className="feature-icon">
                  <Icon aria-hidden="true" />
                </span>
                <div>
                  <h2>{name}</h2>
                  <p>{text}</p>
                </div>
              </article>
            ))}
          </section>
          {recent.length > 0 && (
            <section id="recent-rooms" className="home-recent" aria-labelledby="recent-title">
              <h2 id="recent-title">Your recent rooms</h2>
              <ul>
                {recent.slice(0, 4).map((room) => (
                  <li key={room.code}>
                    <div>
                      <strong>{room.title}</strong>
                      <small>{room.code}</small>
                    </div>
                    <Link to="/summary/$code" params={{ code: room.code }}>
                      Notes
                    </Link>
                    <Link to="/r/$code" params={{ code: room.code }}>
                      Rejoin <ArrowRight size={16} />
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </main>
      </div>
    </div>
  );
}
