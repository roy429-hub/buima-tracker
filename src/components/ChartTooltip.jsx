// Horizontal chart tooltip that anchors to the TOP of the chart so it never
// covers historical bars. Pass `sym` (currency symbol) so monetary series
// format correctly. Use as: <Tooltip content={<ChartTooltip sym="€" />} />

import { fmt, fmt0 } from "../lib/storage";
import { fmtUSD } from "../lib/fx";

function formatValue(value, name, sym) {
  if (name === "kWh")            return `${fmt(value, 1)} kWh`;
  if (name === "Cars Served")    return fmt0(value);
  if (name === "Hours Charged")  return `${fmt(value, 1)} h`;
  // Currency-denominated series
  if (sym === "$") return fmtUSD(value);
  return `${sym}${fmt0(value)}`;
}

const SHORT_NAME = {
  "Cars Served": "Cars",
  "Hours Charged": "Hrs",
  "Net Profit": "Net",
  "Revenue": "Rev",
  "kWh": "kWh",
};

export default function ChartTooltip({ active, payload, label, sym = "$" }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-slate-950/95 backdrop-blur border border-slate-700 rounded-md px-3 py-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] font-mono shadow-lg pointer-events-none">
      <span className="font-bold text-white">{label}</span>
      <span className="text-slate-700">|</span>
      {payload.map((p, i) => (
        <span key={i} className="flex items-center gap-1">
          <span style={{ color: p.color }}>{SHORT_NAME[p.name] || p.name}</span>
          <b className="text-white">{formatValue(p.value, p.name, sym)}</b>
        </span>
      ))}
    </div>
  );
}
