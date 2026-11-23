import { Video } from "lucide-react";
import { cn } from "@/lib/utils";

export function RelayMark({ className }: { className?: string }) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        "relay-mark inline-flex size-7 shrink-0 items-center justify-center",
        className,
      )}
    >
      <Video size="57%" strokeWidth={2.8} fill="currentColor" />
    </span>
  );
}

export function RelayLogo({ className }: { className?: string }) {
  return (
    <span className={cn("inline-flex items-center gap-2", className)}>
      <RelayMark />
      <span className="relay-wordmark">relay</span>
    </span>
  );
}
