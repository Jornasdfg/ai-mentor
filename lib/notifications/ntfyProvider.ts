import type { NotificationProvider, NotificationPayload } from "./types";

export class NtfyProvider implements NotificationProvider {
  readonly name = "ntfy";

  isConfigured(): boolean {
    return !!(process.env.NTFY_URL && process.env.NTFY_TOPIC);
  }

  async send(payload: NotificationPayload): Promise<void> {
    const url = process.env.NTFY_URL;
    const topic = process.env.NTFY_TOPIC;
    if (!url || !topic) throw new Error("NTFY_URL en NTFY_TOPIC zijn verplicht");

    const headers: Record<string, string> = {
      "Content-Type": "text/plain",
      "Title": payload.title,
    };
    if (payload.priority) headers["Priority"] = String(payload.priority);
    if (payload.tags?.length) headers["Tags"] = payload.tags.join(",");
    if (payload.url) headers["Click"] = payload.url;

    const res = await fetch(`${url.replace(/\/$/, "")}/${topic}`, {
      method: "POST",
      headers,
      body: payload.body,
    });

    if (!res.ok) {
      throw new Error(`ntfy responded ${res.status}: ${await res.text()}`);
    }
  }
}
