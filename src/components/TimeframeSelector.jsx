// Global timeframe filter pill.
// `value` can be either a preset id string ("all", "7d", "30d", "90d", "6mo", "ytd")
// OR a custom range object { start: "YYYY-MM-DD", end: "YYYY-MM-DD" }.
// `onChange(newValue)` receives whichever shape was selected.

import { useEffect, useRef, useState } from "react";
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

export function getDateRange(value) {
  if (!value || value === "all") return null;
  // Already a custom { start, end } range — return as-is (after validation).
  if (typeof value === "object" && value.start && value.end) {
    return { start: value.start, end: value.end };
  }
  const today = new Date();
  const todayStr = isoDay(today);
  let start;
  switch (value) {
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

const isCustomValue = (v) => typeof v === "object" && v !== null && v.start && v.end;

export default function TimeframeSelector({ value, onChange, className = "" }) {
  const isCustom = isCustomValue(value);
  const [showCustom, setShowCustom] = useState(isCustom);
  const [customStart, setCustomStart] = useState(isCustom ? value.start : "");
  const [customEnd,   setCustomEnd]   = useState(isCustom ? value.end   : "");

  // Skip the first effect fire (so we don't immediately overwrite the parent's value)
  const mounted = useRef(false);
  useEffect(() => {
    if (!mounted.current) { mounted.current = true; return; }
    if (showCustom && customStart && customEnd && customStart <= customEnd) {
      onChange({ start: customStart, end: customEnd });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [customStart, customEnd, showCustom]);

  const enterCustomMode = () => {
    setShowCustom(true);
    // Pre-fill with last 30 days if no custom dates yet
    if (!customStart || !customEnd) {
      const today = new Date();
      const start = new Date(today.getTime() - 29 * 86400000);
      setCustomStart(isoDay(start));
      setCustomEnd(isoDay(today));
      // Effect will fire and notify parent
    } else {
      // Already had custom dates — re-apply them
      onChange({ start: customStart, end: customEnd });
    }
  };

  const choosePreset = (id) => {
    setShowCustom(false);
    onChange(id);
  };

  return (
    <div className={`flex items-center gap-1.5 flex-wrap ${className}`}>
      <Calendar className="w-3.5 h-3.5 text-slate-500 flex-shrink-0" />
      <div className="flex bg-slate-900 border border-slate-700 rounded-md p-0.5">
        {PRESETS.map(p => {
          const isSelected = !isCustom && !showCustom && value === p.id;
          return (
            <button key={p.id} onClick={() => choosePreset(p.id)}
              className={`px-2.5 py-1 rounded text-[10px] font-bold uppercase tracking-wider transition-all ${
                isSelected
                  ? "bg-brand text-white shadow-[0_0_8px_rgba(190,18,60,0.4)]"
                  : "text-slate-400 hover:text-white"
              }`}>
              {p.label}
            </button>
          );
        })}
        <button onClick={enterCustomMode}
          className={`px-2.5 py-1 rounded text-[10px] font-bold uppercase tracking-wider transition-all ${
            (isCustom || showCustom)
              ? "bg-brand text-white shadow-[0_0_8px_rgba(190,18,60,0.4)]"
              : "text-slate-400 hover:text-white"
          }`}>
          Custom
        </button>
      </div>
      {showCustom && (
        <div className="flex items-center gap-1 bg-slate-900 border border-slate-700 rounded-md px-2 py-1">
          <input type="date" value={customStart} max={customEnd || undefined}
            onChange={e => setCustomStart(e.target.value)}
            className="bg-transparent text-[11px] text-slate-200 font-mono outline-none w-[120px]" />
          <span className="text-slate-500 text-[10px]">→</span>
          <input type="date" value={customEnd} min={customStart || undefined}
            onChange={e => setCustomEnd(e.target.value)}
            className="bg-transparent text-[11px] text-slate-200 font-mono outline-none w-[120px]" />
        </div>
      )}
    </div>
  );
}
