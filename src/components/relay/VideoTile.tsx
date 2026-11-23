import { useEffect, useRef, useState, type CSSProperties } from "react";
import { Hand, Loader2, Maximize2, Mic, MicOff, Minimize2, MonitorUp, Pin, PinOff } from "lucide-react";

import { Avatar } from "@/components/relay/PeoplePanel";
import { VideoSurface } from "@/components/relay/VideoSurface";
import { qualityLabel, type Quality } from "@/lib/meeting/connection-quality";
import { cn } from "@/lib/utils";

export type TileData = {
  id: string;
  name: string;
  stream: MediaStream | null;
  isSelf: boolean;
  micOn: boolean;
  camOn: boolean;
  screen: boolean;
  hand: boolean;
  connecting: boolean;
  quality: Quality;
};

export function VideoTile({
  tile,
  level,
  featured,
  compact,
  pinned,
  onPin,
  className,
}: {
  tile: TileData;
  level: number;
  featured?: boolean;
  compact?: boolean;
  pinned?: boolean;
  /** Omit to hide the pin action (e.g. when you're alone). */
  onPin?: (() => void) | undefined;
  className?: string;
}) {
  const rootRef = useRef<HTMLDivElement>(null);
  const [canFullscreen, setCanFullscreen] = useState(false);
  const [fullscreen, setFullscreen] = useState(false);

  useEffect(() => {
    setCanFullscreen(!!document.fullscreenEnabled);
    const onChange = () => {
      setFullscreen(!!rootRef.current && document.fullscreenElement === rootRef.current);
    };
    document.addEventListener("fullscreenchange", onChange);
    return () => {
      document.removeEventListener("fullscreenchange", onChange);
    };
  }, []);

  const toggleFullscreen = () => {
    if (fullscreen) {
      void document.exitFullscreen().catch(() => undefined);
    } else {
      void rootRef.current?.requestFullscreen().catch(() => undefined);
    }
  };

  const showVideo = tile.camOn && tile.stream;
  const volume = tile.micOn ? level : 0;
  const talking = volume > 0;
  const tone = Array.from(tile.name).reduce((sum, char) => sum + char.charCodeAt(0), 0) % 4;
  const big = featured || fullscreen;
  const hasActions = !!onPin || canFullscreen;

  return (
    <div
      ref={rootRef}
      style={{ "--voice-level": volume } as CSSProperties}
      data-speaking={talking}
      data-pinned={!!pinned}
      className={cn(
        "video-tile relay-dark-surface group/tile relative animate-tile-enter rounded-2xl",
        fullscreen && "rounded-none bg-stage",
        className,
      )}
    >
      <div
        className={cn(
          "relative h-full w-full overflow-hidden rounded-2xl video-well bg-tile ring-1 ring-border",
          pinned && "ring-primary/40",
          fullscreen && "rounded-none bg-stage ring-0",
        )}
      >
        {showVideo ? (
          <VideoSurface
            stream={tile.stream}
            mirrored={tile.isSelf && !tile.screen}
            fit={tile.screen || big ? "contain" : "cover"}
            className={cn((tile.screen || fullscreen) && "bg-stage")}
          />
        ) : (
          <div data-tone={tone} className="video-placeholder flex h-full w-full items-center justify-center">
            <Avatar
              name={tile.name}
              className={cn(compact ? "size-10 text-sm" : big ? "size-28 text-4xl" : "size-20 text-2xl")}
            />
          </div>
        )}

        {tile.connecting && (
          <div className="absolute inset-0 flex animate-in fade-in items-center justify-center gap-2 bg-background/50 text-xs backdrop-blur-sm duration-300">
            <Loader2 className="size-4 animate-spin" /> Connecting…
          </div>
        )}

        {/* Floating participant badge */}
        <div
          className={cn(
            "glass-pill absolute bottom-2 left-2 flex max-w-[calc(100%-1rem)] items-center rounded-full font-medium text-foreground",
            compact ? "gap-1.5 py-0.5 pl-1.5 pr-2 text-[11px]" : "gap-2 py-1 pl-2 pr-2.5 text-xs",
            fullscreen && "bottom-4 left-4",
          )}
        >
          <MicStatus micOn={tile.micOn} volume={volume} compact={compact} />
          {pinned && <Pin className="size-3 shrink-0 fill-primary text-primary" aria-label="Pinned" />}
          {tile.screen && <MonitorUp className="size-3.5 shrink-0 text-live" aria-label="Sharing screen" />}
          <span className="truncate">
            {tile.isSelf ? `${tile.name} (you)` : tile.name}
            {tile.screen && !compact ? " · presenting" : ""}
          </span>
          <SignalBars quality={tile.quality} />
        </div>

        {tile.hand && (
          <div className="absolute left-2 top-2 flex origin-top-left animate-pop-in items-center gap-1 rounded-full bg-primary px-2 py-1 text-xs font-semibold text-primary-foreground">
            <Hand className="size-3.5 origin-bottom animate-[badge-bounce_600ms_var(--ease-spring)_120ms_both]" />
            {!compact && <span>Hand raised</span>}
          </div>
        )}

        {/* Hover actions */}
        {hasActions && (
          <div
            className={cn(
              "absolute right-2 top-2 flex gap-1 opacity-0 transition-[opacity,translate] duration-300 ease-out -translate-y-1",
              "group-hover/tile:translate-y-0 group-hover/tile:opacity-100 focus-within:translate-y-0 focus-within:opacity-100",
              "[@media(hover:none)]:translate-y-0 [@media(hover:none)]:opacity-100",
              fullscreen && "right-4 top-4",
            )}
          >
            {onPin && (
              <TileAction label={pinned ? `Unpin ${tile.name}` : `Pin ${tile.name}`} active={pinned} compact={compact} onClick={onPin}>
                {pinned ? <PinOff /> : <Pin />}
              </TileAction>
            )}
            {canFullscreen && (
              <TileAction label={fullscreen ? "Exit full screen" : "Full screen"} compact={compact} onClick={toggleFullscreen}>
                {fullscreen ? <Minimize2 /> : <Maximize2 />}
              </TileAction>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function TileAction({
  label,
  onClick,
  active,
  compact,
  children,
}: {
  label: string;
  onClick: () => void;
  active?: boolean | undefined;
  compact?: boolean | undefined;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      aria-pressed={active}
      title={label}
      className={cn(
        "motion-press flex items-center justify-center rounded-full outline-none focus-visible:ring-2 focus-visible:ring-ring active:scale-95",
        compact ? "size-7 [&_svg]:size-3.5" : "size-8 [&_svg]:size-4",
        active ? "bg-primary text-primary-foreground" : "glass-pill text-foreground hover:bg-accent",
      )}
    >
      {children}
    </button>
  );
}

function MicStatus({ micOn, volume, compact }: { micOn: boolean; volume: number; compact?: boolean | undefined }) {
  if (!micOn) {
    return (
      <span className="flex size-4 shrink-0 items-center justify-center rounded-full bg-danger-soft/15">
        <MicOff className="size-3 text-danger-soft" aria-label="Muted" />
      </span>
    );
  }
  if (volume > 0) {
    return (
      <span className="flex h-3 w-4 shrink-0 items-end justify-center gap-[2px]" role="img" aria-label="Talking">
        {[0.72, 1, 0.85].map((gain) => (
          <span
            key={gain}
            className="voice-bar h-full w-[3px] rounded-full bg-live"
            style={{ transform: `scaleY(${Math.min(1, 0.12 + volume * gain * 1.5)})` }}
          />
        ))}
      </span>
    );
  }
  return <Mic className={cn("shrink-0 text-foreground/70", compact ? "size-3" : "size-3.5")} aria-label="Mic on" />;
}

function SignalBars({ quality }: { quality: Quality }) {
  const color = quality === 3 ? "bg-live" : quality === 2 ? "bg-primary" : "bg-danger-soft";
  return (
    <span className="flex h-3 shrink-0 items-end gap-[2px] pl-0.5" role="img" aria-label={qualityLabel(quality)} title={qualityLabel(quality)}>
      {[1, 2, 3].map((bar) => (
        <span
          key={bar}
          className={cn(
            "w-[3px] rounded-full transition-colors duration-500",
            bar <= quality ? color : "bg-foreground/20",
            quality === 0 && "animate-pulse",
          )}
          style={{ height: `${bar * 33.4}%` }}
        />
      ))}
    </span>
  );
}

