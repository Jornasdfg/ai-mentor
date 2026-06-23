import type { WorkHours } from "./workStore";

// Pusht een urenregel naar de Airtable "Uren"-tabel (Boone Media base).
// Bestemming staat vast op de juiste base/tabel; alleen de PAT komt uit env.
//   AIRTABLE_TOKEN — Airtable Personal Access Token met data.records:write op de base
//   (optioneel te overschrijven: WERK_AIRTABLE_BASE / WERK_AIRTABLE_TABLE)
// Zonder AIRTABLE_TOKEN: no-op (geeft null terug) → app slaat gewoon lokaal op.

const DEFAULT_BASE = "appMDfQOyPOaEASe7";          // Boone Media
const DEFAULT_TABLE = "tbllhWzPiugvol1ZE";         // tabel "Uren"

export function airtableConfigured(): boolean {
  return !!process.env.AIRTABLE_TOKEN;
}

function nlDate(iso: string): string {
  // YYYY-MM-DD → DD-MM-YYYY
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  return m ? `${m[3]}-${m[2]}-${m[1]}` : iso;
}

export async function pushHoursToAirtable(entry: WorkHours): Promise<string | null> {
  const token = process.env.AIRTABLE_TOKEN;
  if (!token) return null;
  const base = process.env.WERK_AIRTABLE_BASE || DEFAULT_BASE;
  const table = encodeURIComponent(process.env.WERK_AIRTABLE_TABLE || DEFAULT_TABLE);

  const fields: Record<string, unknown> = {
    "Omschrijving": `Werkdag (${nlDate(entry.date)})`,
    "Datum": entry.date,                                   // Airtable date-veld accepteert ISO
    "Uren": String(entry.hours).replace(".", ","),         // "Uren" is een tekstveld
    "Klant": "Van Vijven Transport",
  };
  if (entry.note) fields["Beschrijving"] = entry.note;

  const res = await fetch(`https://api.airtable.com/v0/${base}/${table}`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ fields, typecast: true }),
  });
  if (!res.ok) throw new Error(`Airtable ${res.status}: ${(await res.text()).slice(0, 200)}`);
  const json = await res.json() as { id?: string };
  return json.id ?? null;
}
