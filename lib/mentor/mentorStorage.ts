import fs from "fs/promises";
import path from "path";
import type { MentorTask, MentorDecision, MentorInboxItem, MentorState, MailAction, MentorConversationItem, MentorRecurringTask } from "../mentorTypes";

function getDataDir(): string {
  const base = /* turbopackIgnore: true */ process.cwd();
  return process.env.DATA_DIR
    ? path.resolve(base, process.env.DATA_DIR)
    : path.join(base, "data");
}

function filePath(name: string): string {
  return path.join(getDataDir(), name);
}

async function ensureDir(): Promise<void> {
  await fs.mkdir(getDataDir(), { recursive: true });
}

export async function readTasks(): Promise<MentorTask[]> {
  try {
    const raw = await fs.readFile(filePath("task_register.json"), "utf-8");
    return JSON.parse(raw) as MentorTask[];
  } catch {
    return [];
  }
}

export async function writeTasks(tasks: MentorTask[]): Promise<void> {
  await ensureDir();
  await fs.writeFile(filePath("task_register.json"), JSON.stringify(tasks, null, 2), "utf-8");
}

export async function readDecisions(): Promise<MentorDecision[]> {
  try {
    const raw = await fs.readFile(filePath("decision_log.json"), "utf-8");
    return JSON.parse(raw) as MentorDecision[];
  } catch {
    return [];
  }
}

export async function writeDecisions(decisions: MentorDecision[]): Promise<void> {
  await ensureDir();
  await fs.writeFile(filePath("decision_log.json"), JSON.stringify(decisions, null, 2), "utf-8");
}

export async function readInbox(): Promise<MentorInboxItem[]> {
  try {
    const raw = await fs.readFile(filePath("mentor_inbox.json"), "utf-8");
    return JSON.parse(raw) as MentorInboxItem[];
  } catch {
    return [];
  }
}

export async function writeInbox(items: MentorInboxItem[]): Promise<void> {
  await ensureDir();
  await fs.writeFile(filePath("mentor_inbox.json"), JSON.stringify(items, null, 2), "utf-8");
}

export async function readMailActions(): Promise<MailAction[]> {
  try {
    const raw = await fs.readFile(filePath("mail_actions.json"), "utf-8");
    return JSON.parse(raw) as MailAction[];
  } catch {
    return [];
  }
}

export async function writeMailActions(actions: MailAction[]): Promise<void> {
  await ensureDir();
  await fs.writeFile(filePath("mail_actions.json"), JSON.stringify(actions, null, 2), "utf-8");
}

export async function readRecurringTasks(): Promise<MentorRecurringTask[]> {
  try {
    const raw = await fs.readFile(filePath("recurring_tasks.json"), "utf-8");
    return JSON.parse(raw) as MentorRecurringTask[];
  } catch {
    return [];
  }
}

export async function writeRecurringTasks(templates: MentorRecurringTask[]): Promise<void> {
  await ensureDir();
  await fs.writeFile(filePath("recurring_tasks.json"), JSON.stringify(templates, null, 2), "utf-8");
}

export async function readContextArchive(): Promise<string> {
  try {
    return await fs.readFile(filePath("context_archive.md"), "utf-8");
  } catch {
    return "";
  }
}

export async function appendContextArchive(note: string): Promise<void> {
  await ensureDir();
  const existing = await readContextArchive();
  const timestamp = new Date().toLocaleDateString("nl-NL", {
    timeZone: "Europe/Amsterdam",
    day: "numeric",
    month: "long",
    year: "numeric",
  });
  const entry = `\n## ${timestamp}\n${note}\n`;
  await fs.writeFile(filePath("context_archive.md"), existing + entry, "utf-8");
}

export async function readMentorState(): Promise<MentorState> {
  const [tasks, decisions, inboxItems] = await Promise.all([
    readTasks(),
    readDecisions(),
    readInbox(),
  ]);
  return { tasks, decisions, inboxItems };
}

export async function readConversationHistory(): Promise<MentorConversationItem[]> {
  try {
    const raw = await fs.readFile(filePath("mentor_conversation.json"), "utf-8");
    return JSON.parse(raw) as MentorConversationItem[];
  } catch {
    return [];
  }
}

export async function writeConversationHistory(items: MentorConversationItem[]): Promise<void> {
  await ensureDir();
  await fs.writeFile(filePath("mentor_conversation.json"), JSON.stringify(items, null, 2), "utf-8");
}

export async function appendConversationItem(item: MentorConversationItem): Promise<void> {
  const existing = await readConversationHistory();
  const updated = [item, ...existing];
  if (updated.length > 50) updated.splice(50);
  await writeConversationHistory(updated);
}

export async function ensureDataFiles(): Promise<void> {
  await ensureDir();

  const checks: Array<[string, () => Promise<void>]> = [
    ["task_register.json", () => writeTasks([])],
    ["mail_actions.json", () => writeMailActions([])],
    ["mentor_conversation.json", () => writeConversationHistory([])],
    ["recurring_tasks.json", () => writeRecurringTasks([])],
  ];

  await Promise.all(
    checks.map(async ([name, init]) => {
      try {
        await fs.access(filePath(name));
      } catch {
        await init();
      }
    })
  );
}
