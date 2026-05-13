import { NextRequest, NextResponse } from "next/server";
import { getAIClient } from "@/lib/ai/modelRouter";
import { buildSystemPrompt } from "@/lib/mentor/systemPrompt";
import { parseModelOutput } from "@/lib/mentor/referenceParser";
import { addCost } from "@/lib/storage/costStorage";
import {
  readMentorState,
  ensureDataFiles,
  writeInbox,
  readConversationHistory,
  appendConversationItem,
} from "@/lib/mentor/mentorStorage";
import { enforceP0Safety } from "@/lib/mentor/priorityLogic";
import { analyzeAllTasks } from "@/lib/mentor/taskAnalyzer";
import { migrateTasks, getStaleSeedWarnings } from "@/lib/mentor/migrateMentorData";
import type {
  MentorRequest,
  MentorAdvice,
  MentorInboxItem,
  MentorState,
  MentorConversationItem,
} from "@/lib/mentorTypes";

function getTodayISO(): string {
  return new Date().toLocaleDateString("sv-SE", { timeZone: "Europe/Amsterdam" });
}

function buildMentorContext(
  state: MentorState,
  todayISO: string,
  recentConversation: MentorConversationItem[]
): string {
  const p0p1 = state.tasks.filter(
    t => (t.priority === "P0" || t.priority === "P1") && t.status === "open"
  );
  const p2 = state.tasks
    .filter(t => t.priority === "P2" && t.status === "open")
    .slice(0, 8);
  const recentDecisions = state.decisions.slice(0, 5);
  const recentInbox = state.inboxItems.slice(0, 8);

  const taskLines = [...p0p1, ...p2]
    .map(t => {
      const deadline = t.hardDeadline ?? t.deadline;
      const routineTag = t.isRecurringInstance ? "/routine" : "";
      const plannedTag = t.plannedStart ? ` (gepland: ${t.plannedStart.slice(0, 10)} ${t.plannedStart.slice(11, 16)})` : "";
      const gcalTag = t.calendarLink?.syncStatus === "synced" ? " [gcal]" : "";
      return `[${t.priority}${t.coveyQuadrant ? `/${t.coveyQuadrant}` : ""}${routineTag}] ${t.title}${deadline ? ` (deadline: ${deadline})` : ""}${plannedTag}${gcalTag}${t.estimatedMinutes ? ` ~${t.estimatedMinutes}min` : ""}${t.project ? ` -- ${t.project}` : ""}`;
    })
    .join("\n");

  const decisionLines =
    recentDecisions.map(d => `- ${d.date}: ${d.decision}`).join("\n") || "Geen";
  const inboxLines =
    recentInbox
      .map(i => `- ${i.createdAt.slice(0, 10)}: ${i.rawInput.slice(0, 100)}`)
      .join("\n") || "Leeg";

  const convLines =
    recentConversation
      .slice(0, 5)
      .map(
        c =>
          `[${c.createdAt.slice(0, 16)}] Jorn: ${c.userMessage.slice(0, 80)} → Mentor: ${c.assistantSummary.slice(0, 120)}`
      )
      .join("\n") || "Geen recente sessies";

  return `## Datum
${todayISO}

## Open taken (P0/P1 volledig, P2 top 8)
${taskLines || "Geen open taken"}

## Recente beslissingen
${decisionLines}

## Recente inbox
${inboxLines}

## Recente gesprekken (context)
${convLines}`;
}

export async function POST(req: NextRequest) {
  try {
    await ensureDataFiles();

    const body = (await req.json()) as MentorRequest;
    if (!body.userMessage?.trim()) {
      return NextResponse.json({ error: "userMessage is verplicht" }, { status: 400 });
    }

    const todayISO = getTodayISO();

    const [state, recentConversation] = await Promise.all([
      readMentorState(),
      readConversationHistory(),
    ]);

    // Migrate and compute analysis
    const migratedTasks = migrateTasks(state.tasks, todayISO);
    const safeState: MentorState = { ...state, tasks: enforceP0Safety(migratedTasks) };

    // Stale warnings
    const staleWarnings = getStaleSeedWarnings(safeState.tasks, todayISO);

    // Save inbox item
    const inboxEntry: MentorInboxItem = {
      id: `inbox_${Date.now()}`,
      createdAt: new Date().toISOString(),
      source: "jorn",
      rawInput: body.userMessage,
      status: "new",
      detectedSignals: [],
      linkedTaskIds: [],
    };
    const updatedInbox = [inboxEntry, ...safeState.inboxItems];
    if (updatedInbox.length > 100) updatedInbox.splice(100);
    await writeInbox(updatedInbox);

    const mentorContext = buildMentorContext(safeState, todayISO, recentConversation);

    const userMessage = `## Nieuwe input van Jorn:
${body.userMessage}

## Context:
${mentorContext}`;

    const client = getAIClient();
    const systemPrompt = buildSystemPrompt();
    const aiResponse = await client.complete(systemPrompt, userMessage);

    addCost(aiResponse.inputTokens, aiResponse.outputTokens, aiResponse.costUSD).catch(console.error);

    const parsed = parseModelOutput(aiResponse.text);

    // Task analyses for all current tasks
    const taskAnalyses = analyzeAllTasks(safeState.tasks, todayISO);

    // Save conversation item
    const convItem: MentorConversationItem = {
      id: `conv_${Date.now()}`,
      createdAt: new Date().toISOString(),
      userMessage: body.userMessage,
      assistantSummary: parsed.adviceText.slice(0, 200),
      recommendedTaskIds: (parsed.todayTasks ?? []).map(t => t.title),
      topPriorityTaskId: parsed.topPriority?.title,
      decisionsMade: [],
      patchesProposed: parsed.proposedPatches ?? [],
      patchesApplied: [],
    };
    await appendConversationItem(convItem);

    const openTasks = safeState.tasks.filter(
      t => t.status === "open" || t.status === "in_progress"
    );
    const p0Count = openTasks.filter(t => t.priority === "P0").length;
    const p1Count = openTasks.filter(t => t.priority === "P1").length;

    // Build upcoming warnings combining AI warnings + stale
    const upcomingWarnings = [
      ...(parsed.upcomingWarnings ?? []),
      ...staleWarnings.map(w => ({ title: "Verlopen deadline", message: w })),
    ];

    const response: MentorAdvice = {
      adviceText: parsed.adviceText,
      updatedReference: null,
      rawOutput: aiResponse.text,
      topPriority: parsed.topPriority,
      todayTasks: parsed.todayTasks,
      doNotDo: parsed.doNotDo,
      parked: parsed.parked,
      upcomingWarnings,
      conflicts: parsed.conflicts,
      proposedPatches: parsed.proposedPatches, // NOT auto-applied
      appliedPatchesCount: 0,
      stateSummary: { openTasks: openTasks.length, p0Count, p1Count },
      taskAnalyses,
      parseError: parsed.parseError,
      conversationContextUsed: recentConversation.length > 0,
    };

    return NextResponse.json({
      ...response,
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
