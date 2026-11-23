import { useEffect, useRef } from "react";

import { cn } from "@/lib/utils";

export function VideoSurface({
  stream,
  mirrored,
  className,
  fit = "cover",
}: {
  stream: MediaStream | null;
  mirrored?: boolean;
  className?: string;
  fit?: "cover" | "contain";
}) {
  const ref = useRef<HTMLVideoElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (el.srcObject !== stream) el.srcObject = stream;
    if (stream) void el.play().catch(() => undefined);
  }, [stream]);
  return (
    <video
      ref={ref}
      autoPlay
      playsInline
      muted
      className={cn(
        "h-full w-full",
        fit === "cover" ? "object-cover" : "object-contain",
        mirrored && "-scale-x-100",
        className,
      )}
    />
  );
}

/** Plays a remote participant's audio regardless of what's on screen. */
export function RemoteAudio({ stream, sinkId }: { stream: MediaStream; sinkId?: string | undefined }) {
  const ref = useRef<HTMLAudioElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (el.srcObject !== stream) el.srcObject = stream;
    void el.play().catch(() => undefined);
  }, [stream]);
  useEffect(() => {
    const el = ref.current as (HTMLAudioElement & { setSinkId?: (id: string) => Promise<void> }) | null;
    if (el?.setSinkId && sinkId) void el.setSinkId(sinkId).catch(() => undefined);
  }, [sinkId]);
  return <audio ref={ref} autoPlay className="hidden" />;
}
