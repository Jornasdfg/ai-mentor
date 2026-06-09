import { NextRequest, NextResponse } from "next/server";
import { readWeeklyReview, writeWeeklyReview } from "@/lib/mentor/weeklyReviewStorage";
import { parseInstagramCsv, summarizeInstagram, type InstagramContentRow } from "@/lib/instagram/parseMetaCsv";
import type { WeeklyReview } from "@/lib/mentorTypes";

export const runtime = "nodejs";

async function csvText(form: FormData, field: string): Promise<string | null> {
  const f = form.get(field);
  if (!(f instanceof Blob) || f.size === 0) return null;
  if (f.size > 15 * 1024 * 1024) throw new Error(`${field} te groot (max 15MB)`);
  return await f.text();
}

// Upload van de Instagram-week (Meta Business Suite): post/reels-CSV + stories-CSV.
// Parseert, vat samen en bouwt de funnel (bereik/weergaven → link-in-bio → affiliate).
export async function POST(req: NextRequest) {
  try {
    if (!req.headers.get("content-type")?.includes("multipart/form-data")) {
      return NextResponse.json({ error: "Upload als multipart/form-data" }, { status: 400 });
    }
    const form = await req.formData();
    const [postCsv, storyCsv] = await Promise.all([csvText(form, "postCsv"), csvText(form, "storyCsv")]);
    if (!postCsv && !storyCsv) {
      return NextResponse.json({ error: "Geen CSV ontvangen (postCsv en/of storyCsv)" }, { status: 400 });
    }

    const rows: InstagramContentRow[] = [
      ...(postCsv ? parseInstagramCsv(postCsv) : []),
      ...(storyCsv ? parseInstagramCsv(storyCsv) : []),
    ];
    if (rows.length === 0) {
      return NextResponse.json({ error: "Geen geldige rijen in de CSV('s)" }, { status: 400 });
    }
    const summary = summarizeInstagram(rows);

    // Bestaande review aanvullen (of minimaal aanmaken als die er nog niet is).
    const existing = await readWeeklyReview();
    const weekStart = summary.weekStart ?? existing?.weekStart ?? new Date().toISOString().slice(0, 10);
    const weekEnd = summary.weekEnd ?? existing?.weekEnd ?? weekStart;

    const review: WeeklyReview = {
      ...(existing ?? {
        weekStart, weekEnd,
        summary: "Instagram-week geüpload.",
        generatedAt: new Date().toISOString(),
        source: "instagram-upload",
      }),
      weekStart, weekEnd,
      instagram: summary,
      instagramCsv: {
        post: postCsv ?? existing?.instagramCsv?.post ?? null,
        story: storyCsv ?? existing?.instagramCsv?.story ?? null,
      },
      funnel: {
        instagramReach: summary.totals.reach,
        instagramViews: summary.totals.views,
        storyLinkClicks: summary.stories.linkClicks,
        linkinbioClicks: existing?.linkinbioClicks ?? null,
        affiliateRevenueEur: existing?.affiliateRevenueEur ?? null,
        uploadedAt: new Date().toISOString(),
      },
    };
    await writeWeeklyReview(review);

    return NextResponse.json({ ok: true, instagram: summary, funnel: review.funnel });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Fout" }, { status: 500 });
  }
}
