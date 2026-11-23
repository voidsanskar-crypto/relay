import { useEffect, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { ListChecks, Loader2, MessageCircleQuestion, Mic, Plus, ScrollText, Sparkles, WandSparkles } from "lucide-react";

import { SummaryView } from "@/components/relay/SummaryView";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { askMeetingAssistant, generateMeetingSummary } from "@/lib/meetings.functions";
import type { MeetingNote, MeetingSummary, TranscriptSegment } from "@/lib/meeting/types";
import type { Caption } from "@/lib/meeting/use-meeting-session";
import { cn } from "@/lib/utils";

type Tab = "transcript" | "ask" | "notes" | "summary";
type QA = { id: string; question: string; answer?: string; error?: string };

const QUICK_QUESTIONS = ["What did I miss?", "What decisions have we made?", "Who owns what so far?"];

export function AssistantPanel({
  code,
  transcript,
  captions,
  transcribeEnabled,
  onTranscribeChange,
  transcriberStatus,
  notes,
  onAddNote,
}: {
  code: string;
  notes: MeetingNote[];
  /** Saves a typed note; resolves false when it couldn't be saved. */
  onAddNote: (content: string) => Promise<boolean>;
  transcript: TranscriptSegment[];
  captions: Record<string, Caption>;
  transcribeEnabled: boolean;
  onTranscribeChange: (on: boolean) => void;
  transcriberStatus: "unsupported" | "idle" | "listening" | "blocked";
}) {
  const [tab, setTab] = useState<Tab>("transcript");
  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex gap-1 border-b border-border px-3 py-2">
        {(
          [
            ["transcript", "Transcript", ScrollText],
            ["ask", "Catch up", MessageCircleQuestion],
            ["notes", notes.length ? `Notes · ${notes.length}` : "Notes", ListChecks],
            ["summary", "Summary", WandSparkles],
          ] as const
        ).map(([id, label, Icon]) => (
          <button
            key={id}
            type="button"
            onClick={() => setTab(id)}
            className={cn(
              "flex flex-1 items-center justify-center gap-1.5 rounded-lg px-2 py-1.5 text-xs font-medium transition-colors",
              tab === id ? "bg-accent text-foreground" : "text-muted-foreground hover:text-foreground",
            )}
          >
            <Icon className="size-3.5" /> {label}
          </button>
        ))}
      </div>
      <div className="min-h-0 flex-1">
        {tab === "transcript" && (
          <TranscriptTab
            transcript={transcript}
            captions={captions}
            enabled={transcribeEnabled}
            onChange={onTranscribeChange}
            status={transcriberStatus}
          />
        )}
        {tab === "ask" && <AskTab code={code} hasRecord={transcript.length > 0} />}
        {tab === "notes" && <NotesTab notes={notes} onAdd={onAddNote} />}
        {tab === "summary" && <SummaryTab code={code} />}
      </div>
    </div>
  );
}

function TranscriptTab({
  transcript,
  captions,
  enabled,
  onChange,
  status,
}: {
  transcript: TranscriptSegment[];
  captions: Record<string, Caption>;
  enabled: boolean;
  onChange: (on: boolean) => void;
  status: "unsupported" | "idle" | "listening" | "blocked";
}) {
  const endRef = useRef<HTMLDivElement>(null);
  const [seenAtMount] = useState(() => new Set(transcript.map((s) => s.id)));
  const live = Object.entries(captions);
  useEffect(() => {
    endRef.current?.scrollIntoView({ block: "end" });
  }, [transcript.length, live.length]);

  return (
    <div className="flex h-full min-h-0 flex-col">
      <label className="flex items-center justify-between gap-3 border-b border-border px-4 py-3">
        <span className="flex items-center gap-2 text-sm">
          <Mic className={cn("size-4", status === "listening" ? "text-live" : "text-muted-foreground")} />
          <span>
            <span className="block font-medium">Transcribe my voice</span>
            <span className="block text-xs text-muted-foreground">
              {status === "unsupported"
                ? "Your browser can't transcribe — try Chrome or Edge"
                : status === "blocked"
                  ? "Speech recognition was blocked by the browser"
                  : status === "listening"
                    ? "Listening — your words feed the AI notes"
                    : "Off — your words won't appear in the notes"}
            </span>
          </span>
        </span>
        <Switch
          checked={enabled && status !== "unsupported"}
          onCheckedChange={onChange}
          disabled={status === "unsupported"}
          aria-label="Transcribe my voice"
        />
      </label>
      <div className="min-h-0 flex-1 space-y-3 overflow-y-auto px-4 py-4 text-sm">
        {transcript.length === 0 && live.length === 0 && (
          <p className="pt-8 text-center text-muted-foreground">
            The live transcript appears here as people talk.
          </p>
        )}
        {transcript.map((s) => (
          <div key={s.id} className={cn(!seenAtMount.has(s.id) && "animate-rise-in")}>
            <p className="text-[11px] text-muted-foreground">
              <span className="font-medium text-foreground/80">{s.speaker}</span> ·{" "}
              {new Date(s.spokenAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
            </p>
            <p className="leading-relaxed">{s.content}</p>
          </div>
        ))}
        {live.map(([id, c]) => (
          <div key={id} className="animate-rise-in opacity-70">
            <p className="text-[11px] text-muted-foreground">
              <span className="font-medium text-foreground/80">{c.name}</span> · speaking
            </p>
            <p className="italic leading-relaxed">{c.text}</p>
          </div>
        ))}
        <div ref={endRef} />
      </div>
    </div>
  );
}

function AskTab({ code, hasRecord }: { code: string; hasRecord: boolean }) {
  const ask = useServerFn(askMeetingAssistant);
  const [items, setItems] = useState<QA[]>([]);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    endRef.current?.scrollIntoView({ block: "end" });
  }, [items]);

  const submit = async (question: string) => {
    const q = question.trim();
    if (!q || busy) return;
    const id = crypto.randomUUID();
    setItems((prev) => [...prev, { id, question: q }]);
    setDraft("");
    setBusy(true);
    try {
      const res = await ask({ data: { code, question: q } });
      setItems((prev) =>
        prev.map((it) => (it.id === id ? ("answer" in res ? { ...it, answer: res.answer } : { ...it, error: res.error }) : it)),
      );
    } catch {
      setItems((prev) => prev.map((it) => (it.id === id ? { ...it, error: "Couldn't reach the assistant." } : it)));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-4 py-4 text-sm">
        {items.length === 0 && (
          <div className="pt-6 text-center">
            <Sparkles className="mx-auto size-6 text-primary" />
            <p className="mt-3 font-medium">Ask anything about this meeting</p>
            <p className="mt-1 text-muted-foreground">
              Answers come from the live transcript and chat{hasRecord ? "" : " — once people start talking"}.
            </p>
          </div>
        )}
        {items.map((it) => (
          <div key={it.id} className="space-y-2">
            <p className="ml-auto w-fit max-w-[85%] rounded-2xl rounded-br-md bg-primary px-3 py-2 text-primary-foreground">
              {it.question}
            </p>
            {it.answer ? (
              <div className="whitespace-pre-wrap rounded-2xl rounded-bl-md bg-muted px-3 py-2 leading-relaxed">
                {it.answer}
              </div>
            ) : it.error ? (
              <p className="rounded-2xl border border-destructive/40 bg-destructive/10 px-3 py-2">{it.error}</p>
            ) : (
              <p className="flex items-center gap-2 text-muted-foreground">
                <Loader2 className="size-4 animate-spin" /> Reading the meeting…
              </p>
            )}
          </div>
        ))}
        <div ref={endRef} />
      </div>
      <div className="space-y-2 border-t border-border p-3">
        <div className="flex flex-wrap gap-1.5">
          {QUICK_QUESTIONS.map((q) => (
            <button
              key={q}
              type="button"
              disabled={busy}
              onClick={() => void submit(q)}
              className="rounded-full border border-border px-2.5 py-1 text-xs text-muted-foreground transition-colors hover:border-primary/50 hover:text-foreground disabled:opacity-50"
            >
              {q}
            </button>
          ))}
        </div>
        <form
          className="flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            void submit(draft);
          }}
        >
          <Input
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder="Ask the assistant"
            maxLength={1000}
            className="bg-background/60"
            aria-label="Question for the assistant"
          />
          <Button type="submit" size="icon" disabled={busy || !draft.trim()} aria-label="Ask">
            {busy ? <Loader2 className="animate-spin" /> : <Sparkles />}
          </Button>
        </form>
      </div>
    </div>
  );
}

function NotesTab({ notes, onAdd }: { notes: MeetingNote[]; onAdd: (content: string) => Promise<boolean> }) {
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [seenAtMount] = useState(() => new Set(notes.map((n) => n.id)));
  const endRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    endRef.current?.scrollIntoView({ block: "end" });
  }, [notes.length]);

  const submit = async () => {
    const text = draft.trim();
    if (!text || busy) return;
    setBusy(true);
    const ok = await onAdd(text);
    setBusy(false);
    if (ok) setDraft("");
  };

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="min-h-0 flex-1 space-y-2 overflow-y-auto px-4 py-4 text-sm">
        {notes.length === 0 && (
          <div className="pt-6 text-center">
            <ListChecks className="mx-auto size-6 text-primary" />
            <p className="mt-3 font-medium">No notes yet</p>
            <p className="mt-1 text-muted-foreground">
              When someone commits to something, the AI suggests it as an action item — tap “Add to notes” to keep
              it here. Notes are shared with everyone and feed the summary.
            </p>
          </div>
        )}
        {notes.map((n) => (
          <div
            key={n.id}
            className={cn(
              "flex gap-3 rounded-xl border border-border bg-card p-3 shadow-tile",
              !seenAtMount.has(n.id) && "animate-rise-in",
            )}
          >
            <span className="mt-0.5 size-4 shrink-0 rounded-md border-2 border-primary/50" aria-hidden />
            <div className="min-w-0">
              <p className="font-medium leading-snug">{n.content}</p>
              <p className="mt-0.5 text-[11px] text-muted-foreground">
                {[n.owner, n.due && `due ${n.due}`, `added by ${n.addedBy}`].filter(Boolean).join(" · ")}
              </p>
            </div>
          </div>
        ))}
        <div ref={endRef} />
      </div>
      <form
        className="flex gap-2 border-t border-border p-3"
        onSubmit={(e) => {
          e.preventDefault();
          void submit();
        }}
      >
        <Input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="Add a note for everyone…"
          maxLength={500}
          className="bg-background/60"
          aria-label="New note"
        />
        <Button type="submit" size="icon" disabled={!draft.trim() || busy} aria-label="Add note">
          {busy ? <Loader2 className="animate-spin" /> : <Plus />}
        </Button>
      </form>
    </div>
  );
}

function SummaryTab({ code }: { code: string }) {
  const generate = useServerFn(generateMeetingSummary);
  const [summary, setSummary] = useState<MeetingSummary | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const run = async () => {
    setBusy(true);
    setError(null);
    try {
      const res = await generate({ data: { code } });
      if ("summary" in res) setSummary(res.summary);
      else setError(res.error);
    } catch {
      setError("Couldn't reach the assistant.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="h-full overflow-y-auto px-4 py-4">
      {summary && <SummaryView summary={summary} compact />}
      {!summary && !busy && (
        <div className="pt-6 text-center text-sm">
          <WandSparkles className="mx-auto size-6 text-primary" />
          <p className="mt-3 font-medium">Summary so far</p>
          <p className="mt-1 text-muted-foreground">
            Get the gist, decisions and action items without leaving the call. A full summary is also ready
            when you hang up.
          </p>
        </div>
      )}
      {error && (
        <p className="mt-4 rounded-xl border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm">{error}</p>
      )}
      <Button onClick={run} disabled={busy} className="mt-5 w-full" variant={summary ? "secondary" : "default"}>
        {busy ? <Loader2 className="animate-spin" /> : <WandSparkles />}
        {busy ? "Summarizing…" : summary ? "Refresh summary" : "Summarize so far"}
      </Button>
    </div>
  );
}
