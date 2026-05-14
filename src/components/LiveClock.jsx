import { useState, useEffect } from "react";

export default function LiveClock() {
  const [now, setNow] = useState(new Date());
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(t);
  }, []);

  const time = now.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
  const date = now.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", year: "numeric" });
  const utc  = now.toISOString().slice(11, 19) + " UTC";
  const tz   = Intl.DateTimeFormat().resolvedOptions().timeZone;

  return (
    <div className="flex items-center gap-3">
      <div className="flex items-center gap-1.5">
        <span className="relative flex h-2 w-2">
          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
          <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
        </span>
        <span className="text-[10px] font-bold uppercase tracking-[0.2em] text-emerald-400">Live</span>
      </div>
      <div className="text-right font-mono">
        <p className="text-base font-bold text-white leading-tight tabular-nums">{time}</p>
        <p className="text-[10px] text-slate-400 leading-tight">{date} · {tz}</p>
      </div>
    </div>
  );
}
