import { readHours, writeHours, withWorkLock, type WorkHours } from "./workStore";
import { fetchHoursStatuses } from "./airtable";

// Uren waarvan de Airtable-status "Verwerkt" is, worden NIET getoond (in de app
// én in de werkgever-link). "Nog te verwerken" e.d. blijven zichtbaar.
export function isProcessed(status?: string | null): boolean {
  return !!status && status.toLowerCase().includes("verwerkt"); // "verwerken" (nog te ~) matcht NIET
}

// Leest de uren, ververst de Airtable-status (best-effort), bewaart die, en geeft
// alleen de NIET-verwerkte uren terug.
export async function loadVisibleHours(): Promise<WorkHours[]> {
  const all = await readHours();
  let statuses: Record<string, string> = {};
  try { statuses = await fetchHoursStatuses(); } catch { /* offline/niet geconfigureerd */ }

  let changed = false;
  const updated = all.map(h => {
    if (h.airtableRecordId && statuses[h.airtableRecordId] !== undefined && statuses[h.airtableRecordId] !== h.airtableStatus) {
      changed = true;
      return { ...h, airtableStatus: statuses[h.airtableRecordId] };
    }
    return h;
  });
  if (changed) {
    try {
      await withWorkLock(async () => {
        const fresh = await readHours();
        const statusById = new Map(updated.map(u => [u.id, u.airtableStatus]));
        await writeHours(fresh.map(f => (statusById.has(f.id) ? { ...f, airtableStatus: statusById.get(f.id) ?? f.airtableStatus } : f)));
      });
    } catch { /* niet blokkeren */ }
  }
  return updated.filter(h => !isProcessed(h.airtableStatus));
}
