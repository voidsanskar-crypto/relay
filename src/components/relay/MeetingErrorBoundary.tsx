import { Component, type ErrorInfo, type ReactNode } from "react";
import { RotateCcw } from "lucide-react";

import { RelayLogo } from "@/components/relay/RelayLogo";
import { Button } from "@/components/ui/button";
import { reportLovableError } from "@/lib/lovable-error-reporting";

type Props = { children: ReactNode; onLeave: () => void };
type State = { error: Error | null; attempt: number };

/**
 * Keeps a crash inside the call from taking down the whole page: the person sees what went
 * wrong and can rejoin the same room in one click instead of landing on a generic error screen.
 */
export class MeetingErrorBoundary extends Component<Props, State> {
  override state: State = { error: null, attempt: 0 };

  static getDerivedStateFromError(error: unknown): Partial<State> {
    return { error: error instanceof Error ? error : new Error(String(error)) };
  }

  override componentDidCatch(error: unknown, info: ErrorInfo) {
    console.error("Meeting room crashed", error, info.componentStack);
    reportLovableError(error, { boundary: "meeting_room" });
  }

  rejoin = () => this.setState((s) => ({ error: null, attempt: s.attempt + 1 }));

  override render() {
    const { error, attempt } = this.state;
    if (!error) return <div key={attempt} className="contents">{this.props.children}</div>;
    return (
      <div className="grain flex min-h-dvh flex-col items-center justify-center gap-6 px-6 text-center">
        <RelayLogo />
        <div className="max-w-md">
          <h1 className="font-display text-3xl font-semibold">The call hit a snag</h1>
          <p className="mt-2 text-muted-foreground">
            Something in the meeting stopped working. Rejoin to pick up where you left off — the room, chat and notes
            are still there.
          </p>
          <p className="mt-4 rounded-lg bg-muted px-3 py-2 font-mono text-xs text-muted-foreground">{error.message}</p>
        </div>
        <div className="flex gap-2">
          <Button size="lg" onClick={this.rejoin}>
            <RotateCcw /> Rejoin
          </Button>
          <Button size="lg" variant="secondary" onClick={this.props.onLeave}>
            Leave
          </Button>
        </div>
      </div>
    );
  }
}
