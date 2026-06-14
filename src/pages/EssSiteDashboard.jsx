// ESS site dashboard — energy flow / battery health view.
// No revenue/ROI/payback (ESS sites don't have EV charging revenue).
// Used for sites with site_type='ess'.

import { useState, useMemo } from "react";
import { Link } from "react-router-dom";
import {
  ArrowLeft, Sun, Zap, Battery, BatteryCharging, Activity, Sparkles,
  MapPin, Settings, FileText, Upload, Trash2, AlertCircle,
  FileSpreadsheet, BarChart3, Clock, TrendingDown
} from "lucide-react";
import {
  ComposedChart, BarChart, Bar, Line, XAxis, YAxis, Tooltip,
  ResponsiveContainer, CartesianGrid, Legend
} from "recharts";
import { getSite, currencySymbol, fmt, fmt0, addUpload, deleteUpload, getUploadsForSite, refreshFromDB } from "../lib/storage";
import { useStorageVersion } from "../lib/useStorage";
import { dbRegenerateShareToken } from "../lib/supabase";
import UploadDropzone from "../components/UploadDropzone";
import LiveClock from "../components/LiveClock";
import { SiteFormModal } from "../components/SiteForm";
import ChartTooltip from "../components/ChartTooltip";
import TimeframeSelector, { getDateRange } from "../components/TimeframeSelector";

const PERIODS = [
  { id: "daily",   label: "Daily" },
  { id: "weekly",  label: "Weekly" },
  { id: "monthly", label: "Monthly" },
];

// Aggregate ESS uploads into per-day series + lifetime totals
function aggregateEss(uploads, dateRange) {
  const filtered = dateRange
    ? uploads.filter(u => u.reportDate >= dateRange.start && u.reportDate <= dateRange.end)
    : uploads;

  const sorted = [...filtered].sort((a, b) => a.reportDate.localeCompare(b.reportDate));

  const totals = {
    days: sorted.length,
    pvKwh: 0, gridKwh: 0, chargedKwh: 0, dischargedKwh: 0,
    cyclesAccrued: 0,
    avgSoh: 0,
    peakSoc: 0, minSoc: 100,
    pvPeakW: 0,
    firstDate: null, lastDate: null,
  };

  const sohSamples = [];
  sorted.forEach(u => {
    const s = u.essSummary || {};
    totals.pvKwh        += s.pvKwh || 0;
    totals.gridKwh      += s.gridKwh || 0;
    totals.chargedKwh   += s.chargedKwh || 0;
    totals.dischargedKwh += s.dischargedKwh || 0;
    totals.cyclesAccrued += s.cyclesDelta || 0;
    if (s.peakSoc != null) totals.peakSoc = Math.max(totals.peakSoc, s.peakSoc);
    if (s.minSoc != null && s.minSoc > 0) totals.minSoc = Math.min(totals.minSoc, s.minSoc);
    if (s.pvPeakW != null) totals.pvPeakW = Math.max(totals.pvPeakW, s.pvPeakW);
    if (s.soh != null && s.soh > 0) sohSamples.push(s.soh);
    const d = new Date(u.reportDate);
    if (!totals.firstDate || d < totals.firstDate) totals.firstDate = d;
    if (!totals.lastDate  || d > totals.lastDate)  totals.lastDate  = d;
  });
  totals.avgSoh = sohSamples.length ? sohSamples.reduce((s, v) => s + v, 0) / sohSamples.length : 0;
  totals.avgPvKwh = totals.days ? totals.pvKwh / totals.days : 0;
  totals.avgDischargedKwh = totals.days ? totals.dischargedKwh / totals.days : 0;
  totals.selfConsumption = totals.pvKwh > 0
    ? Math.min(100, (totals.chargedKwh / Math.max(totals.pvKwh, 1)) * 100)
    : 0;

  // Daily series for chart (one row per day, zero-filled if necessary)
  const buckets = new Map();
  sorted.forEach(u => {
    buckets.set(u.reportDate, {
      key: u.reportDate,
      pvKwh: (u.essSummary?.pvKwh || 0),
      gridKwh: (u.essSummary?.gridKwh || 0),
      chargedKwh: (u.essSummary?.chargedKwh || 0),
      dischargedKwh: (u.essSummary?.dischargedKwh || 0),
      peakSoc: u.essSummary?.peakSoc || 0,
      minSoc: u.essSummary?.minSoc || 0,
    });
  });
  let daily = [];
  if (totals.firstDate && totals.lastDate) {
    const start = dateRange ? new Date(dateRange.start) : totals.firstDate;
    const end   = dateRange ? new Date(dateRange.end)   : totals.lastDate;
    const cur = new Date(start);
    while (cur <= end) {
      const k = cur.toISOString().slice(0, 10);
      daily.push(buckets.get(k) || {
        key: k, pvKwh: 0, gridKwh: 0, chargedKwh: 0, dischargedKwh: 0, peakSoc: 0, minSoc: 0,
      });
      cur.setUTCDate(cur.getUTCDate() + 1);
    }
  }

  return { totals, daily, uploads: sorted.slice().reverse() };
}

export default function EssSiteDashboard({ site }) {
  const id = site.id;
  const version = useStorageVersion();
  const [editingSite, setEditingSite] = useState(false);
  const [timeframe, setTimeframe] = useState("all");
  const dateRange = useMemo(() => getDateRange(timeframe), [timeframe]);

  const uploads = useMemo(() => getUploadsForSite(id), [id, version]);
  const data    = useMemo(() => aggregateEss(uploads, dateRange), [uploads, dateRange]);
  const t = data.totals;

  // Status (LIVE if recent upload, else stale/offline)
  let status = { color: "text-slate-500", dot: "bg-slate-600", label: "No Data" };
  if (site.active === false) status = { color: "text-slate-500", dot: "bg-slate-600", label: "Off" };
  else if (t.lastDate) {
    const daysAgo = (new Date() - t.lastDate) / 86400000;
    if (daysAgo <= 7) status = { color: "text-emerald-400", dot: "bg-emerald-500", label: "Live" };
    else if (daysAgo <= 30) status = { color: "text-amber-400", dot: "bg-amber-500", label: "Stale" };
    else status = { color: "text-red-400", dot: "bg-red-500", label: "Offline" };
  }

  // Share link
  const shareUrl = site?.shareToken ? `${window.location.origin}/share/${site.shareToken}` : "";
  const [copied, setCopied] = useState(false);
  const [regenerating, setRegenerating] = useState(false);
  const copyLink = async () => {
    if (!shareUrl) return;
    try { await navigator.clipboard.writeText(shareUrl); setCopied(true); setTimeout(() => setCopied(false), 2000); }
    catch (e) { alert("Could not copy: " + e.message); }
  };
  const regenerateLink = async () => {
    if (!confirm("Regenerate the share link?\n\nThe OLD link will stop working immediately.")) return;
    setRegenerating(true);
    try { await dbRegenerateShareToken(site.id); await refreshFromDB(); setCopied(false); }
    catch (e) { alert("Regenerate failed: " + e.message); }
    finally { setRegenerating(false); }
  };

  const handleParsed = async (parsed) => {
    try {
      if (parsed.kind !== "ess") {
        alert("This site is an ESS site. Please upload an ESS Control Box xlsx (not an EV charger history file).");
        return;
      }
      await addUpload({
        siteId: id, reportDate: parsed.reportDate, chargerId: parsed.chargerId,
        totalKwh: parsed.summary?.dischargedKwh || 0,
        totalSessions: 0, c1Sessions: 0, c2Sessions: 0, sessions: [],
        essSummary: parsed.summary,
      });
    } catch (e) {
      alert("Failed to save upload: " + e.message);
    }
  };

  const removeUpload = async (uid, date) => {
    if (!confirm(`Delete the upload for ${date}?`)) return;
    try { await deleteUpload(uid); }
    catch (e) { alert("Delete failed: " + e.message); }
  };

  return (
    <div className="-mx-4 sm:-mx-6 lg:-mx-8 -mt-8 -mb-12">
      {/* COMMAND BAR */}
      <div className="bg-gradient-to-r from-slate-950 via-slate-900 to-slate-950 border-b border-slate-800/80">
        <div className="max-w-[1400px] mx-auto px-4 sm:px-6 lg:px-8 py-3 flex items-center justify-between flex-wrap gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <Link to="/sites" className="text-slate-400 hover:text-brand flex items-center gap-1 text-xs">
              <ArrowLeft className="w-3.5 h-3.5" /> Installations
            </Link>
            <span className="text-slate-700">/</span>
            <div className="flex items-center gap-1.5">
              <span className="relative flex h-1.5 w-1.5">
                {status.label === "Live" && <span className={`animate-ping absolute inline-flex h-full w-full rounded-full ${status.dot} opacity-75`}></span>}
                <span className={`relative inline-flex rounded-full h-1.5 w-1.5 ${status.dot}`}></span>
              </span>
              <span className={`text-[10px] font-bold uppercase tracking-[0.15em] ${status.color}`}>{status.label}</span>
            </div>
            <span className="text-[10px] font-bold uppercase tracking-[0.2em] text-amber-400 bg-amber-500/15 border border-amber-500/30 rounded px-1.5 py-0.5">
              ESS · PV
            </span>
            <span className="text-xs text-slate-400 font-mono hidden sm:inline">
              {t.days} report files {dateRange ? "in range" : "on record"}
              {dateRange && <span className="text-brand ml-1">· {dateRange.start} → {dateRange.end}</span>}
            </span>
          </div>
          <div className="flex items-center gap-3 flex-wrap">
            <TimeframeSelector value={timeframe} onChange={setTimeframe} />
            <LiveClock />
          </div>
        </div>
      </div>

      {/* MAIN */}
      <div className="bg-slate-950 text-slate-200 p-4 sm:p-6 lg:p-8 pb-12">
        <div className="max-w-[1400px] mx-auto space-y-4">

          {/* SITE HEADER */}
          <div className="bg-gradient-to-r from-amber-700 to-amber-900 rounded-xl p-6 text-white relative overflow-hidden">
            <img src="/logo.png" alt="" className="absolute -right-6 -bottom-6 w-40 h-40 opacity-10 object-contain" />
            <div className="flex items-start justify-between flex-wrap gap-4 relative">
              <div className="min-w-0">
                <p className="text-[10px] uppercase tracking-[0.2em] opacity-80 mb-1 font-bold">Energy Storage System {site.address?.toLowerCase().includes("francisco robles") ? "+ Solar PV" : ""}</p>
                <h1 className="text-3xl font-black tracking-tight">{site.name}</h1>
                <p className="text-sm opacity-90 mt-1 flex items-center gap-2 flex-wrap">
                  <MapPin className="w-3.5 h-3.5" /> {site.city}, {site.country}
                  <span className="opacity-50">·</span>
                  <span className="font-mono text-xs">{site.chargerId}</span>
                </p>
              </div>
              <button onClick={() => setEditingSite(true)}
                className="bg-white/15 hover:bg-white/25 backdrop-blur rounded-md px-3 py-1.5 flex items-center gap-1.5 text-xs font-bold transition-colors">
                <Settings className="w-3.5 h-3.5" /> Edit Site
              </button>
            </div>
          </div>

          {/* HERO KPI ROW (ESS metrics) */}
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
            <KPI label="PV Generated" value={`${fmt0(t.pvKwh)} kWh`}
              sub={`avg ${fmt(t.avgPvKwh, 1)} / day`} icon={Sun} color="amber" />
            <KPI label="ESS Discharged" value={`${fmt0(t.dischargedKwh)} kWh`}
              sub={`avg ${fmt(t.avgDischargedKwh, 1)} / day`} icon={BatteryCharging} color="emerald" />
            <KPI label="ESS Charged" value={`${fmt0(t.chargedKwh)} kWh`}
              sub={`from PV + grid`} icon={Battery} color="blue" />
            <KPI label="Grid Import" value={`${fmt0(t.gridKwh)} kWh`}
              sub={`avg ${fmt(t.days ? t.gridKwh/t.days : 0, 1)} / day`} icon={Zap} color="brand" />
            <KPI label="Self-Consumption" value={t.pvKwh > 0 ? `${fmt(t.selfConsumption, 1)}%` : "—"}
              sub="PV charged to ESS" icon={Sparkles} color="default" />
            <KPI label="State of Health" value={t.avgSoh > 0 ? `${fmt(t.avgSoh, 1)}%` : "—"}
              sub={`${t.cyclesAccrued} cycles in range`} icon={TrendingDown} color={t.avgSoh >= 95 ? "emerald" : t.avgSoh >= 85 ? "amber" : "default"} />
          </div>

          {/* Secondary */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <SecondaryStat label="Peak SoC" value={`${fmt(t.peakSoc, 1)}%`} icon={Battery} />
            <SecondaryStat label="Min SoC" value={`${fmt(t.minSoc, 1)}%`} icon={Battery} />
            <SecondaryStat label="PV Peak Power" value={`${fmt0(t.pvPeakW)} W`} icon={Sun} />
            <SecondaryStat label="Operating Days" value={fmt0(t.days)}
              sub={t.firstDate ? `${t.firstDate.toISOString().slice(0,10)} → ${t.lastDate.toISOString().slice(0,10)}` : "—"} icon={Clock} />
          </div>

          {/* CHART */}
          <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden">
            <div className="bg-slate-800/50 border-b border-slate-800 px-4 py-2.5 flex items-center gap-2">
              <BarChart3 className="w-3.5 h-3.5 text-brand" />
              <h3 className="text-xs font-bold uppercase tracking-wider text-slate-200">Daily Energy Flow</h3>
              <span className="text-[10px] text-slate-500 font-mono ml-auto">PV · Charge · Discharge · Grid</span>
            </div>
            <div className="p-4 bg-slate-950">
              {data.daily.length === 0 ? (
                <div className="h-64 flex items-center justify-center text-slate-500 text-sm">
                  No data yet. Upload an ESS Control Box xlsx below.
                </div>
              ) : (
                <ResponsiveContainer width="100%" height={360}>
                  <ComposedChart data={data.daily} margin={{ top: 40, right: 10, left: 0, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                    <XAxis dataKey="key" tick={{ fontSize: 10, fill: "#64748b" }} stroke="#334155" />
                    <YAxis tick={{ fontSize: 10, fill: "#64748b" }} stroke="#334155" />
                    <YAxis yAxisId="right" orientation="right" tick={{ fontSize: 10, fill: "#64748b" }} stroke="#334155" domain={[0, 100]} />
                    <Tooltip content={<ChartTooltip sym="" />}
                      position={{ y: 0 }}
                      cursor={{ stroke: "#475569", strokeWidth: 1, strokeDasharray: "3 3" }} />
                    <Legend wrapperStyle={{ fontSize: 12, color: "#cbd5e1" }} />
                    <Bar dataKey="pvKwh" fill="#f59e0b" name="PV Generated" radius={[3, 3, 0, 0]} />
                    <Bar dataKey="chargedKwh" fill="#60a5fa" name="ESS Charged" radius={[3, 3, 0, 0]} />
                    <Line type="monotone" dataKey="dischargedKwh" stroke="#10b981" strokeWidth={1.5} name="ESS Discharged" dot={{ r: 1.5, fill: "#10b981" }} />
                    <Line type="monotone" dataKey="gridKwh" stroke="#be123c" strokeWidth={1.5} strokeDasharray="3 3" name="Grid Import" dot={{ r: 1.5, fill: "#be123c" }} />
                    <Line yAxisId="right" type="monotone" dataKey="peakSoc" stroke="#94a3b8" strokeWidth={1.5} strokeDasharray="2 3" name="Peak SoC %" dot={{ r: 1.5, fill: "#94a3b8" }} />
                  </ComposedChart>
                </ResponsiveContainer>
              )}
            </div>
          </div>

          {/* UPLOAD + UPLOADS MANAGER */}
          <div className="grid grid-cols-12 gap-4">
            <div className="col-span-12 lg:col-span-5 bg-slate-900 border border-slate-800 rounded-xl overflow-hidden">
              <div className="bg-slate-800/50 border-b border-slate-800 px-4 py-2.5 flex items-center gap-2">
                <Upload className="w-3.5 h-3.5 text-brand" />
                <h3 className="text-xs font-bold uppercase tracking-wider text-slate-200">Upload ESS Control Box xlsx</h3>
              </div>
              <div className="p-5">
                <UploadDropzone onParsed={handleParsed} />
                <p className="text-[10px] text-slate-500 mt-3 flex items-start gap-1.5">
                  <AlertCircle className="w-3 h-3 mt-0.5 flex-shrink-0" />
                  Format auto-detected. EV chargers upload elsewhere — these sites only accept ESS xlsx.
                </p>
              </div>
            </div>

            <div className="col-span-12 lg:col-span-7 bg-slate-900 border border-slate-800 rounded-xl overflow-hidden">
              <div className="bg-slate-800/50 border-b border-slate-800 px-4 py-2.5 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <FileSpreadsheet className="w-3.5 h-3.5 text-brand" />
                  <h3 className="text-xs font-bold uppercase tracking-wider text-slate-200">Uploaded Reports</h3>
                  <span className="text-[10px] text-slate-500 font-mono">{data.uploads.length}</span>
                </div>
              </div>
              <div className="max-h-96 overflow-y-auto">
                {data.uploads.length === 0 && (
                  <div className="text-center py-10 text-sm text-slate-500 flex flex-col items-center gap-2">
                    <AlertCircle className="w-5 h-5 text-slate-700" />
                    No reports uploaded yet
                  </div>
                )}
                {data.uploads.map(u => {
                  const s = u.essSummary || {};
                  return (
                    <div key={u.id} className="px-4 py-3 border-b border-slate-800/70 last:border-0 hover:bg-slate-800/30 flex items-center justify-between gap-3 transition-colors">
                      <div className="min-w-0 flex-1">
                        <p className="font-bold text-sm text-white font-mono">{u.reportDate}</p>
                        <div className="flex flex-wrap items-center gap-3 mt-1 text-[11px] font-mono">
                          <span className="text-amber-400">PV <b>{fmt(s.pvKwh || 0, 1)}</b> kWh</span>
                          <span className="text-emerald-400">Out <b>{fmt(s.dischargedKwh || 0, 1)}</b> kWh</span>
                          <span className="text-blue-400">In <b>{fmt(s.chargedKwh || 0, 1)}</b> kWh</span>
                          <span className="text-slate-400">SoC <b>{fmt(s.minSoc || 0, 0)}–{fmt(s.peakSoc || 0, 0)}%</b></span>
                        </div>
                      </div>
                      <button onClick={() => removeUpload(u.id, u.reportDate)}
                        className="text-slate-500 hover:text-red-400 transition-colors p-1.5 hover:bg-slate-800 rounded-md"
                        title="Delete this day's upload">
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

          {/* SHARE LINK */}
          <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden">
            <div className="bg-slate-800/50 border-b border-slate-800 px-4 py-2.5 flex items-center gap-2">
              <FileText className="w-3.5 h-3.5 text-brand" />
              <h3 className="text-xs font-bold uppercase tracking-wider text-slate-200">Client Share Link</h3>
              <span className="text-[10px] text-slate-500 font-mono ml-auto">read-only · no login</span>
            </div>
            <div className="p-4">
              <div className="flex items-stretch gap-2 flex-wrap">
                <div className="flex-1 min-w-[280px] flex items-center bg-slate-950 border border-slate-700 rounded-lg overflow-hidden">
                  <input type="text" readOnly value={shareUrl}
                    onClick={e => e.target.select()}
                    className="flex-1 px-3 py-2 bg-transparent text-xs text-slate-300 font-mono outline-none" />
                </div>
                <button onClick={copyLink} disabled={!shareUrl}
                  className={`px-4 py-2 rounded-lg font-bold text-xs uppercase tracking-wider transition-all ${
                    copied ? "bg-emerald-500 text-white" : "bg-brand hover:bg-brand-dark text-white"
                  }`}>
                  {copied ? "Copied" : "Copy Link"}
                </button>
                <button onClick={regenerateLink} disabled={regenerating}
                  className="px-3 py-2 rounded-lg border border-slate-700 text-slate-400 hover:text-brand hover:border-brand text-xs flex items-center gap-1.5 transition-colors disabled:opacity-50">
                  Regenerate
                </button>
              </div>
            </div>
          </div>

        </div>
      </div>

      {editingSite && (
        <SiteFormModal site={site} onClose={() => setEditingSite(false)} onSaved={() => setEditingSite(false)} />
      )}
    </div>
  );
}

function KPI({ label, value, sub, icon: Icon, color = "default" }) {
  const colorMap = {
    default: { v: "text-white" },
    brand:   { v: "text-brand" },
    emerald: { v: "text-emerald-400" },
    amber:   { v: "text-amber-400" },
    blue:    { v: "text-blue-400" },
  };
  const c = colorMap[color] || colorMap.default;
  return (
    <div className="rounded-xl border p-4 bg-slate-900 border-slate-800">
      <div className="flex items-center justify-between mb-1.5">
        <p className="text-[10px] uppercase tracking-[0.15em] font-bold text-slate-400">{label}</p>
        {Icon && <Icon className={`w-3.5 h-3.5 ${c.v}`} />}
      </div>
      <p className={`text-2xl md:text-3xl font-black tabular-nums ${c.v}`}>{value}</p>
      {sub && <p className="text-[10px] text-slate-500 mt-1 font-mono truncate">{sub}</p>}
    </div>
  );
}

function SecondaryStat({ label, value, sub, icon: Icon }) {
  return (
    <div className="rounded-lg ring-1 ring-slate-700 border border-slate-800 bg-slate-900 p-3 flex items-center gap-3">
      {Icon && <Icon className="w-5 h-5 text-slate-500 flex-shrink-0" />}
      <div className="min-w-0 flex-1">
        <p className="text-[10px] uppercase tracking-[0.12em] text-slate-400 font-bold">{label}</p>
        <p className="text-lg font-black text-white tabular-nums leading-tight">{value}</p>
        {sub && <p className="text-[10px] text-slate-500 font-mono truncate">{sub}</p>}
      </div>
    </div>
  );
}
