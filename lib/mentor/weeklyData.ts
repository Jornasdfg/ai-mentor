import type { WeeklyReview } from "@/lib/mentorTypes";

const nf = new Intl.NumberFormat("nl-NL");
function n(v: unknown): string {
  const x = typeof v === "number" ? v : typeof v === "string" ? parseFloat(v.replace(",", ".").replace(/[^\d.-]/g, "")) : NaN;
  return Number.isFinite(x) ? nf.format(x) : "—";
}
function eur(v: unknown): string {
  const x = typeof v === "number" ? v : typeof v === "string" ? parseFloat(v.replace(",", ".").replace(/[^\d.-]/g, "")) : NaN;
  return Number.isFinite(x) ? `€ ${nf.format(x)}` : "—";
}

// Bouwt een tekstrapport van ALLE beschikbare weekdata. `full=true` = uitgebreid (voor mail/diepe
// analyse in ChatGPT/Claude); `full=false` = compact (token-zuinig, voor de in-app AI-conclusies).
export function buildWeeklyReportText(review: WeeklyReview, full: boolean): string {
  const L: string[] = [];
  L.push(`WEEKDATA REISHACKER — ${review.weekStart} t/m ${review.weekEnd}`);

  // Taken
  const m = review.metrics;
  if (m) {
    L.push("");
    L.push(`TAKEN: ${m.completed ?? 0} afgerond, ${m.created ?? 0} nieuw, ${m.overdue ?? 0} te laat, open P0 ${m.openP0 ?? 0} / P1 ${m.openP1 ?? 0}`);
  }

  // Instagram
  const ig = review.instagram;
  if (ig) {
    L.push("");
    L.push("INSTAGRAM (Meta Business Suite):");
    L.push(`  Totaal: ${n(ig.totals.reach)} bereik · ${n(ig.totals.views)} weergaven · ${n(ig.totals.follows)} nieuwe volgers · ${n(ig.totals.engagement)} interacties`);
    L.push(`  Posts/Reels: ${ig.posts.count} (${n(ig.posts.reach)} bereik, ${n(ig.posts.views)} weergaven)`);
    L.push(`  Stories: ${ig.stories.count} (${n(ig.stories.reach)} bereik, ${n(ig.stories.linkClicks)} linkclicks, ${n(ig.stories.profileVisits)} profielbezoeken)`);
    if (full) {
      const types = Object.entries(ig.byType).map(([k, v]) => `${k}: ${v.count}× (${n(v.reach)} bereik)`).join("; ");
      if (types) L.push(`  Per type: ${types}`);
      L.push("  Best bekeken content:");
      ig.top.forEach((t, i) => L.push(`    ${i + 1}. [${t.type}] ${t.description || "(zonder tekst)"} — ${n(t.reach)} bereik, ${n(t.views)} weergaven, ${n(t.likes)} likes, ${n(t.saves)} saves ${t.permalink}`));
    }
  }

  // Funnel
  const f = review.funnel;
  if (f) {
    L.push("");
    L.push("FUNNEL (gezien → link-in-bio → affiliate):");
    L.push(`  Gezien op Instagram: ${n(f.instagramReach)} bereik / ${n(f.instagramViews)} weergaven`);
    L.push(`  Naar link-in-bio: story-linkclicks ${n(f.storyLinkClicks)} · link-in-bio outbound ${n(f.linkinbioClicks)}`);
    L.push(`  Affiliate-inkomsten: ${eur(f.affiliateRevenueEur)}`);
  }

  // Affiliate + klikdata (DATA-regel van de maandag-routine)
  const a = review.affiliate;
  if (a) {
    L.push("");
    L.push("AFFILIATE + KLIKDATA (maandag-routine):");
    L.push(`  Totaal: ${n(a["totaal_kliks"])} kliks · ${n(a["totaal_transacties"])} transacties · ${eur(a["totaal_commissie_eur"])} commissie`);
    const net = (label: string, k: string, t: string, c: string) =>
      `  ${label}: ${n(a[k])} kliks · ${n(a[t])} transacties${a[c] !== undefined ? ` · ${eur(a[c])}` : ""}`;
    L.push(net("Daisycon", "daisycon_kliks", "daisycon_transacties", "x"));
    L.push(net("TradeTracker", "tradetracker_kliks", "tradetracker_transacties", "x"));
    L.push(net("Impact", "impact_kliks", "impact_transacties", "impact_commissie_eur"));
    L.push(net("Awin", "awin_kliks", "awin_transacties", "awin_commissie_eur"));
    L.push(net("Bol.com", "bol_kliks", "bol_transacties", "bol_commissie_eur"));
    L.push(`  Link-in-bio: ${n(a["linkinbio_pageviews_7d"])} pageviews · ${n(a["linkinbio_outbound_kliks_7d"])} outbound kliks · top: ${a["linkinbio_top_link"] ?? "—"}`);
    if (a["klik_transactie_ratio_pct"] !== undefined) L.push(`  Klik→transactie indicatie: ~${n(a["klik_transactie_ratio_pct"])}%`);
  }

  if (!ig && !a && !m) L.push("\n(Nog geen data beschikbaar — upload je Instagram-week en laat de maandag-routine draaien.)");
  return L.join("\n");
}
