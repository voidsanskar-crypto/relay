import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { Camera, CameraOff, Loader2, Mic, MicOff, Speaker, Sparkles, Video } from "lucide-react";

import { AudioMeter } from "@/components/relay/AudioMeter";
import { CopyLinkButton } from "@/components/relay/CopyLinkButton";
import { DeviceSelect } from "@/components/relay/DeviceSelect";
import { RelayLogo } from "@/components/relay/RelayLogo";
import { VideoSurface } from "@/components/relay/VideoSurface";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import type { LocalMedia } from "@/lib/media/use-local-media";
import type { MeetingInfo } from "@/lib/meeting/types";
import { cn } from "@/lib/utils";

export function Lobby({
  meeting,
  media,
  initialName,
  onJoin,
}: {
  meeting: MeetingInfo;
  media: LocalMedia;
  initialName: string;
  onJoin: (name: string) => void;
}) {
  const [name, setName] = useState(initialName);
  const [supportsSink, setSupportsSink] = useState(false);
  useEffect(() => {
    setSupportsSink("setSinkId" in HTMLMediaElement.prototype);
  }, []);
  const canJoin = name.trim().length > 0;
  const showVideo = media.camOn && media.previewStream;

  return (
    <div className="grain min-h-screen">
      <header className="mx-auto flex max-w-6xl items-center justify-between px-6 py-5">
        <Link to="/" aria-label="Relay home">
          <RelayLogo />
        </Link>
        <CopyLinkButton code={meeting.code} size="sm" />
      </header>

      <main className="mx-auto grid max-w-6xl gap-8 px-6 pb-16 pt-4 lg:grid-cols-[1.5fr_1fr]">
        <section>
          <div className="relay-dark-surface lobby-preview relative aspect-video overflow-hidden rounded-3xl border border-border bg-tile shadow-glow">
            {showVideo ? (
              <VideoSurface stream={media.previewStream} mirrored />
            ) : (
              <div className="flex h-full flex-col items-center justify-center gap-3 text-muted-foreground">
                {media.ready ? (
                  <>
                    <CameraOff className="size-10" />
                    <p className="text-sm">{media.cameraTrack ? "Your camera is off" : "No camera available"}</p>
                  </>
                ) : (
                  <>
                    <Loader2 className="size-8 animate-spin" />
                    <p className="text-sm">Starting your camera…</p>
                  </>
                )}
              </div>
            )}

            {media.blurState === "loading" && (
              <div className="absolute left-4 top-4 flex items-center gap-2 rounded-full bg-background/80 px-3 py-1.5 text-xs backdrop-blur">
                <Loader2 className="size-3.5 animate-spin" /> Preparing background blur…
              </div>
            )}

            <div className="absolute inset-x-0 bottom-0 flex items-center justify-between gap-3 bg-gradient-to-t from-background/90 to-transparent p-4 pt-12">
              <div className="flex items-center gap-2">
                <ToggleCircle
                  on={media.micOn}
                  disabled={!media.audioTrack}
                  onClick={() => media.setMicOn(!media.micOn)}
                  label={media.micOn ? "Mute microphone" : "Unmute microphone"}
                  iconOn={Mic}
                  iconOff={MicOff}
                />
                <ToggleCircle
                  on={media.camOn}
                  disabled={!media.cameraTrack}
                  onClick={() => media.setCamOn(!media.camOn)}
                  label={media.camOn ? "Turn camera off" : "Turn camera on"}
                  iconOn={Camera}
                  iconOff={CameraOff}
                />
              </div>
              <div className="flex items-center gap-3 rounded-full bg-background/70 px-3 py-2 backdrop-blur">
                {media.micOn ? <Mic className="size-4 text-muted-foreground" /> : <MicOff className="size-4 text-destructive" />}
                <AudioMeter track={media.micOn ? media.audioTrack : null} />
              </div>
            </div>
          </div>

          {media.error && (
            <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm">
              <span>{media.error}</span>
              <Button size="sm" variant="secondary" onClick={media.retry}>
                Try again
              </Button>
            </div>
          )}
          {media.blurState === "error" && (
            <p className="mt-3 text-sm text-destructive">Background blur couldn't start on this device.</p>
          )}
        </section>

        <section className="glass-card flex flex-col rounded-3xl p-6 sm:p-8">
          <p className="inline-flex w-fit items-center gap-2 rounded-full border border-border bg-card/60 px-3 py-1 text-xs font-medium text-muted-foreground"><span className="size-1.5 animate-pulse rounded-full bg-live" /> You're about to join</p>
          <h1 className="mt-3 font-display text-4xl font-semibold leading-tight">{meeting.title}</h1>
          <p className="mt-2 font-mono text-sm text-muted-foreground">{meeting.code}</p>

          <form
            className="mt-8 space-y-5"
            onSubmit={(e) => {
              e.preventDefault();
              if (canJoin) onJoin(name.trim().slice(0, 60));
            }}
          >
            <label className="block">
              <span className="mb-1.5 block text-xs font-medium text-muted-foreground">Your name</span>
              <Input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="How should others see you?"
                maxLength={60}
                autoFocus
                className="h-11 bg-background/60 text-base"
              />
            </label>

            <div className="grid gap-4">
              <DeviceSelect
                label="Camera"
                icon={Video}
                devices={media.devices.videoinput}
                value={media.videoId}
                onChange={media.selectVideo}
                emptyLabel="No camera found"
              />
              <DeviceSelect
                label="Microphone"
                icon={Mic}
                devices={media.devices.audioinput}
                value={media.audioId}
                onChange={media.selectAudio}
                emptyLabel="No microphone found"
              />
              {supportsSink && (
                <DeviceSelect
                  label="Speaker"
                  icon={Speaker}
                  devices={media.devices.audiooutput}
                  value={media.outputId}
                  onChange={media.setOutputId}
                  emptyLabel="System default"
                />
              )}
            </div>

            <label className="flex items-center justify-between gap-4 rounded-2xl border border-border bg-card/60 px-4 py-3">
              <span className="flex items-center gap-3">
                <Sparkles className="size-4 text-primary" />
                <span>
                  <span className="block text-sm font-medium">Blur my background</span>
                  <span className="block text-xs text-muted-foreground">Keeps the focus on you</span>
                </span>
              </span>
              <Switch
                checked={media.blurOn}
                onCheckedChange={media.setBlurOn}
                disabled={!media.cameraTrack}
                aria-label="Blur my background"
              />
            </label>

            <Button type="submit" size="lg" className="h-12 w-full text-base" disabled={!canJoin || !media.ready}>
              {media.ready ? "Join now" : "Getting your devices ready…"}
            </Button>
          </form>
        </section>
      </main>
    </div>
  );
}

function ToggleCircle({
  on,
  onClick,
  label,
  iconOn: IconOn,
  iconOff: IconOff,
  disabled,
}: {
  on: boolean;
  onClick: () => void;
  label: string;
  iconOn: React.ComponentType<{ className?: string }>;
  iconOff: React.ComponentType<{ className?: string }>;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      title={label}
      className={cn(
        "motion-press flex size-12 items-center justify-center rounded-full border active:scale-95 disabled:opacity-40",
        on
          ? "border-border bg-background/70 text-foreground backdrop-blur hover:bg-accent"
          : "border-transparent bg-destructive text-destructive-foreground hover:bg-destructive/90",
      )}
    >
      {on ? <IconOn className="size-5" /> : <IconOff className="size-5" />}
    </button>
  );
}
