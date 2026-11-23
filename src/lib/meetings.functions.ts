import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { generateRoomCode, isValidRoomCode } from "@/lib/room-code";
import type { ChatMessage, MeetingInfo, MeetingNote, MeetingSummary, TranscriptSegment } from "@/lib/meeting/types";

// Every function here is public: the unguessable room code is the access check.
const codeSchema = z.string().refine(isValidRoomCode, "Invalid room code");

async function admin() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin;
}

async function findMeeting(code: string) {
  const db = await admin();
  const { data, error } = await db
    .from("meetings")
    .select("id, code, title, created_at, summary, summary_generated_at")
    .eq("code", code)
    .maybeSingle();
  if (error) {
    console.error(error);
    throw new Error("Couldn't load this room.");
  }
  return data;
}

export const createMeeting = createServerFn({ method: "POST" })
  .inputValidator((input: { title?: string | undefined }) => z.object({ title: z.string().max(80).optional() }).parse(input))
  .handler(async ({ data }): Promise<MeetingInfo> => {
    const db = await admin();
    const title = data.title?.trim() || "Instant room";
    for (let attempt = 0; attempt < 3; attempt++) {
      const code = generateRoomCode();
      const { data: row, error } = await db
        .from("meetings")
        .insert({ code, title })
        .select("id, code, title, created_at")
        .single();
      if (!error && row) return { id: row.id, code: row.code, title: row.title, createdAt: row.created_at };
      if (error && error.code !== "23505") {
        console.error(error);
        break;
      }
    }
    throw new Error("Couldn't create a room. Please try again.");
  });

export const getMeeting = createServerFn({ method: "GET" })
  .inputValidator((input: { code: string }) => z.object({ code: codeSchema }).parse(input))
  .handler(async ({ data }): Promise<MeetingInfo | null> => {
    const row = await findMeeting(data.code);
    if (!row) return null;
    return { id: row.id, code: row.code, title: row.title, createdAt: row.created_at };
  });

async function loadRecord(meetingId: string) {
  const db = await admin();
  const [t, m, n] = await Promise.all([
    db
      .from("meeting_transcripts")
      .select("id, speaker, content, spoken_at")
      .eq("meeting_id", meetingId)
      .order("spoken_at", { ascending: true })
      .limit(2000),
    db
      .from("meeting_messages")
      .select("id, sender, body, sent_at")
      .eq("meeting_id", meetingId)
      .order("sent_at", { ascending: true })
      .limit(1000),
    db
      .from("meeting_notes")
      .select("id, content, owner, due, added_by, created_at")
      .eq("meeting_id", meetingId)
      .order("created_at", { ascending: true })
      .limit(500),
  ]);
  if (t.error || m.error || n.error) {
    console.error(t.error ?? m.error ?? n.error);
    throw new Error("Couldn't load the meeting record.");
  }
  const transcript: TranscriptSegment[] = (t.data ?? []).map((r) => ({
    id: r.id,
    speaker: r.speaker,
    content: r.content,
    spokenAt: r.spoken_at,
  }));
  const messages: ChatMessage[] = (m.data ?? []).map((r) => ({
    id: r.id,
    sender: r.sender,
    body: r.body,
    sentAt: r.sent_at,
  }));
  const notes: MeetingNote[] = (n.data ?? []).map((r) => ({
    id: r.id,
    content: r.content,
    owner: r.owner,
    due: r.due,
    addedBy: r.added_by,
    createdAt: r.created_at,
  }));
  return { transcript, messages, notes };
}

function recordAsText(transcript: TranscriptSegment[], messages: ChatMessage[], notes: MeetingNote[] = []): string {
  const lines = [
    ...notes.map((n) => ({
      at: n.createdAt,
      line: `[saved action item, added by ${n.addedBy}] ${n.content}${n.owner ? ` — owner: ${n.owner}` : ""}${n.due ? ` — due: ${n.due}` : ""}`,
    })),
    ...transcript.map((s) => ({ at: s.spokenAt, line: `${s.speaker}: ${s.content}` })),
    ...messages.map((c) => ({ at: c.sentAt, line: `[chat] ${c.sender}: ${c.body}` })),
  ].sort((a, b) => a.at.localeCompare(b.at));
  const stamped = lines.map((l) => `[${l.at.slice(11, 16)}] ${l.line}`).join("\n");
  // Keep the most recent part of very long meetings within a sensible prompt size.
  return stamped.length > 60000 ? stamped.slice(-60000) : stamped;
}

export const getMeetingRecord = createServerFn({ method: "GET" })
  .inputValidator((input: { code: string }) => z.object({ code: codeSchema }).parse(input))
  .handler(async ({ data }) => {
    const row = await findMeeting(data.code);
    if (!row) return null;
    const { transcript, messages, notes } = await loadRecord(row.id);
    return {
      meeting: { id: row.id, code: row.code, title: row.title, createdAt: row.created_at } as MeetingInfo,
      transcript,
      messages,
      notes,
      summary: (row.summary as MeetingSummary | null) ?? null,
      summaryGeneratedAt: row.summary_generated_at,
    };
  });

export const saveTranscriptSegment = createServerFn({ method: "POST" })
  .inputValidator((input: { code: string; id: string; speaker: string; content: string }) =>
    z
      .object({
        code: codeSchema,
        id: z.string().uuid(),
        speaker: z.string().min(1).max(60),
        content: z.string().min(1).max(4000),
      })
      .parse(input),
  )
  .handler(async ({ data }) => {
    const row = await findMeeting(data.code);
    if (!row) throw new Error("Room not found");
    const db = await admin();
    const { error } = await db
      .from("meeting_transcripts")
      .insert({ id: data.id, meeting_id: row.id, speaker: data.speaker, content: data.content });
    if (error) console.error(error);
    await db.from("meetings").update({ last_active_at: new Date().toISOString() }).eq("id", row.id);
    return { ok: !error };
  });

export const saveChatMessage = createServerFn({ method: "POST" })
  .inputValidator((input: { code: string; id: string; sender: string; body: string }) =>
    z
      .object({
        code: codeSchema,
        id: z.string().uuid(),
        sender: z.string().min(1).max(60),
        body: z.string().min(1).max(2000),
      })
      .parse(input),
  )
  .handler(async ({ data }) => {
    const row = await findMeeting(data.code);
    if (!row) throw new Error("Room not found");
    const db = await admin();
    const { error } = await db
      .from("meeting_messages")
      .insert({ id: data.id, meeting_id: row.id, sender: data.sender, body: data.body });
    if (error) console.error(error);
    return { ok: !error };
  });

export const askMeetingAssistant = createServerFn({ method: "POST" })
  .inputValidator((input: { code: string; question: string }) =>
    z.object({ code: codeSchema, question: z.string().min(1).max(1000) }).parse(input),
  )
  .handler(async ({ data }): Promise<{ answer: string } | { error: string }> => {
    const row = await findMeeting(data.code);
    if (!row) return { error: "Room not found." };
    const { transcript, messages, notes } = await loadRecord(row.id);
    const { answerFromMeeting, AssistantError } = await import("@/lib/ai/gateway.server");
    try {
      const answer = await answerFromMeeting(recordAsText(transcript, messages, notes), data.question);
      return { answer };
    } catch (error) {
      return { error: error instanceof AssistantError ? error.message : "The assistant couldn't answer." };
    }
  });

export const generateMeetingSummary = createServerFn({ method: "POST" })
  .inputValidator((input: { code: string }) => z.object({ code: codeSchema }).parse(input))
  .handler(
    async ({ data }): Promise<{ summary: MeetingSummary; generatedAt: string } | { error: string }> => {
      const row = await findMeeting(data.code);
      if (!row) return { error: "Room not found." };
      const { transcript, messages, notes } = await loadRecord(row.id);
      if (transcript.length === 0 && messages.length === 0 && notes.length === 0) {
        return { error: "There's nothing to summarize yet — no one has spoken or chatted." };
      }
      const { summarizeMeeting, AssistantError } = await import("@/lib/ai/gateway.server");
      try {
        const summary = await summarizeMeeting(recordAsText(transcript, messages, notes));
        const generatedAt = new Date().toISOString();
        const db = await admin();
        await db.from("meetings").update({ summary, summary_generated_at: generatedAt }).eq("id", row.id);
        return { summary, generatedAt };
      } catch (error) {
        return { error: error instanceof AssistantError ? error.message : "Couldn't create the summary." };
      }
    },
  );

export const suggestActionItem = createServerFn({ method: "POST" })
  .inputValidator((input: { code: string; speaker: string; line: string; recent: string }) =>
    z
      .object({
        code: codeSchema,
        speaker: z.string().min(1).max(60),
        line: z.string().min(1).max(1000),
        recent: z.string().max(3000),
      })
      .parse(input),
  )
  .handler(async ({ data }): Promise<{ task: string; owner: string | null; due: string | null } | null> => {
    const row = await findMeeting(data.code);
    if (!row) return null;
    const { extractActionItem } = await import("@/lib/ai/gateway.server");
    try {
      return await extractActionItem(data.speaker, data.line, data.recent);
    } catch (error) {
      console.warn("Action item check failed", error);
      return null;
    }
  });

export const addMeetingNote = createServerFn({ method: "POST" })
  .inputValidator(
    (input: { code: string; id: string; content: string; owner: string | null; due: string | null; addedBy: string }) =>
      z
        .object({
          code: codeSchema,
          id: z.string().uuid(),
          content: z.string().trim().min(1).max(500),
          owner: z.string().trim().max(80).nullable(),
          due: z.string().trim().max(80).nullable(),
          addedBy: z.string().trim().min(1).max(60),
        })
        .parse(input),
  )
  .handler(async ({ data }): Promise<MeetingNote> => {
    const row = await findMeeting(data.code);
    if (!row) throw new Error("Room not found");
    const db = await admin();
    // Two people can save the same suggestion at once; the shared id keeps it to one note.
    const { error } = await db.from("meeting_notes").upsert(
      {
        id: data.id,
        meeting_id: row.id,
        content: data.content,
        owner: data.owner || null,
        due: data.due || null,
        added_by: data.addedBy,
      },
      { onConflict: "id", ignoreDuplicates: true },
    );
    if (error) {
      console.error(error);
      throw new Error("Couldn't save the note.");
    }
    const { data: saved, error: readError } = await db
      .from("meeting_notes")
      .select("id, content, owner, due, added_by, created_at")
      .eq("id", data.id)
      .eq("meeting_id", row.id)
      .single();
    if (readError || !saved) throw new Error("Couldn't save the note.");
    return {
      id: saved.id,
      content: saved.content,
      owner: saved.owner,
      due: saved.due,
      addedBy: saved.added_by,
      createdAt: saved.created_at,
    };
  });
