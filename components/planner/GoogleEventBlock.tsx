"use client";

interface GoogleEvent {
  id: string;
  title: string;
  start: string;
  end: string;
  allDay: boolean;
  description?: string | null;
  htmlLink?: string | null;
}

interface Props {
  event: GoogleEvent;
  heightPx: number;
  onClick?: () => void;
}

function localTime(iso: string): string {
  if (!iso.includes("T")) return "";
  // Parse the time respecting the offset (+02:00, Z, etc.)
  const d = new Date(iso);
  return d.toLocaleTimeString("nl-NL", {
    hour: "2-digit", minute: "2-digit",
    timeZone: "Europe/Amsterdam",
  });
}

export default function GoogleEventBlock({ event, heightPx, onClick }: Props) {
  const time = event.allDay
    ? ""
    : `${localTime(event.start)}–${localTime(event.end)}`;
  const isSmall = heightPx < 36;

  return (
    <div
      onClick={onClick}
      className={`h-full w-full rounded overflow-hidden border border-indigo-700/50 bg-indigo-950/70 text-indigo-200 select-none transition-all ${
        onClick
          ? "cursor-pointer hover:bg-indigo-900/80 hover:border-indigo-500/70"
          : "pointer-events-none"
      }`}
      title={`${event.title}${time ? ` | ${time}` : ""}${event.description ? `\n${event.description}` : ""}`}
    >
      {isSmall ? (
        <div className="px-1.5 py-0.5 text-[10px] truncate h-full flex items-center">{event.title}</div>
      ) : (
        <div className="px-1.5 py-1 h-full flex flex-col">
          <div className="text-xs font-medium truncate">{event.title}</div>
          {time && <div className="text-[10px] opacity-60 mt-0.5">{time}</div>}
          {event.description && heightPx > 60 && (
            <div className="text-[10px] opacity-50 mt-1 line-clamp-2 leading-tight">{event.description}</div>
          )}
        </div>
      )}
    </div>
  );
}
