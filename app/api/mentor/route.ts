import { NextRequest, NextResponse } from "next/server";
import { getAIClient } from "@/lib/ai/modelRouter";
import { buildSystemPrompt } from "@/lib/mentor/systemPrompt";
import { addCost } from "@/lib/storage/costStorage";
import { readMentorState, ensureDataFiles } from "@/lib/mentor/mentorStorage";
import type { MentorPatch } from "@/lib/mentorTypes";

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

interface MentorRequest {
  userMessage: string;
  conversationMessages?: ChatMessage[];
}

interface MentorOutput {
  message: string;
  patches?: MentorPatch[];
}

function parseOutput(text: string): MentorOutput {
  try {
    const cleaned = text.trim().replace(/^```(?:json)?\n?/, "").replace(/\n?```$/, "");
    const parsed = JSON.parse(cleaned) as MentorOutput;
    return {
      message: parsed.message ?? text,
      patches: Array.isArray(parsed.patches) ? parsed.patches : [],
    };
  } catch {
    return { message: text, patches: [] };
  }
}

export async function POST(req: NextRequest) {
  try {
    await ensureDataFiles();
    const body = (await req.json()) as MentorRequest;
    if (!body.userMessage?.trim()) {
      return NextResponse.json({ error: "userMessage is verplicht" }, { status: 400 });
    }

    const state = await readMentorState();
    const systemPrompt = buildSystemPrompt(state.tasks);

    // Build conversation history — keep last 8 messages (4 exchanges) to limit tokens
    const history: ChatMessage[] = (body.conversationMessages ?? []).slice(-8);
    const messages: ChatMessage[] = [...history, { role: "user", content: body.userMessage }];

    const client = getAIClient();
    const aiResponse = await client.completeChat(systemPrompt, messages);

    addCost(aiResponse.inputTokens, aiResponse.outputTokens, aiResponse.costUSD).catch(console.error);

    const parsed = parseOutput(aiResponse.text);

    return NextResponse.json({
      message: parsed.message,
      patches: parsed.patches ?? [],
      usage: {
        inputTokens: aiResponse.inputTokens,
        outputTokens: aiResponse.outputTokens,
        costUSD: aiResponse.costUSD,
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Onbekende fout";
    console.error("[/api/mentor]", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
