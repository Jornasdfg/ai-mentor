import type { NotificationProvider, NotificationPayload } from "./types";

export class EmailProvider implements NotificationProvider {
  readonly name = "email";

  isConfigured(): boolean {
    return !!(process.env.RESEND_API_KEY && process.env.DAILY_BRIEFING_EMAIL_TO);
  }

  async send(payload: NotificationPayload): Promise<void> {
    const apiKey = process.env.RESEND_API_KEY;
    const to = process.env.DAILY_BRIEFING_EMAIL_TO;
    if (!apiKey || !to) throw new Error("RESEND_API_KEY en DAILY_BRIEFING_EMAIL_TO zijn verplicht");

    // Use Resend REST API directly to avoid requiring the SDK at import time
    const body = `<pre style="font-family:sans-serif;white-space:pre-wrap">${payload.body.replace(/</g, "&lt;")}</pre>`;

    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: "AI Mentor <noreply@mentor.reishacker.nl>",
        to: [to],
        subject: payload.title,
        html: body,
      }),
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({ message: res.statusText }));
      throw new Error(`Resend error ${res.status}: ${JSON.stringify(err)}`);
    }
  }
}
