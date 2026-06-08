// Global timeframe filter pill. Returns presetId via onChange.
// Use getDateRange(presetId) to convert to { start, end } strings (YYYY-MM-DD),
// or null for All Time.

import { Calendar } from "lucide-react";

const PRESETS = [
  { id: "all",  label: "All Time" },
  { id: "7d",   label: "7d" },
  { id: "30d",  label: "30d" },
  { id: "90d",  label: "90d" },
  { id: "6mo",  label: "6mo" },
  { id: "ytd",  label: "YTD" },
];

const isoDay = (d) => d.toISOString().slice(0, 10);

export function getDateRange(presetId) {
  if (presetId === "all") return null;
  const today = new Date();
  const todayStr = isoDay(today);
  let start;
  switch (presetId) {
    case "7d":  start = new Date(today.getTime() - 6   * 86400000); break;
    case "30d": start = new Date(today.getTime() - 29  * 86400000); break;
    case "90d": start = new Date(today.getTime() - 89  * 86400000); break;
    case "6mo": start = new Date(today.getTime() - 180 * 86400000); break;
    case "ytd": start = new Date(today.getFullYear(), 0, 1); break;
    default: return null;
  }
  return { start: isoDay(start), end: todayStr };
}

export const TIMEFRAME_LABEL = Object.fromEntries(PRESETS.map(p => [p.id, p.label]));

export default function TimeframeSelector({ value, onChange, className = "" }) {
  return (
    <div className={`flex items-center gap-1.5 ${className}`}>
      <Calendar className="w-3.5 h-3.5 text-slate-500 flex-shrink-0" />
      <div className="flex bg-slate-900 border border-slate-700 rounded-md p-0.5">
        {PRESETS.map(p => (
          <button
            key={p.id}
            onClick={() => onChange(p.id)}
            className={`px-2.5 py-1 rounded text-[10px] font-bold uppercase tracking-wider transition-all ${
              value === p.id
                ? "bg-brand text-white shadow-[0_0_8px_rgba(190,18,60,0.4)]"
                : "text-slate-400 hover:text-white"
            }`}>
            {p.label}
          </button>
        ))}
      </div>
    </div>
  );
}
