import { queryOptions, useQueryClient, useSuspenseQuery } from "@tanstack/react-query";
import { createFileRoute, Link, notFound } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useRef, useState } from "react";
import { Copy, ListChecks, Loader2, MessageSquare, RotateCw, ScrollText, Video, WandSparkles } from "lucide-react";
import { toast } from "sonner";

import { RelayLogo } from "@/components/relay/RelayLogo";
import { SummaryView, summaryToMarkdown } from "@/components/relay/SummaryView";
import { Button } from "@/components/ui/button";
import { generateMeetingSummary, getMeetingRecord } from "@/lib/meetings.functions";
import { isValidRoomCode } from "@/lib/room-code";
import { cn } from "@/lib/utils";

const recordQuery = (code: string) =>
  queryOptions({
    queryKey: ["meeting-record", code],
    queryFn: () => getMeetingRecord({ data: { code } }),
  });

export const Route = createFileRoute("/summary/$code")({
  beforeLoad: ({ params }) => {
    if (!isValidRoomCode(params.code)) throw notFound();
  },
  loader: async ({ context, params }) => {
    // Always read fresh after a call so the latest transcript is included.
    await context.queryClient.invalidateQueries({ queryKey: ["meeting-record", params.code] });
    const record = await context.queryClient.ensureQueryData(recordQuery(params.code));
    if (!record) throw notFound();
    return { title: record.meeting.title };
  },
  head: ({ loaderData }) => {
    const title = loaderData?.title ?? "Meeting";
    return {
      meta: [
        { title: `Notes: ${title} · Relay` },
        { name: "description", content: `AI summary, action items and full transcript for “${title}”.` },
        { property: "og:title", content: `Meeting notes — ${title}` },
        { property: "og:description", content: "Summary, decisions, action items and transcript from Relay." },
        { property: "og:type", content: "article" },
        { name: "twitter:card", content: "summary" },
        { name: "robots", content: "noindex" },
      ],
    };
  },
  component: SummaryPage,
  notFoundComponent: () => (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4 text-center">
      <h1 className="font-display text-3xl font-semibold">No notes for this room</h1>
      <Button asChild>
        <Link to="/">Start a new room</Link>
      </Button>
    </div>
  ),
});

function SummaryPage() {
  const { code } = Route.useParams();
  const { data } = useSuspenseQuery(recordQuery(code));
  const queryClient = useQueryClient();
  const generate = useServerFn(generateMeetingSummary);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<"transcript" | "chat" | "notes">(() => "transcript");
  const autoRan = useRef(false);

  const record = data!;
  const hasContent = record.transcript.length > 0 || record.messages.length > 0 || record.notes.length > 0;
  const latest = [...record.transcript.map((t) => t.spokenAt), ...record.messages.map((m) => m.sentAt)].sort().at(-1);
  const stale = !record.summary || (!!latest && !!record.summaryGeneratedAt && latest > record.summaryGeneratedAt);

  const run = async () => {
    setBusy(true);
    setError(null);
    try {
      const res = await generate({ data: { code } });
      if ("summary" in res) {
        queryClient.setQueryData(recordQuery(code).queryKey, (prev) =>
          prev ? { ...prev, summary: res.summary, summaryGeneratedAt: res.generatedAt } : prev,
        );
      } else setError(res.error);
    } catch {
      setError("Couldn't reach the assistant.");
    } finally {
      setBusy(false);
    }
  };

  useEffect(() => {
    if (!autoRan.current && hasContent && stale) {
      autoRan.current = true;
      void run();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasContent, stale]);

  const people = Array.from(new Set([...record.transcript.map((t) => t.speaker), ...record.messages.map((m) => m.sender)]));

  const copy = async () => {
    if (!record.summary) return;
    try {
      await navigator.clipboard.writeText(summaryToMarkdown(record.summary));
      toast.success("Notes copied as Markdown");
    } catch {
      toast.error("Your browser blocked copying. Select the notes and copy them instead.");
    }
  };

  return (
    <div className="grain min-h-screen">
      <header className="mx-auto flex max-w-6xl items-center justify-between px-6 py-5">
        <Link to="/" aria-label="Relay home">
          <RelayLogo />
        </Link>
        <div className="flex gap-2">
          <Button asChild variant="secondary" size="sm">
            <Link to="/r/$code" params={{ code }}>
              <Video /> Rejoin
            </Link>
          </Button>
          <Button asChild size="sm">
            <Link to="/">New room</Link>
          </Button>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-6 pb-20">
        <p className="text-sm text-muted-foreground">
          Meeting notes · {new Date(record.meeting.createdAt).toLocaleDateString([], { dateStyle: "medium" })}
        </p>
        <h1 className="mt-1 font-display text-4xl font-semibold sm:text-5xl">{record.meeting.title}</h1>
        {people.length > 0 && (
          <p className="mt-3 text-sm text-muted-foreground">With {people.join(", ")}</p>
        )}

        <div className="mt-10 grid gap-6 lg:grid-cols-[1.35fr_1fr]">
          <section className="glass-card rounded-3xl p-6 sm:p-8">
            <div className="mb-6 flex items-center justify-between gap-3">
              <h2 className="flex items-center gap-2 text-xs font-semibold uppercase tracking-widest text-primary">
                <WandSparkles className="size-4" /> AI summary
              </h2>
              {record.summary && !busy && (
                <div className="flex gap-1">
                  <Button size="sm" variant="ghost" onClick={copy}>
                    <Copy /> Copy
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => void run()}>
                    <RotateCw /> Regenerate
                  </Button>
                </div>
              )}
            </div>

            {busy && (
              <div className="flex items-center gap-3 py-10 text-muted-foreground">
                <Loader2 className="size-5 animate-spin" /> Writing up the meeting — summary, decisions and action
                items…
              </div>
            )}
            {!busy && record.summary && <SummaryView summary={record.summary} />}
            {!busy && !record.summary && !hasContent && (
              <div className="py-8">
                <p className="font-medium">Nothing was captured in this meeting yet.</p>
                <p className="mt-1 text-sm text-muted-foreground">
                  Summaries are built from the live transcript and chat. Turn on “Transcribe my voice” in the AI
                  panel (Chrome or Edge) and the notes will fill in.
                </p>
              </div>
            )}
            {!busy && !record.summary && hasContent && !error && (
              <Button onClick={() => void run()}>
                <WandSparkles /> Create summary
              </Button>
            )}
            {error && (
              <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm">
                <span>{error}</span>
                <Button size="sm" variant="secondary" onClick={() => void run()}>
                  Try again
                </Button>
              </div>
            )}
          </section>

          <section className="flex max-h-[70vh] min-h-80 flex-col glass-card rounded-3xl">
            <div className="flex gap-1 border-b border-border p-2">
              {(
                [
                  ["transcript", `Transcript · ${record.transcript.length}`, ScrollText],
                  ["chat", `Chat · ${record.messages.length}`, MessageSquare],
                  ["notes", `Notes · ${record.notes.length}`, ListChecks],
                ] as const
              ).map(([id, label, Icon]) => (
                <button
                  key={id}
                  type="button"
                  onClick={() => setTab(id)}
                  className={cn(
                    "flex flex-1 items-center justify-center gap-1.5 rounded-xl px-3 py-2 text-sm font-medium",
                    tab === id ? "bg-accent" : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  <Icon className="size-4" /> {label}
                </button>
              ))}
            </div>
            <div className="min-h-0 flex-1 space-y-3 overflow-y-auto p-5 text-sm">
              {tab === "transcript" &&
                (record.transcript.length ? (
                  record.transcript.map((s) => (
                    <div key={s.id}>
                      <p className="text-[11px] text-muted-foreground">
                        <span className="font-medium text-foreground/80">{s.speaker}</span> ·{" "}
                        {new Date(s.spokenAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                      </p>
                      <p className="leading-relaxed">{s.content}</p>
                    </div>
                  ))
                ) : (
                  <p className="text-muted-foreground">No transcript was recorded.</p>
                ))}
              {tab === "chat" &&
                (record.messages.length ? (
                  record.messages.map((m) => (
                    <div key={m.id}>
                      <p className="text-[11px] text-muted-foreground">
                        <span className="font-medium text-foreground/80">{m.sender}</span> ·{" "}
                        {new Date(m.sentAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                      </p>
                      <p className="whitespace-pre-wrap leading-relaxed">{m.body}</p>
                    </div>
                  ))
                ) : (
                  <p className="text-muted-foreground">No chat messages.</p>
                ))}
              {tab === "notes" &&
                (record.notes.length ? (
                  record.notes.map((n) => (
                    <div key={n.id} className="flex gap-3 rounded-xl border border-border bg-card p-3 shadow-tile">
                      <span className="mt-0.5 size-4 shrink-0 rounded-md border-2 border-primary/50" aria-hidden />
                      <div className="min-w-0">
                        <p className="font-medium leading-snug">{n.content}</p>
                        <p className="mt-0.5 text-[11px] text-muted-foreground">
                          {[n.owner, n.due && `due ${n.due}`, `added by ${n.addedBy}`].filter(Boolean).join(" · ")}
                        </p>
                      </div>
                    </div>
                  ))
                ) : (
                  <p className="text-muted-foreground">No notes were saved during the call.</p>
                ))}
            </div>
          </section>
        </div>
      </main>
    </div>
  );
}

