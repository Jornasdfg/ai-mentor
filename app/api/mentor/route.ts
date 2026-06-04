import { NextRequest, NextResponse } from "next/server";
import { getAIClient } from "@/lib/ai/modelRouter";
import { buildSystemPrompt } from "@/lib/mentor/systemPrompt";
import { addCost } from "@/lib/storage/costStorage";
import { readMentorState, ensureDataFiles } from "@/lib/mentor/mentorStorage";
import { buildPlanningContext, resolveAvailability } from "@/lib/mentor/planningContext";
import { readDedupSuggestions } from "@/lib/mentor/taskDedup";
import { readWeeklyReview, buildWeeklyReviewSnippet } from "@/lib/mentor/weeklyReviewStorage";
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
    const [planningContext, suggestions, availability, weeklyReviewData] = await Promise.all([
      buildPlanningContext().catch(() => ""),
      readDedupSuggestions().catch(() => []),
      resolveAvailability(body.userMessage).catch(() => null),
      readWeeklyReview().catch(() => null),
    ]);
    // Token-zuinig: alleen een compacte snippet, en alleen als de review vers is.
    const weeklyReviewSnippet = buildWeeklyReviewSnippet(weeklyReviewData);
    // Deterministisch beschikbaarheidsantwoord bovenaan zetten (de chat hoeft het alleen door te geven).
    const planningWithAnswer = availability ? `${availability}\n\n${planningContext}` : planningContext;
    // Compacte hint (max 2) zodat de mentor mogelijke duplicaten kan aankaarten — token-zuinig.
    const dedupHint = suggestions.slice(0, 2)
      .map(s => `- "${s.titles[0]}" ↔ "${s.titles[1]}" (${s.reason}) [ids: ${s.ids.join(", ")}]`)
      .join("\n");
    const systemPrompt = buildSystemPrompt(state.tasks, planningWithAnswer, dedupHint, weeklyReviewSnippet);

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
