import { useEffect, useRef, useState } from "react";

type SpeechRecognitionResultLike = { isFinal: boolean; 0: { transcript: string } };
type SpeechRecognitionEventLike = { resultIndex: number; results: ArrayLike<SpeechRecognitionResultLike> };
type SpeechRecognitionLike = {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  onresult: ((e: SpeechRecognitionEventLike) => void) | null;
  onend: (() => void) | null;
  onerror: ((e: { error: string }) => void) | null;
  start: () => void;
  stop: () => void;
  abort: () => void;
};

function getRecognitionCtor(): (new () => SpeechRecognitionLike) | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as Record<string, unknown>;
  return (w["SpeechRecognition"] ?? w["webkitSpeechRecognition"] ?? null) as (new () => SpeechRecognitionLike) | null;
}

export function isSpeechTranscriptionSupported() {
  return getRecognitionCtor() !== null;
}

/** Live transcription of the local microphone using the browser's speech engine. */
export function useSpeechTranscriber(opts: {
  enabled: boolean;
  onInterim: (text: string) => void;
  onFinal: (text: string) => void;
}) {
  const [status, setStatus] = useState<"unsupported" | "idle" | "listening" | "blocked">("idle");
  const handlers = useRef(opts);
  handlers.current = opts;

  useEffect(() => {
    const Ctor = getRecognitionCtor();
    if (!Ctor) {
      setStatus("unsupported");
      return;
    }
    if (!opts.enabled) {
      setStatus("idle");
      return;
    }
    let stopped = false;
    let recognition: SpeechRecognitionLike | null = null;
    let restartTimer: ReturnType<typeof setTimeout> | undefined;

    const start = () => {
      if (stopped) return;
      recognition = new Ctor();
      recognition.continuous = true;
      recognition.interimResults = true;
      recognition.lang = navigator.language || "en-US";
      recognition.onresult = (event) => {
        let interim = "";
        for (let i = event.resultIndex; i < event.results.length; i++) {
          const result = event.results[i];
          if (!result) continue;
          const text = result[0].transcript.trim();
          if (!text) continue;
          if (result.isFinal) handlers.current.onFinal(text);
          else interim += `${text} `;
        }
        handlers.current.onInterim(interim.trim());
      };
      recognition.onerror = (e) => {
        if (e.error === "not-allowed" || e.error === "service-not-allowed") {
          stopped = true;
          setStatus("blocked");
        }
      };
      recognition.onend = () => {
        handlers.current.onInterim("");
        if (!stopped) restartTimer = setTimeout(start, 300);
      };
      try {
        recognition.start();
        setStatus("listening");
      } catch {
        restartTimer = setTimeout(start, 1000);
      }
    };
    start();
    return () => {
      stopped = true;
      clearTimeout(restartTimer);
      try {
        recognition?.abort();
      } catch {
        // ignore
      }
      handlers.current.onInterim("");
    };
  }, [opts.enabled]);

  return status;
}
