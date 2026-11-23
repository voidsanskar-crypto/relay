import {
  Bot,
  Camera,
  CameraOff,
  Captions,
  Hand,
  LayoutGrid,
  MessageSquare,
  Mic,
  MicOff,
  MonitorUp,
  PenLine,
  PhoneOff,
  Presentation,
  Users,
} from "lucide-react";

import { CameraMenu, MicMenu } from "@/components/relay/DeviceMenus";
import type { LocalMedia } from "@/lib/media/use-local-media";
import { cn } from "@/lib/utils";

export type SidebarTab = "chat" | "people" | "ai";

export function ControlDock(props: {
  media: LocalMedia;
  micOn: boolean;
  camOn: boolean;
  canMic: boolean;
  canCam: boolean;
  sharing: boolean;
  canShare: boolean;
  boardOpen: boolean;
  hand: boolean;
  layout: "grid" | "speaker";
  captionsOn: boolean;
  sidebar: SidebarTab | null;
  unread: number;
  peopleCount: number;
  onMic: () => void;
  onCam: () => void;
  onShare: () => void;
  onBoard: () => void;
  onHand: () => void;
  onLayout: () => void;
  onCaptions: () => void;
  onSidebar: (tab: SidebarTab) => void;
  onLeave: () => void;
}) {
  return (
    <div className="pointer-events-auto flex max-w-full animate-[panel-in_520ms_var(--ease-spring-soft)_120ms_both] items-center gap-1 overflow-x-auto rounded-[1.75rem] border border-border bg-dock p-1.5 shadow-dock backdrop-blur-xl sm:gap-2 sm:p-2">
      <div className="flex shrink-0 items-center gap-0.5">
        <DockButton
          label={props.micOn ? "Mute" : props.canMic ? "Unmute (or hold Space to talk)" : "Unmute"}
          danger={!props.micOn}
          disabled={!props.canMic}
          onClick={props.onMic}
          className="rounded-r-md sm:rounded-r-md"
        >
          {props.micOn ? <Mic /> : <MicOff />}
        </DockButton>
        <MicMenu media={props.media} />
      </div>
      <div className="flex shrink-0 items-center gap-0.5">
        <DockButton
          label={props.camOn ? "Stop video" : "Start video"}
          danger={!props.camOn}
          disabled={!props.canCam}
          onClick={props.onCam}
          className="rounded-r-md sm:rounded-r-md"
        >
          {props.camOn ? <Camera /> : <CameraOff />}
        </DockButton>
        <CameraMenu media={props.media} sharing={props.sharing} />
      </div>
      {props.canShare && (
        <DockButton
          label={props.sharing ? "Stop sharing" : "Share screen"}
          active={props.sharing}
          onClick={props.onShare}
          className="hidden sm:flex"
        >
          <MonitorUp />
        </DockButton>
      )}
      <DockButton label={props.boardOpen ? "Close board" : "Whiteboard"} active={props.boardOpen} onClick={props.onBoard}>
        <PenLine />
      </DockButton>
      <DockButton
        label={props.hand ? "Lower hand" : "Raise hand"}
        active={props.hand}
        onClick={props.onHand}
        className="hidden sm:flex"
      >
        <Hand />
      </DockButton>
      <DockButton
        label={props.layout === "grid" ? "Speaker view" : "Grid view"}
        onClick={props.onLayout}
        className="hidden sm:flex"
      >
        {props.layout === "grid" ? <Presentation /> : <LayoutGrid />}
      </DockButton>
      <DockButton
        label={props.captionsOn ? "Hide captions" : "Show captions"}
        active={props.captionsOn}
        onClick={props.onCaptions}
        className="hidden sm:flex"
      >
        <Captions />
      </DockButton>

      <span className="mx-1 hidden h-8 w-px shrink-0 bg-border sm:block" />

      <DockButton label="Chat" active={props.sidebar === "chat"} onClick={() => props.onSidebar("chat")} badge={props.unread}>
        <MessageSquare />
      </DockButton>
      <DockButton
        label="People"
        active={props.sidebar === "people"}
        onClick={() => props.onSidebar("people")}
        count={props.peopleCount}
      >
        <Users />
      </DockButton>
      <DockButton label="AI assistant" active={props.sidebar === "ai"} onClick={() => props.onSidebar("ai")} accent>
        <Bot />
      </DockButton>

      <span className="mx-1 hidden h-8 w-px shrink-0 bg-border sm:block" />

      <button
        type="button"
        aria-label="Leave"
        onClick={props.onLeave}
        className="flex h-10 shrink-0 items-center gap-2 rounded-xl bg-destructive px-3 sm:h-12 sm:rounded-2xl sm:px-4 text-sm font-semibold text-destructive-foreground motion-press hover:bg-destructive/90 hover:shadow-[0_10px_24px_-10px_var(--destructive)] active:scale-95 [&_svg]:size-5"
      >
        <PhoneOff /> <span className="hidden sm:inline">Leave</span>
      </button>
    </div>
  );
}

function DockButton({
  label,
  onClick,
  children,
  active,
  danger,
  disabled,
  badge,
  count,
  accent,
  className,
}: {
  label: string;
  onClick: () => void;
  children: React.ReactNode;
  active?: boolean;
  danger?: boolean;
  disabled?: boolean;
  badge?: number;
  count?: number;
  accent?: boolean;
  className?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      aria-pressed={active}
      title={label}
      className={cn(
        "motion-press relative flex size-10 shrink-0 items-center justify-center rounded-xl active:scale-95 sm:size-12 sm:rounded-2xl disabled:opacity-40 [&_svg]:size-5",
        danger
          ? "bg-destructive/90 text-destructive-foreground hover:bg-destructive"
          : active
            ? "bg-[image:var(--gradient-primary)] text-citron-ink shadow-button"
            : accent
              ? "bg-primary/15 text-primary-glow ring-1 ring-primary/30 hover:bg-primary/25"
              : "bg-secondary text-foreground hover:bg-accent",
        className,
      )}
    >
      {children}
      {!!badge && (
        <span
          key={badge}
          className="absolute -right-1 -top-1 flex min-w-5 animate-badge-bounce items-center justify-center rounded-full bg-primary px-1 text-[10px] font-bold text-primary-foreground ring-2 ring-dock"
        >
          {badge > 9 ? "9+" : badge}
        </span>
      )}
      {count !== undefined && count > 0 && !active && (
        <span className="absolute bottom-1 right-1.5 font-mono text-[10px] text-muted-foreground">{count}</span>
      )}
    </button>
  );
}

