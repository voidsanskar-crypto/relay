import { createOpenAI } from "@ai-sdk/openai";
import { APICallError, NoObjectGeneratedError, Output, streamText } from "ai";
import { z } from "zod";

import { createLovableAiGatewayRunIdFetch } from "./run-id.server";

const GATEWAY_URL = "https://ai.gateway.lovable.dev/v1";
const MODEL = "openai/gpt-6-astra";

export class AssistantError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

function createProvider() {
  const apiKey = process.env["LOVABLE_API_KEY"];
  if (!apiKey) throw new AssistantError("The AI assistant isn't configured yet.", 401);
  const runIdFetch = createLovableAiGatewayRunIdFetch();
  return createOpenAI({
    baseURL: GATEWAY_URL,
    apiKey,
    headers: { "Lovable-API-Key": apiKey, "X-Lovable-AIG-SDK": "vercel-ai-sdk" },
    fetch: runIdFetch.fetch,
  });
}

const providerOptions = {
  openai: {
    forceReasoning: true,
    reasoningEffort: "low",
    reasoningSummary: "auto",
    store: false,
    include: ["reasoning.encrypted_content"],
  },
};

function toAssistantError(error: unknown): AssistantError {
  if (error instanceof AssistantError) return error;
  if (APICallError.isInstance(error)) {
    const status = error.statusCode ?? 500;
    let message = "The AI assistant is unavailable right now. Please try again shortly.";
    if (status === 429) message = "The AI assistant is busy. Please wait a moment and try again.";
    if (status === 402)
      message = "AI credits have run out for this workspace. Add credits to keep using the assistant.";
    if (status === 403) message = "The AI assistant isn't available for this workspace right now.";
    try {
      const body = JSON.parse(error.responseBody ?? "{}") as { message?: string; error?: { message?: string } };
      const safe = body.message ?? body.error?.message;
      if (safe && (status === 402 || status === 403)) message = safe;
    } catch {
      // keep generic message
    }
    console.error("AI gateway error", status, error.responseBody);
    return new AssistantError(message, status);
  }
  console.error("AI assistant failure", error);
  return new AssistantError("The AI assistant hit an unexpected problem.", 500);
}

export async function answerFromMeeting(context: string, question: string): Promise<string> {
  try {
    const result = streamText({
      model: createProvider().responses(MODEL),
      instructions:
        "You are Relay's in-meeting assistant. Answer using only the meeting transcript and chat provided. " +
        "Be concise (under 150 words), use short bullet points when listing, name who said what when useful, " +
        "and say plainly when the meeting hasn't covered something yet.",
      messages: [
        {
          role: "user",
          content: `MEETING RECORD\n${context || "(Nothing has been said yet.)"}\n\nQUESTION\n${question}`,
        },
      ],
      providerOptions,
    });
    const text = (await result.text).trim();
    if (!text) throw new AssistantError("The assistant couldn't answer that. Try asking differently.", 422);
    return text;
  } catch (error) {
    throw toAssistantError(error);
  }
}

export const summarySchema = z.object({
  title: z.string(),
  overview: z.string(),
  keyPoints: z.array(z.string()),
  decisions: z.array(z.string()),
  actionItems: z.array(
    z.object({
      task: z.string(),
      owner: z.string().nullable(),
      due: z.string().nullable(),
    }),
  ),
});

export type MeetingSummary = z.infer<typeof summarySchema>;

export async function summarizeMeeting(context: string): Promise<MeetingSummary> {
  try {
    const result = streamText({
      model: createProvider().responses(MODEL),
      instructions:
        "You write crisp post-meeting summaries. From the transcript and chat, produce: a short meeting title " +
        "(max 8 words), a 2-4 sentence overview, up to 6 key points, the decisions made, and concrete action items. " +
        "For each action item set owner to the person responsible if one was named, otherwise null; set due to the " +
        "deadline mentioned, otherwise null. Never invent facts not in the record. Use empty lists when nothing applies.",
      messages: [{ role: "user", content: `MEETING RECORD\n${context}` }],
      output: Output.object({ schema: summarySchema }),
      providerOptions,
    });
    try {
      const output = await result.output;
      return normalizeSummary(output);
    } catch (error) {
      if (NoObjectGeneratedError.isInstance(error) && error.text) {
        const parsed = summarySchema.safeParse(JSON.parse(error.text));
        if (parsed.success) return normalizeSummary(parsed.data);
      }
      throw error;
    }
  } catch (error) {
    throw toAssistantError(error);
  }
}

function normalizeSummary(s: MeetingSummary): MeetingSummary {
  return {
    title: s.title.trim().slice(0, 120) || "Meeting summary",
    overview: s.overview.trim(),
    keyPoints: s.keyPoints.map((p) => p.trim()).filter(Boolean).slice(0, 8),
    decisions: s.decisions.map((p) => p.trim()).filter(Boolean),
    actionItems: s.actionItems.filter((a) => a.task.trim()),
  };
}

const actionSchema = z.object({
  isActionItem: z.boolean(),
  task: z.string(),
  owner: z.string().nullable(),
  due: z.string().nullable(),
});

export type ExtractedAction = { task: string; owner: string | null; due: string | null };

/** Decides whether the newest transcript line is a concrete task or commitment, and phrases it. */
export async function extractActionItem(speaker: string, line: string, recent: string): Promise<ExtractedAction | null> {
  try {
    const result = streamText({
      model: createProvider().responses(MODEL),
      instructions:
        "You watch a live meeting transcript for action items. Look only at the NEW LINE (use RECENT for context). " +
        "Set isActionItem true only for a concrete task, commitment or request someone should follow up on — not " +
        "opinions, ideas, questions about the past, or small talk. task: a short imperative phrase, max 8 words, " +
        "starting with a verb (e.g. 'Send project roadmap'). owner: the responsible person's name; when the speaker " +
        "says I/me, that's the speaker; null if unclear. due: the deadline as said (e.g. 'Friday'), else null. " +
        "When it isn't an action item, set task to an empty string and owner/due to null.",
      messages: [
        {
          role: "user",
          content: `RECENT\n${recent || "(none)"}\n\nNEW LINE\n${speaker}: ${line}`,
        },
      ],
      output: Output.object({ schema: actionSchema }),
      providerOptions,
    });
    let output: z.infer<typeof actionSchema>;
    try {
      output = await result.output;
    } catch (error) {
      if (NoObjectGeneratedError.isInstance(error) && error.text) {
        const parsed = actionSchema.safeParse(JSON.parse(error.text));
        if (!parsed.success) throw error;
        output = parsed.data;
      } else {
        throw error;
      }
    }
    const task = output.task.trim().replace(/[.!]+$/, "");
    if (!output.isActionItem || !task) return null;
    return {
      task: task.slice(0, 120),
      owner: output.owner?.trim().slice(0, 80) || null,
      due: output.due?.trim().slice(0, 80) || null,
    };
  } catch (error) {
    throw toAssistantError(error);
  }
}
