import * as DropdownMenuPrimitive from "@radix-ui/react-dropdown-menu";
import { Camera, Check, ChevronUp, Loader2, Mic, Sparkles, Volume2 } from "lucide-react";
import { useEffect, useState } from "react";

import { AudioMeter } from "@/components/relay/AudioMeter";
import type { LocalMedia } from "@/lib/media/use-local-media";
import { cn } from "@/lib/utils";

const contentClass =
  "z-50 w-72 max-w-[calc(100vw-1.5rem)] overflow-hidden rounded-2xl border border-border bg-popover/95 p-1.5 text-popover-foreground shadow-dock backdrop-blur-xl outline-none " +
  "origin-(--radix-dropdown-menu-content-transform-origin) data-[state=open]:animate-[pop-in_340ms_var(--ease-spring)_both] data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-95 data-[state=closed]:duration-150";

const itemClass =
  "relative flex min-h-10 cursor-pointer select-none items-center gap-2.5 rounded-xl py-2 pl-9 pr-3 text-sm outline-none transition-colors " +
  "data-[highlighted]:bg-accent data-[disabled]:pointer-events-none data-[disabled]:opacity-50";

function MenuTrigger({ label }: { label: string }) {
  return (
    <DropdownMenuPrimitive.Trigger
      aria-label={label}
      title={label}
      className={cn(
        "group/chev motion-press flex h-10 w-6 shrink-0 items-center justify-center rounded-l-md rounded-r-xl bg-secondary text-muted-foreground outline-none sm:h-12 sm:w-7 sm:rounded-r-2xl",
        "hover:bg-accent hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring active:scale-95 data-[state=open]:bg-accent data-[state=open]:text-foreground",
      )}
    >
      <ChevronUp className="size-4 transition-transform duration-300 ease-spring group-data-[state=open]/chev:rotate-180" />
    </DropdownMenuPrimitive.Trigger>
  );
}

function Section({ icon: Icon, children }: { icon: React.ComponentType<{ className?: string }>; children: React.ReactNode }) {
  return (
    <DropdownMenuPrimitive.Label className="flex items-center gap-1.5 px-3 pb-1 pt-2 font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
      <Icon className="size-3" /> {children}
    </DropdownMenuPrimitive.Label>
  );
}

function DeviceOptions({
  devices,
  value,
  fallback,
  onSelect,
  empty,
}: {
  devices: MediaDeviceInfo[];
  value: string | undefined;
  fallback: string;
  onSelect: (id: string) => void;
  empty: string;
}) {
  if (!devices.length) {
    return <p className="px-3 py-2 text-sm text-muted-foreground">{empty}</p>;
  }
  const current = devices.some((d) => d.deviceId === value) ? value : devices[0]?.deviceId;
  return (
    <DropdownMenuPrimitive.RadioGroup
      value={current ?? ""}
      onValueChange={(id) => {
        if (id !== value) onSelect(id);
      }}
    >
      {devices.map((d, i) => (
        <DropdownMenuPrimitive.RadioItem key={d.deviceId} value={d.deviceId} className={itemClass}>
          <span className="absolute left-3 flex size-4 items-center justify-center">
            <DropdownMenuPrimitive.ItemIndicator className="animate-pop-in">
              <Check className="size-4 text-primary" />
            </DropdownMenuPrimitive.ItemIndicator>
          </span>
          <span className="truncate">{cleanLabel(d.label) || `${fallback} ${i + 1}`}</span>
        </DropdownMenuPrimitive.RadioItem>
      ))}
    </DropdownMenuPrimitive.RadioGroup>
  );
}

const Separator = () => <DropdownMenuPrimitive.Separator className="mx-2 my-1.5 h-px bg-border" />;

/** Device names often end with a USB id like "(046d:0825)"; it's noise in a menu. */
function cleanLabel(label: string) {
  return label.replace(/\s*\([0-9a-f]{4}:[0-9a-f]{4}\)\s*$/i, "");
}

function useCanPickSpeaker() {
  const [can, setCan] = useState(false);
  useEffect(() => {
    setCan(typeof HTMLMediaElement !== "undefined" && "setSinkId" in HTMLMediaElement.prototype);
  }, []);
  return can;
}

export function MicMenu({ media }: { media: LocalMedia }) {
  const [open, setOpen] = useState(false);
  const canPickSpeaker = useCanPickSpeaker();
  const speakers = canPickSpeaker ? media.devices.audiooutput : [];
  return (
    <DropdownMenuPrimitive.Root open={open} onOpenChange={setOpen}>
      <MenuTrigger label="Microphone options" />
      <DropdownMenuPrimitive.Portal>
        <DropdownMenuPrimitive.Content side="top" align="start" sideOffset={14} collisionPadding={12} className={contentClass}>
          <Section icon={Mic}>Microphone</Section>
          <DeviceOptions
            devices={media.devices.audioinput}
            value={media.audioId}
            fallback="Microphone"
            onSelect={media.selectAudio}
            empty="No microphones found"
          />
          {media.audioTrack && (
            <div className="flex items-center gap-2 px-3 pb-1.5 pt-1">
              <span className="text-[11px] text-muted-foreground">{media.micOn ? "Input" : "Muted"}</span>
              {open && <AudioMeter track={media.audioTrack} className={cn("h-3 flex-1 gap-[2px]", !media.micOn && "opacity-40")} />}
            </div>
          )}
          {speakers.length > 0 && (
            <>
              <Separator />
              <Section icon={Volume2}>Speaker</Section>
              <DeviceOptions
                devices={speakers}
                value={media.outputId}
                fallback="Speaker"
                onSelect={media.setOutputId}
                empty="No speakers found"
              />
            </>
          )}
        </DropdownMenuPrimitive.Content>
      </DropdownMenuPrimitive.Portal>
    </DropdownMenuPrimitive.Root>
  );
}

export function CameraMenu({ media, sharing }: { media: LocalMedia; sharing: boolean }) {
  const blurNote =
    media.blurState === "loading"
      ? "Getting ready…"
      : media.blurState === "error"
        ? "Not available on this device"
        : sharing
          ? "Applies to your camera"
          : null;
  return (
    <DropdownMenuPrimitive.Root>
      <MenuTrigger label="Camera options" />
      <DropdownMenuPrimitive.Portal>
        <DropdownMenuPrimitive.Content side="top" align="start" sideOffset={14} collisionPadding={12} className={contentClass}>
          <Section icon={Camera}>Camera</Section>
          <DeviceOptions
            devices={media.devices.videoinput}
            value={media.videoId}
            fallback="Camera"
            onSelect={media.selectVideo}
            empty="No cameras found"
          />
          <Separator />
          <DropdownMenuPrimitive.CheckboxItem
            checked={media.blurOn}
            disabled={!media.cameraTrack}
            onCheckedChange={(v) => media.setBlurOn(v === true)}
            onSelect={(e) => e.preventDefault()}
            className={cn(itemClass, "pl-3")}
          >
            <Sparkles className="size-4 shrink-0 text-primary" />
            <span className="flex min-w-0 flex-1 flex-col">
              <span>Blur background</span>
              {blurNote && <span className="text-[11px] text-muted-foreground">{blurNote}</span>}
            </span>
            {media.blurState === "loading" ? (
              <Loader2 className="size-4 animate-spin text-muted-foreground" />
            ) : (
              <span
                aria-hidden
                className={cn(
                  "relative h-5 w-9 shrink-0 rounded-full transition-colors duration-200",
                  media.blurOn ? "bg-primary" : "bg-input",
                )}
              >
                <span
                  className={cn(
                    "absolute left-0.5 top-0.5 size-4 rounded-full bg-foreground transition-[translate] duration-300 ease-spring",
                    media.blurOn && "translate-x-4 bg-primary-foreground",
                  )}
                />
              </span>
            )}
          </DropdownMenuPrimitive.CheckboxItem>
        </DropdownMenuPrimitive.Content>
      </DropdownMenuPrimitive.Portal>
    </DropdownMenuPrimitive.Root>
  );
}
