import type { ChatMessage, MeetingNote, Suggestion, TranscriptSegment } from "./types";

export type StrokeTool = "pen" | "marker" | "eraser";
export type StrokeMeta = { id: string; author: string; tool: StrokeTool; color: string; size: number };
export type Stroke = StrokeMeta & { points: number[] };

export type SessionDescriptionLike = { type: RTCSdpType; sdp?: string };

// Every realtime message travels as one broadcast event with a typed payload.
export type BusEvent =
  | { type: "signal"; from: string; to: string; description?: SessionDescriptionLike; candidate?: RTCIceCandidateInit }
  | { type: "chat"; message: ChatMessage }
  | { type: "transcript"; segment: TranscriptSegment }
  | { type: "caption"; from: string; name: string; text: string }
  | { type: "board-points"; stroke: StrokeMeta; points: number[] }
  | { type: "board-remove"; id: string }
  | { type: "board-clear"; from: string; name: string }
  | { type: "board-sync-request"; from: string }
  | { type: "board-sync"; to: string; strokes: Stroke[] }
  | { type: "board-open"; from: string; name: string }
  | { type: "suggestion"; suggestion: Suggestion }
  | { type: "note"; note: MeetingNote };

export type Bus = {
  send: (event: BusEvent) => void;
  subscribe: (listener: (event: BusEvent) => void) => () => void;
};
