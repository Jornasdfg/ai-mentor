import webpush from "web-push";
import { readSubscriptions, removeSubscription, type StoredPushSubscription } from "./pushStorage";

let configured = false;
function ensureConfigured(): boolean {
  if (configured) return true;
  const pub = process.env.VAPID_PUBLIC_KEY;
  const priv = process.env.VAPID_PRIVATE_KEY;
  if (!pub || !priv) return false;
  const subject = process.env.VAPID_SUBJECT || "mailto:jornbooneinf@gmail.com";
  webpush.setVapidDetails(subject, pub, priv);
  configured = true;
  return true;
}

export function pushConfigured(): boolean {
  return ensureConfigured();
}

export interface PushPayload {
  title: string;
  body: string;
  url?: string;
  tag?: string;
}

// Stuurt een notificatie naar alle aangemelde apparaten. Dode abonnementen
// (404/410) worden automatisch opgeruimd. Veilig fire-and-forget aanroepbaar.
export async function sendPushToAll(payload: PushPayload): Promise<{ sent: number; pruned: number }> {
  if (!ensureConfigured()) return { sent: 0, pruned: 0 };
  const subs = await readSubscriptions();
  if (subs.length === 0) return { sent: 0, pruned: 0 };

  const data = JSON.stringify(payload);
  let sent = 0;
  let pruned = 0;

  await Promise.all(
    subs.map(async (s: StoredPushSubscription) => {
      try {
        await webpush.sendNotification(
          { endpoint: s.endpoint, keys: s.keys },
          data,
          { TTL: 3600, urgency: "normal" }
        );
        sent++;
      } catch (err: unknown) {
        const status = (err as { statusCode?: number })?.statusCode;
        if (status === 404 || status === 410) {
          await removeSubscription(s.endpoint).catch(() => {});
          pruned++;
        }
      }
    })
  );

  return { sent, pruned };
}
