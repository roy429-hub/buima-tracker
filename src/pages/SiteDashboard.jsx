import { useState, useMemo } from "react";
import { useParams, Link } from "react-router-dom";
import {
  ArrowLeft, Zap, TrendingUp, Activity, DollarSign, Battery, Clock, Upload, Trash2,
  FileSpreadsheet, AlertCircle, MapPin, Car, Radio, Sparkles, Settings, BarChart3,
  Link2, RefreshCw, Copy, CheckCheck, Loader2
} from "lucide-react";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Legend, Line, ComposedChart } from "recharts";
import { getSite, currencySymbol, fmt, fmt0, addUpload, deleteUpload, refreshFromDB } from "../lib/storage";
import { aggregateSite } from "../lib/aggregate";
import { fmtUSD, fmtCompact } from "../lib/fx";
import { useStorageVersion } from "../lib/useStorage";
import { dbRegenerateShareToken } from "../lib/supabase";
import UploadDropzone from "../components/UploadDropzone";
import LiveClock from "../components/LiveClock";
import { SiteFormModal } from "../components/SiteForm";
import ReportModal from "../components/ReportModal";
import ChartTooltip from "../components/ChartTooltip";
import TimeframeSelector, { getDateRange } from "../components/TimeframeSelector";
import { generatePartnerStatement } from "../lib/pdfReport";
import { getUploadsForSite } from "../lib/storage";
import { FileText } from "lucide-react";

const PERIODS = [
  { id: "daily",   label: "Daily" },
  { id: "weekly",  label: "Weekly" },
  { id: "monthly", label: "Monthly" },
  { id: "yearly",  label: "Yearly" },
];

export default function SiteDashboard() {
  const { id } = useParams();
  const version = useStorageVersion();
  const site = getSite(id);
  const [period, setPeriod] = useState("daily");
  const [editingSite, setEditingSite] = useState(false);
  const [showReport, setShowReport] = useState(false);
  const [timeframe, setTimeframe] = useState("all");
  const dateRange = useMemo(() => getDateRange(timeframe), [timeframe]);

  const data = useMemo(() => aggregateSite(id, site, dateRange), [id, site, version, dateRange]);

  if (!site) return (
    <div className="text-center py-20">
      <p className="text-slate-500">Site not found</p>
      <Link to="/sites" className="text-brand font-bold">← Back to installations</Link>
    </div>
  );

  const sym = currencySymbol(site.currency);
  const t = data.totals;
  const series = data[period];

  const handleParsed = async (parsed) => {
    try {
      await addUpload({
        siteId: id, reportDate: parsed.reportDate, chargerId: parsed.chargerId,
        totalKwh: parsed.totalKwh, totalSessions: parsed.totalSessions,
        c1Sessions: parsed.c1Sessions, c2Sessions: parsed.c2Sessions,
        sessions: parsed.sessions,
      });
    } catch (e) {
      alert("Failed to save upload: " + e.message);
    }
  };

  const removeUpload = async (uid, date) => {
    if (!confirm(`Delete the upload for ${date}? You can re-upload it later.`)) return;
    try { await deleteUpload(uid); }
    catch (e) { alert("Delete failed: " + e.message); }
  };

  // Share link state
  const shareUrl = site?.shareToken ? `${window.location.origin}/share/${site.shareToken}` : "";
  const [copied, setCopied] = useState(false);
  const [regenerating, setRegenerating] = useState(false);
  const copyLink = async () => {
    if (!shareUrl) return;
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (e) { alert("Could not copy: " + e.message); }
  };
  const regenerateLink = async () => {
    if (!confirm("Regenerate the share link?\n\nThe OLD link will stop working immediately. Use this if a link leaked or you changed clients.")) return;
    setRegenerating(true);
    try {
      await dbRegenerateShareToken(site.id);
      await refreshFromDB();   // pull the new share_token into the cache
      setCopied(false);
    } catch (e) { alert("Regenerate failed: " + e.message); }
    finally { setRegenerating(false); }
  };

  const annualizedKwh = t.totalDays > 0 ? (t.totalKwh / t.totalDays) * 365 : 0;
  const annualizedProfit = t.totalDays > 0 ? (t.netProfit / t.totalDays) * 365 : 0;
  const utilization = t.totalDays > 0 ? (t.totalChargeMinutes / (t.totalDays * 1440)) * 100 : 0;

  // Site status
  let status = { tag: "no-data", color: "text-slate-500", dot: "bg-slate-600", label: "No Data" };
  if (t.lastDate) {
    const daysAgo = (new Date() - t.lastDate) / 86400000;
    if (daysAgo <= 7)  status = { tag: "live",   color: "text-emerald-400", dot: "bg-emerald-500", label: "Live" };
    else if (daysAgo <= 30) status = { tag: "stale",  color: "text-amber-400",   dot: "bg-amber-500",   label: "Stale" };
    else status = { tag: "offline", color: "text-red-400",   dot: "bg-red-500",   label: "Offline" };
  }

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
                {status.tag === "live" && <span className={`animate-ping absolute inline-flex h-full w-full rounded-full ${status.dot} opacity-75`}></span>}
                <span className={`relative inline-flex rounded-full h-1.5 w-1.5 ${status.dot}`}></span>
              </span>
              <span className={`text-[10px] font-bold uppercase tracking-[0.15em] ${status.color}`}>{status.label}</span>
            </div>
            <span className="text-xs text-slate-400 font-mono hidden sm:inline">
              {t.totalDays} report files {dateRange ? `in range` : "on record"}
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
          <div className="bg-gradient-to-r from-brand to-brand-dark rounded-xl p-6 text-white relative overflow-hidden">
            <img src="/logo.png" alt="" className="absolute -right-6 -bottom-6 w-40 h-40 opacity-10 object-contain" />
            <div className="flex items-start justify-between flex-wrap gap-4 relative">
              <div className="min-w-0">
                <p className="text-[10px] uppercase tracking-[0.2em] opacity-80 mb-1 font-bold">Charging Station</p>
                <h1 className="text-3xl font-black tracking-tight">{site.name}</h1>
                <p className="text-sm opacity-90 mt-1 flex items-center gap-2 flex-wrap">
                  <MapPin className="w-3.5 h-3.5" /> {site.city}, {site.country}
                  <span className="opacity-50">·</span>
                  <span className="font-mono text-xs">{site.chargerId}</span>
                </p>
              </div>
              <div className="flex items-center gap-2">
                <button onClick={() => setShowReport(true)}
                  className="bg-white text-brand hover:bg-brand-light rounded-md px-3 py-1.5 flex items-center gap-1.5 text-xs font-bold transition-colors shadow-sm">
                  <FileText className="w-3.5 h-3.5" /> Partner Statement
                </button>
                <button onClick={() => setEditingSite(true)}
                  className="bg-white/15 hover:bg-white/25 backdrop-blur rounded-md px-3 py-1.5 flex items-center gap-1.5 text-xs font-bold transition-colors">
                  <Settings className="w-3.5 h-3.5" /> Edit Site
                </button>
              </div>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mt-5 pt-5 border-t border-white/15 relative">
              <SiteParam label="Charging Fee" value={`${sym}${fmt(site.chargingFee)}`} unit="/kWh"   onClick={() => setEditingSite(true)} />
              <SiteParam label="Variable Cost" value={`${sym}${fmt(site.costPerKwh)}`} unit="/kWh"   onClick={() => setEditingSite(true)} />
              <SiteParam label="OPEX" value={`${sym}${fmt0(site.opexMonthly)}`} unit="/month"        onClick={() => setEditingSite(true)} />
              <SiteParam label="Setup Cost" value={`${sym}${fmtCompact(site.capex)}`} unit="CAPEX"  onClick={() => setEditingSite(true)} />
              <SiteParam label="Contract" value={site.contractYears > 0 ? site.contractYears : "—"} unit={site.contractYears > 0 ? "years" : "(none)"} onClick={() => setEditingSite(true)} />
            </div>
            <p className="text-[10px] text-white/60 mt-3 relative">↑ Click any value to edit · or use the Edit Site button</p>
          </div>

          {/* HERO KPI ROW */}
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
            <HeroKPI label="Cars Served" value={fmtCompact(t.totalSessions)} sub={`avg ${fmt(t.avgSessionsPerDay, 1)} / day`} icon={Car} />
            <HeroKPI label="kWh Delivered" value={fmtCompact(t.totalKwh)} sub={`avg ${fmt0(t.avgKwhPerDay)} kWh / day`} icon={Zap} />
            <HeroKPI label="Revenue" value={`${sym}${fmtCompact(t.grossRevenue)}`}
              sub={`avg ${sym}${fmt0(t.monthlyAvgRevenue)} / month`} icon={DollarSign} />
            <HeroKPI label="Net Profit" value={`${sym}${fmtCompact(t.netProfit)}`}
              sub={`avg ${sym}${fmt0(t.monthlyAvgProfit)} / month`} icon={TrendingUp} />
            <HeroKPI
              label="Current ROI"
              value={site.capex > 0 ? `${fmt(t.roi, 1)}%` : "—"}
              subLines={site.capex > 0
                ? [
                    `${fmt(t.annualizedRoi, 1)}% annualized`,
                    t.paybackYears != null && t.paybackYears < 100
                      ? `Payback ${fmt(t.paybackYears, 1)} yrs (${fmt0(t.paybackMonths)} mo)`
                      : "Payback >100 yrs",
                    site.contractYears > 0
                      ? (t.paybackFitsContract
                          ? `✓ within ${site.contractYears}-yr contract`
                          : `⚠ exceeds ${site.contractYears}-yr contract`)
                      : null
                  ].filter(Boolean)
                : ["Set CAPEX to compute"]}
              icon={Sparkles} />
            <HeroKPI label="Utilization" value={`${fmt(utilization, 1)}%`} sub={`${fmt0(t.totalChargeMinutes / 60)}h charging`} icon={Clock} />
          </div>

          {/* SECONDARY ROW: gun split + days */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <SecondaryStat label="Connect 1 · Left" value={fmt0(t.totalC1)} sub={`${t.totalSessions > 0 ? ((t.totalC1/t.totalSessions)*100).toFixed(0) : 0}% of sessions`} color="blue" icon={Battery} />
            <SecondaryStat label="Connect 2 · Right" value={fmt0(t.totalC2)} sub={`${t.totalSessions > 0 ? ((t.totalC2/t.totalSessions)*100).toFixed(0) : 0}% of sessions`} color="rose" icon={Battery} />
            <SecondaryStat label="Annualized kWh" value={fmtCompact(annualizedKwh)} sub="projected if rate holds" icon={Activity} />
            <SecondaryStat label="Annualized Profit" value={`${sym}${fmtCompact(annualizedProfit)}`} sub={fmtUSD(annualizedProfit * (t.grossRevenueUSD > 0 ? t.grossRevenueUSD / t.grossRevenue : 1))} icon={TrendingUp} />
          </div>

          {/* CHART */}
          <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden">
            <div className="bg-slate-800/50 border-b border-slate-800 px-4 py-2.5 flex items-center justify-between flex-wrap gap-3">
              <div className="flex items-center gap-2">
                <BarChart3 className="w-3.5 h-3.5 text-brand" />
                <h3 className="text-xs font-bold uppercase tracking-wider text-slate-200">Energy & Profit Trend</h3>
              </div>
              <div className="flex bg-slate-950 p-0.5 rounded-md border border-slate-700">
                {PERIODS.map(p => (
                  <button key={p.id} onClick={() => setPeriod(p.id)}
                    className={`px-3 py-1 rounded text-[10px] font-bold uppercase tracking-wider transition-all ${period === p.id ? "bg-brand text-white" : "text-slate-400 hover:text-white"}`}>
                    {p.label}
                  </button>
                ))}
              </div>
            </div>
            <div className="p-4 bg-slate-950">
              {series.length === 0 ? (
                <div className="h-64 flex items-center justify-center text-slate-500 text-sm">
                  No data yet. Upload an xlsx report below to populate the trend.
                </div>
              ) : (
                <ResponsiveContainer width="100%" height={360}>
                  <ComposedChart data={series} margin={{ top: 40, right: 10, left: 0, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                    <XAxis dataKey="key" tick={{ fontSize: 10, fill: "#64748b" }} stroke="#334155" />
                    <YAxis yAxisId="left" tick={{ fontSize: 10, fill: "#64748b" }} stroke="#334155" />
                    <YAxis yAxisId="right" orientation="right" tick={{ fontSize: 10, fill: "#64748b" }} stroke="#334155" />
                    <YAxis yAxisId="cars" orientation="right" hide />
                    <YAxis yAxisId="time" orientation="right" hide />
                    <Tooltip
                      content={<ChartTooltip sym={sym} />}
                      position={{ y: 0 }}
                      cursor={{ stroke: "#475569", strokeWidth: 1, strokeDasharray: "3 3" }}
                    />
                    <Legend wrapperStyle={{ fontSize: 12, color: "#cbd5e1" }} />
                    <Bar yAxisId="left" dataKey="kwh" fill="#be123c" name="kWh" radius={[3, 3, 0, 0]} />
                    <Line yAxisId="right" type="monotone" dataKey="profit"  stroke="#10b981" strokeWidth={1.5} name="Net Profit"     dot={{ r: 1.5, fill: "#10b981" }} />
                    <Line yAxisId="right" type="monotone" dataKey="revenue" stroke="#94a3b8" strokeWidth={1.5} strokeDasharray="3 3" name="Revenue" dot={{ r: 1.5, fill: "#94a3b8" }} />
                    <Line yAxisId="cars"  type="monotone" dataKey="sessions" stroke="#60a5fa" strokeWidth={1.5} name="Cars Served"   dot={{ r: 1.5, fill: "#60a5fa" }} />
                    <Line yAxisId="time"  type="monotone" dataKey={(b) => (b.minutes || 0) / 60} stroke="#f59e0b" strokeWidth={1.5} strokeDasharray="2 3" name="Hours Charged" dot={{ r: 1.5, fill: "#f59e0b" }} />
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
                <h3 className="text-xs font-bold uppercase tracking-wider text-slate-200">Upload Daily Reports</h3>
              </div>
              <div className="p-5">
                <UploadDropzone onParsed={handleParsed} />
                <p className="text-[10px] text-slate-500 mt-3 flex items-start gap-1.5">
                  <AlertCircle className="w-3 h-3 mt-0.5 flex-shrink-0" />
                  Drop multiple files at once · Each file is one day · Re-uploading the same date overwrites
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
                <span className="text-[10px] text-slate-500">Click 🗑 to delete a wrong upload</span>
              </div>
              <div className="max-h-96 overflow-y-auto">
                {data.uploads.length === 0 && (
                  <div className="text-center py-10 text-sm text-slate-500 flex flex-col items-center gap-2">
                    <AlertCircle className="w-5 h-5 text-slate-700" />
                    No reports uploaded yet
                  </div>
                )}
                {data.uploads.map(u => (
                  <div key={u.id} className="px-4 py-3 border-b border-slate-800/70 last:border-0 hover:bg-slate-800/30 flex items-center justify-between gap-3 transition-colors">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <p className="font-bold text-sm text-white font-mono">{u.reportDate}</p>
                        <span className="text-[10px] text-slate-500">uploaded {new Date(u.uploadedAt).toLocaleDateString()}</span>
                      </div>
                      <div className="flex items-center gap-3 mt-1 text-[11px] font-mono">
                        <span className="text-brand font-bold">{fmt(u.totalKwh, 1)} kWh</span>
                        <span className="text-slate-400">{u.totalSessions} sess</span>
                        <span className="text-slate-500">C1:{u.c1Sessions}</span>
                        <span className="text-slate-500">C2:{u.c2Sessions}</span>
                        <span className="ml-auto text-emerald-400 font-bold">+{sym}{fmt0(u.totalKwh * (site.chargingFee - site.costPerKwh) - (site.opexMonthly / 30.4375))}</span>
                      </div>
                    </div>
                    <button onClick={() => removeUpload(u.id, u.reportDate)}
                      className="text-slate-500 hover:text-red-400 transition-colors p-1.5 hover:bg-slate-800 rounded-md"
                      title="Delete this day's upload">
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* SHARE LINK */}
          <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden">
            <div className="bg-slate-800/50 border-b border-slate-800 px-4 py-2.5 flex items-center gap-2">
              <Link2 className="w-3.5 h-3.5 text-brand" />
              <h3 className="text-xs font-bold uppercase tracking-wider text-slate-200">Client Share Link</h3>
              <span className="text-[10px] text-slate-500 font-mono ml-auto">read-only · no login required</span>
            </div>
            <div className="p-4 space-y-3">
              <p className="text-xs text-slate-400">
                Share this URL with your client or investor. They'll see this site's performance in read-only mode — no login required.
                Regenerate the link if it leaks or you change clients.
              </p>
              <div className="flex items-stretch gap-2 flex-wrap">
                <div className="flex-1 min-w-[280px] flex items-center bg-slate-950 border border-slate-700 rounded-lg overflow-hidden">
                  <input type="text" readOnly value={shareUrl}
                    onClick={e => e.target.select()}
                    className="flex-1 px-3 py-2 bg-transparent text-xs text-slate-300 font-mono outline-none" />
                </div>
                <button onClick={copyLink} disabled={!shareUrl}
                  className={`px-4 py-2 rounded-lg font-bold text-xs uppercase tracking-wider flex items-center gap-1.5 transition-all ${
                    copied
                      ? "bg-emerald-500 text-white"
                      : "bg-brand hover:bg-brand-dark text-white shadow-[0_0_12px_rgba(190,18,60,0.25)]"
                  }`}>
                  {copied ? <CheckCheck className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                  {copied ? "Copied" : "Copy Link"}
                </button>
                <button onClick={regenerateLink} disabled={regenerating}
                  title="Generate a new link (old link stops working)"
                  className="px-3 py-2 rounded-lg border border-slate-700 text-slate-400 hover:text-brand hover:border-brand text-xs flex items-center gap-1.5 transition-colors disabled:opacity-50">
                  {regenerating ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
                  Regenerate
                </button>
                <a href={shareUrl} target="_blank" rel="noopener noreferrer"
                  className="px-3 py-2 rounded-lg border border-slate-700 text-slate-400 hover:text-brand hover:border-brand text-xs flex items-center gap-1.5 transition-colors">
                  <Link2 className="w-3.5 h-3.5" /> Preview
                </a>
              </div>
            </div>
          </div>

          {/* SESSIONS TABLE */}
          <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden">
            <div className="bg-slate-800/50 border-b border-slate-800 px-4 py-2.5 flex items-center gap-2">
              <Activity className="w-3.5 h-3.5 text-brand" />
              <h3 className="text-xs font-bold uppercase tracking-wider text-slate-200">Session Log</h3>
              <span className="text-[10px] text-slate-500 font-mono">latest 5 days</span>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="text-[10px] uppercase tracking-wider text-slate-500 bg-slate-900">
                  <tr className="border-b border-slate-800">
                    <th className="px-4 py-3 text-left font-bold">Date</th>
                    <th className="px-4 py-3 text-left font-bold">Gun</th>
                    <th className="px-4 py-3 text-left font-bold">Start</th>
                    <th className="px-4 py-3 text-left font-bold">End</th>
                    <th className="px-4 py-3 text-right font-bold">kWh</th>
                    <th className="px-4 py-3 text-right font-bold">Min</th>
                    <th className="px-4 py-3 text-right font-bold">Peak kW</th>
                    <th className="px-4 py-3 text-right font-bold">End SoC</th>
                    <th className="px-4 py-3 text-right font-bold">Net Profit</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/70 font-mono">
                  {data.uploads.slice(0, 5).flatMap(u =>
                    (u.sessions || []).map((s, i) => {
                      const sessProfit = s.kwh * (site.chargingFee - site.costPerKwh);
                      return (
                        <tr key={`${u.id}-${i}`} className="hover:bg-slate-800/30 transition-colors">
                          <td className="px-4 py-2.5 text-xs text-slate-400">{u.reportDate}</td>
                          <td className="px-4 py-2.5">
                            <span className={`text-[10px] font-black px-1.5 py-0.5 rounded ${s.gun === "C1" ? "bg-blue-500/20 text-blue-400" : "bg-rose-500/20 text-brand"}`}>{s.gun}</span>
                          </td>
                          <td className="px-4 py-2.5 text-xs text-slate-400">{new Date(s.start).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })}</td>
                          <td className="px-4 py-2.5 text-xs text-slate-400">{new Date(s.end).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })}</td>
                          <td className="px-4 py-2.5 text-right text-brand font-bold tabular-nums">{fmt(s.kwh)}</td>
                          <td className="px-4 py-2.5 text-right text-slate-300 tabular-nums">{fmt(s.durationMin, 1)}</td>
                          <td className="px-4 py-2.5 text-right text-slate-300 tabular-nums">{fmt(s.peakKw)}</td>
                          <td className="px-4 py-2.5 text-right text-slate-300 tabular-nums">{s.endSoc}%</td>
                          <td className="px-4 py-2.5 text-right text-emerald-400 font-bold tabular-nums">+{sym}{fmt0(sessProfit)}</td>
                        </tr>
                      );
                    })
                  )}
                  {data.uploads.length === 0 && (
                    <tr><td colSpan={9} className="text-center text-slate-500 py-12 text-xs">No session data yet</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

        </div>
      </div>

      {editingSite && (
        <SiteFormModal
          site={site}
          onClose={() => setEditingSite(false)}
          onSaved={() => setEditingSite(false)}
        />
      )}

      {showReport && (
        <ReportModal
          title="Partner Statement"
          subtitle={`${site.name} · ${site.partnerName || "no partner set"}`}
          icon={FileText}
          onClose={() => setShowReport(false)}
          onGenerate={(start, end) => {
            const uploads = getUploadsForSite(site.id);
            generatePartnerStatement(site, uploads, start, end);
          }}
        />
      )}
    </div>
  );
}

// ── Reusable styled components ──
function SiteParam({ label, value, unit, onClick }) {
  return (
    <button onClick={onClick} type="button"
      className="text-left group cursor-pointer">
      <p className="text-[10px] uppercase tracking-[0.15em] opacity-70 font-bold mb-0.5 group-hover:opacity-100 transition-opacity">{label}</p>
      <p className="font-mono text-lg font-black tabular-nums group-hover:text-white/95 transition-colors">
        {value}<span className="text-xs font-normal opacity-60 ml-1">{unit}</span>
      </p>
      <div className="h-0.5 w-0 group-hover:w-12 bg-white/70 transition-all mt-1"></div>
    </button>
  );
}

function HeroKPI({ label, value, sub, subLines, icon: Icon }) {
  const lines = subLines || (sub ? [sub] : []);
  return (
    <div className="rounded-xl border p-4 bg-slate-900 border-slate-800">
      <div className="flex items-center justify-between mb-1.5">
        <p className="text-[10px] uppercase tracking-[0.15em] font-bold text-slate-400">{label}</p>
        {Icon && <Icon className="w-3.5 h-3.5 text-slate-500" />}
      </div>
      <p className="text-2xl md:text-3xl font-black tabular-nums text-white">{value}</p>
      {lines.map((line, i) => (
        <p key={i} className="text-[10px] text-slate-500 mt-1 font-mono leading-tight">{line}</p>
      ))}
    </div>
  );
}

function SecondaryStat({ label, value, sub, icon: Icon, color }) {
  const colorMap = {
    blue:  { ring: "ring-blue-500/40 bg-blue-500/5", iconC: "text-blue-400" },
    rose:  { ring: "ring-brand/40 bg-brand/5",       iconC: "text-brand" },
    default: { ring: "ring-slate-700 bg-slate-900",  iconC: "text-slate-500" },
  };
  const c = colorMap[color] || colorMap.default;
  return (
    <div className={`rounded-lg ring-1 ${c.ring} border border-slate-800 p-3 flex items-center gap-3`}>
      {Icon && <Icon className={`w-5 h-5 ${c.iconC} flex-shrink-0`} />}
      <div className="min-w-0 flex-1">
        <p className="text-[10px] uppercase tracking-[0.12em] text-slate-400 font-bold">{label}</p>
        <p className="text-lg font-black text-white tabular-nums leading-tight">{value}</p>
        {sub && <p className="text-[10px] text-slate-500 font-mono truncate">{sub}</p>}
      </div>
    </div>
  );
}
