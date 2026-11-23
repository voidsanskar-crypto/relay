export type ChatMessage = { id: string; sender: string; senderId?: string; body: string; sentAt: string };
export type TranscriptSegment = { id: string; speaker: string; speakerId?: string; content: string; spokenAt: string };
export type ActionItem = { task: string; owner: string | null; due: string | null };
export type MeetingSummary = {
  title: string;
  overview: string;
  keyPoints: string[];
  decisions: string[];
  actionItems: ActionItem[];
};
export type MeetingInfo = { id: string; code: string; title: string; createdAt: string };
export type MeetingNote = {
  id: string;
  content: string;
  owner: string | null;
  due: string | null;
  addedBy: string;
  createdAt: string;
};
/** An action item the AI spotted in the live transcript, waiting for someone to save or dismiss it. */
export type Suggestion = { id: string; task: string; owner: string | null; due: string | null; speaker: string };
