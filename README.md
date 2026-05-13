# AI Mentor — v1

Persoonlijk AI Mentorsysteem voor dagelijkse prioritering.

## Snel starten

```bash
# 1. Installeer dependencies
npm install

# 2. Maak .env.local aan vanuit het voorbeeld
cp .env.local.example .env.local
# Vul je DEEPSEEK_API_KEY in

# 3. Start de dev server
npm run dev
# Open http://localhost:3000
```

## .env.local instellen

```env
DEEPSEEK_API_KEY=sk-xxxx      # Verplicht
ACTIVE_MODEL=deepseek          # of "openai"
# OPENAI_API_KEY=sk-xxxx       # Optioneel
```

## Projectstructuur

```
app/
  api/mentor/     → AI mentor aanroep
  api/reference/  → lees/schrijf daily_reference.md
  api/versions/   → versiegeschiedenis

lib/
  mentor/         → system prompt, parser, updater
  ai/             → deepseekClient, openaiClient, modelRouter
  storage/        → referenceStorage, versionStorage

components/
  Editor.tsx        → Markdown editor met opslaan
  MentorChat.tsx    → Chat interface + update-flow
  VersionHistory.tsx → Versie-accordeon

data/
  daily_reference.md   → Huidig werkgeheugen
  versions/            → Automatisch opgeslagen versies
```

## Model wisselen

Zet `ACTIVE_MODEL=openai` in `.env.local` en voeg je `OPENAI_API_KEY` toe.

## MCP uitbreiden (v2)

Voeg een nieuwe client toe in `lib/ai/` die de `AIClient` interface implementeert,
en registreer hem in `lib/ai/modelRouter.ts`.
