// Parser voor Meta Business Suite content-exports (Instagram), Nederlandse kolomnamen.
// Verwerkt zowel post/reel- als story-exports. Robuust tegen BOM, quotes, komma's en
// newlines binnen velden. Classificeert per rij (Berichttype) → post/reel vs verhaal.

export interface InstagramContentRow {
  type: string;           // Berichttype (bv. "Instagram-reel", "Instagram-verhaal")
  isStory: boolean;
  published: string;      // Publicatietijdstip (ruw)
  permalink: string;
  description: string;    // ingekort
  views: number;          // Weergaven
  reach: number;          // Bereik
  likes: number;
  shares: number;
  comments: number;
  saves: number;
  linkClicks: number;     // alleen stories ("Klikken op link")
  profileVisits: number;
  follows: number;
}

export interface InstagramSummary {
  weekStart: string | null;   // YYYY-MM-DD (vroegste publicatiedatum)
  weekEnd: string | null;
  posts: { count: number; reach: number; views: number; engagement: number };
  stories: { count: number; reach: number; views: number; linkClicks: number; profileVisits: number };
  totals: { reach: number; views: number; linkClicks: number; follows: number; engagement: number };
  byType: Record<string, { count: number; reach: number; views: number }>;
  top: InstagramContentRow[]; // top 5 op bereik
  rowCount: number;
}

// ── CSV-tokenizer (RFC4180-achtig) ──────────────────────────────────────────
function parseCsv(input: string): string[][] {
  const text = input.replace(/^﻿/, ""); // BOM weg
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') { field += '"'; i++; }
        else inQuotes = false;
      } else field += c;
    } else {
      if (c === '"') inQuotes = true;
      else if (c === ",") { row.push(field); field = ""; }
      else if (c === "\n") { row.push(field); rows.push(row); row = []; field = ""; }
      else if (c === "\r") { /* negeer */ }
      else field += c;
    }
  }
  if (field.length > 0 || row.length > 0) { row.push(field); rows.push(row); }
  return rows.filter(r => r.length > 1 || (r.length === 1 && r[0].trim() !== ""));
}

function num(v: string | undefined): number {
  if (!v) return 0;
  const n = parseInt(v.replace(/[^\d-]/g, ""), 10);
  return Number.isFinite(n) ? n : 0;
}

// "05/19/2026 09:22" of "MM/DD/YYYY..." → YYYY-MM-DD
function toISODate(raw: string): string | null {
  const m = raw.match(/(\d{2})\/(\d{2})\/(\d{4})/);
  if (m) return `${m[3]}-${m[1]}-${m[2]}`;
  const m2 = raw.match(/(\d{4})-(\d{2})-(\d{2})/);
  if (m2) return `${m2[1]}-${m2[2]}-${m2[3]}`;
  return null;
}

function headerIndex(header: string[]): Record<string, number> {
  const idx: Record<string, number> = {};
  header.forEach((h, i) => { idx[h.trim().toLowerCase()] = i; });
  return idx;
}
function col(idx: Record<string, number>, ...names: string[]): number {
  for (const n of names) { const i = idx[n.toLowerCase()]; if (i !== undefined) return i; }
  return -1;
}

// Parse één CSV-bestand naar rijen. Leeg/ongeldig → [].
export function parseInstagramCsv(content: string): InstagramContentRow[] {
  const rows = parseCsv(content);
  if (rows.length < 2) return [];
  const idx = headerIndex(rows[0]);
  const iType = col(idx, "Berichttype");
  const iPub = col(idx, "Publicatietijdstip");
  const iLink = col(idx, "Permalink");
  const iDesc = col(idx, "Omschrijving");
  const iViews = col(idx, "Weergaven");
  const iReach = col(idx, "Bereik");
  const iLikes = col(idx, "Vind-ik-leuks");
  const iShares = col(idx, "Aantal keer gedeeld");
  const iComments = col(idx, "Opmerkingen");
  const iSaves = col(idx, "Aantal keer opgeslagen");
  const iLinkClicks = col(idx, "Klikken op link");
  const iProfile = col(idx, "Profielbezoeken");
  const iFollows = col(idx, "Volgt");

  const out: InstagramContentRow[] = [];
  for (let r = 1; r < rows.length; r++) {
    const row = rows[r];
    const get = (i: number) => (i >= 0 && i < row.length ? row[i] : "");
    const type = (get(iType) || "onbekend").trim();
    if (!type && !get(iViews) && !get(iReach)) continue;
    const isStory = /verhaal|story|stories/i.test(type);
    out.push({
      type, isStory,
      published: get(iPub).trim(),
      permalink: get(iLink).trim(),
      description: get(iDesc).replace(/\s+/g, " ").trim().slice(0, 80),
      views: num(get(iViews)),
      reach: num(get(iReach)),
      likes: num(get(iLikes)),
      shares: num(get(iShares)),
      comments: num(get(iComments)),
      saves: num(get(iSaves)),
      linkClicks: num(get(iLinkClicks)),
      profileVisits: num(get(iProfile)),
      follows: num(get(iFollows)),
    });
  }
  return out;
}

// Combineer post- en story-rijen tot één weeksamenvatting.
export function summarizeInstagram(rows: InstagramContentRow[]): InstagramSummary {
  const posts = rows.filter(r => !r.isStory);
  const stories = rows.filter(r => r.isStory);
  const dates = rows.map(r => toISODate(r.published)).filter((d): d is string => !!d).sort();

  const engagementOf = (r: InstagramContentRow) => r.likes + r.comments + r.shares + r.saves;

  const byType: Record<string, { count: number; reach: number; views: number }> = {};
  for (const r of rows) {
    const k = r.type || "onbekend";
    if (!byType[k]) byType[k] = { count: 0, reach: 0, views: 0 };
    byType[k].count++; byType[k].reach += r.reach; byType[k].views += r.views;
  }

  const sum = (arr: InstagramContentRow[], f: (r: InstagramContentRow) => number) => arr.reduce((a, r) => a + f(r), 0);

  return {
    weekStart: dates[0] ?? null,
    weekEnd: dates[dates.length - 1] ?? null,
    posts: {
      count: posts.length,
      reach: sum(posts, r => r.reach),
      views: sum(posts, r => r.views),
      engagement: sum(posts, engagementOf),
    },
    stories: {
      count: stories.length,
      reach: sum(stories, r => r.reach),
      views: sum(stories, r => r.views),
      linkClicks: sum(stories, r => r.linkClicks),
      profileVisits: sum(stories, r => r.profileVisits),
    },
    totals: {
      reach: sum(rows, r => r.reach),
      views: sum(rows, r => r.views),
      linkClicks: sum(rows, r => r.linkClicks),
      follows: sum(rows, r => r.follows),
      engagement: sum(rows, engagementOf),
    },
    byType,
    top: [...rows].sort((a, b) => b.reach - a.reach).slice(0, 5),
    rowCount: rows.length,
  };
}
