# Security Checklist — AI Mentor (Productie)

## Infrastructuur

### Cloudflare Access (verplicht vóór live gaan)
- [ ] Cloudflare Access ingesteld op `mentor.reishacker.nl`
- [ ] Policy: Email-based, alleen `jornbooneinf@gmail.com` toegestaan
- [ ] Uitzondering op Access-policy voor webhook route:
  - Pad: `/api/google/calendar/webhook`
  - Dit pad moet publiek bereikbaar zijn voor Google (webhook-validatie via `tokenHash`)
- [ ] Uitzondering voor: `/api/auth/google/callback` (OAuth redirect)

### VPS
- [ ] Root-login uitgeschakeld (`PermitRootLogin no`)
- [ ] Password SSH auth uitgeschakeld (`PasswordAuthentication no`)
- [ ] UFW actief: alleen poorten 22, 80, 443 open
- [ ] Fail2ban actief (blokkeert brute-force SSH pogingen)
- [ ] Automatische beveiligingsupdates actief
- [ ] Coolify beheerpaneel NIET publiek toegankelijk (alleen via SSH tunnel of VPN)

### Docker
- [ ] Containers draaien als non-root user (`nextjs:nodejs` in Dockerfile)
- [ ] `data/` directory als volume gemount (niet in image gebakken)
- [ ] Geen secrets in Docker image layers (alleen via env vars)

---

## Applicatie

### Tokens & secrets
- [ ] `GOOGLE_TOKEN_ENCRYPTION_KEY` ingesteld (AES-256-GCM encryptie actief)
  - Verifieer via: `GET /api/system/health` → `tokensEncrypted: true`
  - Genereer: `openssl rand -hex 32`
- [ ] Geen access tokens of refresh tokens in logs
- [ ] `tokenHash` (SHA-256 van channel token) wordt NOOIT teruggegeven aan de client
- [ ] `data/google_tokens.json` staat in `.gitignore` (nooit committen)
- [ ] `data/google_calendar_*.json` staat in `.gitignore`

### API routes
- [ ] Alle publieke API routes zijn ofwel:
  - Beschermd via Cloudflare Access, OF
  - Hebben eigen validatie (webhook: `tokenHash` vergelijking)
- [ ] Webhook route valideert `X-Goog-Channel-Token` header (via tokenHash)
- [ ] Geen route geeft tokens, secrets of encryption keys terug aan client
- [ ] `calendarLink.provider` en sync status zijn OK om te tonen, maar nooit de raw token

### AI & MCP
- [ ] AI (OpenAI/DeepSeek) ontvangt nooit tokens, passwords of API keys in de prompt
- [ ] Financiële data gaat nooit rechtstreeks naar AI — alleen geaggregeerde samenvattingen
- [ ] MCP filesystem (toekomst) beperkt tot `~/mentor-imports/` — nooit `.env` of project root
- [ ] CalendarMCP wordt NIET gebruikt als schrijfkanaal (policy: AI schrijft nooit direct naar Google Calendar)

### Calendar security
- [ ] Google Calendar writes lopen altijd via:
  - Direct: `POST /api/calendar/sync-task` (UI-geïnitieerd)
  - Outbox: `CalendarOutbox` queue (gecontroleerd, met retry-limiet)
- [ ] Webhook valideert `resourceState` en `channelId` voor verwerking
- [ ] Watch channels worden gevalideerd via `tokenHash` — niet de raw token

---

## Data

### Wat nooit gecommit mag worden
```
data/google_tokens.json          ← OAuth tokens
data/google_calendar_*.json      ← Sync state, event cache, channels
data/calendar_outbox.json        ← Outbox jobs
data/calendar_conflicts.json     ← Conflicten
.env.local                       ← Alle secrets
```

- [ ] Controleer `.gitignore`: alle bovenstaande bestanden zijn opgenomen
- [ ] `git log --oneline -- data/google_tokens.json` geeft geen resultaten

### Database (productie)
- [ ] PostgreSQL draait NIET publiek op poort 5432 (alleen intern Docker netwerk)
- [ ] `DATABASE_URL` bevat een sterk, uniek wachtwoord (niet het default `mentor_local_dev`)
- [ ] Dagelijkse database backup geconfigureerd in Coolify
- [ ] Backup encryption ingesteld (Coolify ondersteunt versleutelde backups naar S3)

### Backups
- [ ] Backup storage niet op dezelfde VPS als productie
- [ ] S3/Backblaze B2 bucket is private (geen publieke leestoegang)
- [ ] Restore getest (maandelijks)
- [ ] Backup retention: minimaal 14 dagelijkse, 4 wekelijkse snapshots

---

## Toekomstige modules (extra checks bij implementatie)

### Financiën (Fase 3)
- [ ] Transactiedata geïsoleerd in eigen DB-tabel (geen mix met task data)
- [ ] Bankrekening credentials (PSD2) encrypted zoals Google tokens
- [ ] AI-context bevat alleen: totalen per categorie, geen individuele transacties
- [ ] Export/download van financiële data vereist extra bevestiging in UI

### Google Analytics (Fase 1)
- [ ] Analytics scope is read-only: `https://www.googleapis.com/auth/analytics.readonly`
- [ ] Analytics tokens apart van Calendar tokens opgeslagen

---

## Incident response

### Bij gelekte tokens
1. Ga onmiddellijk naar [Google Cloud Console](https://console.cloud.google.com) → Credentials → Revoke token
2. Verwijder `data/google_tokens.json` (of verwijder de DB-rij)
3. Herverbind Google via `/api/auth/google/start`
4. Rotateer `GOOGLE_TOKEN_ENCRYPTION_KEY` (nieuwe key genereren, redeploy)
5. Controleer Google Security Alerts voor ongeautoriseerde toegang

### Bij gecompromitteerde VPS
1. Schakel server onmiddellijk uit via Hetzner Console
2. Neem snapshot voor forensisch onderzoek
3. Revoke alle Google tokens
4. Maak nieuwe VPS aan, deploy vanuit clean state
5. Restore database van meest recente backup
6. Rotateer ALLE secrets in Coolify env vars

### Bij data breach
1. Google OAuth app onmiddellijk intrekken
2. Alle API keys roteren (OpenAI, DeepSeek, Resend)
3. `GOOGLE_TOKEN_ENCRYPTION_KEY` roteren
4. Nieuwe PostgreSQL wachtwoord instellen
5. Rapporteer als persoonsgegevens betrokken zijn (AVG)
