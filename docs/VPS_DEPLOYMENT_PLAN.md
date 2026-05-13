# VPS Deployment Plan — AI Mentor (mentor.reishacker.nl)

## Stack-overzicht

| Component | Keuze | Reden |
|-----------|-------|-------|
| VPS | Hetzner CX22 (€4,49/m) | 2 vCPU, 4 GB RAM, 40 GB SSD, Amsterdam DC |
| OS | Ubuntu 24.04 LTS | Langetermijn support, stabiel |
| Container runtime | Docker CE | Isolatie, reproduceerbaar |
| Orchestratie | Coolify | Self-hosted PaaS, GitHub-integratie, SSL via Traefik |
| Database | PostgreSQL 16 (via Coolify) | ACID, productieproof |
| DNS | Cloudflare | Proxy, DDoS-bescherming, gratis SSL |
| Domein | mentor.reishacker.nl | Persoonlijk dashboard |
| Notificaties | ntfy (optioneel) | Push naar telefoon |

---

## Fase 1 — VPS opzetten

### 1.1 VPS aanmaken (Hetzner)
1. Ga naar [console.hetzner.cloud](https://console.hetzner.cloud)
2. Maak een project "ai-mentor"
3. Server aanmaken:
   - Type: **CX22** (2 vCPU, 4 GB RAM)
   - Datacenter: **Falkenstein** of **Nuremberg** (EU, dicht bij NL)
   - Image: **Ubuntu 24.04**
   - SSH key: voeg je publieke sleutel toe
   - Naam: `mentor-01`
4. Noteer het IP-adres

### 1.2 Ubuntu hardening
```bash
# Verbind als root
ssh root@<VPS_IP>

# Update & upgrade
apt update && apt upgrade -y

# Maak een non-root gebruiker aan
adduser deploy
usermod -aG sudo deploy

# Kopieer SSH key naar deploy user
mkdir -p /home/deploy/.ssh
cp ~/.ssh/authorized_keys /home/deploy/.ssh/
chown -R deploy:deploy /home/deploy/.ssh
chmod 700 /home/deploy/.ssh
chmod 600 /home/deploy/.ssh/authorized_keys

# Uitloggen, herverbinden als deploy
exit
ssh deploy@<VPS_IP>

# Disable root login + password auth
sudo sed -i 's/PermitRootLogin yes/PermitRootLogin no/' /etc/ssh/sshd_config
sudo sed -i 's/#PasswordAuthentication yes/PasswordAuthentication no/' /etc/ssh/sshd_config
sudo systemctl restart sshd

# Firewall (UFW)
sudo ufw default deny incoming
sudo ufw default allow outgoing
sudo ufw allow 22/tcp    # SSH
sudo ufw allow 80/tcp    # HTTP (Traefik)
sudo ufw allow 443/tcp   # HTTPS (Traefik)
sudo ufw allow 8000/tcp  # Coolify (tijdelijk, later afsluiten)
sudo ufw enable

# Fail2ban
sudo apt install -y fail2ban
sudo systemctl enable --now fail2ban

# Automatische beveiligingsupdates
sudo apt install -y unattended-upgrades
sudo dpkg-reconfigure -plow unattended-upgrades
```

---

## Fase 2 — Docker + Coolify installeren

### 2.1 Docker CE
```bash
curl -fsSL https://get.docker.com | bash
sudo usermod -aG docker deploy
# Herverbinden zodat groep actief is
exit && ssh deploy@<VPS_IP>
docker --version   # moet werken zonder sudo
```

### 2.2 Coolify
```bash
curl -fsSL https://cdn.coollabs.io/coolify/install.sh | bash
```
Dit installeert Coolify op **poort 8000**. Na installatie:
1. Open `http://<VPS_IP>:8000` in je browser
2. Maak een admin-account aan
3. Voeg je server toe als **Localhost** (of via SSH als je meerdere servers hebt)

> Na het configureren van Coolify kun je poort 8000 sluiten via UFW:
> `sudo ufw delete allow 8000/tcp`
> Gebruik dan SSH tunnel: `ssh -L 8000:localhost:8000 deploy@<VPS_IP>`

---

## Fase 3 — GitHub koppelen

1. In Coolify → **Sources** → **GitHub App**
2. Klik **Install GitHub App** → autoriseer voor de `ai-mentor` repo
3. Coolify heeft nu lees/deploy-toegang tot je repo

---

## Fase 4 — Services aanmaken in Coolify

### 4.1 PostgreSQL
1. Coolify → **New Resource** → **Database** → **PostgreSQL 16**
2. Naam: `mentor-db`
3. Database: `mentor`, User: `mentor`, stel een sterk wachtwoord in
4. Sla de **Connection String** op (komt als `DATABASE_URL`)

### 4.2 mentor-web (Next.js)
1. Coolify → **New Resource** → **Application** → **Docker**
2. Repo: je GitHub repo, branch: `main`
3. Build Pack: **Dockerfile** (detecteert de `Dockerfile` automatisch)
4. Port: `3000`
5. Domein: `mentor.reishacker.nl`
6. Environment variables: zie **Fase 5**

### 4.3 mentor-worker (achtergrond)
1. Coolify → **New Resource** → **Application** → **Docker**
2. Zelfde repo/branch
3. Build Pack: **Dockerfile**
4. Overschrijf CMD: `["npx", "tsx", "worker/index.ts"]`
5. Geen publiek domein nodig
6. Dezelfde environment variables als mentor-web

---

## Fase 5 — Environment variabelen

Stel de volgende env vars in voor **zowel mentor-web als mentor-worker**:

```bash
# AI
OPENAI_API_KEY=sk-...
ACTIVE_MODEL=openai
OPENAI_MODEL=gpt-4o

# Database
DATABASE_URL=postgresql://mentor:<wachtwoord>@mentor-db:5432/mentor

# Google OAuth
GOOGLE_CLIENT_ID=...
GOOGLE_CLIENT_SECRET=...
GOOGLE_REDIRECT_URI=https://mentor.reishacker.nl/api/auth/google/callback
GOOGLE_CALENDAR_SCOPES=https://www.googleapis.com/auth/calendar
GOOGLE_DEFAULT_CALENDAR_ID=primary

# Google Calendar Webhook
GOOGLE_CALENDAR_WEBHOOK_URL=https://mentor.reishacker.nl/api/google/calendar/webhook

# Token encryptie (verplicht in productie!)
# Genereer met: openssl rand -hex 32
GOOGLE_TOKEN_ENCRYPTION_KEY=<64-char-hex>

# Calendar
CALENDAR_PROVIDER=google

# Notificaties (optioneel)
NTFY_URL=https://ntfy.sh         # of je eigen ntfy server
NTFY_TOPIC=mentor-jorn           # geheime topic naam
RESEND_API_KEY=re_...
DAILY_BRIEFING_EMAIL_TO=jornbooneinf@gmail.com

# Worker intern
MENTOR_WEB_URL=http://mentor-web:3000
```

### Encryptie key genereren
```bash
openssl rand -hex 32
# Output: 64 hex tekens → kopieer als GOOGLE_TOKEN_ENCRYPTION_KEY
```

---

## Fase 6 — Database migraties uitvoeren

Na eerste deploy, voer migraties uit via Coolify terminal of SSH:

```bash
# In de mentor-web container
npx prisma migrate deploy

# Optioneel: migreer bestaande JSON-data
npm run migrate:json-to-db
```

---

## Fase 7 — Domein koppelen (Cloudflare + Coolify)

### 7.1 Cloudflare DNS
1. Ga naar Cloudflare dashboard → je domein `reishacker.nl`
2. Voeg toe: **A record** `mentor` → `<VPS_IP>`, **Proxy: aan** (oranje wolk)
3. SSL/TLS mode: **Full (strict)** (Cloudflare ↔ VPS versleuteld)

### 7.2 Coolify domein
1. In mentor-web service → **Domains**: `mentor.reishacker.nl`
2. Coolify configureert Traefik + Let's Encrypt automatisch

---

## Fase 8 — Google OAuth redirect URI aanpassen

1. Ga naar [Google Cloud Console](https://console.cloud.google.com) → je project
2. **APIs & Services** → **Credentials** → je OAuth 2.0 Client
3. Voeg toe bij **Authorized redirect URIs**:
   ```
   https://mentor.reishacker.nl/api/auth/google/callback
   ```
4. Sla op
5. Update env var `GOOGLE_REDIRECT_URI` → redeploy

---

## Fase 9 — Webhook registreren

Na deploy en OAuth-koppeling:
```bash
curl -X POST https://mentor.reishacker.nl/api/google/calendar/watch/ensure \
  -H "Content-Type: application/json" \
  -d '{"calendarId": "primary"}'
```

Controleer: `GET https://mentor.reishacker.nl/api/system/health`
→ `watchActive: true`

---

## Fase 10 — Health check

```bash
curl https://mentor.reishacker.nl/api/system/health | jq .
```

Verwachte output (alles groen):
```json
{
  "status": "ok",
  "google": {
    "connected": true,
    "watchActive": true,
    "tokensEncrypted": true,
    "lastFullSync": "2026-...",
    "lastIncrementalSync": "2026-..."
  },
  "warnings": []
}
```

---

## Fase 11 — Backups instellen

### 11.1 PostgreSQL backup (via Coolify)
Coolify heeft ingebouwde **Scheduled Backups** voor databases:
1. mentor-db → **Backups** → **Schedule**
2. Dagelijks om 03:00
3. Bewaar 14 dagelijkse backups
4. S3/Backblaze B2 als opslag (configureer S3 credentials in Coolify Settings)

### 11.2 Data volume backup (voor JSON fallback)
```bash
# Cron op VPS: dagelijks backup van /app/data volume
# /etc/cron.d/mentor-backup
0 3 * * * deploy docker run --rm -v mentor_mentor_data:/data -v /home/deploy/backups:/backup \
  alpine tar czf /backup/mentor-data-$(date +%Y%m%d).tar.gz -C / data && \
  find /home/deploy/backups -name "mentor-data-*.tar.gz" -mtime +14 -delete
```

### 11.3 Restore testen
Maandelijks: restore de meest recente backup naar een test-instantie en controleer data-integriteit.

---

## Rollback plan

### Snelle rollback (< 5 min)
1. Coolify → mentor-web → **Deployments** → klik op vorige succesvolle deployment → **Redeploy**

### Database rollback
```bash
# Prisma rollback (revert laatste migratie)
npx prisma migrate resolve --rolled-back <migratie-naam>
npx prisma migrate deploy  # herdeploy vorige staat
```

### Noodgeval: JSON fallback
Als database onbereikbaar is, werkt de app met JSON-bestanden in het `data/` volume. Verwijder `DATABASE_URL` env var tijdelijk → restart → JSON-modus actief.

---

## Checklist na eerste deploy

- [ ] `GET /api/system/health` → `status: ok`
- [ ] Google OAuth flow werkt (koppel opnieuw via `/api/auth/google/start`)
- [ ] Webhook actief (`watchActive: true`)
- [ ] Tokens versleuteld (`tokensEncrypted: true`)
- [ ] Eerste full sync uitgevoerd
- [ ] Worker draait (check Coolify logs: "Gestart. Jobs: outbox/5m...")
- [ ] Dagelijkse briefing ontvangen op 07:30 (dag erna)
- [ ] Cloudflare Access geconfigureerd (zie SECURITY_CHECKLIST.md)
- [ ] Backup geconfigureerd en getest
