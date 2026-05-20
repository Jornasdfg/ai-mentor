"use client";

interface GoogleEvent {
  id: string;
  title: string;
  start: string;
  end: string;
  allDay: boolean;
}

interface Props {
  event: GoogleEvent;
  style?: React.CSSProperties;
}

export default function GoogleEventBlock({ event, style }: Props) {
  const timeLabel = event.allDay
    ? "Hele dag"
    : `${event.start.slice(11, 16)}–${event.end.slice(11, 16)}`;

  return (
    <div
      className="absolute left-1 right-1 rounded border border-blue-700/40 bg-blue-900/20 text-blue-300 px-1.5 py-0.5 text-xs font-mono overflow-hidden pointer-events-none"
      style={style}
      title={`${event.title} | ${timeLabel}`}
    >
      <div className="truncate opacity-80">{event.title}</div>
      <div className="opacity-50">{timeLabel}</div>
    </div>
  );
}