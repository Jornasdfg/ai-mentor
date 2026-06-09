# CODEMAP — AI Mentor v4

Persoonlijke productiviteitscoach als Next.js 16 app. Combineert AI-advies (OpenAI/DeepSeek) met een taaksysteem op basis van Covey-kwadranten en een patch-gebaseerd state-model. Alle data is flat-file JSON, geen database.

---

## Stack

| Laag | Technologie |
|------|-------------|
| Framework | Next.js 16 App Router (TypeScript) |
| UI | React 19, Tailwind CSS 3 |
| AI | OpenAI SDK v4 — GPT-4o standaard, DeepSeek als alternatief |
| Storage | Flat-file JSON (`data/`) op de server |
| Stijl | Donker terminalthema: `bg-surface`, `text-muted`, `text-accent` |
| Kalender (fase 1) | Lokale planning via JSON-velden (geen externe afhankelijkheid) |
| Kalender (fase 2) | CalendarMCP adapter — activeer via `CALENDAR_PROVIDER=calendarmcp` |
| Kalender (fase 3) | Google Calendar API direct — OAuth2 + push webhooks + incrementele sync ★ NIEUW |

---

## Directory

```
AI Mentor/
├── app/
│   ├── api/
│   │   ├── mentor/
│   │   │   ├── route.ts              ← HOOFD-AI-ROUTE: bouwt context, roept AI aan, parseert output
│   │   │   └── apply-patches/route.ts ← past door gebruiker goedgekeurde patches toe op state
│   │   ├── tasks/
│   │   │   ├── route.ts              ← GET alle taken, POST nieuwe taak (incl. planningsvelden)
│   │   │   └── [id]/
│   │   │       ├── route.ts          ← PATCH taak (veld-updates)
│   │   │       ├── schedule/route.ts ← PATCH plannedStart/End/Date/Minutes/calendarSyncMode
│   │   │       ├── complete/route.ts ← zet status → done
│   │   │       ├── cancel/route.ts   ← zet status → cancelled
│   │   │       ├── park/route.ts     ← zet status → parked
│   │   │       └── reopen/route.ts   ← zet status → open
│   │   ├── planner/
│   │   │   └── route.ts              ← GET weekevents: taakevents + optioneel Google Calendar events
│   │   ├── calendar/
│   │   │   ├── sync-task/route.ts    ← POST { taskId }: synct taak naar Google Calendar
│   │   │   └── import-event/route.ts ← POST: maakt MentorTask van Google Calendar event
│   │   ├── auth/google/              ← OAuth2 flow ★ NIEUW
│   │   │   ├── start/route.ts        ← GET: genereert state, redirect naar Google consent
│   │   │   ├── callback/route.ts     ← GET: wisselt code + tokens, slaat op in data/
│   │   │   └── status/route.ts       ← GET: { connected, calendarId, scope } — nooit tokens
│   │   ├── google/calendar/          ← Near-live sync controle ★ NIEUW
│   │   │   ├── webhook/route.ts      ← POST: Google push notification ontvangen + fire-and-forget sync
│   │   │   ├── sync-now/route.ts     ← POST { mode: "full"|"incremental" }: handmatige sync trigger
│   │   │   └── watch/
│   │   │       ├── start/route.ts    ← POST: registreert push-channel bij Google
│   │   │       ├── renew/route.ts    ← POST: verlengt channels die binnen 24h verlopen
│   │   │       └── status/route.ts   ← GET: { connected, activeChannels, syncState, recentLog }
│   │   ├── reference/
│   │   │   ├── route.ts              ← GET/PATCH daily_reference.md
│   │   │   └── regenerate/route.ts   ← hergenereert referentie vanuit taken
│   │   ├── cost/route.ts             ← GET kostenoverzicht
│   │   └── versions/route.ts         ← GET versiehistorie van referentie
│   ├── globals.css                   ← Tailwind base + donker thema tokens
│   ├── layout.tsx                    ← Root layout
│   └── page.tsx                      ← HOOFD-PAGINA: state, layout, Taken/Kalender toggle
│
├── components/
│   ├── MentorChat.tsx                ← Chat-UI + patch approve/dismiss
│   ├── TaskBoard.tsx                 ← Tabbladtaken (open/vandaag/parked/done) + filters
│   ├── TaskCard.tsx                  ← Taakregel + acties + gepland-badge + gcal-badge
│   ├── TaskEditorModal.tsx           ← Formulier voor handmatige taakedits
│   ├── TaskCreateModal.tsx           ← Nieuw-taak formulier + planningsvelden
│   ├── RecurringTaskModal.tsx        ← Herhalende taken + standaard planningstijd
│   ├── PlannerCalendar.tsx           ← Weekkalender + sync panel + dev buttons + auto-sync ★ GEWIJZIGD
│   ├── CoveyMatrix.tsx               ← 2x2 kwadranten-visualisatie + klikfilter
│   ├── DailyFocus.tsx                ← Topblok: meest urgente taak van vandaag
│   ├── UpcomingWarnings.tsx          ← Deadlinewaarschuwingen uit AI-advies
│   ├── CostBadge.tsx                 ← Live kostenweergave topbar
│   ├── Editor.tsx                    ← Textarea-editor voor daily_reference
│   └── VersionHistory.tsx            ← Referentie-versiegeschiedenis sidebar
│
├── lib/
│   ├── mentorTypes.ts                ← ALLE TYPES — uitgebreid met CalendarSyncStatus ★ GEWIJZIGD
│   ├── ai/
│   │   ├── aiClient.ts               ← Interface AIClient + AIResponse
│   │   ├── modelRouter.ts            ← Switcht provider op ACTIVE_MODEL env
│   │   ├── openaiClient.ts           ← OpenAI client (json_mode, retry bij truncatie)
│   │   └── deepseekClient.ts         ← DeepSeek client (OpenAI-compat API)
│   ├── calendar/
│   │   ├── types.ts                  ← CalendarProvider interface, CalendarCreateInput/UpdateInput
│   │   ├── calendarProvider.ts       ← getCalendarProvider() factory (local|calendarmcp|google)
│   │   ├── localCalendarProvider.ts  ← Fase 1: geen sync, listEvents=[], mutaties geven foutmelding
│   │   ├── calendarMcpProvider.ts    ← Fase 2: JSON-RPC 2.0 naar CalendarMCP endpoint
│   │   ├── googleCalendarProvider.ts ← Fase 3: Google API via googleapis npm ★ NIEUW
│   │   ├── googleTokenStorage.ts     ← Lees/schrijf data/google_tokens.json — nooit tokens loggen ★ NIEUW
│   │   ├── googleSyncStorage.ts      ← CRUD voor 4 sync-databestanden + typen ★ NIEUW
│   │   ├── googleSyncEngine.ts       ← fullSync + incrementalSync + 410-handling ★ NIEUW
│   │   ├── googleTaskSyncMapper.ts   ← Cache → taken mapper, conflict-detectie ★ NIEUW
│   │   ├── googleWatchManager.ts     ← Channel lifecycle: start/stop/renew, HMAC token security ★ NIEUW
│   │   └── planner.ts                ← buildPlannerEvents(), getWeekRange(), taskToCalendarView()
│   ├── mentor/
│   │   ├── systemPrompt.ts           ← AI-instructie uitgebreid met planningsregels
│   │   ├── mentorStorage.ts          ← Lees/schrijf alle JSON-databestanden
│   │   ├── taskAnalyzer.ts           ← Berekent urgentie/belang/kwadrant per taak
│   │   ├── priorityLogic.ts          ← P0-safety: demoteert interne tools als externe P0 bestaat
│   │   ├── migrateMentorData.ts      ← Migreert deadline → hardDeadline, berekent startBy
│   │   ├── patchApplier.ts           ← Past MentorPatch-array toe op MentorState
│   │   ├── referenceParser.ts        ← Parset ruwe AI JSON → ParsedMentorOutput
│   │   ├── referenceUpdater.ts       ← Hulp bij opslaan van referentie-versies
│   │   ├── dailyReferenceGenerator.ts ← Hergenereert daily_reference.md vanuit taken
│   │   ├── recurringTaskEngine.ts    ← Herhalende taken + helpers combineDateAndTime/addMinutesToLocalISO
│   │   └── mentorTypes.ts            ← (legacy, leeg — gebruik lib/mentorTypes.ts)
│   └── storage/
│       ├── costStorage.ts            ← Bijhouden cumulatieve API-kosten
│       ├── referenceStorage.ts       ← Lees/schrijf daily_reference.md
│       └── versionStorage.ts         ← Lees/schrijf versie-snapshots
│
└── data/                             ← FLAT-FILE DATABASE (nooit committen, gitignored)
    ├── task_register.json            ← Array van MentorTask (hoofd-databron)
    ├── decision_log.json             ← Array van MentorDecision
    ├── mentor_inbox.json             ← Array van MentorInboxItem (max 100)
    ├── mentor_conversation.json      ← Array van MentorConversationItem (max 50)
    ├── mail_actions.json             ← Array van MailAction
    ├── daily_reference.md            ← Huidige dagelijkse referentietekst (Markdown)
    ├── cost.json                     ← Cumulatieve tokenkosten
    ├── google_tokens.json            ← OAuth2 access/refresh tokens — NOOIT committen ★ NIEUW
    ├── oauth_state.json              ← Eenmalige CSRF state voor OAuth flow — NOOIT committen ★ NIEUW
    ├── google_calendar_sync_state.json ← nextSyncToken + lastFullSync tijdstempel ★ NIEUW
    ├── google_calendar_channels.json   ← Watch channels + tokenHash (nooit raw token) ★ NIEUW
    ├── google_calendar_event_cache.json ← Snapshot van Google Calendar events ★ NIEUW
    ├── google_calendar_sync_log.json    ← Sync-logboek, max 200 items ★ NIEUW
    └── versions/                     ← Snapshots van daily_reference op tijdstip
        └── index.json
```

---

## Request lifecycle — Mentor Chat

```
MentorChat (browser)
  │
  ├─ POST /api/mentor  { userMessage }
  │
  └─ app/api/mentor/route.ts
       │
       ├─ ensureDataFiles()           → maakt data/ aan indien ontbreekt
       ├─ readMentorState()           → laadt tasks + decisions + inbox parallel
       ├─ readConversationHistory()   → laadt max 50 gesprekken
       │
       ├─ migrateTasks()              → hardDeadline, leadTimeDays, startBy, coveyQuadrant
       ├─ enforceP0Safety()           → demoteert interne tool-P0s als externe P0 bestaat
       ├─ getStaleSeedWarnings()      → detecteert verlopen vaste deadlines
       │
       ├─ saveInboxItem()             → slaat userMessage op als inbox-entry
       │
       ├─ buildMentorContext()        → geeft AI: datum, P0/P1 + top-8 P2 taken,
       │                                recente beslissingen, inbox, gesprekken
       │                                ★ Taken tonen ook: "(gepland: datum tijd)" en "[gcal]"
       │
       ├─ getAIClient().complete()    → stuurt systemPrompt + context naar AI
       │
       ├─ parseModelOutput()          → JSON → ParsedMentorOutput
       ├─ analyzeAllTasks()           → berekent TaskAnalysis per niet-done taak
       ├─ appendConversationItem()    → slaat samenvatting op in geschiedenis
       │
       └─ NextResponse.json(MentorAdvice)
            └─ proposedPatches: MentorPatch[]  ← NIET automatisch toegepast

MentorChat (browser)
  ├─ toont adviceText, todayTasks, doNotDo, upcomingWarnings
  └─ [Toepassen] → POST /api/mentor/apply-patches  { patches }
       └─ applyMentorPatches(state, patches) → schrijft tasks, decisions, inbox
```

## Request lifecycle — Planner (weekkalender + Google sync)

```
PlannerCalendar (browser)
  │
  ├─ GET /api/planner?week=YYYY-MM-DD
  │    └─ leest taken, optioneel Google Calendar events via CalendarProvider
  │       → buildPlannerEvents() → gesorteerde CalendarEventView[]
  │
  ├─ PATCH /api/tasks/[id]/schedule  { plannedStart, plannedEnd, ... }
  │    └─ werkt planningsvelden bij in task_register.json
  │    └─ (als autoSync aan) → POST /api/calendar/sync-task { taskId }
  │
  ├─ POST /api/calendar/sync-task  { taskId }
  │    └─ GoogleCalendarProvider.createEvent() of updateEvent()
  │       → slaat calendarLink (eventId, syncStatus: "synced") terug op taak
  │
  ├─ POST /api/calendar/import-event  { eventId, summary, ... }
  │    └─ maakt MentorTask met source:"calendar", dedupliceert op calendarLink.eventId
  │
  ├─ POST /api/google/calendar/sync-now  { mode: "full"|"incremental" }
  │    └─ fullSyncCalendar() of incrementalSyncCalendar()
  │       → upsertCachedEvents() → syncCacheToTasks()
  │
  ├─ POST /api/google/calendar/watch/start
  │    └─ startWatch(): channelToken = HMAC-SHA256(secret, channelId)
  │       tokenHash = SHA256(channelToken) — alleen hash opgeslagen
  │       → calendar.events.watch() bij Google registreren
  │
  └─ GET /api/google/calendar/watch/status
       └─ { connected, activeChannels (geen tokenHash), syncState, recentLog }

Google Calendar (extern)
  │
  └─ POST /api/google/calendar/webhook  (push notificatie)
       ├─ Lees headers: X-Goog-Channel-Id, X-Goog-Resource-State, X-Goog-Channel-Token
       ├─ Valideer channel in opgeslagen channels
       ├─ Verificeer token: SHA256(receivedToken) === channel.tokenHash
       ├─ Stuur direct 204 terug (Google verwacht snelle respons)
       └─ Fire-and-forget: incrementalSyncCalendar() + syncCacheToTasks()
```

## OAuth2 flow — Google koppeling

```
Browser → GET /api/auth/google/start
  ├─ Genereer 16-byte hex state, sla op in data/oauth_state.json
  └─ Redirect → https://accounts.google.com/o/oauth2/v2/auth?...&state=xxx

Google → GET /api/auth/google/callback?code=...&state=xxx
  ├─ Lees state uit data/oauth_state.json, verwijder bestand
  ├─ Verifieer state (CSRF-bescherming)
  ├─ POST https://oauth2.googleapis.com/token → { access_token, refresh_token, ... }
  ├─ Sla op in data/google_tokens.json (nooit loggen)
  └─ Redirect → /?calendarConnected=1

Browser → GET /api/auth/google/status
  └─ { provider, googleEnabled, connected, calendarId, scope, updatedAt }
     → NOOIT accessToken of refreshToken teruggeven
```

---

## Kernconcepten

### Prioriteitsysteem

| Level | Kwadrant | Betekenis |
|-------|----------|-----------|
| P0 | Q1 | Urgent + belangrijk — doe nu |
| P1 | Q2 | Belangrijk, niet urgent — plan |
| P2 | Q3 | Urgent, minder belangrijk — beperken |
| P3 | Q4 | Niet urgent, niet belangrijk — parkeer |

### Taakanalyse-scores (`lib/mentor/taskAnalyzer.ts`)

**Urgentie (0–100):**
- Verlopen deadline → 100
- Deadline vandaag → 90
- Deadline morgen → 80
- Deadline deze week → 60
- Toekomstige deadline maar binnen `leadTimeDays` → 50
- `startBy` bereikt → minimaal 50
- Parked/done/cancelled → max 10

**Belang (0–100):**
- Basis: 20
- Tags `klant/samenwerking/weeze`: +40
- Tags `malaga/reis/opname/vlucht`: +40
- Tags `script/shotlist/hooks/cta/winactie`: +20
- Source `monthly_goal`: +30
- Tags `tool/dashboard/intern` zonder deadline: −20
- Max: 100

**Kwadrant:** urgent = score ≥ 60, belangrijk = score ≥ 50

### P0-safety regel (`lib/mentor/priorityLogic.ts`)

Als er een open P0-taak bestaat met tag `weeze/malaga/klant/samenwerking`,
worden alle P0-taken met tag `tool/ai-video-analyzer/dashboard/intern`
automatisch gedegradeerd naar P2.

**Doel:** interne bouwprojecten mogen nooit boven externe verplichtingen staan.

### Patch-systeem (`lib/mentor/patchApplier.ts`)

AI stelt patches voor — de gebruiker keurt ze goed of verwerpt ze. Patches worden nooit automatisch toegepast.

| Operatie | Effect |
|----------|--------|
| `add_task` | Voegt taak toe; bij duplicaat: verhoogt prioriteit of update estimate |
| `update_task` | Past toe: priority, deadline, estimatedMinutes, nextAction, tags, plannedStart, etc. |
| `park_task` | Zet status → parked, priority → P3 |
| `add_decision` | Logt beslissing in decision_log |
| `add_inbox_item` | Voegt item toe aan inbox |
| `complete_task` | Geblokkeerd — alleen via UI |
| `cancel_task` | Geblokkeerd — alleen via UI |

### Kalenderlaag — Fase 1 / 2 / 3

**Fase 1 (actief zonder configuratie):**
- `CALENDAR_PROVIDER=local` (of env niet ingesteld)
- Planningsvelden (`plannedDate`, `plannedStart`, `plannedEnd`, `plannedMinutes`) werken puur lokaal
- Weekkalender toont taakevents uit JSON
- Sync-knop geeft een melding: "Google Calendar sync is nog niet geconfigureerd"

**Fase 2 (activeer met CalendarMCP credentials):**
- `CALENDAR_PROVIDER=calendarmcp` + `CALENDAR_MCP_ENDPOINT` + `CALENDAR_MCP_API_KEY`
- `CalendarMcpProvider` stuurt JSON-RPC 2.0 aanroepen naar het endpoint

**Fase 3 — Google Calendar API direct (actief bij `CALENDAR_PROVIDER=google`):**
- `GoogleCalendarProvider` via `googleapis` npm package
- OAuth2 via `/api/auth/google/start` → callback → `data/google_tokens.json`
- Token refresh via `oauth2Client.on("tokens", ...)` listener — persists without logging
- Incrementele sync met `nextSyncToken`, full-sync fallback bij 410 Gone
- Push webhooks via Google Calendar `events.watch` → channel in `data/google_calendar_channels.json`
- Channel token: `channelToken = HMAC-SHA256(GOOGLE_CALENDAR_WEBHOOK_SECRET, channelId)`
  — alleen `tokenHash = SHA256(channelToken)` opgeslagen, nooit raw token
- Webhook: beantwoord altijd 204 direct; sync loopt fire-and-forget asynchroon
- Conflict-detectie: beide kanten gewijzigd na `lastSyncedAt` → status `"conflict"`, geen auto-resolve
- Orphaned events (aiMentorTaskId verwijst naar onbekende taak) → gelogd, niet geïmporteerd
- Google events geïdentificeerd via `extendedProperties.private.aiMentorTaskId`

**Bron van waarheid:** Altijd `task_register.json`. Google Calendar is een spiegellaag, nooit de primaire database.

**AI-beperking:** De AI mag nooit zelf Google Calendar events aanmaken. Sync loopt uitsluitend via de sync-knop in de UI of `POST /api/calendar/sync-task`.

### CalendarProvider interface (`lib/calendar/types.ts`)

```typescript
interface CalendarProvider {
  readonly name: "local" | "calendarmcp" | "google";
  listEvents(startISO: string, endISO: string): Promise<CalendarEventView[]>;
  createEvent(input: CalendarCreateInput): Promise<string>;   // returns eventId
  updateEvent(eventId: string, input: CalendarUpdateInput): Promise<void>;
  deleteEvent(eventId: string): Promise<void>;
}
```

Wissel van provider door `CALENDAR_PROVIDER` env te veranderen — geen routecode aanpassen nodig.

### Near-live sync mechanisme (`lib/calendar/googleSyncEngine.ts`)

```
fullSyncCalendar(calendarId):
  timeMin = now − 90 dagen (RFC3339 met Z)
  timeMax = now + 365 dagen (RFC3339 met Z)
  singleEvents=true, showDeleted=true
  Pagineer via pageToken
  Sla nextSyncToken op (altijd van de EERSTE pagina)
  → upsertCachedEvents() + writeSyncState()

incrementalSyncCalendar(calendarId):
  Lees nextSyncToken uit sync state
  syncToken alleen op eerste pagina, daarna pageToken only
  Bij 410 Gone: wis syncToken → fullSyncCalendar()
  → upsertCachedEvents() + writeSyncState()
```

### Context naar AI (max tokens gespaard)

```
## Datum
YYYY-MM-DD

## Open taken (P0/P1 volledig, P2 top 8)
[P0/Q1] Taaktitel (deadline: YYYY-MM-DD) (gepland: 2026-05-14 09:00) [gcal] ~30min -- Project
                                           ↑ als plannedStart ingesteld  ↑ als gcal synced

## Recente beslissingen (max 5)
- datum: beslissingstekst

## Recente inbox (max 8)
- datum: ruwe input (max 100 tekens)

## Recente gesprekken (max 5)
[datum] Jorn: ... → Mentor: ...
```

---

## Scheduler & planning — afspraak vs. taak + auto-inplannen ★ NIEUW

De planner en taken werken samen via `lib/scheduler/autoScheduler.ts` (`recalculateSchedule()`).
Het verschil tussen een **vaste afspraak** en een **flexibele taak** is expliciet in het model.

### Taaktype (`MentorTask.taskKind`)
| `taskKind` | Betekenis | Gedrag |
|------------|-----------|--------|
| `"task"` (default) | Flexibele taak (bv. "bonnen in administratie") | Wordt **automatisch ingepland** in vrije werkweek-tijd op prioriteit + deadline. |
| `"appointment"` | Vaste afspraak (bv. "Afspraak Jordi woensdag") | Vast tijdstip, **onverplaatsbaar**; telt als **bezet** zodat flexibele taken eromheen worden gepland; gaat naar Google Agenda (`calendarSyncMode: "auto"`). |

Een afspraak heeft een vast `plannedStart`/`plannedEnd` en krijgt `autoSchedule: "off"`. In de
TaskCreateModal kies je boven "Type": *Flexibele taak* of *Vaste afspraak* (afspraak vereist datum + tijd).

### Auto-inplannen (`recalculateSchedule`)
1. **Bezet** = locked blocks + externe (niet door de app gemaakte) Google-events + **vaste afspraken**
   + handmatig vastgepinde taken (`autoSchedule "off"`/`locked` met een tijd).
2. Bouwt vrije slots uit de **scheduling windows** (`scheduling_windows.json`; default Werk Ma–Vr 09:00–17:30,
   Avond, Weekend) en trekt de bezette tijd eraf.
3. Plant openstaande flexibele taken (`status` open/in_progress, niet `appointment`, `autoSchedule ≠ off`,
   niet `locked`) op volgorde van prioriteit → deadline → `manualSortOrder`. **Zonder `estimatedMinutes`
   gebruikt hij standaard 30 min** (zo worden ook mail-/routinetaken zonder schatting ingepland).
4. Genereert `ScheduleBlock`s (`schedule_blocks.json`); afspraken worden als **locked blocks** getoond.
   Niet-locked auto-blocks worden elke run opnieuw berekend; locked/handmatige blijven staan.
5. Bij `syncToGoogle` worden blocks van taken met `calendarSyncMode: "auto"` naar Google gesynct (outbox).

### Wanneer draait het (triggers)
- **Bij taak aanmaken/wijzigen**: `POST /api/tasks` en `PATCH /api/tasks/[id]` triggeren `recalculate` (fire-and-forget).
- **Periodiek**: worker-job `scheduler-repair` elke 10 min (`worker/index.ts`).
- **Handmatig**: knop "↺ Herplan" in `SchedulerToolbar` → `POST /api/scheduler/recalculate`.
- Vastgezette (`locked`) en vaste-afspraak-blokken worden nooit verschoven.

### Belangrijkste bestanden
| Bestand | Rol |
|---------|-----|
| `lib/scheduler/autoScheduler.ts` | `recalculateSchedule()` — slots, bezet-logica, inplannen, blocks |
| `lib/scheduler/scheduleStorage.ts` | I/O voor `schedule_blocks.json`, `schedule_runs.json`, `scheduling_windows.json` |
| `app/api/scheduler/recalculate/route.ts` | POST-trigger voor herplannen |
| `app/api/scheduler/blocks/**` | CRUD + move/resize/create-from-task voor blocks |
| `components/planner/*` | Planner-UI (WeekTimeGrid, SchedulerToolbar, PriorityTaskInbox, …) |

---

## Mentor-chat (in-app, POST /api/mentor) ★ FLEXIBEL

De chat (`app/api/mentor/route.ts` + `lib/mentor/systemPrompt.ts`) is bewust flexibel én token-zuinig
(geen extra AI-calls; alleen compacte server-side context).

- **Schedule-bewust**: krijgt `buildPlanningContext()` mee (vrije tijd komende dagen, werk-/avondvensters
  minus blocks + Google-events). Vage periode → deadline-taak; concrete dag → stelt een ECHT vrij slot voor en vraagt.
  **Flexibel auto-geplande blokken (~) tellen NIET als bezet** voor beschikbaarheid (`computePlanning` rekent
  vrije tijd alleen tegen vaste items: afspraken/locked/handmatig/Google). Een vaste taak via de mentor mag dus
  op een ~-plek landen (`autoSchedule:"off"` + `plannedStart`); de flexibele taak reflowt vanzelf.
- **Kent bestaande taken op id**: de open-takenlijst toont per taak een `id:` → de chat kan precies verzetten,
  herplannen, uit planning halen, deadline/prioriteit wijzigen, **parkeren, afronden, annuleren, samenvoegen**.
- **Meerdere intenties per bericht** → meerdere patches in één antwoord.
- **Dedup-bewust**: krijgt max 2 duplicaat-suggesties (met id's) mee; kan `merge_tasks` voorstellen.
- **Veiligheid**: de chat past niets zelf toe; patches worden pas uitgevoerd als de gebruiker op
  "Toepassen" klikt (`POST /api/mentor/apply-patches` → `applyMentorPatches`).
- Output: strikt JSON `{ message, patches[] }`; patch-operaties: add_task, update_task, park_task,
  complete_task, cancel_task, merge_tasks, add_decision.

### Spraakinvoer (ChatGPT-stijl) — `MentorChat` + `POST /api/transcribe`
- 1 tik = opname start: pulserende stop-knop (`animate-record-pulse`) + **live geluidsgolf** (Web Audio
  `AnalyserNode`, ~70ms) + timer + annuleer-knop. 2e tik = transcriberen **én** direct versturen.
- Stilte/te-kort-guard (client): geen transcriptie/verzending bij <600ms of (nagenoeg) stilte
  (piekniveau via de meter) → voorkomt gehallucineerde auto-sends.
- `/api/transcribe`: `gpt-4o-mini-transcribe` (accurater + ~$0.003/min) met **fallback** naar `whisper-1`;
  `language:"nl"` + Nederlandse domein-prompt; bestandsnaam-extensie volgt het echte mime-type
  (fix iOS/Safari `audio/mp4`). Kosten gaan naar de teller linksboven.

---

## Taak-dedup & merge (taken uit meerdere bronnen) ★ NIEUW

Taken komen uit Gmail, Airtable, facturen, samenwerkingen en handmatige invoer en overlappen vaak.
`lib/mentor/taskDedup.ts` is een **deterministische** engine (geen AI → gratis qua tokens).

**Velden** (`MentorTask`): `sources: {source, ref?, at}[]` (alle bronnen die de taak bevestigen),
`mergedFrom: string[]` (samengevoegde id's), `supersededBy` (doel-id als de taak is samengevoegd),
`history` (wijzigingslog).

**`dedupeTasks(tasks)`** — veilig (exact auto, twijfel als suggestie):
- **Exacte auto-merge**: zelfde genormaliseerde titel + project → samenvoegen in de oudste (canoniek).
  Vaste afspraken (`taskKind:"appointment"`) en al ingeplande taken worden NOOIT auto-gemerged.
- **Merge-regels**: hoogste prioriteit wint, vroegste/strengste deadline wint, ontbrekende velden
  aangevuld, tags + `sources` verenigd, `history` bijgewerkt; duplicaat → `status:"cancelled"` + `supersededBy`.
- **Prioriteit omhoog** als ≥2 onafhankelijke bronnen dezelfde taak bevestigen (max tot P1).
- **Suggesties** (geen auto): gelijkende titels (Jaccard ≥ 0.5) → `data/dedup_suggestions.json`.

**Beslisser**: deterministische engine voor zekere gevallen; de **AI-mentor** beslist alleen bij twijfel.
De mentor-chat krijgt max 2 suggesties (met id's) compact mee en kan na bevestiging een
`merge_tasks`-patch sturen (`data.ids`). `mergeExplicit()` voert die uit.

**Waar het draait**:
- Worker-job **`dedup` elke 17 min**: `dedupeTasks` → schrijft suggesties, bij merges schrijft taken + herplant.
- `patchApplier`: `add_task` registreert bron + hoogt prioriteit op bij meerdere bronnen; `merge_tasks` voegt expliciet samen.

---

## Routines & wekelijkse analyse ★ NIEUW

Externe Claude-routines (claude.ai "Scheduled tasks") voeden de app via HTTP. De app is
publiek bereikbaar op `https://204.168.213.112.nip.io` (nginx → web-container poort 3000).

| Routine | Trigger | Voedt app via |
|---------|---------|---------------|
| **Ai mentor gmail daily** | dagelijks 07:00 | GitHub `repository_dispatch` → `task_register.json` |
| **AI Mentor — wekelijkse analyse (maandag)** | ma 08:13 (`trig_014uuK6MEmRh9cj6n5tVJJRs`) | `POST /api/weekly-review` (token) |

### Wekelijkse analyse-pijplijn
1. De maandag-routine leest de **live taken** (`GET /api/tasks`), berekent **deterministisch in
   Python** een retrospective van de vorige week (Ma–Zo): afgerond, nieuw, te laat, open P0/P1,
   per project, top-3 focus uit open P0/P1.
2. Ze post het compacte resultaat naar **`POST /api/weekly-review`** met header
   `x-mentor-routine-token: <MENTOR_ROUTINE_TOKEN>`.
3. Het endpoint (`app/api/weekly-review/route.ts`):
   - Slaat de review op in `data/weekly_review.json` (`lib/mentor/weeklyReviewStorage.ts`).
   - Borgt de analyse als **terugkerende routine** (`recurring_tasks.json`, id
     `recurring_weekreview`): **wekelijks op maandag**, flexibel maar **vastgepind op de maandag**
     (`pinToOccurrenceDate`). Ruimt oude losse `task_weekreview_*`-taken op.
   - Triggert `recalculateSchedule`.
4. **Token-zuinig naar de mentor**: `buildWeeklyReviewSnippet()` geeft alléén de samenvatting +
   max 3 focuspunten mee aan de system-prompt, en alléén als de review < 9 dagen oud is. De
   volledige metrics blijven in `data/weekly_review.json`, niet in de prompt.

### Dag-gepinde routines in de auto-scheduler
- **`MentorTask.scheduleOnDate`** (YYYY-MM-DD): als gezet plant de auto-scheduler die flexibele
  taak **alléén op die datum** (tijd blijft flexibel binnen de werkweek-vensters van die dag).
- **`MentorRecurringTask.pinToOccurrenceDate`**: instances krijgen `scheduleOnDate = occurrenceDate`
  + `autoSchedule:"auto"` (geen vast tijdstip). Zo blijft een wekelijkse routine op zijn dag (maandag),
  meerdere weken vooruit, zonder op een andere dag te belanden.
- **`recalculateSchedule()` materialiseert** terugkerende routines binnen de horizon (idempotent via
  `recurrenceKey`) vóór het plannen — zodat ze ook in de planner verschijnen en meteen ingepland worden.
- **Horizon ≥ 62 dagen**: recalc plant altijd minstens ~2 maanden vooruit, zodat **maandelijkse**
  routines (bv. "1e van de maand") altijd op hun dag verschijnen, ook al is die >28 dagen weg.
- **Nieuwe routine = direct zichtbaar**: `POST`/`PATCH /api/recurring-tasks` pint standaard op de
  occurrence-dag (`pinToOccurrenceDate = !defaultPlannedTime`) én triggert meteen een recalc. Een
  routine met een vast tijdstip (`defaultPlannedTime`) wordt i.p.v. gepind als vaste tijd geplaatst.

### Karakter-onderscheid: Taak / Afspraak / Routine (`lib/mentor/taskCharacter.ts`)
`TaskKind = "task" | "appointment" | "routine"`. `isRoutine(task)` = `taskKind==="routine"` of
`isRecurringInstance` of `recurrenceTemplateId`. Routine-instances worden **uitgefilterd** uit de
Taken-lijst (TaskBoard Covey + Agenda), de `PriorityTaskInbox` naast de planner én de mentor-prompt
(ruis + tokens) — ze leven **alleen als planbaar blok in de planner** (gemarkeerd met 🔁). De
routine-**template** blijft zichtbaar in de "Routines"-accordion van de TaskBoard. Afspraken
(`appointment`) tellen als bezet; routines zijn flexibel (vaak dag-gepind via `scheduleOnDate`).

### Gemiste routine → pop-up bij openen (`components/MissedRoutineModal.tsx`)
Bij het laden van de app (`app/page.tsx`) worden routine-instances gezocht die nog open staan terwijl
hun gepinde dag (`scheduleOnDate`/`recurrenceDate`) voorbij is. Is er zo'n gemiste routine, dan
verschijnt een pop-up ("Gisteren niet gedaan"): **Vandaag plannen** (`PATCH scheduleOnDate = vandaag`
→ herplant op vandaag) of **Overslaan** (`POST /api/tasks/[id]/cancel`). Zo blijft een gepinde routine
niet eindeloos als "geen vrije slots" op een voorbije dag hangen.

**Beveiliging**: `MENTOR_ROUTINE_TOKEN` staat in `/app/.env.local` (server) én in de
routine-prompt (cloud). Bij rotatie **beide** bijwerken. Geen token → endpoint geeft 401.

### Instagram-weekupload + funnel (Meta Business Suite)
- **Parser** `lib/instagram/parseMetaCsv.ts`: leest NL Meta-content-exports (posts/reels én stories,
  BOM + quoted velden), classificeert per rij (`Berichttype` → verhaal vs post/reel) en aggregeert
  bereik/weergaven/linkclicks/volgers/interacties + top content.
- **Upload** `POST /api/weekly-review/instagram` (multipart `postCsv`/`storyCsv`, open endpoint):
  parse → `summarizeInstagram` → schrijft `instagram` + `funnel` in `weekly_review.json`.
- **Funnel**: bereik/weergaven (wat volgers zagen) → link-in-bio (story-linkclicks uit CSV +
  `linkinbioClicks` uit de klikdata-routine) → `affiliateRevenueEur` (affiliate-routine). De hoofd-POST
  (`/api/weekly-review`) **merget** i.p.v. overschrijven, en accepteert `linkinbioClicks`/`affiliateRevenueEur`.
- **UI**: `InstagramUploadModal` (twee file-pickers, PC + mobiel) toont funnel + breakdown + top.
  `InstagramWeekPrompt` toont op **maandag (of dinsdag als nog niet gedaan)** een Start/Overslaan-pop-up;
  "overslaan" wordt per week in `localStorage` onthouden (`ig-skip-<maandag>`).

### Affiliate/klikdata + acties (Snel inzicht / Naar mail)
- De **"Affiliate + Klikdata Mentor"**-routine (`trig_01XgqBbxBbXw1mjL1KAvSw2X`, door Make ~ma 6u) berekent
  affiliate-totalen + link-in-bio klikdata en **post die nu (STAP D, best-effort) naar
  `/api/weekly-review`** (`affiliate`-blok + `linkinbioClicks` + `affiliateRevenueEur`). Hoofd-POST merget,
  dus dit combineert met de geüploade Instagram-week tot één funnel.
- **Knop 1 "Snel inzicht"** (`POST /api/weekly-review/insight`): korte AI-conclusies (gpt-4o-mini, token-zuinig)
  over alle data; output wordt genormaliseerd naar bullets (json-mode tolerant) en bewaard als `insightText`.
- **Knop 2 "Naar mail"** (`POST /api/weekly-review/email`): volledig tekstrapport (`lib/mentor/weeklyData.ts`)
  naar `jornbooneinf@gmail.com` via **Resend** (`RESEND_API_KEY`); zonder key → de client downloadt het
  rapport + opent een mailto-concept (zero-setup fallback). Voor diepe analyse in ChatGPT/Claude.
- Beide knoppen staan in `InstagramUploadModal` (PC + mobiel).

---

## PWA & pushnotificaties (iPhone) ★ NIEUW

De app is installeerbaar op het iPhone-beginscherm en stuurt Web Push-notificaties (iOS 16.4+,
alleen vanaf het beginscherm-icoon).

- **PWA**: `public/manifest.webmanifest` + iconen (`public/icon-192.png`, `icon-512.png`,
  `apple-touch-icon.png`, gegenereerd via `scripts/gen-icons.mjs`) + `public/sw.js` (service worker:
  `push` → `showNotification`, `notificationclick` → focus/open). Meta/links in `app/layout.tsx`.
- **Web Push**: `lib/push/webPush.ts` (VAPID via `web-push`), `lib/push/pushStorage.ts`
  (`data/push_subscriptions.json`). Routes: `GET /api/push/public-key`, `POST /api/push/subscribe`,
  `/unsubscribe`, `/test`. UI: `components/EnableNotifications.tsx` (🔔-knop in de header) registreert
  de SW, vraagt toestemming, abonneert en stuurt direct een testmelding.
- **Triggers**:
  - Worker-job **`reminders` elke minuut** (`lib/push/reminders.ts`, dedup via `data/notify_state.json`):
    ~10 min vóór een vast/bevestigd blok, nieuwe `source:"mail"`-taken, en 1×/dag (na 08:00) een
    deadline-waarschuwing (te laat/vandaag/morgen).
  - `POST /api/weekly-review` stuurt een push als de maandag-analyse klaar is.
- **Env**: `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT` in `/app/.env.local` (privésleutel
  nooit naar client; publieke sleutel via `/api/push/public-key`).
- **Deploy-gotcha**: `npm install` MOET in de **alpine-container** (musl) draaien, niet op de host
  (Ubuntu/glibc) — anders krijg je de verkeerde `@next/swc`-binding en faalt Turbopack. Gebruik
  `docker run --rm -v /app:/app -w /app node:20-alpine npm install --no-package-lock`.

---

## Datamodel

### MentorTask (kern)

```typescript
{
  id: string                    // "task_<timestamp>_<rand>"
  title: string
  project?: string
  status: "open" | "in_progress" | "done" | "parked" | "cancelled"
  priority: "P0" | "P1" | "P2" | "P3"

  hardDeadline?: string | null   // YYYY-MM-DD — bindend
  softDeadline?: string | null   // YYYY-MM-DD — richtlijn
  startBy?: string | null        // berekend: hardDeadline − leadTimeDays
  leadTimeDays?: number          // standaard op basis van tags

  estimatedMinutes?: number
  nextAction?: string
  tags?: string[]                // sturen scoring + P0-safety
  source: "manual_input" | "daily_reference" | "mail" | "monthly_goal" | "system" | "calendar"

  // Planning
  plannedDate?: string | null     // YYYY-MM-DD
  plannedStart?: string | null    // YYYY-MM-DDTHH:mm:00 (lokale tijd Amsterdam)
  plannedEnd?: string | null      // YYYY-MM-DDTHH:mm:00
  plannedMinutes?: number | null
  calendarSyncMode?: "none" | "manual" | "auto"

  // Google Calendar koppeling ★ UITGEBREID
  calendarLink?: {
    eventId: string
    calendarId: string
    provider?: "google" | "calendarmcp"
    etag?: string
    googleUpdatedAt?: string      // ISO — tijdstip van laatste Google-mutatie
    lastSynced?: string           // ISO — alias voor lastSyncedAt (backwards compat)
    lastSyncedAt?: string         // ISO — tijdstip van laatste succesvolle sync
    syncStatus: "not_synced" | "pending_google" | "synced" | "external_changed"
               | "deleted_remote" | "conflict" | "error"
    syncError?: string
  }

  updatedAt?: string              // ISO — gebruikt voor conflict-detectie

  // Computed (niet door AI opgeslagen)
  coveyQuadrant?: "Q1" | "Q2" | "Q3" | "Q4"
  urgencyScore?: number
  importanceScore?: number
  deadlinePressure?: "overdue" | "today" | "tomorrow" | "this_week" | "future" | "none"
  isRecurringInstance?: boolean
  recurringTemplateId?: string
}
```

### Sync-databestanden (`lib/calendar/googleSyncStorage.ts`)

```typescript
// data/google_calendar_sync_state.json
interface CalendarSyncState {
  calendarId: string
  nextSyncToken: string | null   // null = full sync nodig
  lastFullSync: string | null    // ISO
  lastIncrementalSync: string | null
  lastError: string | null
}

// data/google_calendar_channels.json — array van:
interface WatchChannel {
  channelId: string
  resourceId: string
  calendarId: string
  expiration: number             // Unix ms
  tokenHash: string              // SHA256(HMAC-SHA256(secret, channelId)) — nooit raw token
  active: boolean
  createdAt: string
}

// data/google_calendar_event_cache.json — record van:
interface CachedEvent {
  id: string                     // Google event ID
  calendarId: string
  status: "confirmed" | "cancelled" | "tentative"
  summary?: string
  start?: string                 // ISO
  end?: string
  updated: string                // RFC3339 van Google
  etag?: string
  aiMentorTaskId?: string        // uit extendedProperties.private.aiMentorTaskId
  cachedAt: string               // ISO
}

// data/google_calendar_sync_log.json — array van (max 200):
interface SyncLogItem {
  ts: string                     // ISO
  type: "full_sync" | "incremental_sync" | "webhook" | "task_map" | "error" | "watch_start" | "watch_renew"
  calendarId?: string
  message: string
  changed?: number
  deleted?: number
}
```

### MentorRecurringTask — planning-velden

```typescript
{
  // ...bestaande velden...
  defaultPlannedTime?: string    // "HH:mm" — standaard begintijd voor instances
  defaultDurationMinutes?: number
  calendarSyncMode?: "none" | "manual" | "auto"
  calendarTitleTemplate?: string  // bv. "Check-in {date}"
}
```

### CalendarEventView (weergavemodel weekkalender)

```typescript
{
  id: string
  title: string
  start: string                  // ISO
  end?: string
  source: "task" | "google"
  taskId?: string                // als source === "task"
  coveyQuadrant?: string
  priority?: string
  calendarSyncStatus?: string
  color?: string
}
```

### AI Output JSON-schema

```json
{
  "adviceText": "max 300 woorden, concreet Nederlands",
  "topPriority": { "title": "", "reason": "" },
  "todayTasks": [{ "title": "", "priority": "P0|P1|P2|P3", "coveyQuadrant": "Q1|Q2|Q3|Q4", "timeEstimate": "", "reason": "" }],
  "upcomingWarnings": [{ "taskId": "", "title": "", "daysUntilDeadline": 0, "message": "" }],
  "doNotDo": [{ "title": "", "reason": "" }],
  "parked": [{ "title": "", "reason": "" }],
  "conflicts": [{ "type": "priority_conflict|duplicate_task|missing_context|deadline_conflict", "resolution": "" }],
  "proposedPatches": [{
    "operation": "add_task|update_task|park_task|add_decision|add_inbox_item",
    "reason": "",
    "data": {
      "title": "",
      "plannedDate": "YYYY-MM-DD of null",
      "plannedStart": "YYYY-MM-DDTHH:mm:00 of null",
      "plannedEnd": "YYYY-MM-DDTHH:mm:00 of null",
      "plannedMinutes": 0,
      "calendarSyncMode": "none|manual|auto"
    }
  }]
}
```

---

## Omgevingsvariabelen (`.env.local`)

```env
# AI
ACTIVE_MODEL=openai          # of: deepseek
OPENAI_API_KEY=sk-...
OPENAI_MODEL=gpt-4o          # of: gpt-4.1-mini, gpt-4o-mini
OPENAI_TEMPERATURE=0.1
OPENAI_MAX_TOKENS=2500
DEEPSEEK_API_KEY=...
DEEPSEEK_BASE_URL=https://api.deepseek.com
DATA_DIR=data                # relatief pad voor flat-file opslag

# Kalender — kies één provider
CALENDAR_PROVIDER=google     # "local" | "calendarmcp" | "google"

# CalendarMCP (fase 2)
# CALENDAR_MCP_ENDPOINT=https://...
# CALENDAR_MCP_API_KEY=cal_xxx

# Google Calendar API (fase 3) ★ NIEUW
GOOGLE_CLIENT_ID=...
GOOGLE_CLIENT_SECRET=...
GOOGLE_REDIRECT_URI=http://localhost:3000/api/auth/google/callback
GOOGLE_DEFAULT_CALENDAR_ID=primary
GOOGLE_CALENDAR_SCOPES=https://www.googleapis.com/auth/calendar

# Near-live sync (fase 3)
GOOGLE_CALENDAR_WEBHOOK_URL=https://jouw-ngrok-url.ngrok-free.app/api/google/calendar/webhook
GOOGLE_CALENDAR_WEBHOOK_SECRET=een_lange_random_string_minimaal_32_chars
GOOGLE_CALENDAR_WATCH_TTL_SECONDS=604800   # 7 dagen (Google max)
```

**Volgorde-regel:** Next.js neemt de EERSTE waarde bij duplicate keys in `.env.local`. Zorg dat `CALENDAR_PROVIDER` maar één keer voorkomt.

**Retry-logica OpenAI:** als `finish_reason === "length"` of ongeldige JSON, herhaalt de client de aanroep eenmalig met expliciete JSON-instructie.

---

## Tailwind kleurentokens & typografie (vrolijk licht thema)

Gedefinieerd in `tailwind.config.ts` en `globals.css`. **Lettertype: Nunito** (rond, luchtig) app-breed
(`font-sans` én `font-mono` gemapt op Nunito; geladen via Google Fonts-link in `app/layout.tsx`).
Achtergrond: zachte verloop-tint (`globals.css` body). `html,body { overflow-x: hidden }` borgt dat er
**nooit horizontaal gescrold** wordt; chat-bubbels gebruiken `.break-anywhere` + `min-w-0`.

| Token | Kleur | Gebruik |
|-------|-------|---------|
| `bg-surface` | `#f3f5fc` | Paginaachtergrond (zacht) |
| `bg-panel` | `#ffffff` | Cards, panelen, headers |
| `border-border` | `#e3e6f0` | Zachte hairline |
| `text-muted` | `#6e6e80` | Secundaire tekst |
| `text-accent` | `#5b6cff` | Accent (indigo) — vaak in gradient `from-accent to-accent2` |
| `accent2` | `#8b5cf6` | Violet, tweede gradient-stop |
| `success` | `#34c759` | Bevestigingen, geplande taken |
| `warning` | `#ff9f0a` | Waarschuwingen |
| `danger` | `#ff3b30` | Fouten, P0 |

Animaties: `animate-msg-in` (chatbericht-entree), `animate-pop-in`, `animate-record-pulse` (opname),
`shadow-soft`/`shadow-lift`; alles uit via `prefers-reduced-motion` (globals).

**Belangrijk (geleerd):** na wijziging van `tailwind.config.ts` moet de dev-web-container herstart
(`docker restart app-mentor-web-1`) — `next dev` cachet de Tailwind-config; een git pull alléén
herlaadt de themewaarden niet.

---

## Migratielogica (`lib/mentor/migrateMentorData.ts`)

Draait bij elke mentor-aanroep op de volledige takenlijst:

1. `deadline` → `hardDeadline` als `hardDeadline` ontbreekt
2. Berekent `leadTimeDays` standaard op basis van tags
3. Berekent `startBy = hardDeadline − leadTimeDays` als nog niet ingesteld
4. Voegt tag `stale_seed` toe aan vaste taken met verlopen deadline
5. Herberekent `coveyQuadrant`, `urgencyScore`, `importanceScore`, `deadlinePressure`

---

## Planningsregels (AI — `lib/mentor/systemPrompt.ts`)

- Een taak met `plannedStart` is al ingepland — adviseer niet opnieuw te plannen tenzij er een deadline- of conflict-probleem is
- Als een taak belangrijk is maar geen `plannedStart` heeft, mag de AI voorstellen om hem in te plannen via `update_task` met `plannedDate/plannedStart/plannedEnd/plannedMinutes`
- De AI mag **nooit** direct een Google Calendar event aanmaken — dit loopt altijd via de dashboardknop of `/api/calendar/sync-task`
- Taken met `source: "calendar"` komen uit Google Calendar en kunnen al een geplande tijd hebben

---

## Veiligheidsgrenzen (Google Calendar)

- **Nooit tokens loggen** — `accessToken` en `refreshToken` mogen nergens in logs verschijnen
- **Nooit tokens naar frontend** — `/api/auth/google/status` geeft alleen `connected`, `calendarId`, `scope`, `updatedAt`
- **Nooit `tokenHash` naar client** — `watch/status` filtert `tokenHash` eruit via destructuring
- **Nooit raw channel token opslaan** — alleen `SHA256(HMAC-SHA256(secret, channelId))`
- **AI schrijft nooit naar Google Calendar** — alleen via expliciete UI-actie of `/api/calendar/sync-task`
- **`data/*.json` gitignored** — zie `.gitignore` voor volledige lijst

---

## Grenzen en beperkingen

- Geen echte database — alle data is JSON in `data/`. Bij gelijktijdige requests kan data verloren gaan.
- Geen authenticatie — volledig lokale single-user app.
- `complete_task` en `cancel_task` zijn bewust geblokkeerd voor AI — alleen de gebruiker mag taken sluiten.
- AI ontvangt maximaal P0/P1 + 8 P2 taken — P3-taken zijn onzichtbaar voor de AI tenzij ze al bestaan in de context.
- Conversatiegeschiedenis is niet gestreamd — de AI ziet samengevatte regels, geen volledige berichten.
- `daily_reference.md` wordt niet automatisch meegegeven aan de AI.
- Fire-and-forget webhook werkt in lokale Node.js dev. In serverless (Vercel Edge) kan dit gedrag afwijken — overweeg dan een aparte cron of queue.
- Push webhooks vereisen een publiek bereikbare URL (ngrok voor lokale test).
- Conflicten (`syncStatus: "conflict"`) worden gedetecteerd maar **niet** automatisch opgelost — gebruiker moet handmatig kiezen.

---

## Top 20 cruciale bestanden voor diepe AI-review

Geordend van meest impact naar minst:

| # | Bestand | Waarom cruciaal |
|---|---------|-----------------|
| 1 | `lib/mentor/systemPrompt.ts` | Bepaalt volledig het AI-gedrag: prioriteitsregels, planningsregels, output-schema, patch-instructies |
| 2 | `lib/mentorTypes.ts` | Backbone van het systeem — alle types, enums, interfaces incl. kalender-types |
| 3 | `app/api/mentor/route.ts` | Hoofd-AI-flow: context bouwen, AI aanroepen, state bijwerken |
| 4 | `lib/mentor/taskAnalyzer.ts` | Kernalgoritme voor urgentie/belang/kwadrant-scoring |
| 5 | `lib/mentor/patchApplier.ts` | State-mutatie engine — correctheid is kritisch |
| 6 | `lib/calendar/googleSyncEngine.ts` | Full + incremental sync, 410-handling, paginatie ★ NIEUW |
| 7 | `lib/calendar/googleTaskSyncMapper.ts` | Cache → taken mapper: conflict-detectie, deleted_remote, tijd-updates ★ NIEUW |
| 8 | `lib/calendar/googleWatchManager.ts` | Channel lifecycle + HMAC token security ★ NIEUW |
| 9 | `app/api/google/calendar/webhook/route.ts` | Push notification handler — security-kritisch ★ NIEUW |
| 10 | `lib/calendar/googleSyncStorage.ts` | CRUD voor 4 sync-databestanden + alle sync-types ★ NIEUW |
| 11 | `lib/mentor/priorityLogic.ts` | P0-safety enforcement — beschermt externe verplichtingen |
| 12 | `lib/mentor/migrateMentorData.ts` | Datamigratie + stale-detectie — draait elke request |
| 13 | `lib/mentor/mentorStorage.ts` | Alle I/O naar data/ — single point of failure voor persistentie |
| 14 | `lib/calendar/googleCalendarProvider.ts` | Google API provider: listEvents, createEvent, updateEvent ★ NIEUW |
| 15 | `lib/calendar/googleTokenStorage.ts` | Token I/O — nooit loggen, nooit naar client ★ NIEUW |
| 16 | `components/PlannerCalendar.tsx` | Weekkalender UI: grid, sync panel, dev buttons, auto-sync ★ GEWIJZIGD |
| 17 | `lib/mentor/referenceParser.ts` | AI JSON-parser — fouten hier breken de hele response |
| 18 | `lib/ai/openaiClient.ts` | AI-integratie met retry, json_mode, kostenberekening |
| 19 | `app/api/tasks/route.ts` | CRUD-basis voor taken + triggert referentie-regeneratie |
| 20 | `lib/mentor/recurringTaskEngine.ts` | Herhalende taken + helpers combineDateAndTime/addMinutesToLocalISO |
