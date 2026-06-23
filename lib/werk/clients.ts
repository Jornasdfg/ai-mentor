// Werk-klanten. Per klant: label, Airtable-Klantnaam, of er vrachtbonnen zijn,
// en de slug-prefix voor de deelbare werkgever-link (/u/<slug>-<geheim>).
export type ClientId = "vanvijven" | "ledgnd";

export interface ClientConfig {
  id: ClientId;
  label: string;          // weergavenaam in de app
  airtableKlant: string;  // waarde voor het Airtable-veld "Klant"
  showFreight: boolean;   // vrachtbonnen-tab tonen?
  slug: string;           // herkenbaar deel van de deellink
  emoji: string;
  headerName: string;     // titel op de werkgever-pagina
}

export const CLIENTS: Record<ClientId, ClientConfig> = {
  vanvijven: {
    id: "vanvijven", label: "Van Vijven (werk)", airtableKlant: "Van Vijven Transport",
    showFreight: true, slug: "rens", emoji: "🚚", headerName: "Jorn — Van Vijven Transport",
  },
  ledgnd: {
    id: "ledgnd", label: "Ledgnd (werk)", airtableKlant: "Ledgnd",
    showFreight: false, slug: "ledgnd", emoji: "💡", headerName: "Jorn — Ledgnd",
  },
};

export function isClientId(x: string): x is ClientId {
  return x === "vanvijven" || x === "ledgnd";
}
export function normalizeClient(x: string | null | undefined): ClientId {
  return x && isClientId(x) ? x : "vanvijven";
}
