import { useEffect, useState, useMemo } from "react";
import { useParams } from "react-router-dom";
import {
  Zap, TrendingUp, Activity, DollarSign, Battery, Clock, MapPin, Car,
  Sparkles, BarChart3, Loader2, AlertCircle, ShieldCheck, Globe, ChevronRight
} from "lucide-react";
import { ComposedChart, Bar, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Legend } from "recharts";
import { dbFetchSiteByShareToken, dbFetchUploadsByShareToken } from "../lib/supabase";
import { currencySymbol, fmt, fmt0 } from "../lib/storage";
import { fmtUSD, fmtCompact, toUSD } from "../lib/fx";
import LiveClock from "../components/LiveClock";

const PERIODS = [
  { id: "daily",   label: "Daily" },
  { id: "weekly",  label: "Weekly" },
  { id: "monthly", label: "Monthly" },
  { id: "yearly",  label: "Yearly" },
];

// Local aggregation for share view (doesn't touch the in-memory cache)
function aggregate(site, uploads) {
  const opexPerDay = (site.opexMonthly || 0) / 30.4375;
  const totals = {
    totalKwh: 0, totalSessions: 0, totalC1: 0, totalC2: 0,
    totalDays: uploads.length,
    grossRevenue: 0, netProfit: 0, totalChargeMinutes: 0,
    firstDate: null, lastDate: null,
    avgKwhPerDay: 0, avgSessionsPerDay: 0,
    grossRevenueUSD: 0, netProfitUSD: 0,
    roi: 0,
  };
  const byDay = {}, byWeek = {}, byMonth = {}, byYear = {};
  const isoWeek = (d) => {
    const x = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
    x.setUTCDate(x.getUTCDate() + 4 - (x.getUTCDay() || 7));
    const ys = new Date(Date.UTC(x.getUTCFullYear(), 0, 1));
    return `${x.getUTCFullYear()}-W${String(Math.ceil(((x - ys) / 86400000 + 1) / 7)).padStart(2, "0")}`;
  };
  const monthKey = (d) => `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
  const yearKey = (d) => `${d.getUTCFullYear()}`;
  const dayKey  = (d) => d.toISOString().slice(0, 10);
  const bucket = (k, s) => s[k] || (s[k] = { key: k, kwh: 0, sessions: 0, minutes: 0, revenue: 0, profit: 0 });

  uploads.forEach(u => {
    const d = new Date(u.reportDate);
    const kwh = u.totalKwh || 0;
    const sess = u.totalSessions || 0;
    const rev = kwh * (site.chargingFee || 0);
    const var_ = kwh * (site.costPerKwh || 0);
    const profit = rev - var_ - opexPerDay;
    const minutes = (u.sessions || []).reduce((s, x) => s + (x.durationMin || 0), 0);
    totals.totalKwh += kwh;
    totals.totalSessions += sess;
    totals.totalC1 += (u.c1Sessions || 0);
    totals.totalC2 += (u.c2Sessions || 0);
    totals.grossRevenue += rev;
    totals.netProfit += profit;
    totals.totalChargeMinutes += minutes;
    if (!totals.firstDate || d < totals.firstDate) totals.firstDate = d;
    if (!totals.lastDate || d > totals.lastDate) totals.lastDate = d;
    [[dayKey(d), byDay], [isoWeek(d), byWeek], [monthKey(d), byMonth], [yearKey(d), byYear]].forEach(([k, s]) => {
      const b = bucket(k, s);
      b.kwh += kwh; b.sessions += sess; b.minutes += minutes; b.revenue += rev; b.profit += profit;
    });
  });
  const finalize = (s) => Object.values(s).sort((a, b) => a.key.localeCompare(b.key));
  totals.avgKwhPerDay = totals.totalDays ? totals.totalKwh / totals.totalDays : 0;
  totals.avgSessionsPerDay = totals.totalDays ? totals.totalSessions / totals.totalDays : 0;
  totals.grossRevenueUSD = toUSD(totals.grossRevenue, site.currency);
  totals.netProfitUSD = toUSD(totals.netProfit, site.currency);
  totals.roi = (site.capex || 0) > 0 ? (totals.netProfit / site.capex) * 100 : 0;
  totals.annualizedProfit = totals.totalDays > 0 ? (totals.netProfit / totals.totalDays) * 365 : 0;
  totals.annualizedRoi    = (site.capex || 0) > 0 ? (totals.annualizedProfit / site.capex) * 100 : 0;
  totals.paybackYears     = totals.annualizedProfit > 0 ? site.capex / totals.annualizedProfit : null;
  totals.paybackMonths    = totals.paybackYears != null ? totals.paybackYears * 12 : null;
  totals.monthlyAvgRevenue = totals.totalDays > 0 ? (totals.grossRevenue / totals.totalDays) * 30.4375 : 0;
  totals.monthlyAvgProfit  = totals.totalDays > 0 ? (totals.netProfit   / totals.totalDays) * 30.4375 : 0;
  const contractYears = site.contractYears || 0;
  totals.contractYears = contractYears;
  totals.paybackFitsContract = totals.paybackYears != null && contractYears > 0
    ? totals.paybackYears <= contractYears : null;

  // Gap-fillers — make missing days/weeks/months/years show as 0 instead of being skipped
  const zero = (k) => ({ key: k, kwh: 0, sessions: 0, minutes: 0, revenue: 0, profit: 0 });
  const fillDays = (arr) => {
    if (!totals.firstDate || !totals.lastDate) return arr;
    const map = new Map(arr.map(b => [b.key, b]));
    const out = [];
    const cur = new Date(Date.UTC(totals.firstDate.getUTCFullYear(), totals.firstDate.getUTCMonth(), totals.firstDate.getUTCDate()));
    const end = new Date(Date.UTC(totals.lastDate.getUTCFullYear(), totals.lastDate.getUTCMonth(), totals.lastDate.getUTCDate()));
    while (cur <= end) { const k = cur.toISOString().slice(0,10); out.push(map.get(k) || zero(k)); cur.setUTCDate(cur.getUTCDate()+1); }
    return out;
  };
  const fillWeeks = (arr) => {
    if (!totals.firstDate || !totals.lastDate) return arr;
    const map = new Map(arr.map(b => [b.key, b]));
    const out = []; const seen = new Set();
    const cur = new Date(Date.UTC(totals.firstDate.getUTCFullYear(), totals.firstDate.getUTCMonth(), totals.firstDate.getUTCDate()));
    cur.setUTCDate(cur.getUTCDate() - ((cur.getUTCDay() + 6) % 7));
    while (cur <= totals.lastDate) {
      const k = isoWeek(cur);
      if (!seen.has(k)) { out.push(map.get(k) || zero(k)); seen.add(k); }
      cur.setUTCDate(cur.getUTCDate() + 7);
    }
    return out;
  };
  const fillMonths = (arr) => {
    if (!totals.firstDate || !totals.lastDate) return arr;
    const map = new Map(arr.map(b => [b.key, b]));
    const out = [];
    const cur = new Date(Date.UTC(totals.firstDate.getUTCFullYear(), totals.firstDate.getUTCMonth(), 1));
    const end = new Date(Date.UTC(totals.lastDate.getUTCFullYear(), totals.lastDate.getUTCMonth(), 1));
    while (cur <= end) { const k = monthKey(cur); out.push(map.get(k) || zero(k)); cur.setUTCMonth(cur.getUTCMonth()+1); }
    return out;
  };
  const fillYears = (arr) => {
    if (!totals.firstDate || !totals.lastDate) return arr;
    const map = new Map(arr.map(b => [b.key, b]));
    const out = [];
    for (let y = totals.firstDate.getUTCFullYear(); y <= totals.lastDate.getUTCFullYear(); y++) {
      const k = String(y); out.push(map.get(k) || zero(k));
    }
    return out;
  };

  return {
    totals,
    daily:   fillDays(finalize(byDay)),
    weekly:  fillWeeks(finalize(byWeek)),
    monthly: fillMonths(finalize(byMonth)),
    yearly:  fillYears(finalize(byYear)),
  };
}

export default function ShareSiteView() {
  const { token } = useParams();
  const [site, setSite] = useState(null);
  const [uploads, setUploads] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [period, setPeriod] = useState("daily");

  useEffect(() => {
    let mounted = true;
    setLoading(true);
    Promise.all([
      dbFetchSiteByShareToken(token),
      dbFetchUploadsByShareToken(token),
    ]).then(([s, u]) => {
      if (!mounted) return;
      if (!s) { setError("Invalid or expired share link."); setLoading(false); return; }
      setSite(s); setUploads(u); setLoading(false);
    }).catch(e => {
      if (!mounted) return;
      setError(e.message || "Could not load this site.");
      setLoading(false);
    });
    return () => { mounted = false; };
  }, [token]);

  const data = useMemo(() => site ? aggregate(site, uploads) : null, [site, uploads]);

  if (loading) return (
    <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center gap-3">
      <Loader2 className="w-8 h-8 text-brand animate-spin" />
      <p className="text-xs text-slate-500 font-mono">Loading site data…</p>
    </div>
  );

  if (error || !site) return (
    <div className="min-h-screen bg-slate-950 flex items-center justify-center p-6">
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-8 max-w-md text-center">
        <AlertCircle className="w-12 h-12 text-red-400 mx-auto mb-3" />
        <h1 className="text-xl font-bold text-white mb-2">Can't open this link</h1>
        <p className="text-sm text-slate-400">{error}</p>
        <p className="text-xs text-slate-600 mt-4 font-mono">Token: {token?.slice(0, 8)}…</p>
      </div>
    </div>
  );

  const sym = currencySymbol(site.currency);
  const t = data.totals;
  const series = data[period];
  const utilization = t.totalDays > 0 ? (t.totalChargeMinutes / (t.totalDays * 1440)) * 100 : 0;

  return (
    <div className="min-h-screen bg-slate-950 text-slate-200">
      {/* HEADER (white, like the staff app — investor presentation polish) */}
      <header className="bg-white border-b border-slate-200 shadow-sm">
        <div className="max-w-[1400px] mx-auto px-4 sm:px-6 lg:px-8 h-[64px] flex items-center justify-between">
          <div className="flex items-center gap-3">
            <img src="/logo.png" alt="" className="w-9 h-9 object-contain drop-shadow-sm" />
            <div className="flex flex-col leading-tight">
              <span className="text-base font-black tracking-tight text-slate-900">BUIMA <span className="text-brand">ENERGY</span></span>
              <span className="text-[10px] font-bold text-brand tracking-[0.2em] uppercase">Tracker · Investor Brief</span>
            </div>
            <span className="hidden md:flex ml-2 px-2.5 py-1 rounded-md bg-brand-light border border-rose-200 items-center gap-1.5">
              <ShieldCheck className="w-3 h-3 text-brand" />
              <span className="text-[10px] font-bold text-brand tracking-wider uppercase">Read-Only · Verified</span>
            </span>
          </div>
          <div className="hidden md:flex items-center gap-2 text-xs text-slate-500">
            <Globe className="w-3.5 h-3.5 text-slate-400" />
            <span>Single-site view</span>
          </div>
        </div>
        <div className="h-[2px] bg-gradient-to-r from-transparent via-brand to-transparent opacity-60" />
      </header>

      {/* Command bar */}
      <div className="bg-gradient-to-r from-slate-950 via-slate-900 to-slate-950 border-b border-slate-800/80">
        <div className="max-w-[1400px] mx-auto px-4 sm:px-6 lg:px-8 py-3 flex items-center justify-between flex-wrap gap-3">
          <div className="flex items-center gap-3">
            <div className="bg-brand/15 border border-brand/30 rounded-md px-2.5 py-1 flex items-center gap-1.5">
              <Sparkles className="w-3.5 h-3.5 text-brand" />
              <span className="text-[10px] font-black uppercase tracking-[0.25em] text-brand">Performance Brief</span>
            </div>
            <span className="text-xs text-slate-400 font-mono">{uploads.length} reports on record</span>
          </div>
          <LiveClock />
        </div>
      </div>

      <div className="bg-slate-950 p-4 sm:p-6 lg:p-8 pb-12">
        <div className="max-w-[1400px] mx-auto space-y-4">

          {/* Site header */}
          <div className="bg-gradient-to-r from-brand to-brand-dark rounded-xl p-6 text-white relative overflow-hidden">
            <img src="/logo.png" alt="" className="absolute -right-6 -bottom-6 w-40 h-40 opacity-10 object-contain" />
            <div className="relative">
              <p className="text-[10px] uppercase tracking-[0.2em] opacity-80 mb-1 font-bold">Charging Station</p>
              <h1 className="text-3xl font-black tracking-tight">{site.name}</h1>
              <p className="text-sm opacity-90 mt-1 flex items-center gap-2 flex-wrap">
                <MapPin className="w-3.5 h-3.5" /> {site.city}, {site.country}
                <span className="opacity-50">·</span>
                <span className="font-mono text-xs">{site.chargerId}</span>
              </p>
              <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mt-5 pt-5 border-t border-white/15">
                <Param label="Charging Fee" value={`${sym}${fmt(site.chargingFee)}`} unit="/kWh" />
                <Param label="Variable Cost" value={`${sym}${fmt(site.costPerKwh)}`} unit="/kWh" />
                <Param label="OPEX" value={`${sym}${fmt0(site.opexMonthly)}`} unit="/month" />
                <Param label="Setup Cost" value={`${sym}${fmtCompact(site.capex)}`} unit="CAPEX" />
                <Param label="Contract" value={site.contractYears > 0 ? site.contractYears : "—"} unit={site.contractYears > 0 ? "years" : "(none)"} />
              </div>
            </div>
          </div>

          {/* Hero KPIs */}
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

          {/* Secondary stats */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <SecondaryStat label="Connect 1 · Left" value={fmt0(t.totalC1)} sub={`${t.totalSessions > 0 ? ((t.totalC1/t.totalSessions)*100).toFixed(0) : 0}% of sessions`} color="blue" icon={Battery} />
            <SecondaryStat label="Connect 2 · Right" value={fmt0(t.totalC2)} sub={`${t.totalSessions > 0 ? ((t.totalC2/t.totalSessions)*100).toFixed(0) : 0}% of sessions`} color="rose" icon={Battery} />
            <SecondaryStat label="Days on Record" value={fmt0(t.totalDays)} sub={t.firstDate ? `${t.firstDate.toISOString().slice(0,10)} → ${t.lastDate.toISOString().slice(0,10)}` : "—"} icon={Activity} />
            <SecondaryStat label="Avg Revenue / Day" value={`${sym}${fmt0(t.totalDays > 0 ? t.grossRevenue / t.totalDays : 0)}`} sub={`${fmtUSD(t.totalDays > 0 ? t.grossRevenueUSD / t.totalDays : 0)} USD`} icon={DollarSign} />
          </div>

          {/* Chart */}
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
                <div className="h-64 flex items-center justify-center text-slate-500 text-sm">No data yet.</div>
              ) : (
                <ResponsiveContainer width="100%" height={320}>
                  <ComposedChart data={series}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                    <XAxis dataKey="key" tick={{ fontSize: 10, fill: "#64748b" }} stroke="#334155" />
                    <YAxis yAxisId="left" tick={{ fontSize: 10, fill: "#64748b" }} stroke="#334155" />
                    <YAxis yAxisId="right" orientation="right" tick={{ fontSize: 10, fill: "#64748b" }} stroke="#334155" />
                    <YAxis yAxisId="cars" orientation="right" hide />
                    <YAxis yAxisId="time" orientation="right" hide />
                    <Tooltip contentStyle={{ borderRadius: 8, border: "1px solid #1e293b", background: "#0f172a", fontSize: 12 }}
                      labelStyle={{ color: "#cbd5e1", fontWeight: "bold" }}
                      formatter={(v, n) => {
                        if (n === "kWh") return [fmt(v, 1), n];
                        if (n === "Cars Served") return [fmt0(v), n];
                        if (n === "Hours Charged") return [`${fmt(v, 1)} h`, n];
                        return [`${sym}${fmt0(v)}`, n];
                      }} />
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

          {/* Recent sessions */}
          <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden">
            <div className="bg-slate-800/50 border-b border-slate-800 px-4 py-2.5 flex items-center gap-2">
              <Activity className="w-3.5 h-3.5 text-brand" />
              <h3 className="text-xs font-bold uppercase tracking-wider text-slate-200">Recent Session Log</h3>
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
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/70 font-mono">
                  {uploads.slice(0, 5).flatMap(u =>
                    (u.sessions || []).map((s, i) => (
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
                      </tr>
                    ))
                  )}
                  {uploads.length === 0 && (
                    <tr><td colSpan={8} className="text-center text-slate-500 py-12 text-xs">No data yet</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

        </div>
      </div>

      {/* ── FOOTER (white, matches Layout) ─────────────────────── */}
      <footer className="bg-white border-t border-slate-200">
        <div className="h-[2px] bg-gradient-to-r from-transparent via-brand to-transparent opacity-60" />
        <div className="max-w-[1400px] mx-auto px-4 sm:px-6 lg:px-8 py-8 grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="flex items-start gap-3">
            <img src="/logo.png" alt="" className="w-8 h-8 object-contain" />
            <div>
              <p className="text-sm font-black text-slate-900">BUIMA <span className="text-brand">ENERGY</span></p>
              <p className="text-[11px] text-slate-500 mt-0.5 max-w-xs leading-relaxed">
                Operating proprietary B.E.S.T (Battery Energy Storage Tile) systems with integrated DC fast charging across global installation sites.
              </p>
            </div>
          </div>
          <div>
            <p className="text-[10px] uppercase tracking-[0.2em] font-bold text-slate-700 mb-2">This View</p>
            <ul className="space-y-1 text-xs">
              <li className="flex items-center gap-2 text-slate-500">
                <ChevronRight className="w-3 h-3 text-brand" />
                <span>Read-only access via unique share link</span>
              </li>
              <li className="flex items-center gap-2 text-slate-500">
                <ChevronRight className="w-3 h-3 text-brand" />
                <span>Refreshes as new reports are uploaded</span>
              </li>
              <li className="flex items-center gap-2 text-slate-500">
                <ChevronRight className="w-3 h-3 text-brand" />
                <span>TLS-encrypted &middot; revocable on demand</span>
              </li>
            </ul>
          </div>
          <div className="md:text-right">
            <p className="text-[10px] uppercase tracking-[0.2em] font-bold text-slate-700 mb-2">System</p>
            <p className="text-xs text-slate-500 font-mono">Tracker v0.2 &middot; Investor Brief</p>
            <p className="text-xs text-slate-500 font-mono">Updated {new Date().toISOString().slice(0,10)}</p>
            <p className="text-[10px] text-slate-400 mt-3">&copy; 2026 Buima Energy &middot; All rights reserved</p>
          </div>
        </div>
      </footer>
    </div>
  );
}

function Param({ label, value, unit }) {
  return (
    <div>
      <p className="text-[10px] uppercase tracking-[0.15em] opacity-70 font-bold mb-0.5">{label}</p>
      <p className="font-mono text-lg font-black tabular-nums">
        {value}<span className="text-xs font-normal opacity-60 ml-1">{unit}</span>
      </p>
    </div>
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
  const map = {
    blue:  { ring: "ring-blue-500/40 bg-blue-500/5", iconC: "text-blue-400" },
    rose:  { ring: "ring-brand/40 bg-brand/5",       iconC: "text-brand" },
    default: { ring: "ring-slate-700 bg-slate-900",  iconC: "text-slate-500" },
  };
  const c = map[color] || map.default;
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
