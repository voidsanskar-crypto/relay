import { useEffect, useRef, useState } from "react";

let sharedCtx: AudioContext | null = null;
export function getAudioContext(): AudioContext {
  if (!sharedCtx || sharedCtx.state === "closed") sharedCtx = new AudioContext();
  if (sharedCtx.state === "suspended") void sharedCtx.resume().catch(() => undefined);
  return sharedCtx;
}

export type LevelReader = { read: () => number; dispose: () => void };

/** Returns a reader giving the current loudness (0..1) of an audio track. */
export function createLevelReader(track: MediaStreamTrack): LevelReader {
  const ctx = getAudioContext();
  const source = ctx.createMediaStreamSource(new MediaStream([track]));
  const analyser = ctx.createAnalyser();
  analyser.fftSize = 512;
  analyser.smoothingTimeConstant = 0.6;
  source.connect(analyser);
  const buf = new Uint8Array(analyser.fftSize);
  return {
    read: () => {
      if (!track.enabled || track.muted || track.readyState !== "live") return 0;
      analyser.getByteTimeDomainData(buf);
      let sum = 0;
      for (let i = 0; i < buf.length; i++) {
        const v = ((buf[i] ?? 128) - 128) / 128;
        sum += v * v;
      }
      const rms = Math.sqrt(sum / buf.length);
      return Math.min(1, rms * 4);
    },
    dispose: () => {
      source.disconnect();
      analyser.disconnect();
    },
  };
}

/**
 * Tracks who is speaking across a set of audio tracks.
 * Returns the loudest recent speaker (held briefly to avoid flicker) and everyone currently talking.
 */
export function useSpeakingDetector(tracks: Record<string, MediaStreamTrack | null | undefined>) {
  const [levels, setLevels] = useState<Record<string, number>>({});
  const [active, setActive] = useState<string | null>(null);
  const readers = useRef(new Map<string, { track: MediaStreamTrack; reader: LevelReader }>());
  const lastActive = useRef<{ id: string | null; at: number }>({ id: null, at: 0 });

  useEffect(() => {
    const map = readers.current;
    for (const [id, entry] of map) {
      if (tracks[id] !== entry.track) {
        entry.reader.dispose();
        map.delete(id);
      }
    }
    for (const [id, track] of Object.entries(tracks)) {
      if (track && !map.has(id)) {
        try {
          map.set(id, { track, reader: createLevelReader(track) });
        } catch {
          // ignore tracks the audio graph can't read
        }
      }
    }
  }, [tracks]);

  useEffect(() => {
    const timer = setInterval(() => {
      const now = Date.now();
      const next: Record<string, number> = {};
      let loudest: { id: string; level: number } | null = null;
      for (const [id, { reader }] of readers.current) {
        const level = reader.read();
        if (level > 0.08) next[id] = Math.ceil(level * 20) / 20;
        if (level > 0.12 && (!loudest || level > loudest.level)) loudest = { id, level };
      }
      setLevels((previous) => {
        const ids = Object.keys(next);
        return ids.length === Object.keys(previous).length && ids.every((id) => previous[id] === next[id]) ? previous : next;
      });
      if (loudest) {
        // Hold the current speaker briefly so the spotlight doesn't flicker between people.
        if (loudest.id !== lastActive.current.id && now - lastActive.current.at < 1200) return;
        lastActive.current = { id: loudest.id, at: now };
        setActive(loudest.id);
      }
    }, 110);
    return () => clearInterval(timer);
  }, []);

  useEffect(
    () => () => {
      for (const { reader } of readers.current.values()) reader.dispose();
      readers.current.clear();
    },
    [],
  );

  return { levels, active };
}
