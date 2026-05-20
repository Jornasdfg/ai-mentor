"use client";

interface GoogleEvent {
  id: string; title: string; start: string; end: string; allDay: boolean;
}

interface Props {
  event: GoogleEvent;
  heightPx: number;
}

export default function GoogleEventBlock({ event, heightPx }: Props) {
  const time = event.allDay ? "" : `${event.start.slice(11, 16)}–${event.end.slice(11, 16)}`;
  const isSmall = heightPx < 36;
  return (
    <div
      className="absolute left-0.5 right-0.5 rounded overflow-hidden border border-blue-700/40 bg-blue-950/60 text-blue-300 select-none pointer-events-none"
      title={`${event.title}${time ? ` | ${time}` : ""}`}
    >
      {isSmall ? (
        <div className="px-1.5 py-0.5 text-[10px] truncate">{event.title}</div>
      ) : (
        <div className="px-1.5 py-1">
          <div className="text-xs font-medium truncate">{event.title}</div>
          {time && <div className="text-[10px] opacity-60">{time}</div>}
        </div>
      )}
    </div>
  );
}