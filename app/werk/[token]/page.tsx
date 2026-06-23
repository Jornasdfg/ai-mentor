import { isValidShareToken } from "@/lib/werk/share";
import { readFreight } from "@/lib/werk/workStore";
import { loadVisibleHours } from "@/lib/werk/hoursView";
import { computeAvailability, workWeekDates, type DayStatus } from "@/lib/werk/availability";

export const dynamic = "force-dynamic";

const DAY_NL = ["", "ma", "di", "wo", "do", "vr", "za", "zo"];
const MONTH_NL = ["jan", "feb", "mrt", "apr", "mei", "jun", "jul", "aug", "sep", "okt", "nov", "dec"];

function fmtDate(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  return `${d} ${MONTH_NL[m - 1]}`;
}
const STATUS_STYLE: Record<DayStatus, { box: string; label: string }> = {
  vast:     { box: "background:#ef4444;color:#fff",                 label: "Niet mogelijk" },
  flexibel: { box: "background:#fde68a;color:#92400e",              label: "Flexibel" },
  vrij:     { box: "background:#d1fae5;color:#065f46",              label: "Vrij" },
};

export default async function WerkgeverPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const ok = await isValidShareToken(token);
  if (!ok) {
    return (
      <main style={{ fontFamily: "system-ui, sans-serif", maxWidth: 520, margin: "60px auto", padding: 24, textAlign: "center", color: "#334155" }}>
        <h1 style={{ fontSize: 20 }}>Geen toegang</h1>
        <p style={{ color: "#64748b" }}>Deze link is niet (meer) geldig.</p>
      </main>
    );
  }

  const todayISO = new Date().toLocaleDateString("sv-SE", { timeZone: "Europe/Amsterdam" });
  const [hours, freight, availability] = await Promise.all([
    loadVisibleHours(),
    readFreight(),
    computeAvailability(workWeekDates(todayISO, 2)),
  ]);

  // Uren groeperen per datum (laatste 6 weken).
  const recentHours = hours.filter(h => h.date >= shift(todayISO, -42)).sort((a, b) => (a.date < b.date ? 1 : -1));
  const recentFreight = freight.filter(f => f.date >= shift(todayISO, -42));

  // Beschikbaarheid per week opdelen (5 dagen per week).
  const weeks: typeof availability[] = [];
  for (let i = 0; i < availability.length; i += 5) weeks.push(availability.slice(i, i + 5));

  return (
    <main style={{ fontFamily: "system-ui, sans-serif", background: "#f3f5fc", minHeight: "100vh", margin: 0 }}>
      <div style={{ maxWidth: 640, margin: "0 auto", padding: "20px 16px 60px" }}>
        <header style={{ marginBottom: 20 }}>
          <h1 style={{ fontSize: 22, margin: 0, color: "#1e293b" }}>🚚 Jorn — Van Vijven Transport</h1>
          <p style={{ color: "#64748b", margin: "4px 0 0", fontSize: 14 }}>Overzicht uren, vrachtbonnen en beschikbaarheid.</p>
        </header>

        {/* Beschikbaarheid */}
        <section style={card}>
          <h2 style={h2}>Beschikbaarheid</h2>
          <p style={{ color: "#64748b", fontSize: 12, margin: "0 0 12px" }}>
            Werkdagen zijn <b>di/wo/do</b>. Ma/vr in principe vrij — even overleggen. Staat er iets in de agenda, dan niet mogelijk.
          </p>
          {weeks.map((wk, i) => (
            <div key={i} style={{ marginBottom: 12 }}>
              <div style={{ fontSize: 11, color: "#94a3b8", marginBottom: 4 }}>{i === 0 ? "Deze week" : "Volgende week"}</div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(5,1fr)", gap: 6 }}>
                {wk.map(d => {
                  const s = STATUS_STYLE[d.status];
                  return (
                    <div key={d.date} title={d.note} style={{ borderRadius: 10, padding: "8px 4px", textAlign: "center", border: d.isWorkDay ? "2px solid #5b6cff" : "1px solid #e2e8f0" }}>
                      <div style={{ fontSize: 11, color: "#64748b", textTransform: "uppercase" }}>{DAY_NL[d.weekday]}</div>
                      <div style={{ fontSize: 13, fontWeight: 700, color: "#1e293b" }}>{fmtDate(d.date)}</div>
                      <div style={{ marginTop: 4, fontSize: 10, fontWeight: 700, borderRadius: 6, padding: "3px 2px", ...styleObj(s.box) }}>{s.label}</div>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
          <div style={{ display: "flex", gap: 12, marginTop: 6, fontSize: 11, color: "#64748b" }}>
            <Legend color="#d1fae5" text="Vrij" /><Legend color="#fde68a" text="Flexibel" /><Legend color="#ef4444" text="Niet mogelijk" />
          </div>
        </section>

        {/* Uren */}
        <section style={card}>
          <h2 style={h2}>Gewerkte uren</h2>
          {recentHours.length === 0 ? <p style={muted}>Nog geen uren geregistreerd.</p> : (
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 14 }}>
              <tbody>
                {recentHours.map(h => (
                  <tr key={h.id} style={{ borderTop: "1px solid #eef2f7" }}>
                    <td style={{ padding: "8px 0", color: "#475569" }}>{fmtDate(h.date)}{h.start && h.end ? ` · ${h.start}–${h.end}` : ""}</td>
                    <td style={{ padding: "8px 0", textAlign: "right", fontWeight: 700, color: "#1e293b" }}>{h.hours.toFixed(2).replace(".", ",")} uur</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>

        {/* Vrachtbonnen */}
        <section style={card}>
          <h2 style={h2}>Vrachtbonnen</h2>
          {recentFreight.length === 0 ? <p style={muted}>Nog geen vrachtbonnen.</p> : (
            <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 8 }}>
              {recentFreight.map(v => (
                <a key={v.id} href={`/api/werk/freight/${v.id}/image`} target="_blank" rel="noreferrer" style={{ display: "block" }}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={`/api/werk/freight/${v.id}/image`} alt="" style={{ width: "100%", height: 90, objectFit: "cover", borderRadius: 8, border: "1px solid #e2e8f0" }} />
                  <div style={{ fontSize: 10, color: "#94a3b8", marginTop: 2 }}>{fmtDate(v.date)}</div>
                </a>
              ))}
            </div>
          )}
        </section>

        <p style={{ textAlign: "center", color: "#cbd5e1", fontSize: 11, marginTop: 24 }}>Alleen-lezen overzicht · AI Mentor</p>
      </div>
    </main>
  );
}

const card: React.CSSProperties = { background: "#fff", borderRadius: 16, padding: 16, marginBottom: 16, boxShadow: "0 1px 3px rgba(0,0,0,.06)" };
const h2: React.CSSProperties = { fontSize: 15, margin: "0 0 10px", color: "#1e293b" };
const muted: React.CSSProperties = { color: "#94a3b8", fontSize: 14, margin: 0 };

function styleObj(css: string): React.CSSProperties {
  const o: Record<string, string> = {};
  css.split(";").forEach(p => { const [k, v] = p.split(":"); if (k && v) o[k.trim().replace(/-([a-z])/g, (_, c) => c.toUpperCase())] = v.trim(); });
  return o as React.CSSProperties;
}
function shift(iso: string, days: number): string {
  const [y, m, d] = iso.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d)); dt.setUTCDate(dt.getUTCDate() + days);
  return dt.toISOString().slice(0, 10);
}
function Legend({ color, text }: { color: string; text: string }) {
  return <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}><span style={{ width: 10, height: 10, borderRadius: 3, background: color, display: "inline-block" }} />{text}</span>;
}
