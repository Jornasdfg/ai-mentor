# Integrations Roadmap — AI Mentor

## Overzicht

De AI Mentor groeit van een taak-/agenda-manager naar een volledig persoonlijk business intelligence dashboard. Hieronder de geplande integraties per fase.

**Beveiligingsprincipes die voor ALLE integraties gelden:**
- Geen externe tool heeft directe schrijftoegang tot taken of kalender
- Financiële data gaat nooit naar externe AI-tools, behalve via expliciete samenvatting
- MCP filesystem-toegang is read-only en beperkt tot een specifieke import-map
- Alle API-keys en tokens worden encrypted opgeslagen

---

## Fase 1 — Google Analytics Data API (Q3 2026)

**Doel:** Reishacker.nl traffic en omzetevents inzichtelijk maken in het dashboard.

### Wat
- Dagelijks rapport via Google Analytics Data API v1
- Metrics: sessions, pageviews, top-10 pagina's, bounce rate, conversies
- Evenement-tracking: affiliate clicks, contactformulier, nieuwsbrief aanmeldingen

### Hoe
```typescript
// lib/integrations/googleAnalytics.ts
// Gebruikt googleapis (al aanwezig in package.json)
// OAuth scope: https://www.googleapis.com/auth/analytics.readonly
// Dagelijks ophalen via worker job om 06:00
```

### Database
```prisma
model AnalyticsSnapshot {
  id         String @id
  date       String
  metric     String   // "sessions" | "pageviews" | "topPage" etc.
  value      Float
  dimensions String?  // JSON blob
  createdAt  String
  @@map("analytics_snapshots")
}
```

### Dashboard widget
- Weekoverzicht: sessions/pageviews grafiek
- Top 5 pagina's van de week
- Omzetevents teller
- Mentor kan suggesties doen: "Pagina X converteert goed, overweeg follow-up content"

---

## Fase 2 — Affiliate tracking (Q3 2026)

**Doel:** Inzicht in affiliate-inkomsten per netwerk en per maand.

### Ondersteunde netwerken
- **Awin** — CSV export of API (Awin Publisher API)
- **Travelpayouts** — CSV export of Travelpayouts API
- **Booking.com affiliate** — CSV rapport

### Import flow
```
CSV bestand uploaden → POST /api/integrations/affiliate/import
         │
         ▼
Parse CSV → normalize naar AffiliateRecord
         │
         └─► Opslaan in DB + maandtotalen bijhouden
```

### Database
```prisma
model AffiliateRecord {
  id          String  @id
  network     String  // "awin" | "travelpayouts" | "booking"
  date        String  // YYYY-MM-DD
  orderId     String?
  program     String  // adverteerder naam
  commission  Float   // bedrag in EUR
  currency    String  @default("EUR")
  status      String  // "pending" | "confirmed" | "cancelled"
  importedAt  String
  @@map("affiliate_records")
}
```

### Mentor integratie
- Maandelijkse P&L samenvatting in daily briefing
- Alert als maandtotaal < vorige maand × 80%
- Taak: "Controleer pending commissions bij Awin"

---

## Fase 3 — Finance: CSV/mail import (Q4 2026)

**Doel:** Persoonlijke financiën bijhouden: inkomsten, uitgaven, P&L.

### Import methoden
1. **CSV upload** — bankafschrift (ING, Rabobank, KNAB formaat)
2. **E-mail forward** — facturen doorsturen naar een dedicated mailbox (via Resend inbound of Gmail filter)
3. **Handmatige invoer** via UI

### Categorisering
```typescript
// AI-gebaseerde categorie-detectie
// Regels: merchant name + amount pattern matching
// Categorieën: reiskosten, software, belasting, inkomen, etc.
```

### Database
```prisma
model Transaction {
  id          String  @id
  date        String  // YYYY-MM-DD
  amount      Float   // positief = inkomst, negatief = uitgave
  currency    String  @default("EUR")
  description String
  category    String  // AI-voorgesteld of handmatig
  source      String  // "csv_import" | "manual" | "mail"
  importedAt  String
  @@map("transactions")
}
```

### Maandelijkse P&L
- Inkomsten: affiliate + overige
- Uitgaven: per categorie
- Netto: inkomsten - uitgaven
- Vergelijking met vorige maand

**Beveiligingsnota:** Financiële transactiedata gaat nooit rechtstreeks naar externe AI-modellen. Alleen geaggregeerde samenvattingen (totalen per categorie) worden als context meegestuurd aan de AI.

---

## Fase 3b — PSD2/Open Banking (2027)

**Doel:** Automatische banksync zonder handmatig CSV exporteren.

### Provider: GoCardless (voorheen Nordigen)
- Open source PSD2 API aggregator
- Gratis tier: 90 dagen historische data, live transacties
- Ondersteunde banken: ING, Rabobank, ABN, KNAB etc.

### Flow
```
GoCardless Requisition → OAuth → Bank koppeling
         │
         ▼ (dagelijks via worker)
GET /api/integrations/gocardless/sync
         │
         └─► Transacties ophalen → categoriseren → opslaan
```

### Beveiliging
- GoCardless access token encrypted opgeslagen (zelfde AES-256-GCM als Google tokens)
- Bank credentials gaan nooit via de AI Mentor server
- Alleen read-only toegang (PSD2 AIS — Account Information Services)

---

## Fase 4 — MCP filesystem read-only (Q1 2027)

**Doel:** AI-agent kan bestanden lezen uit een specifieke import-map voor data-import taken.

### Scope (strict afgebakend)
- **Toegestaan:** Lezen van `~/mentor-imports/` directory
  - CSV bestanden (financiën, affiliate exports)
  - PDF facturen
  - .xlsx exports
- **Verboden:**
  - Toegang tot `.env`, `.env.local`, of andere secrets
  - Schrijftoegang
  - Toegang buiten `~/mentor-imports/`
  - Toegang tot de project root (`~/Desktop/Claude Oefenmap/`)

### Implementatie
```typescript
// CLAUDE.md constraint voor MCP filesystem tool:
// "Only access ~/mentor-imports/. Never access .env files, 
//  project root, or any path outside the designated import directory."
```

### Use cases
- "Analyseer dit bankafschrift en maak taken voor uitstaande betalingen"
- "Importeer dit Awin CSV rapport"
- "Lees deze factuur en maak een transactie-record"

---

## Prioriteitsmatrix

| Integratie | Waarde | Inspanning | Prioriteit |
|------------|--------|-----------|-----------|
| Google Analytics | Hoog | Laag | ⭐⭐⭐ |
| Affiliate CSV import | Hoog | Laag | ⭐⭐⭐ |
| Finance CSV import | Hoog | Middel | ⭐⭐⭐ |
| PSD2/GoCardless | Hoog | Hoog | ⭐⭐ |
| MCP filesystem | Middel | Laag | ⭐⭐ |
| Awin API (live) | Middel | Middel | ⭐⭐ |
| Travelpayouts API | Middel | Middel | ⭐⭐ |

---

## Niet in scope

De volgende integraties zijn bewust buiten scope gehouden:

- **WhatsApp Business API** — privacy-risico, te complex voor single-user
- **Slack** — niet gebruikt in workflow
- **Zapier/Make** — externe afhankelijkheid, data gaat via derde partij
- **Google Sheets als database** — niet ACID-proof
- **CRM-systemen** — buiten scope voor persoonlijk dashboard
