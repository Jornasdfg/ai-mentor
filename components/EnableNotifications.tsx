"use client";

import { useEffect, useState } from "react";

// Zet base64 VAPID-sleutel om naar Uint8Array voor pushManager.subscribe.
function urlBase64ToUint8Array(base64String: string): Uint8Array<ArrayBuffer> {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(base64);
  const buffer = new ArrayBuffer(raw.length);
  const arr = new Uint8Array(buffer);
  for (let i = 0; i < raw.length; i++) arr[i] = raw.charCodeAt(i);
  return arr;
}

type State = "idle" | "subscribed" | "unsupported" | "needs-install" | "working" | "error";

export default function EnableNotifications() {
  const [state, setState] = useState<State>("idle");
  const [msg, setMsg] = useState<string | null>(null);

  const isStandalone = () =>
    typeof window !== "undefined" &&
    (window.matchMedia?.("(display-mode: standalone)").matches ||
      (window.navigator as unknown as { standalone?: boolean }).standalone === true);
  const isIOS = () =>
    typeof navigator !== "undefined" && /iphone|ipad|ipod/i.test(navigator.userAgent);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!("serviceWorker" in navigator) || !("PushManager" in window)) {
      // iOS toont Push pas als de app op het beginscherm staat.
      setState(isIOS() && !isStandalone() ? "needs-install" : "unsupported");
      return;
    }
    navigator.serviceWorker.getRegistration().then(reg => {
      reg?.pushManager.getSubscription().then(sub => { if (sub) setState("subscribed"); });
    }).catch(() => {});
  }, []);

  async function enable() {
    try {
      if (isIOS() && !isStandalone()) { setState("needs-install"); return; }
      if (!("serviceWorker" in navigator) || !("PushManager" in window)) { setState("unsupported"); return; }
      setState("working");
      setMsg(null);

      const reg = await navigator.serviceWorker.register("/sw.js");
      await navigator.serviceWorker.ready;

      const perm = await Notification.requestPermission();
      if (perm !== "granted") { setState("error"); setMsg("Notificaties geweigerd. Sta ze toe in instellingen."); return; }

      const keyRes = await fetch("/api/push/public-key");
      const { key } = (await keyRes.json()) as { key: string };
      if (!key) { setState("error"); setMsg("Server-sleutel ontbreekt."); return; }

      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(key),
      });

      const res = await fetch("/api/push/subscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ subscription: sub.toJSON() }),
      });
      if (!res.ok) throw new Error("Aanmelden mislukt");

      setState("subscribed");
      setMsg("Gelukt! Je ontvangt nu meldingen.");
      // Meteen een testmelding sturen ter bevestiging.
      fetch("/api/push/test", { method: "POST" }).catch(() => {});
    } catch (err) {
      setState("error");
      setMsg(err instanceof Error ? err.message : "Er ging iets mis.");
    }
  }

  const label =
    state === "subscribed" ? "🔔 Aan" :
    state === "working" ? "…" :
    state === "needs-install" ? "🔔 Zet op beginscherm" :
    state === "unsupported" ? "🔔 n.v.t." :
    "🔔 Meldingen aan";

  const title =
    state === "needs-install"
      ? "Open de app eerst via 'Zet op beginscherm' (deelknop in Safari), daarna kun je meldingen aanzetten."
      : state === "unsupported"
      ? "Notificaties worden niet ondersteund in deze browser."
      : msg ?? "Zet pushnotificaties aan";

  return (
    <button
      onClick={state === "subscribed" || state === "working" ? undefined : enable}
      title={title}
      aria-label="Notificaties aanzetten"
      className={`text-[11px] font-semibold px-2.5 py-1 rounded-full transition-all active:scale-95 shrink-0 ${
        state === "subscribed"
          ? "bg-emerald-500/15 text-emerald-700 border border-emerald-500/30"
          : state === "unsupported"
          ? "bg-gray-100 text-zinc-400 border border-gray-200"
          : "bg-white text-zinc-600 border border-gray-200 hover:text-accent hover:border-accent/40"
      }`}
    >
      {label}
    </button>
  );
}
