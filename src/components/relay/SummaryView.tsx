import { CheckCircle2, CircleDot, Gavel, ListChecks } from "lucide-react";

import type { MeetingSummary } from "@/lib/meeting/types";
import { cn } from "@/lib/utils";

export function SummaryView({ summary, compact }: { summary: MeetingSummary; compact?: boolean }) {
  return (
    <div className={cn("space-y-6", compact && "space-y-5 text-sm")}>
      <div>
        <h3 className={cn("font-display font-semibold", compact ? "text-lg" : "text-2xl")}>{summary.title}</h3>
        <p className="mt-2 leading-relaxed text-muted-foreground">{summary.overview}</p>
      </div>

      {summary.actionItems.length > 0 && (
        <Section icon={ListChecks} title="Action items" count={summary.actionItems.length}>
          <ul className="space-y-2">
            {summary.actionItems.map((item, i) => (
              <li key={i} className="flex gap-3 rounded-xl border border-border bg-background/50 p-3">
                <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-primary" />
                <div className="min-w-0">
                  <p className="font-medium">{item.task}</p>
                  <p className="mt-1 flex flex-wrap gap-2 text-xs text-muted-foreground">
                    <span className="rounded-full bg-muted px-2 py-0.5">{item.owner ?? "Unassigned"}</span>
                    {item.due && <span className="rounded-full bg-muted px-2 py-0.5">Due {item.due}</span>}
                  </p>
                </div>
              </li>
            ))}
          </ul>
        </Section>
      )}

      {summary.decisions.length > 0 && (
        <Section icon={Gavel} title="Decisions" count={summary.decisions.length}>
          <ul className="space-y-1.5">
            {summary.decisions.map((d, i) => (
              <li key={i} className="flex gap-2">
                <span className="mt-2 size-1.5 shrink-0 rounded-full bg-live" />
                <span>{d}</span>
              </li>
            ))}
          </ul>
        </Section>
      )}

      {summary.keyPoints.length > 0 && (
        <Section icon={CircleDot} title="Key points" count={summary.keyPoints.length}>
          <ul className="space-y-1.5">
            {summary.keyPoints.map((d, i) => (
              <li key={i} className="flex gap-2">
                <span className="mt-2 size-1.5 shrink-0 rounded-full bg-muted-foreground" />
                <span>{d}</span>
              </li>
            ))}
          </ul>
        </Section>
      )}
    </div>
  );
}

function Section({
  icon: Icon,
  title,
  count,
  children,
}: {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  count: number;
  children: React.ReactNode;
}) {
  return (
    <section>
      <h4 className="mb-2.5 flex items-center gap-2 text-xs font-semibold uppercase tracking-widest text-muted-foreground">
        <Icon className="size-3.5" /> {title}
        <span className="font-mono text-[10px]">{count}</span>
      </h4>
      {children}
    </section>
  );
}

export function summaryToMarkdown(summary: MeetingSummary): string {
  const lines = [`# ${summary.title}`, "", summary.overview, ""];
  if (summary.actionItems.length) {
    lines.push("## Action items");
    for (const a of summary.actionItems) {
      lines.push(`- [ ] ${a.task}${a.owner ? ` — ${a.owner}` : ""}${a.due ? ` (due ${a.due})` : ""}`);
    }
    lines.push("");
  }
  if (summary.decisions.length) {
    lines.push("## Decisions", ...summary.decisions.map((d) => `- ${d}`), "");
  }
  if (summary.keyPoints.length) {
    lines.push("## Key points", ...summary.keyPoints.map((d) => `- ${d}`), "");
  }
  return lines.join("\n");
}
