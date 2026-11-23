import { useEffect, useRef, useState } from "react";
import { SendHorizonal } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { ChatMessage } from "@/lib/meeting/types";
import { cn } from "@/lib/utils";

export function ChatPanel({
  messages,
  selfId,
  selfName,
  onSend,
}: {
  messages: ChatMessage[];
  selfId: string;
  selfName: string;
  onSend: (body: string) => void;
}) {
  const [draft, setDraft] = useState("");
  const endRef = useRef<HTMLDivElement>(null);
  // Only messages that arrive after the panel mounts animate in; history appears as-is.
  const [seenAtMount] = useState(() => new Set(messages.map((m) => m.id)));
  useEffect(() => {
    // Newer browsers return a Promise from scrollIntoView; never hand it back to React as a cleanup.
    endRef.current?.scrollIntoView({ block: "end" });
  }, [messages.length]);

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="min-h-0 flex-1 space-y-3 overflow-y-auto px-4 py-4">
        {messages.length === 0 && (
          <p className="pt-10 text-center text-sm text-muted-foreground">
            No messages yet. Say hi — chat is saved with the meeting notes.
          </p>
        )}
        {messages.map((m) => {
          const mine = m.senderId ? m.senderId === selfId : m.sender === selfName;
          return (
            <div
              key={m.id}
              className={cn(
                "flex flex-col",
                mine ? "items-end" : "items-start",
                !seenAtMount.has(m.id) && (mine ? "animate-rise-in-right" : "animate-rise-in"),
              )}
            >
              <span className="mb-1 text-[11px] text-muted-foreground">
                {mine ? "You" : m.sender} ·{" "}
                {new Date(m.sentAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
              </span>
              <p
                className={cn(
                  "max-w-[85%] whitespace-pre-wrap break-words rounded-2xl px-3 py-2 text-sm",
                  mine ? "rounded-br-md bg-primary text-primary-foreground" : "rounded-bl-md bg-muted",
                )}
              >
                {m.body}
              </p>
            </div>
          );
        })}
        <div ref={endRef} />
      </div>
      <form
        className="flex gap-2 border-t border-border p-3"
        onSubmit={(e) => {
          e.preventDefault();
          if (!draft.trim()) return;
          onSend(draft);
          setDraft("");
        }}
      >
        <Input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="Message everyone"
          maxLength={2000}
          className="bg-background/60"
          aria-label="Chat message"
        />
        <Button type="submit" size="icon" disabled={!draft.trim()} aria-label="Send message">
          <SendHorizonal />
        </Button>
      </form>
    </div>
  );
}
