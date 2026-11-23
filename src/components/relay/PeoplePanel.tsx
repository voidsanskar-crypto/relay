import { CameraOff, Hand, MicOff, MonitorUp } from "lucide-react";

import { CopyLinkButton } from "@/components/relay/CopyLinkButton";
import type { Participant } from "@/lib/meeting/use-meeting-session";

export function Avatar({ name, className }: { name: string; className?: string }) {
  const initials = name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase())
    .join("");
  return (
    <span
      className={
        "flex shrink-0 items-center justify-center rounded-full bg-primary/15 font-display font-semibold text-primary " +
        (className ?? "size-9 text-sm")
      }
    >
      {initials || "?"}
    </span>
  );
}

export function PeoplePanel({ participants, code }: { participants: Participant[]; code: string }) {
  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="min-h-0 flex-1 overflow-y-auto p-3">
        <p className="px-1 pb-2 text-xs font-medium uppercase tracking-widest text-muted-foreground">
          In this room · {participants.length}
        </p>
        <ul className="space-y-1">
          {participants.map((p) => (
            <li key={p.id} className="flex items-center gap-3 rounded-xl px-2 py-2 hover:bg-accent/50">
              <Avatar name={p.name} />
              <span className="min-w-0 flex-1 truncate text-sm font-medium">
                {p.name}
                {p.isSelf && <span className="ml-1 text-muted-foreground">(you)</span>}
              </span>
              <span className="flex items-center gap-1.5 text-muted-foreground [&_svg]:size-4">
                {p.hand && <Hand className="animate-pop-in text-primary" aria-label="Hand raised" />}
                {p.screen && <MonitorUp className="text-live" aria-label="Sharing screen" />}
                {!p.camOn && <CameraOff aria-label="Camera off" />}
                {!p.micOn && <MicOff className="text-destructive" aria-label="Muted" />}
              </span>
            </li>
          ))}
        </ul>
      </div>
      <div className="border-t border-border p-3">
        <CopyLinkButton code={code} className="w-full" />
      </div>
    </div>
  );
}
