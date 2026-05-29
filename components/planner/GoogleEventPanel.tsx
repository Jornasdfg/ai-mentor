"use client";

interface GoogleEvent {
  id: string;
  title: string;
  start: string;
  end: string;
  allDay: boolean;
  description?: string | null;
  htmlLink?: string | null;
  calendarId: string;
}

interface Props {
  event: GoogleEvent;
  onClose: () => void;
  onImportAsTask?: () => Promise<void>;
}

function localDateTime(iso: string): string {
  if (!iso.includes("T")) {
    return new Date(`${iso}T00:00:00`).toLocaleDateString("nl-NL", {
      weekday: "long", day: "numeric", month: "long", year: "numeric",
      timeZone: "Europe/Amsterdam",
    });
  }
  return new Date(iso).toLocaleString("nl-NL", {
    weekday: "long", day: "numeric", month: "long",
    hour: "2-digit", minute: "2-digit",
    timeZone: "Europe/Amsterdam",
  });
}

function localTime(iso: string): string {
  if (!iso.includes("T")) return "";
  return new Date(iso).toLocaleTimeString("nl-NL", {
    hour: "2-digit", minute: "2-digit",
    timeZone: "Europe/Amsterdam",
  });
}

function durationStr(start: string, end: string): string {
  const diffMs = new Date(end).getTime() - new Date(start).getTime();
  const mins = Math.round(diffMs / 60000);
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  if (h === 0) return `${m}m`;
  if (m === 0) return `${h}u`;
  return `${h}u ${m}m`;
}

export default function GoogleEventPanel({ event, onClose, onImportAsTask }: Props) {
  const isAllDay = !event.start.includes("T");

  return (
    <div className="
      fixed sm:static bottom-0 sm:bottom-auto left-0 sm:left-auto right-0 sm:right-auto
      z-50 sm:z-auto
      w-full sm:w-72 sm:shrink-0
      max-h-[88vh] sm:max-h-none sm:h-full
      bg-zinc-900 border-t sm:border-t-0 sm:border-l border-zinc-800
      rounded-t-2xl sm:rounded-none
      flex flex-col overflow-hidden
      shadow-2xl sm:shadow-none
    ">
      {/* Mobile drag handle */}
      <div className="sm:hidden flex justify-center pt-2.5 pb-1 shrink-0">
        <div className="w-10 h-1 rounded-full bg-zinc-700" />
      </div>
      <div className="flex items-center justify-between px-4 py-3 border-b border-zinc-800 shrink-0">
        <div className="flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-indigo-400 shrink-0" />
          <span className="text-[10px] font-semibold text-zinc-500 uppercase tracking-wider">Google Calendar</span>
        </div>
        <button
          onClick={onClose}
          className="w-6 h-6 flex items-center justify-center rounded hover:bg-zinc-800 text-zinc-400 hover:text-zinc-200 transition-colors text-lg leading-none"
        >
          ×
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        <h2 className="text-sm font-semibold text-zinc-100 leading-snug">{event.title}</h2>

        <div className="space-y-2 text-xs">
          {isAllDay ? (
            <div className="flex gap-2">
              <span className="text-zinc-600 w-14 shrink-0">Dag</span>
              <span className="text-zinc-300">{localDateTime(event.start)}</span>
            </div>
          ) : (
            <>
              <div className="flex gap-2">
                <span className="text-zinc-600 w-14 shrink-0">Start</span>
                <span className="text-zinc-300">{localDateTime(event.start)}</span>
              </div>
              <div className="flex gap-2">
                <span className="text-zinc-600 w-14 shrink-0">Einde</span>
                <span className="text-zinc-300">{localTime(event.end)}</span>
              </div>
              <div className="flex gap-2">
                <span className="text-zinc-600 w-14 shrink-0">Duur</span>
                <span className="text-zinc-300">{durationStr(event.start, event.end)}</span>
              </div>
            </>
          )}
        </div>

        {event.description && (
          <div className="bg-zinc-800/60 rounded-lg p-3">
            <p className="text-[10px] text-zinc-500 uppercase tracking-wider mb-1">Beschrijving</p>
            <p className="text-xs text-zinc-300 leading-relaxed whitespace-pre-wrap">{event.description}</p>
          </div>
        )}

        <div className="text-xs text-zinc-600">
          Agenda: {event.calendarId === "primary" ? "Primaire agenda" : event.calendarId}
        </div>
      </div>

      <div className="px-4 py-3 border-t border-zinc-800 space-y-2 shrink-0">
        {event.htmlLink && (
          <a
            href={event.htmlLink}
            target="_blank"
            rel="noreferrer"
            className="flex items-center justify-center w-full py-2 text-xs font-medium rounded-lg bg-indigo-600/20 border border-indigo-600/40 text-indigo-400 hover:bg-indigo-600/30 transition-colors"
          >
            Openen in Google Calendar ↗
          </a>
        )}
        {onImportAsTask && (
          <button
            onClick={onImportAsTask}
            className="w-full py-2 text-xs font-medium rounded-lg border border-zinc-700 text-zinc-400 hover:text-zinc-200 hover:border-zinc-500 transition-colors"
          >
            + Importeer als taak
          </button>
        )}
      </div>
    </div>
  );
}
