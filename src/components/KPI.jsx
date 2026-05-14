export function KPICard({ label, value, sub, accent = "default", icon: Icon }) {
  const palettes = {
    default: { bg: "bg-white",         border: "border-slate-200", text: "text-slate-900",  icon: "text-slate-400" },
    brand:   { bg: "bg-brand",          border: "border-brand-dark", text: "text-white",     icon: "text-white/80" },
    dark:    { bg: "bg-slate-800",      border: "border-slate-700", text: "text-white",      icon: "text-slate-400" },
    green:   { bg: "bg-emerald-50",    border: "border-emerald-200", text: "text-emerald-700", icon: "text-emerald-500" },
    amber:   { bg: "bg-amber-50",      border: "border-amber-200", text: "text-amber-700",   icon: "text-amber-500" },
    indigo:  { bg: "bg-indigo-50",     border: "border-indigo-200", text: "text-indigo-700",  icon: "text-indigo-500" },
  };
  const p = palettes[accent] || palettes.default;
  return (
    <div className={`${p.bg} ${p.border} border rounded-xl shadow-sm p-4 flex flex-col`}>
      <div className="flex items-center justify-between mb-2">
        <p className={`text-[10px] uppercase tracking-wider font-bold opacity-70 ${p.text}`}>{label}</p>
        {Icon && <Icon className={`w-4 h-4 ${p.icon}`} />}
      </div>
      <p className={`text-2xl font-black ${p.text}`}>{value}</p>
      {sub && <p className={`text-xs mt-1 opacity-75 ${p.text}`}>{sub}</p>}
    </div>
  );
}
