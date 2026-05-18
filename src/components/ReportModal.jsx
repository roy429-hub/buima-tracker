import { useState } from "react";
import { X, Download, Calendar, FileText, Loader2 } from "lucide-react";

// Period helpers
function isoDate(d) { return d.toISOString().slice(0, 10); }
function lastMonth() {
  const now = new Date();
  const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1));
  const end   = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 0));
  return { start: isoDate(start), end: isoDate(end) };
}
function thisMonth() {
  const now = new Date();
  const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const end   = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 0));
  return { start: isoDate(start), end: isoDate(end) };
}
function ytd() {
  const now = new Date();
  return {
    start: isoDate(new Date(Date.UTC(now.getUTCFullYear(), 0, 1))),
    end:   isoDate(now),
  };
}
function allTime() {
  return { start: "2020-01-01", end: isoDate(new Date()) };
}

export default function ReportModal({ title, subtitle, icon, onClose, onGenerate }) {
  const presets = [
    { id: "last_month", label: "Last Month", get: lastMonth },
    { id: "this_month", label: "This Month", get: thisMonth },
    { id: "ytd",        label: "Year-to-Date", get: ytd },
    { id: "all",        label: "All Time",   get: allTime },
  ];
  const [selectedPreset, setSelectedPreset] = useState("last_month");
  const [{ start, end }, setRange] = useState(lastMonth());
  const [generating, setGenerating] = useState(false);

  const choosePreset = (p) => {
    setSelectedPreset(p.id);
    setRange(p.get());
  };

  const handleGenerate = async () => {
    setGenerating(true);
    try {
      await onGenerate(start, end);
      onClose();
    } catch (e) {
      alert("Failed to generate report: " + (e.message || e));
    } finally {
      setGenerating(false);
    }
  };

  const Icon = icon || FileText;

  return (
    <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl max-w-lg w-full overflow-hidden"
        onClick={e => e.stopPropagation()}>
        <div className="bg-gradient-to-r from-slate-950 to-slate-900 text-white px-6 py-4 flex justify-between items-center border-b border-slate-700">
          <div className="flex items-center gap-3">
            <Icon className="w-5 h-5 text-brand" />
            <div>
              <h3 className="font-bold">{title}</h3>
              {subtitle && <p className="text-xs text-slate-400 mt-0.5">{subtitle}</p>}
            </div>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-white">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 space-y-4">
          <div>
            <p className="text-[10px] uppercase tracking-wider font-bold text-slate-700 mb-2">Period</p>
            <div className="grid grid-cols-2 gap-2">
              {presets.map(p => (
                <button key={p.id}
                  onClick={() => choosePreset(p)}
                  className={`px-3 py-2 rounded-lg text-sm font-bold border transition-all ${
                    selectedPreset === p.id
                      ? "bg-brand text-white border-brand shadow-sm"
                      : "bg-white text-slate-700 border-slate-200 hover:border-brand"
                  }`}>
                  {p.label}
                </button>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <label className="block">
              <span className="text-[10px] uppercase tracking-wider font-bold text-slate-700">From</span>
              <input type="date" value={start}
                onChange={e => { setRange({ start: e.target.value, end }); setSelectedPreset("custom"); }}
                className="mt-1 w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:border-brand focus:ring-2 focus:ring-brand/20" />
            </label>
            <label className="block">
              <span className="text-[10px] uppercase tracking-wider font-bold text-slate-700">To</span>
              <input type="date" value={end}
                onChange={e => { setRange({ start, end: e.target.value }); setSelectedPreset("custom"); }}
                className="mt-1 w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:border-brand focus:ring-2 focus:ring-brand/20" />
            </label>
          </div>

          <div className="bg-slate-50 border border-slate-200 rounded-lg p-3 flex items-start gap-2">
            <Calendar className="w-3.5 h-3.5 text-slate-500 mt-0.5 flex-shrink-0" />
            <p className="text-xs text-slate-600">
              The PDF will only include data <b>within this range</b>. Days with no uploads are skipped from the daily breakdown.
            </p>
          </div>
        </div>

        <div className="bg-slate-50 border-t border-slate-200 px-6 py-4 flex items-center justify-end gap-2">
          <button onClick={onClose}
            className="px-4 py-2 text-slate-600 hover:bg-slate-100 rounded-lg text-sm font-bold">
            Cancel
          </button>
          <button onClick={handleGenerate} disabled={generating}
            className="bg-brand hover:bg-brand-dark text-white px-5 py-2 rounded-lg font-bold shadow-sm flex items-center gap-2 disabled:opacity-50">
            {generating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
            {generating ? "Generating…" : "Generate PDF"}
          </button>
        </div>
      </div>
    </div>
  );
}
