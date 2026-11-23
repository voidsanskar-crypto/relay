import { Check, ListPlus, Loader2, Sparkles, X } from "lucide-react";
import { useEffect, useState } from "react";

import type { Suggestion } from "@/lib/meeting/types";
import { cn } from "@/lib/utils";

export type PendingSuggestion = Suggestion & { status: "new" | "saving" | "added" };

const AUTO_HIDE_MS = 30000;

export function SuggestionPills({
  items,
  onAdd,
  onDismiss,
}: {
  items: PendingSuggestion[];
  onAdd: (s: PendingSuggestion) => void;
  onDismiss: (id: string) => void;
}) {
  if (!items.length) return null;
  return (
    <div
      className="pointer-events-none absolute right-3 top-3 z-10 flex w-[min(22rem,calc(100%-1.5rem))] flex-col items-end gap-2 sm:right-4"
      aria-live="polite"
    >
      {items.slice(-2).map((s) => (
        <Pill key={s.id} item={s} onAdd={onAdd} onDismiss={onDismiss} />
      ))}
    </div>
  );
}

function Pill({
  item,
  onAdd,
  onDismiss,
}: {
  item: PendingSuggestion;
  onAdd: (s: PendingSuggestion) => void;
  onDismiss: (id: string) => void;
}) {
  const [hovered, setHovered] = useState(false);
  useEffect(() => {
    if (hovered || item.status !== "new") return;
    const t = setTimeout(() => onDismiss(item.id), AUTO_HIDE_MS);
    return () => {
      clearTimeout(t);
    };
  }, [hovered, item.status, item.id, onDismiss]);

  const meta = [item.owner, item.due && `due ${item.due}`].filter(Boolean).join(" · ");
  const added = item.status === "added";

  return (
    <div
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      className={cn(
        "glass-pill pointer-events-auto flex w-full origin-top-right animate-pop-in items-center gap-2.5 rounded-2xl py-2 pl-3 pr-2 text-sm",
        added && "transition-opacity delay-700 duration-700",
      )}
    >
      <span
        className={cn(
          "flex size-7 shrink-0 items-center justify-center rounded-full transition-colors duration-300",
          added ? "bg-live/15 text-live" : "bg-primary/10 text-primary",
        )}
      >
        {added ? <Check className="size-4 animate-pop-in" /> : <Sparkles className="size-4" />}
      </span>
      <div className="min-w-0 flex-1">
        <p className="truncate leading-tight">
          <span className="font-semibold">{added ? "Added to notes:" : "Action item:"}</span> {item.task}
        </p>
        {meta && <p className="truncate text-[11px] text-muted-foreground">{meta}</p>}
      </div>
      {!added && (
        <>
          <button
            type="button"
            onClick={() => onAdd(item)}
            disabled={item.status === "saving"}
            className="motion-press flex h-8 shrink-0 items-center gap-1.5 rounded-xl bg-primary px-2.5 text-xs font-semibold text-primary-foreground hover:bg-primary/90 active:scale-95 disabled:opacity-70"
          >
            {item.status === "saving" ? <Loader2 className="size-3.5 animate-spin" /> : <ListPlus className="size-3.5" />}
            Add to notes
          </button>
          <button
            type="button"
            onClick={() => onDismiss(item.id)}
            aria-label="Dismiss suggestion"
            className="flex size-7 shrink-0 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
          >
            <X className="size-3.5" />
          </button>
        </>
      )}
    </div>
  );
}
