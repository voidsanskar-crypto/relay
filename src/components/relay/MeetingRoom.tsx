import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { useServerFn } from "@tanstack/react-start";

import { useIsMobile } from "@/hooks/use-mobile";
import { Bot, MessageSquare, Users, WifiOff, X } from "lucide-react";
import { toast } from "sonner";

import { AssistantPanel } from "@/components/relay/AssistantPanel";
import { ChatPanel } from "@/components/relay/ChatPanel";
import { ControlDock, type SidebarTab } from "@/components/relay/ControlDock";
import { CopyLinkButton } from "@/components/relay/CopyLinkButton";
import { PeoplePanel } from "@/components/relay/PeoplePanel";
import { RelayLogo } from "@/components/relay/RelayLogo";
import { VideoTile, type TileData } from "@/components/relay/VideoTile";
import { SuggestionPills, type PendingSuggestion } from "@/components/relay/SuggestionPills";
import { RemoteAudio } from "@/components/relay/VideoSurface";
import { Whiteboard } from "@/components/relay/Whiteboard";
import { useSpeakingDetector } from "@/lib/media/audio-level";
import { usePushToTalk } from "@/lib/media/use-push-to-talk";
import type { LocalMedia } from "@/lib/media/use-local-media";
import { useSpeechTranscriber } from "@/lib/media/use-speech-transcriber";
import { looksActionable, sameTask } from "@/lib/meeting/action-detect";
import type { ChatMessage, MeetingInfo, MeetingNote, TranscriptSegment } from "@/lib/meeting/types";
import { addMeetingNote, suggestActionItem } from "@/lib/meetings.functions";
import { scoreConnection, selfQuality } from "@/lib/meeting/connection-quality";
import { useMeetingSession } from "@/lib/meeting/use-meeting-session";
import { useSharedBoard } from "@/lib/meeting/use-shared-board";
import { cn } from "@/lib/utils";

function gridColumns(n: number, mobile: boolean) {
  if (n <= 1) return 1;
  if (mobile) return n <= 3 ? 1 : 2;
  if (n <= 4) return 2;
  if (n <= 9) return 3;
  return 4;
}

export function MeetingRoom({
  meeting,
  media,
  name,
  initialMessages,
  initialTranscript,
  initialNotes,
  onLeave,
}: {
  initialNotes: MeetingNote[];
  meeting: MeetingInfo;
  media: LocalMedia;
  name: string;
  initialMessages: ChatMessage[];
  initialTranscript: TranscriptSegment[];
  onLeave: () => void;
}) {
  const [screenTrack, setScreenTrack] = useState<MediaStreamTrack | null>(null);
  const [hand, setHand] = useState(false);
  const [sidebar, setSidebar] = useState<SidebarTab | null>(null);
  const [boardOpen, setBoardOpen] = useState(false);
  const [layout, setLayout] = useState<"grid" | "speaker">("grid");
  const [pinnedId, setPinnedId] = useState<string | null>(null);
  const [captionsOn, setCaptionsOn] = useState(true);
  const [transcribeOn, setTranscribeOn] = useState(true);
  const [unread, setUnread] = useState(0);
  const [startedAt] = useState(() => Date.now());

  const session = useMeetingSession({
    code: meeting.code,
    name,
    audioTrack: media.audioTrack,
    videoTrack: media.videoTrack,
    screenTrack,
    micOn: media.micOn,
    camOn: media.camOn,
    hand,
    initialMessages,
    initialTranscript,
  });

  // Saved notes and AI-spotted action items.
  const [notes, setNotes] = useState<MeetingNote[]>(initialNotes);
  const [suggestions, setSuggestions] = useState<PendingSuggestion[]>([]);
  const addNoteFn = useServerFn(addMeetingNote);
  const suggestFn = useServerFn(suggestActionItem);
  const notesRef = useRef(notes);
  notesRef.current = notes;
  const suggestionsRef = useRef(suggestions);
  suggestionsRef.current = suggestions;

  const mergeNote = useCallback((note: MeetingNote) => {
    setNotes((prev) => (prev.some((n) => n.id === note.id) ? prev : [...prev, note]));
    setSuggestions((prev) => prev.map((s) => (s.id === note.id ? { ...s, status: "added" } : s)));
    setTimeout(() => setSuggestions((prev) => prev.filter((s) => s.id !== note.id)), 1800);
  }, []);
  const dismissSuggestion = useCallback((id: string) => {
    setSuggestions((prev) => prev.filter((s) => s.id !== id));
  }, []);
  const offerSuggestion = useCallback((s: PendingSuggestion) => {
    const known = [...notesRef.current.map((n) => n.content), ...suggestionsRef.current.map((x) => x.task)];
    if (known.some((t) => sameTask(t, s.task))) return false;
    setSuggestions((prev) => [...prev, s]);
    return true;
  }, []);

  const saveNote = async (note: { id: string; content: string; owner: string | null; due: string | null }) => {
    try {
      const saved = await addNoteFn({ data: { code: meeting.code, ...note, addedBy: name } });
      mergeNote(saved);
      session.bus.send({ type: "note", note: saved });
      return true;
    } catch {
      toast.error("Couldn't save that note. Try again.");
      return false;
    }
  };
  const addSuggestionToNotes = (s: PendingSuggestion) => {
    setSuggestions((prev) => prev.map((x) => (x.id === s.id ? { ...x, status: "saving" } : x)));
    void saveNote({ id: s.id, content: s.task, owner: s.owner, due: s.due }).then((ok) => {
      if (!ok) setSuggestions((prev) => prev.map((x) => (x.id === s.id ? { ...x, status: "new" } : x)));
    });
  };

  // Only the speaker's own browser checks their lines, so each line is checked once.
  const lastCheck = useRef(0);
  const checking = useRef(false);
  const transcriptRef = useRef(session.transcript);
  transcriptRef.current = session.transcript;
  const checkForActionItem = async (line: string) => {
    const now = Date.now();
    if (!looksActionable(line) || checking.current || now - lastCheck.current < 4000) return;
    checking.current = true;
    lastCheck.current = now;
    try {
      const recent = transcriptRef.current
        .slice(-6)
        .map((s) => `${s.speaker}: ${s.content}`)
        .join("\n")
        .slice(-2500);
      const item = await suggestFn({ data: { code: meeting.code, speaker: name, line: line.slice(0, 1000), recent } });
      if (!item) return;
      const suggestion: PendingSuggestion = { id: crypto.randomUUID(), ...item, speaker: name, status: "new" };
      if (offerSuggestion(suggestion)) {
        const { status: _status, ...shared } = suggestion;
        session.bus.send({ type: "suggestion", suggestion: shared });
      }
    } catch (err) {
      console.warn("Action item check failed", err);
    } finally {
      checking.current = false;
    }
  };

  const board = useSharedBoard(session.bus, session.selfId, (who) => toast.message(`${who} cleared the board`));

  // Notifications from others: board opened, new chat while panel closed.
  useEffect(() => {
    const unsubscribe = session.bus.subscribe((event) => {
      if (event.type === "suggestion") offerSuggestion({ ...event.suggestion, status: "new" });
      if (event.type === "note") mergeNote(event.note);
      if (event.type === "board-open") {
        toast.message(`${event.name} opened the whiteboard`, {
          action: { label: "Open", onClick: () => setBoardOpen(true) },
        });
      }
    });
    return () => {
      unsubscribe();
    };
  }, [session.bus, offerSuggestion, mergeNote]);
  const sidebarRef = useRef(sidebar);
  sidebarRef.current = sidebar;
  const seenMessages = useRef(session.messages.length);
  useEffect(() => {
    const fresh = session.messages.slice(seenMessages.current);
    seenMessages.current = session.messages.length;
    const fromOthers = fresh.filter((m) => m.senderId !== session.selfId);
    if (fromOthers.length && sidebarRef.current !== "chat") {
      setUnread((u) => u + fromOthers.length);
      const last = fromOthers[fromOthers.length - 1]!;
      toast.message(last.sender, {
        description: last.body.slice(0, 120),
        action: { label: "Reply", onClick: () => setSidebar("chat") },
      });
    }
  }, [session.messages, session.selfId]);
  useEffect(() => {
    if (sidebar === "chat") setUnread(0);
  }, [sidebar]);

  // Hold Space while muted to talk.
  const pushToTalk = usePushToTalk({
    muted: !media.micOn,
    enabled: !!media.audioTrack,
    setMicOn: media.setMicOn,
  });

  const transcriberStatus = useSpeechTranscriber({
    enabled: transcribeOn && media.micOn && !!media.audioTrack,
    onInterim: session.publishCaption,
    onFinal: (text) => {
      session.publishTranscript(text);
      void checkForActionItem(text);
    },
  });

  // Screen sharing
  const canShare = typeof navigator !== "undefined" && !!navigator.mediaDevices?.getDisplayMedia;
  const stopShare = useCallback(() => {
    setScreenTrack((t) => {
      t?.stop();
      return null;
    });
  }, []);
  const toggleShare = async () => {
    if (screenTrack) return stopShare();
    try {
      const stream = await navigator.mediaDevices.getDisplayMedia({ video: { frameRate: 15 }, audio: false });
      const track = stream.getVideoTracks()[0];
      if (!track) return;
      track.contentHint = "detail";
      track.addEventListener("ended", stopShare);
      setScreenTrack(track);
      setBoardOpen(false);
    } catch (err) {
      if (!(err instanceof DOMException && err.name === "NotAllowedError")) {
        toast.error("Couldn't start screen sharing.");
      }
    }
  };
  useEffect(() => () => screenTrack?.stop(), [screenTrack]);

  const toggleBoard = () => {
    setBoardOpen((open) => {
      if (!open) session.bus.send({ type: "board-open", from: session.selfId, name });
      return !open;
    });
  };

  // Tiles
  const selfStream = useMemo(
    () => (screenTrack ? new MediaStream([screenTrack]) : media.previewStream),
    [screenTrack, media.previewStream],
  );
  const tiles: TileData[] = useMemo(() => {
    const remoteQualities = session.participants
      .filter((p) => !p.isSelf)
      .map((p) => session.connectionQuality[p.id] ?? scoreConnection(session.connectionStates[p.id], undefined));
    const list: TileData[] = [
      {
        id: session.selfId,
        name,
        stream: selfStream,
        isSelf: true,
        micOn: media.micOn && !!media.audioTrack,
        camOn: !!screenTrack || (media.camOn && !!media.videoTrack),
        screen: !!screenTrack,
        hand,
        connecting: false,
        quality: selfQuality(session.status, remoteQualities),
      },
    ];
    for (const p of session.participants) {
      if (p.isSelf) continue;
      const state = session.connectionStates[p.id];
      list.push({
        id: p.id,
        name: p.name,
        stream: session.remoteStreams[p.id] ?? null,
        isSelf: false,
        micOn: p.micOn,
        camOn: p.camOn,
        screen: p.screen,
        hand: p.hand,
        connecting: state !== "connected",
        quality: session.connectionQuality[p.id] ?? scoreConnection(state, undefined),
      });
    }
    return list;
  }, [session.participants, session.remoteStreams, session.connectionStates, session.connectionQuality, session.status, session.selfId, name, selfStream, media.micOn, media.camOn, media.audioTrack, media.videoTrack, screenTrack, hand]);

  const audioTracks = useMemo(() => {
    const map: Record<string, MediaStreamTrack | null> = {
      [session.selfId]: media.micOn ? media.audioTrack : null,
    };
    for (const t of tiles) {
      if (!t.isSelf) map[t.id] = t.micOn ? (t.stream?.getAudioTracks()[0] ?? null) : null;
    }
    return map;
  }, [tiles, session.selfId, media.micOn, media.audioTrack]);
  const { levels, active } = useSpeakingDetector(audioTracks);

  // Pinning is local to you: it puts that tile on the big stage until you unpin it or they leave.
  const pinned = tiles.length > 1 ? tiles.find((t) => t.id === pinnedId) : undefined;
  const togglePin = (id: string) => setPinnedId((p) => (p === id ? null : id));
  const pinFor = (id: string) => (tiles.length > 1 ? () => togglePin(id) : undefined);
  const presenter = tiles.find((t) => t.screen && !t.isSelf) ?? tiles.find((t) => t.screen);
  const featured: TileData | undefined =
    pinned ??
    presenter ??
    (layout === "speaker" && tiles.length > 1
      ? (tiles.find((t) => t.id === active && !t.isSelf) ?? tiles.find((t) => !t.isSelf))
      : undefined);

  const leave = () => {
    screenTrack?.stop();
    media.stopAll();
    onLeave();
  };

  const othersCaptions = Object.entries(session.captions).filter(([id]) => id !== session.selfId);
  const remoteAudio = tiles.filter((t) => !t.isSelf && t.stream);

  return (
    <div className="grain flex h-dvh flex-col overflow-hidden">
      {remoteAudio.map((t) => (
        <RemoteAudio key={t.id} stream={t.stream!} sinkId={media.outputId} />
      ))}

      <header className="flex items-center justify-between gap-3 px-4 py-3">
        <div className="flex min-w-0 items-center gap-3">
          <RelayLogo className="shrink-0 border-r border-border pr-3 max-sm:[&_.relay-wordmark]:hidden" />
          <div className="min-w-0">
            <h1 className="truncate font-display text-base font-semibold leading-tight">{meeting.title}</h1>
            <p className="flex items-center gap-2 text-xs text-muted-foreground">
              <span className="font-mono">{meeting.code}</span>
              <span>·</span>
              <Elapsed since={startedAt} />
              {transcriberStatus === "listening" && (
                <span className="hidden items-center gap-1 text-live sm:inline-flex">
                  · <span className="size-1.5 animate-pulse rounded-full bg-live" /> AI notes on
                </span>
              )}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {session.status === "error" && (
            <span className="flex animate-pop-in items-center gap-1.5 rounded-full bg-destructive/15 px-3 py-1 text-xs text-destructive">
              <WifiOff className="size-3.5" /> Reconnecting…
            </span>
          )}
          <CopyLinkButton code={meeting.code} size="sm" label="Invite" />
        </div>
      </header>

      <div className="relative flex min-h-0 flex-1">
        <main className="relative flex min-w-0 flex-1 flex-col px-3 pb-28 sm:px-4">
          <div className="meeting-stage">
            {boardOpen ? (
              <div className="flex min-h-0 flex-1 gap-3">
                <div className="min-w-0 flex-1">
                  <Whiteboard
                    strokes={board.strokes}
                    selfId={session.selfId}
                    onDraw={board.draw}
                    onUndo={board.undo}
                    onClear={() => board.clear(name)}
                    onClose={() => setBoardOpen(false)}
                  />
                </div>
                <Filmstrip tiles={tiles} levels={levels} pinFor={pinFor} pinnedId={pinned?.id} vertical />
              </div>
            ) : featured ? (
              <div className="flex min-h-0 flex-1 flex-col gap-3 lg:flex-row">
                <VideoTile
                  key={featured.id}
                  tile={featured}
                  level={levels[featured.id] ?? 0}
                  featured
                  pinned={featured.id === pinned?.id}
                  onPin={pinFor(featured.id)}
                  className="min-h-0 flex-1"
                />
                <Filmstrip tiles={tiles.filter((t) => t.id !== featured.id)} levels={levels} pinFor={pinFor} />
              </div>
            ) : (
              <Grid tiles={tiles} levels={levels} pinFor={pinFor} />
            )}
          </div>

          {tiles.length === 1 && !boardOpen && (
            <div className="pointer-events-none absolute inset-x-0 top-6 flex justify-center">
              <div className="pointer-events-auto flex animate-[pop-in_520ms_var(--ease-spring)_300ms_both] items-center gap-3 rounded-2xl border border-border bg-card/90 px-4 py-3 text-sm shadow-dock backdrop-blur">
                <span>You're the first one here.</span>
                <CopyLinkButton code={meeting.code} size="sm" label="Copy invite" />
              </div>
            </div>
          )}

          {!boardOpen && (
            <SuggestionPills items={suggestions} onAdd={addSuggestionToNotes} onDismiss={dismissSuggestion} />
          )}

          {pushToTalk && (
            <div className="pointer-events-none absolute inset-x-0 top-3 z-10 flex justify-center" role="status">
              <div className="glass-pill flex animate-pop-in items-center gap-2.5 rounded-full py-2 pl-3 pr-4 text-sm font-medium">
                <span className="flex h-4 items-end gap-[3px]" aria-hidden>
                  {[0, 1, 2, 3, 4].map((i) => (
                    <span
                      key={i}
                      className="talk-bar h-full w-[3px] rounded-full bg-live"
                      style={{ animationDelay: `${[-300, -120, -420, -200, -60][i]}ms` }}
                    />
                  ))}
                </span>
                <span>
                  You are unmuted <span className="text-muted-foreground">— Space held</span>
                </span>
              </div>
            </div>
          )}

          {captionsOn && othersCaptions.length > 0 && (
            <div className="pointer-events-none absolute inset-x-0 bottom-28 flex flex-col items-center gap-1.5 px-4">
              {othersCaptions.slice(-2).map(([id, c]) => (
                <p key={id} className="max-w-2xl animate-rise-in rounded-xl bg-background/85 px-4 py-2 text-center text-sm backdrop-blur">
                  <span className="font-semibold text-primary">{c.name}: </span>
                  {c.text}
                </p>
              ))}
            </div>
          )}

          <div className="pointer-events-none absolute inset-x-0 bottom-5 flex justify-center px-3">
            <ControlDock
              media={media}
              micOn={media.micOn && !!media.audioTrack}
              camOn={media.camOn && !!media.videoTrack}
              canMic={!!media.audioTrack}
              canCam={!!media.videoTrack}
              sharing={!!screenTrack}
              canShare={canShare}
              boardOpen={boardOpen}
              hand={hand}
              layout={layout}
              captionsOn={captionsOn}
              sidebar={sidebar}
              unread={unread}
              peopleCount={tiles.length}
              onMic={() => media.setMicOn(!media.micOn)}
              onCam={() => media.setCamOn(!media.camOn)}
              onShare={() => void toggleShare()}
              onBoard={toggleBoard}
              onHand={() => setHand((h) => !h)}
              onLayout={() => setLayout((l) => (l === "grid" ? "speaker" : "grid"))}
              onCaptions={() => setCaptionsOn((c) => !c)}
              onSidebar={(tab) => setSidebar((s) => (s === tab ? null : tab))}
              onLeave={leave}
            />
          </div>
        </main>

        <aside
          className={cn(
            "absolute inset-y-0 right-0 z-20 flex w-full flex-col overflow-hidden border-border bg-sidebar backdrop-blur-xl sm:w-[380px] lg:static lg:z-auto lg:shrink-0",
            "transition-[translate,width,opacity,box-shadow] duration-[560ms] ease-spring-soft",
            sidebar
              ? "translate-x-0 border-l opacity-100 shadow-[-24px_0_60px_-30px_oklch(0_0_0/60%)] lg:w-[380px] lg:shadow-none"
              : "pointer-events-none translate-x-full opacity-0 lg:w-0 lg:translate-x-8 lg:duration-[420ms]",
          )}
          aria-hidden={!sidebar}
        >
          <div className="flex items-center justify-between border-b border-border px-4 py-3 sm:min-w-[380px]">
            <h2 key={sidebar ?? "none"} className="flex animate-panel-in items-center gap-2 font-display text-base font-semibold">
              {sidebar === "chat" && (
                <>
                  <MessageSquare className="size-4" /> Chat
                </>
              )}
              {sidebar === "people" && (
                <>
                  <Users className="size-4" /> People
                </>
              )}
              {sidebar === "ai" && (
                <>
                  <Bot className="size-4 text-primary" /> AI assistant
                </>
              )}
            </h2>
            <button
              type="button"
              onClick={() => setSidebar(null)}
              className="rounded-lg p-1.5 text-muted-foreground hover:bg-accent hover:text-foreground"
              aria-label="Close panel"
            >
              <X className="size-4" />
            </button>
          </div>
          <div className={cn("min-h-0 flex-1 animate-panel-in sm:min-w-[380px]", sidebar !== "chat" && "hidden")}>
            <ChatPanel messages={session.messages} selfId={session.selfId} selfName={name} onSend={session.sendChat} />
          </div>
          <div className={cn("min-h-0 flex-1 animate-panel-in sm:min-w-[380px]", sidebar !== "people" && "hidden")}>
            <PeoplePanel participants={session.participants} code={meeting.code} />
          </div>
          <div className={cn("min-h-0 flex-1 animate-panel-in sm:min-w-[380px]", sidebar !== "ai" && "hidden")}>
            <AssistantPanel
              code={meeting.code}
              transcript={session.transcript}
              captions={session.captions}
              transcribeEnabled={transcribeOn}
              onTranscribeChange={setTranscribeOn}
              transcriberStatus={transcriberStatus}
              notes={notes}
              onAddNote={(content) => saveNote({ id: crypto.randomUUID(), content, owner: null, due: null })}
            />
          </div>
        </aside>
      </div>
    </div>
  );
}

type PinFor = (id: string) => (() => void) | undefined;

function Grid({ tiles, levels, pinFor }: { tiles: TileData[]; levels: Record<string, number>; pinFor: PinFor }) {
  const mobile = useIsMobile();
  const cols = gridColumns(tiles.length, mobile);
  return (
    <div className="flex min-h-0 flex-1 items-center justify-center">
      <div
        className="grid h-full max-h-full w-full gap-3"
        style={{ gridAutoRows: "minmax(0, 1fr)", gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }}
      >
        {tiles.map((t) => (
          <VideoTile
            key={t.id}
            tile={t}
            level={levels[t.id] ?? 0}
            onPin={pinFor(t.id)}
            className="min-h-0 min-w-0"
          />
        ))}
      </div>
    </div>
  );
}

function Filmstrip({
  tiles,
  levels,
  pinFor,
  pinnedId,
  vertical,
}: {
  tiles: TileData[];
  levels: Record<string, number>;
  pinFor: PinFor;
  pinnedId?: string | undefined;
  vertical?: boolean;
}) {
  if (!tiles.length) return null;
  return (
    <div
      className={cn(
        "flex shrink-0 gap-3 overflow-auto p-1",
        vertical ? "hidden w-44 flex-col md:flex" : "h-28 lg:h-auto lg:w-56 lg:flex-col",
      )}
    >
      {tiles.map((t) => (
        <VideoTile
          key={t.id}
          tile={t}
          level={levels[t.id] ?? 0}
          compact
          pinned={t.id === pinnedId}
          onPin={pinFor(t.id)}
          className={cn("aspect-video shrink-0", vertical ? "w-full" : "h-full lg:h-auto lg:w-full")}
        />
      ))}
    </div>
  );
}

function Elapsed({ since }: { since: number }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);
  const s = Math.max(0, Math.floor((now - since) / 1000));
  const mm = String(Math.floor(s / 60)).padStart(2, "0");
  const ss = String(s % 60).padStart(2, "0");
  return <span className="font-mono tabular-nums">{Math.floor(s / 3600) ? `${Math.floor(s / 3600)}:` : ""}{mm}:{ss}</span>;
}
