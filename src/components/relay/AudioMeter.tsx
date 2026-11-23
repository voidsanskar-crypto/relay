import { useEffect, useRef } from "react";

import { createLevelReader } from "@/lib/media/audio-level";
import { cn } from "@/lib/utils";

const BARS = 14;

export function AudioMeter({ track, className }: { track: MediaStreamTrack | null; className?: string }) {
  const barsRef = useRef<(HTMLSpanElement | null)[]>([]);
  useEffect(() => {
    if (!track) return;
    let reader: ReturnType<typeof createLevelReader> | null = null;
    try {
      reader = createLevelReader(track);
    } catch {
      return;
    }
    let frame = 0;
    const tick = () => {
      const level = reader!.read();
      const lit = Math.round(level * BARS);
      barsRef.current.forEach((bar, i) => {
        if (bar) bar.dataset["on"] = i < lit ? "true" : "false";
      });
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(frame);
      reader?.dispose();
    };
  }, [track]);

  return (
    <div className={cn("flex h-5 items-end gap-[3px]", className)} role="meter" aria-label="Microphone level">
      {Array.from({ length: BARS }, (_, i) => (
        <span
          key={i}
          ref={(el) => {
            barsRef.current[i] = el;
          }}
          data-on="false"
          style={{ height: `${30 + (i / BARS) * 70}%` }}
          className={cn(
            "w-1.5 origin-bottom scale-y-50 rounded-full bg-muted-foreground/25 transition-[scale,background-color,opacity] duration-150 ease-out data-[on=true]:scale-y-100",
            i >= BARS - 3 ? "data-[on=true]:bg-primary" : "data-[on=true]:bg-live",
          )}
        />
      ))}
    </div>
  );
}
