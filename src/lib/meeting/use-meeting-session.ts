import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { RealtimeChannel } from "@supabase/supabase-js";

import { supabase } from "@/integrations/supabase/client";
import { saveChatMessage, saveTranscriptSegment } from "@/lib/meetings.functions";
import { createBlankVideoTrack, createSilentAudioTrack } from "@/lib/media/fallback-tracks";
import { readLinkSample, scoreConnection, type Quality } from "./connection-quality";
import type { Bus, BusEvent } from "./bus";
import type { ChatMessage, TranscriptSegment } from "./types";

const ICE_SERVERS: RTCIceServer[] = [
  { urls: ["stun:stun.l.google.com:19302", "stun:stun1.l.google.com:19302"] },
];

export type Participant = {
  id: string;
  name: string;
  micOn: boolean;
  camOn: boolean;
  screen: boolean;
  hand: boolean;
  joinedAt: number;
  isSelf: boolean;
};

type PresenceMeta = Omit<Participant, "isSelf">;

type Peer = {
  pc: RTCPeerConnection;
  polite: boolean;
  makingOffer: boolean;
  ignoreOffer: boolean;
  audioSender: RTCRtpSender;
  videoSender: RTCRtpSender;
};

export type Caption = { name: string; text: string; at: number };

export function useMeetingSession(opts: {
  code: string;
  name: string;
  audioTrack: MediaStreamTrack | null;
  videoTrack: MediaStreamTrack | null;
  screenTrack: MediaStreamTrack | null;
  micOn: boolean;
  camOn: boolean;
  hand: boolean;
  initialMessages: ChatMessage[];
  initialTranscript: TranscriptSegment[];
}) {
  const { code, name } = opts;
  const selfId = useMemo(() => crypto.randomUUID(), []);
  const joinedAt = useMemo(() => Date.now(), []);
  const [status, setStatus] = useState<"connecting" | "live" | "error">("connecting");
  const [participants, setParticipants] = useState<Participant[]>([]);
  const [remoteStreams, setRemoteStreams] = useState<Record<string, MediaStream>>({});
  const [connectionStates, setConnectionStates] = useState<Record<string, RTCPeerConnectionState>>({});
  const [messages, setMessages] = useState<ChatMessage[]>(opts.initialMessages);
  const [transcript, setTranscript] = useState<TranscriptSegment[]>(opts.initialTranscript);
  const [captions, setCaptions] = useState<Record<string, Caption>>({});
  const [connectionQuality, setConnectionQuality] = useState<Record<string, Quality>>({});

  const channelRef = useRef<RealtimeChannel | null>(null);
  const subscribedRef = useRef(false);
  const peersRef = useRef(new Map<string, Peer>());
  const listenersRef = useRef(new Set<(e: BusEvent) => void>());
  const sendStreamRef = useRef<MediaStream | null>(null);
  const fallbackRef = useRef<{ audio: MediaStreamTrack | null; video: MediaStreamTrack | null } | null>(null);
  const outgoingRef = useRef<{ audio: MediaStreamTrack | null; video: MediaStreamTrack | null }>({
    audio: null,
    video: null,
  });

  const getFallback = () => {
    if (!fallbackRef.current) {
      fallbackRef.current = { audio: createSilentAudioTrack(), video: createBlankVideoTrack() };
    }
    return fallbackRef.current;
  };

  const outgoingAudio = opts.audioTrack;
  const outgoingVideo = opts.screenTrack ?? opts.videoTrack;
  outgoingRef.current = { audio: outgoingAudio, video: outgoingVideo };

  const send = useCallback((event: BusEvent) => {
    const channel = channelRef.current;
    if (!channel) return;
    channel.send({ type: "broadcast", event: "relay", payload: event }).catch((err: unknown) => {
      console.warn("Room message not sent", err);
    });
  }, []);

  const bus: Bus = useMemo(
    () => ({
      send,
      subscribe: (listener) => {
        listenersRef.current.add(listener);
        return () => listenersRef.current.delete(listener);
      },
    }),
    [send],
  );

  const closePeer = useCallback((id: string) => {
    const peer = peersRef.current.get(id);
    if (!peer) return;
    peer.pc.close();
    peersRef.current.delete(id);
    setRemoteStreams((prev) => {
      const next = { ...prev };
      delete next[id];
      return next;
    });
    setConnectionStates((prev) => {
      const next = { ...prev };
      delete next[id];
      return next;
    });
  }, []);

  const ensurePeer = useCallback(
    (remoteId: string): Peer => {
      const existing = peersRef.current.get(remoteId);
      if (existing) return existing;
      const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });
      if (!sendStreamRef.current) sendStreamRef.current = new MediaStream();
      const fallback = getFallback();
      const stream = sendStreamRef.current;
      // Always open one audio and one video line; with no usable track, send an empty one
      // that replaceTrack fills in later.
      const addSender = (kind: "audio" | "video", track: MediaStreamTrack | null) =>
        track ? pc.addTrack(track, stream) : pc.addTransceiver(kind, { direction: "sendrecv", streams: [stream] }).sender;
      const peer: Peer = {
        pc,
        polite: selfId > remoteId,
        makingOffer: false,
        ignoreOffer: false,
        audioSender: addSender("audio", outgoingRef.current.audio ?? fallback.audio),
        videoSender: addSender("video", outgoingRef.current.video ?? fallback.video),
      };
      peersRef.current.set(remoteId, peer);

      pc.onnegotiationneeded = async () => {
        try {
          peer.makingOffer = true;
          await pc.setLocalDescription();
          if (pc.localDescription) {
            send({
              type: "signal",
              from: selfId,
              to: remoteId,
              description: { type: pc.localDescription.type, sdp: pc.localDescription.sdp },
            });
          }
        } catch (err) {
          console.warn("Offer failed", err);
        } finally {
          peer.makingOffer = false;
        }
      };
      pc.onicecandidate = ({ candidate }) => {
        if (candidate) send({ type: "signal", from: selfId, to: remoteId, candidate: candidate.toJSON() });
      };
      pc.ontrack = (event) => {
        const stream = event.streams[0] ?? new MediaStream([event.track]);
        setRemoteStreams((prev) => ({ ...prev, [remoteId]: stream }));
        event.track.onunmute = () => setRemoteStreams((prev) => ({ ...prev, [remoteId]: stream }));
      };
      pc.onconnectionstatechange = () => {
        setConnectionStates((prev) => ({ ...prev, [remoteId]: pc.connectionState }));
        if (pc.connectionState === "failed") pc.restartIce();
      };
      return peer;
    },
    [selfId, send],
  );

  const handleSignal = useCallback(
    async (event: Extract<BusEvent, { type: "signal" }>) => {
      if (event.to !== selfId) return;
      try {
        const peer = ensurePeer(event.from);
        const { pc } = peer;
        if (pc.signalingState === "closed") return;
        if (event.description) {
          const description = event.description;
          const collision =
            description.type === "offer" && (peer.makingOffer || pc.signalingState !== "stable");
          peer.ignoreOffer = !peer.polite && collision;
          if (peer.ignoreOffer) return;
          await pc.setRemoteDescription(description);
          if (description.type === "offer") {
            await pc.setLocalDescription();
            if (pc.localDescription) {
              send({
                type: "signal",
                from: selfId,
                to: event.from,
                description: { type: pc.localDescription.type, sdp: pc.localDescription.sdp },
              });
            }
          }
        } else if (event.candidate) {
          try {
            await pc.addIceCandidate(event.candidate);
          } catch (err) {
            if (!peer.ignoreOffer) console.warn("ICE candidate rejected", err);
          }
        }
      } catch (err) {
        console.warn("Signal handling failed", err);
      }
    },
    [ensurePeer, selfId, send],
  );

  // Join the room channel once per session.
  useEffect(() => {
    // A channel for this room can linger briefly while a previous session is still leaving
    // (fast rejoin, hot reload). Reusing it would attach to a closing connection, so drop it first.
    const topic = `relay-room:${code}`;
    for (const stale of supabase.getChannels()) {
      if (stale.topic === `realtime:${topic}`) void supabase.removeChannel(stale).catch(() => undefined);
    }
    const channel = supabase.channel(topic, {
      config: { broadcast: { self: false, ack: false }, presence: { key: selfId } },
    });
    channelRef.current = channel;

    channel.on("broadcast", { event: "relay" }, ({ payload }) => {
      const event = payload as BusEvent;
      if (!event || typeof event !== "object" || !("type" in event)) return;
      switch (event.type) {
        case "signal":
          void handleSignal(event);
          break;
        case "chat":
          setMessages((prev) => (prev.some((m) => m.id === event.message.id) ? prev : [...prev, event.message]));
          break;
        case "transcript":
          setTranscript((prev) =>
            prev.some((s) => s.id === event.segment.id) ? prev : [...prev, event.segment],
          );
          if (event.segment.speakerId) {
            const sid = event.segment.speakerId;
            setCaptions((prev) => {
              const next = { ...prev };
              delete next[sid];
              return next;
            });
          }
          break;
        case "caption":
          setCaptions((prev) => ({ ...prev, [event.from]: { name: event.name, text: event.text, at: Date.now() } }));
          break;
        default:
          break;
      }
      for (const listener of listenersRef.current) {
        try {
          listener(event);
        } catch (err) {
          console.warn("Room event handler failed", err);
        }
      }
    });

    channel.on("presence", { event: "sync" }, () => {
      const state = channel.presenceState<PresenceMeta>();
      const list: Participant[] = [];
      for (const metas of Object.values(state)) {
        const meta = metas[0];
        if (meta?.id) list.push({ ...meta, isSelf: meta.id === selfId });
      }
      list.sort((a, b) => a.joinedAt - b.joinedAt);
      setParticipants(list);
      const remoteIds = new Set(list.filter((p) => !p.isSelf).map((p) => p.id));
      for (const id of remoteIds) {
        try {
          ensurePeer(id);
        } catch (err) {
          console.warn("Couldn't open a connection to a participant", err);
        }
      }
      for (const id of [...peersRef.current.keys()]) if (!remoteIds.has(id)) closePeer(id);
    });

    channel.subscribe((state) => {
      if (state === "SUBSCRIBED") {
        subscribedRef.current = true;
        setStatus("live");
        channel.track(presenceRef.current).catch(() => undefined);
      } else if (state === "CHANNEL_ERROR" || state === "TIMED_OUT") {
        setStatus("error");
      }
    });

    const peers = peersRef.current;
    return () => {
      subscribedRef.current = false;
      void channel.untrack().catch(() => undefined);
      void supabase.removeChannel(channel);
      channelRef.current = null;
      for (const peer of peers.values()) peer.pc.close();
      peers.clear();
      fallbackRef.current?.audio?.stop();
      fallbackRef.current?.video?.stop();
      fallbackRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [code, selfId]);

  // Keep presence in sync with local state.
  const presence: PresenceMeta = {
    id: selfId,
    name,
    micOn: opts.micOn && !!opts.audioTrack,
    camOn: (opts.camOn && !!opts.videoTrack) || !!opts.screenTrack,
    screen: !!opts.screenTrack,
    hand: opts.hand,
    joinedAt,
  };
  const presenceRef = useRef(presence);
  presenceRef.current = presence;
  const presenceKey = JSON.stringify(presence);
  useEffect(() => {
    if (subscribedRef.current) channelRef.current?.track(presenceRef.current).catch(() => undefined);
  }, [presenceKey]);

  // Swap outgoing tracks on every connection when devices, blur or screen share change.
  useEffect(() => {
    const fallback = peersRef.current.size ? getFallback() : null;
    for (const peer of peersRef.current.values()) {
      const audio = outgoingAudio ?? fallback?.audio ?? null;
      const video = outgoingVideo ?? fallback?.video ?? null;
      if (peer.audioSender.track !== audio) void peer.audioSender.replaceTrack(audio).catch(() => undefined);
      if (peer.videoSender.track !== video) void peer.videoSender.replaceTrack(video).catch(() => undefined);
    }
  }, [outgoingAudio, outgoingVideo]);

  // Sample each connection's round-trip time and packet loss for the signal bars.
  useEffect(() => {
    const counters = new Map<string, { lost: number; received: number }>();
    let cancelled = false;
    const sample = async () => {
      const next: Record<string, Quality> = {};
      for (const [id, peer] of peersRef.current) {
        const state = peer.pc.connectionState;
        if (state !== "connected") {
          next[id] = scoreConnection(state, undefined);
          continue;
        }
        try {
          const report = await peer.pc.getStats();
          const { sample: link, counters: c } = readLinkSample(report, counters.get(id));
          counters.set(id, c);
          next[id] = scoreConnection(state, link);
        } catch {
          next[id] = scoreConnection(state, undefined);
        }
      }
      for (const id of [...counters.keys()]) if (!(id in next)) counters.delete(id);
      if (cancelled) return;
      setConnectionQuality((prev) => {
        const keys = Object.keys(next);
        const same = keys.length === Object.keys(prev).length && keys.every((k) => prev[k] === next[k]);
        return same ? prev : next;
      });
    };
    const timer = setInterval(() => {
      void sample();
    }, 2500);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, []);

  // Expire stale captions.
  useEffect(() => {
    const timer = setInterval(() => {
      const now = Date.now();
      setCaptions((prev) => {
        const entries = Object.entries(prev).filter(([, c]) => now - c.at < 5000);
        return entries.length === Object.keys(prev).length ? prev : Object.fromEntries(entries);
      });
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  const sendChat = useCallback(
    (body: string) => {
      const text = body.trim().slice(0, 2000);
      if (!text) return;
      const message: ChatMessage = {
        id: crypto.randomUUID(),
        sender: name,
        senderId: selfId,
        body: text,
        sentAt: new Date().toISOString(),
      };
      setMessages((prev) => [...prev, message]);
      send({ type: "chat", message });
      void saveChatMessage({ data: { code, id: message.id, sender: name, body: text } }).catch((e) =>
        console.warn("Chat not saved", e),
      );
    },
    [code, name, selfId, send],
  );

  const lastCaptionSent = useRef(0);
  const publishCaption = useCallback(
    (text: string) => {
      setCaptions((prev) => {
        if (!text) {
          if (!prev[selfId]) return prev;
          const next = { ...prev };
          delete next[selfId];
          return next;
        }
        return { ...prev, [selfId]: { name, text, at: Date.now() } };
      });
      const now = Date.now();
      if (text && now - lastCaptionSent.current > 600) {
        lastCaptionSent.current = now;
        send({ type: "caption", from: selfId, name, text: text.slice(-240) });
      }
    },
    [name, selfId, send],
  );

  const publishTranscript = useCallback(
    (text: string) => {
      const content = text.trim().slice(0, 4000);
      if (!content) return;
      const segment: TranscriptSegment = {
        id: crypto.randomUUID(),
        speaker: name,
        speakerId: selfId,
        content,
        spokenAt: new Date().toISOString(),
      };
      setTranscript((prev) => [...prev, segment]);
      send({ type: "transcript", segment });
      void saveTranscriptSegment({ data: { code, id: segment.id, speaker: name, content } }).catch((e) =>
        console.warn("Transcript not saved", e),
      );
    },
    [code, name, selfId, send],
  );

  return {
    selfId,
    status,
    participants,
    remoteStreams,
    connectionStates,
    connectionQuality,
    messages,
    sendChat,
    transcript,
    captions,
    publishCaption,
    publishTranscript,
    bus,
  };
}
