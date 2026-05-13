export type { NotificationProvider, NotificationPayload } from "./types";
export { NtfyProvider } from "./ntfyProvider";
export { EmailProvider } from "./emailProvider";

import { NtfyProvider } from "./ntfyProvider";
import { EmailProvider } from "./emailProvider";
import type { NotificationProvider } from "./types";

let _providers: NotificationProvider[] | null = null;

export function getNotificationProviders(): NotificationProvider[] {
  if (_providers) return _providers;
  _providers = [new NtfyProvider(), new EmailProvider()].filter(p => p.isConfigured());
  return _providers;
}

export async function sendNotification(
  title: string,
  body: string,
  opts?: { tags?: string[]; priority?: 1 | 2 | 3 | 4 | 5; url?: string }
): Promise<string[]> {
  const providers = getNotificationProviders();
  const sent: string[] = [];
  for (const p of providers) {
    try {
      await p.send({ title, body, ...opts });
      sent.push(p.name);
    } catch (err) {
      console.error(`[notifications] ${p.name} failed:`, err instanceof Error ? err.message : err);
    }
  }
  return sent;
}
