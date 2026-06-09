import fs from "fs/promises";
import path from "path";

// Opgeslagen push-abonnementen (per apparaat). Geen tokens loggen.
export interface StoredPushSubscription {
  endpoint: string;
  keys: { p256dh: string; auth: string };
  createdAt: string;
}

function dir(): string {
  const base = process.cwd();
  return process.env.DATA_DIR ? path.resolve(base, process.env.DATA_DIR) : path.join(base, "data");
}
function file(): string {
  return path.join(dir(), "push_subscriptions.json");
}

export async function readSubscriptions(): Promise<StoredPushSubscription[]> {
  try {
    return JSON.parse(await fs.readFile(file(), "utf-8")) as StoredPushSubscription[];
  } catch {
    return [];
  }
}

export async function writeSubscriptions(subs: StoredPushSubscription[]): Promise<void> {
  await fs.mkdir(dir(), { recursive: true });
  await fs.writeFile(file(), JSON.stringify(subs, null, 2), "utf-8");
}

export async function addSubscription(sub: StoredPushSubscription): Promise<void> {
  const subs = await readSubscriptions();
  const without = subs.filter(s => s.endpoint !== sub.endpoint);
  without.push(sub);
  await writeSubscriptions(without);
}

export async function removeSubscription(endpoint: string): Promise<void> {
  const subs = await readSubscriptions();
  await writeSubscriptions(subs.filter(s => s.endpoint !== endpoint));
}
