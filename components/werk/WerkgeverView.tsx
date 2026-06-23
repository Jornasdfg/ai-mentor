import { resolveShareToken } from "@/lib/werk/share";
import { readFreight } from "@/lib/werk/workStore";
import { loadVisibleHours } from "@/lib/werk/hoursView";
import { computeAvailability, workWeekDates, type DayStatus } from "@/lib/werk/availability";
import { CLIENTS } from "@/lib/werk/clients";

// Gedeelde, alleen-lezen werkgever-weergave. Gebruikt door /werk/[token] én /u/[code].
const DAY_NL = ["", "ma", "di", "wo", "do", "vr", "za", "zo"];
const MONTH_NL = ["jan", "feb", "mrt", "apr", "mei", "jun", "jul", "aug", "sep", "okt", "nov", "dec"];

function fmtDate(iso: string): string {
  const [, m, d] = iso.split("-").map(Number);
  return `${d} ${MONTH_NL[m - 1]}`;
}
const STATUS_STYLE: Record<DayStatus, { box: string; label: string }> = {
  vast:     { box: "background:#ef4444;color:#fff",    label: "Niet mogelijk" },
  navragen: { box: "background:#fde68a;color:#92400e", label: "Navragen" },
  vrij:     { box: "background:#d1fae5;color:#065f46", label: "Vrij" },
};

export default async function WerkgeverView({ token }: { token: string }) {
  const client = await resolveShareToken(token);
  if (!client) {
    return (
      <main style={{ fontFamily: "system-ui, sans-serif", maxWidth: 520, margin: "60px auto", padding: 24, textAlign: "center", color: "#334155" }}>
        <h1 style={{ fontSize: 20 }}>Geen toegang</h1>
        <p style={{ color: "#64748b" }}>Deze link is niet (meer) geldig.</p>
      </main>
    );
  }
  const cfg = CLIENTS[client];

  const todayISO = new Date().toLocaleDateString("sv-SE", { timeZone: "Europe/Amsterdam" });
  const [hours, freight, availability] = await Promise.all([
    loadVisibleHours(client),
    cfg.showFreight ? readFreight() : Promise.resolve([]),
    computeAvailability(workWeekDates(todayISO, 4)),
  ]);

  const recentHours = hours.filter(h => h.date >= shift(todayISO, -42)).sort((a, b) => (a.date < b.date ? 1 : -1));
  const recentFreight = freight.filter(f => f.date >= shift(todayISO, -42));

  const weeks: typeof availability[] = [];
  for (let i = 0; i < availability.length; i += 5) weeks.push(availability.slice(i, i + 5));

  return (
    <main style={{ fontFamily: "system-ui, sans-serif", background: "#f3f5fc", minHeight: "100vh", margin: 0, overflowX: "hidden" }}>
      <style>{`
        *{box-sizing:border-box}
        .wk-grid{display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:5px}
        .wk-cell{border:1px solid #e2e8f0;border-radius:10px;padding:6px 2px;text-align:center;min-width:0;overflow:hidden}
        .wk-work{border:2px solid #5b6cff;padding:5px 1px}
        .wk-dow{font-size:10px;color:#64748b;text-transform:uppercase}
        .wk-date{font-size:12px;font-weight:700;color:#1e293b;line-height:1.05;margin-bottom:3px}
        .wk-badge{font-size:9px;font-weight:700;border-radius:6px;padding:3px 1px;white-space:normal;line-height:1.05;word-break:break-word}
        .fr-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px}
        @media(min-width:520px){.wk-date{font-size:14px}.wk-dow{font-size:11px}.wk-badge{font-size:11px;padding:4px 2px}.wk-cell{padding:8px 4px}}
      `}</style>
      <div style={{ maxWidth: 640, margin: "0 auto", padding: "16px 12px 60px" }}>
        <header style={{ marginBottom: 20 }}>
          <h1 style={{ fontSize: 22, margin: 0, color: "#1e293b" }}>{cfg.emoji} {cfg.headerName}</h1>
          <p style={{ color: "#64748b", margin: "4px 0 0", fontSize: 14 }}>Overzicht uren{cfg.showFreight ? ", vrachtbonnen" : ""} en beschikbaarheid.</p>
        </header>

        <section style={card}>
          <h2 style={h2}>Beschikbaarheid</h2>
          <p style={{ color: "#64748b", fontSize: 12, margin: "0 0 12px" }}>
            Werkdagen <b>di/wo/do</b> staan standaard op <b>Navragen</b>. Ma/vr in principe <b>Vrij</b>. Alleen als er al een vaste afspraak staat, is het <b>Niet mogelijk</b>.
          </p>
          {weeks.map((wk, i) => (
            <div key={i} style={{ marginBottom: 12 }}>
              <div style={{ fontSize: 11, color: "#94a3b8", marginBottom: 4 }}>{i === 0 ? "Deze week" : `Week van ${fmtDate(wk[0].date)}`}</div>
              <div className="wk-grid">
                {wk.map(d => {
                  const s = STATUS_STYLE[d.status];
                  return (
                    <div key={d.date} title={d.note} className={"wk-cell" + (d.isWorkDay ? " wk-work" : "")}>
                      <div className="wk-dow">{DAY_NL[d.weekday]}</div>
                      <div className="wk-date">{fmtDate(d.date)}</div>
                      <div className="wk-badge" style={styleObj(s.box)}>{s.label}</div>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
          <div style={{ display: "flex", gap: 12, marginTop: 6, fontSize: 11, color: "#64748b" }}>
            <Legend color="#d1fae5" text="Vrij" /><Legend color="#fde68a" text="Navragen" /><Legend color="#ef4444" text="Niet mogelijk" />
          </div>
        </section>

        <section style={card}>
          <h2 style={h2}>Gewerkte uren</h2>
          {recentHours.length === 0 ? <p style={muted}>Nog geen uren geregistreerd.</p> : (
            <div>
              {recentHours.map(h => (
                <div key={h.id} style={{ borderTop: "1px solid #eef2f7", padding: "8px 0" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
                    <span style={{ color: "#475569", fontSize: 14 }}>{fmtDate(h.date)}{h.start && h.end ? ` · ${h.start}–${h.end}` : ""}</span>
                    <span style={{ fontWeight: 700, color: "#1e293b", fontSize: 14, whiteSpace: "nowrap" }}>{h.hours > 0 ? `${h.hours.toFixed(2).replace(".", ",")} uur` : "—"}</span>
                  </div>
                  {h.note && <div style={{ color: "#64748b", fontSize: 12, marginTop: 2, lineHeight: 1.3 }}>{h.note}</div>}
                </div>
              ))}
            </div>
          )}
        </section>

        {cfg.showFreight && (
          <section style={card}>
            <h2 style={h2}>Vrachtbonnen</h2>
            {recentFreight.length === 0 ? <p style={muted}>Nog geen vrachtbonnen.</p> : (
              <div className="fr-grid">
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
        )}

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
