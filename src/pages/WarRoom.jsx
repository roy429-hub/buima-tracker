import { useMemo, useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { MapContainer, TileLayer, CircleMarker, Tooltip as LeafletTooltip, ZoomControl, useMap } from "react-leaflet";
import L from "leaflet";
import {
  Zap, Activity, TrendingUp, MapPinned, Upload, Search, Radio,
  AlertCircle, ChevronRight, Sparkles, BarChart3, Clock, DollarSign, Globe, Car,
  Briefcase, Calendar, FileText, Power
} from "lucide-react";
import ReportModal from "../components/ReportModal";
import { generateInvestorMonthlyReport } from "../lib/pdfReport";
import { getSites, currencySymbol, fmt0, fmt, getUploads, toggleSiteActive } from "../lib/storage";
import { aggregateAllSites, aggregateSite, aggregatePortfolio } from "../lib/aggregate";
import { ComposedChart, Bar, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Legend } from "recharts";
import { fmtUSD, fmtCompact, FX_LAST_UPDATED, toUSD } from "../lib/fx";
import { useStorageVersion } from "../lib/useStorage";
import LiveClock from "../components/LiveClock";
import SiteQuickUpload from "../components/SiteQuickUpload";
import ChartTooltip from "../components/ChartTooltip";
import TimeframeSelector, { getDateRange, TIMEFRAME_LABEL } from "../components/TimeframeSelector";

// Leaflet's default marker images, bundled as assets rather than pulled from a
// CDN at runtime. Vite fingerprints these and serves them from our own origin,
// so the map keeps working on networks that block unpkg.
import markerIcon2x from "leaflet/dist/images/marker-icon-2x.png";
import markerIcon from "leaflet/dist/images/marker-icon.png";
import markerShadow from "leaflet/dist/images/marker-shadow.png";

delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: markerIcon2x,
  iconUrl: markerIcon,
  shadowUrl: markerShadow,
});

// Auto-fit map to all site markers + recompute size when container resizes.
// Eliminates blank space when the column grows taller than the initial map.
function FitBoundsToMarkers({ sites }) {
  const map = useMap();
  const valid = sites.filter(s => s.lat && s.lng);
  const key = valid.map(s => `${s.lat},${s.lng}`).join("|");

  const refit = () => {
    if (valid.length === 0) return;
    if (valid.length === 1) {
      map.setView([valid[0].lat, valid[0].lng], 4, { animate: false });
    } else {
      const bounds = L.latLngBounds(valid.map(s => [s.lat, s.lng]));
      map.fitBounds(bounds, { padding: [40, 40], maxZoom: 5, animate: false });
    }
  };

  useEffect(() => {
    // Initial fit + a delayed retry after the flex container settles
    map.invalidateSize();
    refit();
    const t = setTimeout(() => { map.invalidateSize(); refit(); }, 60);

    // Re-fit whenever the map container resizes (column heights change)
    const container = map.getContainer();
    const ro = new ResizeObserver(() => {
      map.invalidateSize();
      refit();
    });
    ro.observe(container);

    return () => { clearTimeout(t); ro.disconnect(); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, map]);

  return null;
}

const PERIODS = [
  { id: "daily",   label: "Daily" },
  { id: "weekly",  label: "Weekly" },
  { id: "monthly", label: "Monthly" },
  { id: "yearly",  label: "Yearly" },
];

export default function WarRoom() {
  const [search, setSearch] = useState("");
  const [uploadTarget, setUploadTarget] = useState(null);
  const [period, setPeriod] = useState("daily");
  const [showReport, setShowReport] = useState(false);
  const [timeframe, setTimeframe] = useState("all");
  const dateRange = useMemo(() => getDateRange(timeframe), [timeframe]);
  const version = useStorageVersion();
  const sites = useMemo(() => getSites(), [version]);
  const data  = useMemo(() => aggregateAllSites(sites, dateRange), [sites, version, dateRange]);
  const portfolioSeries = useMemo(() => aggregatePortfolio(sites, dateRange), [sites, version, dateRange]);

  const filteredSites = sites.filter(s =>
    !search || s.name.toLowerCase().includes(search.toLowerCase()) ||
    (s.country || "").toLowerCase().includes(search.toLowerCase()) ||
    (s.city || "").toLowerCase().includes(search.toLowerCase())
  );

  const maxKwh = Math.max(1, ...data.perSite.map(p => p.agg.totals.totalKwh));

  // Lookup: is this site active?
  const isActiveById = id => {
    const s = sites.find(s => s.id === id);
    return s && s.active !== false;
  };

  // ── Today's stats (USD) — ACTIVE sites only ──
  const todayISO = new Date().toISOString().slice(0, 10);
  const todayUploads = getUploads().filter(u => u.reportDate === todayISO && isActiveById(u.siteId));
  const todayKwh = todayUploads.reduce((s, u) => s + (u.totalKwh || 0), 0);
  const todaySess = todayUploads.reduce((s, u) => s + (u.totalSessions || 0), 0);
  const todayRevenueUSD = todayUploads.reduce((acc, u) => {
    const site = sites.find(s => s.id === u.siteId);
    if (!site) return acc;
    return acc + toUSD((u.totalKwh || 0) * site.chargingFee, site.currency);
  }, 0);

  // ── Recent activity feed (last 8 sessions, ACTIVE sites + within timeframe) ──
  const recentSessions = sites
    .filter(s => s.active !== false)
    .flatMap(s => {
      const agg = aggregateSite(s.id, s, dateRange);  // already filtered to timeframe
      return agg.uploads.flatMap(u => (u.sessions || []).map(sess => ({
        ...sess, site: s, reportDate: u.reportDate, currency: s.currency,
      })));
    })
    .sort((a, b) => b.start.localeCompare(a.start))
    .slice(0, 8);

  // ── Site status ──
  const siteStatus = (site) => {
    if (site.active === false) return { tag: "off", color: "text-slate-500", dot: "bg-slate-600", label: "Off" };
    const agg = aggregateSite(site.id, site);
    if (!agg.totals.lastDate) return { tag: "no-data", color: "text-slate-500", dot: "bg-slate-600", label: "No Data" };
    const daysAgo = (new Date() - agg.totals.lastDate) / 86400000;
    if (daysAgo <= 7)  return { tag: "live",   color: "text-emerald-400", dot: "bg-emerald-500", label: "Live" };
    if (daysAgo <= 30) return { tag: "stale",  color: "text-amber-400",   dot: "bg-amber-500",   label: "Stale" };
    return { tag: "offline", color: "text-red-400", dot: "bg-red-500", label: "Offline" };
  };

  // ── Best ROI holding (by current %-recovered) — ACTIVE only ──
  const topSite = [...data.perSite]
    .filter(p => p.site.active !== false && p.site.capex > 0 && p.agg.totals.roi > 0)
    .sort((a, b) => b.agg.totals.roi - a.agg.totals.roi)[0];

  // ── Total Cars Served ≈ total sessions (each session = 1 car) ──
  const totalCars = data.totalSessions;

  return (
    <div className="-mx-4 sm:-mx-6 lg:-mx-8 -mt-8 -mb-12">
      {/* COMMAND BAR */}
      <div className="bg-gradient-to-r from-slate-950 via-slate-900 to-slate-950 border-b border-slate-800/80">
        <div className="max-w-[1400px] mx-auto px-4 sm:px-6 lg:px-8 py-3 flex items-center justify-between flex-wrap gap-3">
          <div className="flex items-center gap-3 flex-wrap">
            <div className="bg-brand/15 border border-brand/30 rounded-md px-2.5 py-1 flex items-center gap-1.5">
              <Radio className="w-3.5 h-3.5 text-brand animate-pulse" />
              <span className="text-[10px] font-black uppercase tracking-[0.25em] text-brand">B.E.S.T Portfolio · War Room</span>
            </div>
            <span className="text-xs text-slate-400 font-mono">
              {sites.filter(s => s.active !== false).length} / {sites.length} HOLDINGS · {fmtUSD(data.totalCapexUSD)} DEPLOYED
              {sites.some(s => s.active === false) && (
                <span className="text-amber-400/80 ml-1">
                  · {sites.filter(s => s.active === false).length} EXCLUDED
                </span>
              )}
              {dateRange && (
                <span className="text-brand ml-1">
                  · RANGE {dateRange.start} → {dateRange.end}
                </span>
              )}
            </span>
            <span className="text-[10px] text-slate-500 font-mono hidden sm:inline">
              FX {FX_LAST_UPDATED}
            </span>
          </div>
          <div className="flex items-center gap-3 flex-wrap">
            <TimeframeSelector value={timeframe} onChange={setTimeframe} />
            <button onClick={() => setShowReport(true)}
              className="bg-brand hover:bg-brand-dark text-white rounded-md px-3 py-1.5 flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider transition-colors shadow-[0_0_12px_rgba(190,18,60,0.25)]">
              <FileText className="w-3.5 h-3.5" /> Investor Report
            </button>
            <LiveClock />
          </div>
        </div>
      </div>

      {/* MAIN */}
      <div className="bg-slate-950 text-slate-200 p-4 sm:p-6 lg:p-8 pb-12">
        <div className="max-w-[1400px] mx-auto space-y-4">

          {/* ── ETF-STYLE PORTFOLIO KPI ROW (the headline metrics for investors) ── */}
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
            <HeroKPI label="Capital Deployed"
              value={fmtUSD(data.totalCapexUSD)}
              subLines={[`${fmt0(sites.length)} sites (holdings)`, `${sites.filter(s => s.active).length} active`]}
              icon={Briefcase} />
            <HeroKPI label="Monthly Revenue"
              value={fmtUSD(data.totalMonthlyRevenueUSD)}
              subLines={[`Run-rate (run days)`, `Lifetime ${fmtUSD(data.totalRevenueUSD)}`]}
              icon={DollarSign} />
            <HeroKPI label="Monthly Profit"
              value={fmtUSD(data.totalMonthlyProfitUSD)}
              subLines={[
                `Margin ${data.totalMonthlyRevenueUSD > 0 ? ((data.totalMonthlyProfitUSD / data.totalMonthlyRevenueUSD) * 100).toFixed(1) : 0}%`,
                `Lifetime ${fmtUSD(data.totalProfitUSD)}`
              ]}
              icon={TrendingUp} />
            <HeroKPI label="Current ROI"
              value={`${fmt(data.portfolioROI, 1)}%`}
              subLines={[
                `${fmt(data.portfolioAnnualizedROI, 1)}% annualized`,
                `${fmtUSD(data.totalProfitUSD)} of ${fmtUSD(data.totalCapexUSD)} recovered`
              ]}
              icon={Sparkles} />
            <HeroKPI label="Portfolio Payback"
              value={data.portfolioPaybackYears != null && data.portfolioPaybackYears < 100
                ? `${fmt(data.portfolioPaybackYears, 1)} yrs`
                : "—"}
              subLines={[
                data.portfolioPaybackMonths != null && data.portfolioPaybackMonths < 1200
                  ? `${fmt0(data.portfolioPaybackMonths)} months`
                  : "set capex/upload data",
                "to full capital recovery"
              ]}
              icon={Calendar} />
            <HeroKPI label="Cars Served"
              value={fmtCompact(totalCars)}
              subLines={[
                `${fmtCompact(data.totalKwh)} kWh delivered`,
                `${fmt0(data.totalDays)} operating days`
              ]}
              icon={Car} />
          </div>

          {/* ── 3-COLUMN GRID: sidebar | map | feed ── */}
          <div className="grid grid-cols-12 gap-4">

            {/* LEFT — Sites */}
            <aside className="col-span-12 lg:col-span-3 bg-slate-900 border border-slate-800 rounded-xl overflow-hidden flex flex-col">
              <div className="bg-slate-800/50 border-b border-slate-800 px-4 py-3 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <MapPinned className="w-4 h-4 text-brand" />
                  <h3 className="font-bold text-white text-sm">Installations</h3>
                  <span className="text-[10px] text-slate-400 font-mono">{sites.length}</span>
                </div>
                <Link to="/sites" className="text-[10px] uppercase tracking-wider text-slate-400 hover:text-brand font-bold">Manage →</Link>
              </div>
              <div className="px-3 pt-3 pb-2">
                <div className="relative">
                  <Search className="w-3.5 h-3.5 absolute left-2.5 top-2 text-slate-500" />
                  <input value={search} onChange={e => setSearch(e.target.value)}
                    placeholder="Search sites..."
                    className="w-full bg-slate-950 border border-slate-700 rounded-md pl-8 pr-3 py-1.5 text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-brand" />
                </div>
              </div>
              <div className="flex-1 overflow-y-auto max-h-[600px]">
                {filteredSites.map(site => {
                  const agg = aggregateSite(site.id, site);
                  const t = agg.totals;
                  const status = siteStatus(site);
                  const sym = currencySymbol(site.currency);
                  const isOff = site.active === false;
                  return (
                    <div key={site.id}
                      className={`group border-b border-slate-800/70 hover:bg-slate-800/50 transition-colors px-4 py-3 ${isOff ? "opacity-50" : ""}`}>
                      <div className="flex items-start justify-between gap-2">
                        <Link to={`/sites/${site.id}`} className="flex-1 min-w-0">
                          <div className="flex items-center gap-1.5 mb-0.5">
                            <span className="relative flex h-1.5 w-1.5">
                              {status.tag === "live" && (
                                <span className={`animate-ping absolute inline-flex h-full w-full rounded-full ${status.dot} opacity-75`}></span>
                              )}
                              <span className={`relative inline-flex rounded-full h-1.5 w-1.5 ${status.dot}`}></span>
                            </span>
                            <span className={`text-[9px] font-bold uppercase tracking-wider ${status.color}`}>{status.label}</span>
                            <span className="text-[9px] font-mono text-slate-500 ml-auto">{agg.uploads.length} files</span>
                          </div>
                          <p className="text-sm font-bold text-white truncate group-hover:text-brand transition-colors">
                            {site.name}
                            {site.siteType === "ess" && (
                              <span className="ml-1.5 text-[8px] font-bold uppercase tracking-wider text-amber-400 bg-amber-500/15 border border-amber-500/30 rounded px-1 py-0.5 align-middle">ESS</span>
                            )}
                          </p>
                          <p className="text-[10px] text-slate-500 mt-0.5 truncate">{site.city}, {site.country}</p>
                          <div className="flex items-center gap-3 mt-2 font-mono text-[11px]">
                            <span className="text-slate-400"><span className="text-brand font-bold">{fmt0(t.totalKwh)}</span> kWh</span>
                            <span className="text-slate-400"><span className="text-emerald-400 font-bold">{fmt0(t.totalSessions)}</span> cars</span>
                          </div>
                          <p className="text-[10px] text-slate-500 mt-1 font-mono">
                            Net: <span className="text-emerald-400 font-bold">{sym}{fmt0(t.netProfit)}</span>
                            <span className="text-slate-600"> ({fmtUSD(t.netProfitUSD)})</span>
                          </p>
                          <div className="flex items-center justify-between mt-1 font-mono text-[10px]">
                            <span className="text-slate-500">
                              CAPEX:{" "}
                              {site.capex > 0
                                ? <span className="text-slate-300 font-bold">{sym}{fmtCompact(site.capex)}</span>
                                : <span className="text-slate-600">—</span>}
                            </span>
                            <span className="text-slate-500">
                              ROI:{" "}
                              {site.capex > 0 ? (
                                <>
                                  <span className={`font-bold ${t.roi >= 100 ? "text-emerald-400" : t.roi >= 25 ? "text-amber-400" : "text-slate-300"}`}>
                                    {fmt(t.roi, 1)}%
                                  </span>
                                  <span className="text-slate-600"> (ann {fmt(t.annualizedRoi, 1)}%)</span>
                                </>
                              ) : <span className="text-slate-600">—</span>}
                            </span>
                          </div>
                        </Link>
                        <div className="flex flex-col gap-1 flex-shrink-0">
                          <button
                            onClick={async (e) => {
                              e.preventDefault(); e.stopPropagation();
                              try { await toggleSiteActive(site.id, !site.active); }
                              catch (err) { alert("Toggle failed: " + err.message); }
                            }}
                            title={isOff ? "Include in portfolio totals" : "Exclude from portfolio totals"}
                            className={`transition-all rounded-md p-1.5 ${
                              isOff
                                ? "opacity-100 text-slate-400 hover:text-emerald-400 bg-slate-800 hover:bg-slate-700"
                                : "opacity-100 text-emerald-400 hover:text-slate-500 bg-emerald-500/15 hover:bg-slate-800"
                            }`}>
                            <Power className="w-3.5 h-3.5" />
                          </button>
                          <button onClick={() => setUploadTarget(site)}
                            title="Quick upload xlsx"
                            className="opacity-0 group-hover:opacity-100 transition-opacity text-slate-400 hover:text-brand bg-slate-800 hover:bg-slate-700 rounded-md p-1.5">
                            <Upload className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })}
                {filteredSites.length === 0 && (
                  <div className="p-8 text-center text-slate-500 text-xs">
                    {search ? "No matches" : "No sites yet"}
                  </div>
                )}
              </div>
              <Link to="/sites" className="border-t border-slate-800 px-4 py-3 text-center text-xs font-bold text-brand hover:bg-slate-800/50 transition-colors">
                + Add Installation Site
              </Link>
            </aside>

            {/* CENTER — Map */}
            <section className="col-span-12 lg:col-span-6 flex flex-col">
              <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden flex-1 flex flex-col">
                <div className="bg-slate-800/50 border-b border-slate-800 px-4 py-2.5 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Globe className="w-3.5 h-3.5 text-brand" />
                    <h3 className="text-xs font-bold uppercase tracking-wider text-slate-200">Global Footprint</h3>
                    <span className="text-[10px] text-slate-500 font-mono">{sites.length} markers</span>
                  </div>
                  <div className="text-[10px] text-slate-500 font-mono flex items-center gap-2">
                    <span><span className="inline-block w-2 h-2 rounded-full bg-brand mr-1 align-middle"></span>EV</span>
                    <span><span className="inline-block w-2 h-2 rounded-full bg-emerald-500 mr-1 align-middle"></span>ESS</span>
                    <span className="opacity-60">size ∝ kWh</span>
                  </div>
                </div>
                <div className="relative flex-1 min-h-[480px]">
                  <MapContainer
                    center={[25, 30]}
                    zoom={2}
                    minZoom={2}
                    maxZoom={10}
                    maxBounds={[[-85, -180], [85, 180]]}
                    maxBoundsViscosity={1.0}
                    worldCopyJump={false}
                    scrollWheelZoom
                    zoomControl={false}
                    style={{ height: "100%", width: "100%", background: "#020617" }}>
                    <TileLayer
                      attribution='&copy; CartoDB · OSM'
                      url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
                      noWrap
                    />
                    <ZoomControl position="bottomright" />
                    <FitBoundsToMarkers sites={data.perSite.filter(p => p.site.active !== false).map(p => p.site)} />
                    {data.perSite.filter(p => p.site.lat && p.site.lng && p.site.active !== false).map(({ site, agg }) => {
                      const t = agg.totals;
                      const sym = currencySymbol(site.currency);
                      const isEss = site.siteType === "ess";
                      // Baseline of 5 so empty sites are still visible, scaled up to ~12 by kWh
                      const radius = 5 + (t.totalKwh / maxKwh) * 7;
                      // ESS sites = emerald green, EV sites = brand rose (gray only for inactive EV)
                      const color = isEss
                        ? "#10b981"
                        : (t.totalKwh > 0 ? "#be123c" : "#64748b");
                      return (
                        <CircleMarker key={site.id} center={[site.lat, site.lng]}
                          radius={radius}
                          pathOptions={{ color, weight: 1, fillColor: color, fillOpacity: 0.7 }}>
                          <LeafletTooltip direction="top" offset={[0, -8]} permanent={false}>
                            <div className="text-xs">
                              <div className="font-bold text-slate-900">
                                {site.name}
                                {isEss && <span className="ml-1.5 text-[8px] font-bold uppercase tracking-wider text-amber-700 bg-amber-100 border border-amber-300 rounded px-1 py-0.5">ESS</span>}
                              </div>
                              <div className="text-slate-600">{site.city}, {site.country}</div>
                              {isEss ? (
                                <div className="mt-1 text-slate-700">
                                  <b>{fmt0(t.totalKwh)}</b> kWh discharged · <b>{agg.uploads.length}</b> daily reports
                                </div>
                              ) : (
                                <>
                                  <div className="mt-1 text-slate-700">
                                    <b>{fmt0(t.totalKwh)}</b> kWh · <b>{t.totalSessions}</b> sessions
                                  </div>
                                  <div className="text-emerald-700 font-bold">
                                    Net Profit: {sym}{fmt0(t.netProfit)} ({fmtUSD(t.netProfitUSD)})
                                  </div>
                                </>
                              )}
                            </div>
                          </LeafletTooltip>
                        </CircleMarker>
                      );
                    })}
                  </MapContainer>
                </div>
              </div>
            </section>

            {/* RIGHT — Today + Top + Feed */}
            <aside className="col-span-12 lg:col-span-3 flex flex-col gap-4">
              <div className="bg-gradient-to-br from-brand to-brand-dark rounded-xl p-4 text-white">
                <div className="flex items-center justify-between mb-2">
                  <p className="text-[10px] uppercase tracking-[0.2em] font-bold opacity-80">Today · {todayISO.slice(5)}</p>
                  <Clock className="w-3.5 h-3.5 opacity-70" />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <p className="text-2xl font-black tabular-nums">{fmt0(todayKwh)}</p>
                    <p className="text-[10px] opacity-80 font-bold uppercase tracking-wider">kWh</p>
                  </div>
                  <div>
                    <p className="text-2xl font-black tabular-nums">{fmt0(todaySess)}</p>
                    <p className="text-[10px] opacity-80 font-bold uppercase tracking-wider">Cars</p>
                  </div>
                </div>
                <div className="mt-3 pt-3 border-t border-white/20">
                  <p className="text-xl font-black tabular-nums">{fmtUSD(todayRevenueUSD)}</p>
                  <p className="text-[10px] opacity-80 font-bold uppercase tracking-wider">Revenue today (USD)</p>
                </div>
                {todayUploads.length === 0 && (
                  <p className="text-[10px] mt-3 opacity-80 flex items-center gap-1">
                    <AlertCircle className="w-3 h-3" /> Awaiting today's uploads
                  </p>
                )}
              </div>

              {topSite && (
                <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden">
                  <div className="bg-slate-800/50 border-b border-slate-800 px-4 py-2.5 flex items-center gap-2">
                    <Sparkles className="w-3.5 h-3.5 text-emerald-400" />
                    <h3 className="text-xs font-bold uppercase tracking-wider text-slate-200">Top Holding · by ROI</h3>
                  </div>
                  <Link to={`/sites/${topSite.site.id}`} className="block p-4 hover:bg-slate-800/30 transition-colors">
                    <p className="font-bold text-white truncate">{topSite.site.name}</p>
                    <p className="text-[10px] text-slate-500 mb-3">{topSite.site.city} · {topSite.site.country}</p>
                    <div className="grid grid-cols-2 gap-3 text-xs">
                      <div>
                        <p className="font-mono text-lg font-black text-emerald-400 tabular-nums">{fmt(topSite.agg.totals.roi, 1)}%</p>
                        <p className="text-[9px] text-slate-500 uppercase tracking-wider font-bold">Current ROI</p>
                      </div>
                      <div>
                        <p className="font-mono text-lg font-black text-brand tabular-nums">
                          {topSite.agg.totals.paybackYears != null && topSite.agg.totals.paybackYears < 100
                            ? `${fmt(topSite.agg.totals.paybackYears, 1)} yrs`
                            : "—"}
                        </p>
                        <p className="text-[9px] text-slate-500 uppercase tracking-wider font-bold">Payback</p>
                      </div>
                    </div>
                  </Link>
                </div>
              )}

              <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden flex-1 flex flex-col">
                <div className="bg-slate-800/50 border-b border-slate-800 px-4 py-2.5 flex items-center gap-2">
                  <Activity className="w-3.5 h-3.5 text-brand" />
                  <h3 className="text-xs font-bold uppercase tracking-wider text-slate-200">Recent Sessions</h3>
                  <span className="text-[10px] text-slate-500 font-mono ml-auto">{recentSessions.length}</span>
                </div>
                <div className="flex-1 overflow-y-auto max-h-96">
                  {recentSessions.map((s, i) => {
                    const time = new Date(s.start).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
                    const profitUSD = toUSD(s.kwh * 0.46, s.currency); // rough net profit per kWh
                    return (
                      <Link key={i} to={`/sites/${s.site.id}`}
                        className="block px-4 py-2.5 border-b border-slate-800/70 hover:bg-slate-800/50 transition-colors">
                        <div className="flex items-center justify-between gap-2 mb-1">
                          <div className="flex items-center gap-1.5 min-w-0">
                            <span className={`text-[9px] font-black px-1.5 py-0.5 rounded ${s.gun === "C1" ? "bg-blue-500/20 text-blue-400" : "bg-rose-500/20 text-brand"}`}>{s.gun}</span>
                            <span className="text-xs text-slate-300 truncate">{s.site.name.split("—")[0].trim()}</span>
                          </div>
                          <span className="text-[10px] text-slate-500 font-mono">{s.reportDate.slice(5)} {time}</span>
                        </div>
                        <div className="flex items-center gap-3 font-mono text-[11px]">
                          <span className="text-brand font-bold">{fmt(s.kwh)} kWh</span>
                          <span className="text-slate-500">{fmt(s.durationMin, 0)} min</span>
                          <span className="text-slate-500">{fmt(s.peakKw, 0)} kW</span>
                          <span className="text-emerald-400 ml-auto">+{fmtUSD(profitUSD)}</span>
                        </div>
                      </Link>
                    );
                  })}
                  {recentSessions.length === 0 && (
                    <div className="p-8 text-center text-slate-500 text-xs">
                      No session data yet.<br/>Upload an xlsx to populate.
                    </div>
                  )}
                </div>
              </div>
            </aside>
          </div>

          {/* ── Portfolio Energy & Profit Trend (aggregated across all holdings) ── */}
          <section className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden">
            <div className="bg-slate-800/50 border-b border-slate-800 px-4 py-2.5 flex items-center justify-between flex-wrap gap-3">
              <div className="flex items-center gap-2">
                <BarChart3 className="w-3.5 h-3.5 text-brand" />
                <h3 className="text-xs font-bold uppercase tracking-wider text-slate-200">Portfolio Energy & Profit Trend</h3>
                <span className="text-[10px] text-slate-500 font-mono">aggregated · USD</span>
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
              {portfolioSeries[period].length === 0 ? (
                <div className="h-64 flex items-center justify-center text-slate-500 text-sm">
                  No data yet across the portfolio. Upload reports on any site to populate this trend.
                </div>
              ) : (
                <ResponsiveContainer width="100%" height={360}>
                  <ComposedChart data={portfolioSeries[period]} margin={{ top: 40, right: 10, left: 0, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                    <XAxis dataKey="key" tick={{ fontSize: 10, fill: "#64748b" }} stroke="#334155" />
                    <YAxis yAxisId="left" tick={{ fontSize: 10, fill: "#64748b" }} stroke="#334155" />
                    <YAxis yAxisId="right" orientation="right" tick={{ fontSize: 10, fill: "#64748b" }} stroke="#334155" />
                    <YAxis yAxisId="cars" orientation="right" hide />
                    <YAxis yAxisId="time" orientation="right" hide />
                    <Tooltip
                      content={<ChartTooltip sym="$" />}
                      position={{ y: 0 }}
                      cursor={{ stroke: "#475569", strokeWidth: 1, strokeDasharray: "3 3" }}
                    />
                    <Legend wrapperStyle={{ fontSize: 12, color: "#cbd5e1" }} />
                    <Bar yAxisId="left" dataKey="kwh" fill="#be123c" name="kWh" radius={[3, 3, 0, 0]} />
                    <Line yAxisId="right" type="monotone" dataKey="profit"  stroke="#10b981" strokeWidth={1.5} name="Net Profit"    dot={{ r: 1.5, fill: "#10b981" }} />
                    <Line yAxisId="right" type="monotone" dataKey="revenue" stroke="#94a3b8" strokeWidth={1.5} strokeDasharray="3 3" name="Revenue" dot={{ r: 1.5, fill: "#94a3b8" }} />
                    <Line yAxisId="cars"  type="monotone" dataKey="sessions" stroke="#60a5fa" strokeWidth={1.5} name="Cars Served" dot={{ r: 1.5, fill: "#60a5fa" }} />
                    <Line yAxisId="time"  type="monotone" dataKey={(b) => (b.minutes || 0) / 60} stroke="#f59e0b" strokeWidth={1.5} strokeDasharray="2 3" name="Hours Charged" dot={{ r: 1.5, fill: "#f59e0b" }} />
                  </ComposedChart>
                </ResponsiveContainer>
              )}
            </div>
          </section>

          {/* ── Full-width: Site performance table ── */}
          <section className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden">
            <div className="bg-slate-800/50 border-b border-slate-800 px-4 py-2.5 flex items-center gap-2">
              <BarChart3 className="w-3.5 h-3.5 text-brand" />
              <h3 className="text-xs font-bold uppercase tracking-wider text-slate-200">Holdings · All values in USD</h3>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="text-[10px] uppercase tracking-wider text-slate-500 bg-slate-900">
                  <tr className="border-b border-slate-800">
                    <th className="px-4 py-3 text-left font-bold">Site</th>
                    <th className="px-4 py-3 text-center font-bold">Status</th>
                    <th className="px-4 py-3 text-right font-bold">Setup Cost</th>
                    <th className="px-4 py-3 text-right font-bold">Contract</th>
                    <th className="px-4 py-3 text-right font-bold">Cars</th>
                    <th className="px-4 py-3 text-right font-bold">Monthly Rev</th>
                    <th className="px-4 py-3 text-right font-bold">Monthly Profit</th>
                    <th className="px-4 py-3 text-right font-bold">Current ROI</th>
                    <th className="px-4 py-3 text-right font-bold">Payback</th>
                    <th className="px-4 py-3"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/70 font-mono">
                  {data.perSite.map(({ site, agg }) => {
                    const status = siteStatus(site);
                    const t = agg.totals;
                    const paybackOverContract = t.paybackYears != null && site.contractYears > 0 && t.paybackYears > site.contractYears;
                    const isOff = site.active === false;
                    return (
                      <tr key={site.id} className={`hover:bg-slate-800/30 transition-colors ${isOff ? "opacity-50" : ""}`}>
                        <td className="px-4 py-3">
                          <Link to={`/sites/${site.id}`} className="font-sans font-bold text-white hover:text-brand">{site.name}</Link>
                          <div className="text-[10px] text-slate-500 font-mono">{site.city}, {site.country}</div>
                        </td>
                        <td className="px-4 py-3 text-center">
                          <span className={`inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider ${status.color}`}>
                            <span className={`w-1.5 h-1.5 rounded-full ${status.dot}`}></span>
                            {status.label}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-right text-slate-300 tabular-nums">{fmtUSD(t.capexUSD)}</td>
                        <td className="px-4 py-3 text-right text-slate-300 tabular-nums">{site.contractYears || "—"} yrs</td>
                        <td className="px-4 py-3 text-right text-slate-300 tabular-nums">{fmt0(t.totalSessions)}</td>
                        <td className="px-4 py-3 text-right text-slate-300 tabular-nums">{fmtUSD(t.monthlyAvgRevenueUSD)}</td>
                        <td className="px-4 py-3 text-right font-bold text-emerald-400 tabular-nums">{fmtUSD(t.monthlyAvgProfitUSD)}</td>
                        <td className={`px-4 py-3 text-right font-bold tabular-nums ${t.roi >= 100 ? "text-emerald-400" : t.roi >= 25 ? "text-amber-400" : "text-slate-400"}`}>
                          {site.capex > 0 ? (
                            <>
                              {fmt(t.roi, 1)}%
                              <div className="text-[9px] text-slate-500 font-normal">ann {fmt(t.annualizedRoi, 1)}%</div>
                            </>
                          ) : "—"}
                        </td>
                        <td className={`px-4 py-3 text-right tabular-nums ${paybackOverContract ? "text-red-400" : "text-slate-300"}`}>
                          {t.paybackYears != null && t.paybackYears < 100 ? (
                            <>
                              <div className="font-bold">{fmt(t.paybackYears, 1)} yrs{paybackOverContract ? " ⚠" : ""}</div>
                              <div className="text-[9px] text-slate-500 font-normal">
                                {fmt0(t.paybackMonths)} mo
                              </div>
                            </>
                          ) : "—"}
                        </td>
                        <td className="px-4 py-3 text-right">
                          <button
                            onClick={async () => {
                              try { await toggleSiteActive(site.id, !site.active); }
                              catch (err) { alert("Toggle failed: " + err.message); }
                            }}
                            className={`rounded p-1.5 inline-flex transition-colors ${
                              isOff
                                ? "text-slate-500 hover:text-emerald-400 bg-slate-800 hover:bg-slate-700"
                                : "text-emerald-400 hover:text-slate-500 bg-emerald-500/15 hover:bg-slate-800"
                            }`}
                            title={isOff ? "Include in portfolio totals" : "Exclude from portfolio totals"}>
                            <Power className="w-3.5 h-3.5" />
                          </button>
                          <button onClick={() => setUploadTarget(site)}
                            className="ml-1 text-slate-400 hover:text-brand bg-slate-800 hover:bg-slate-700 rounded p-1.5 inline-flex"
                            title="Quick upload">
                            <Upload className="w-3.5 h-3.5" />
                          </button>
                          <Link to={`/sites/${site.id}`}
                            className="ml-1 text-slate-400 hover:text-brand bg-slate-800 hover:bg-slate-700 rounded p-1.5 inline-flex">
                            <ChevronRight className="w-3.5 h-3.5" />
                          </Link>
                        </td>
                      </tr>
                    );
                  })}
                  {data.perSite.length === 0 && (
                    <tr><td colSpan={10} className="text-center text-slate-500 py-12 text-xs">
                      No sites yet. <Link to="/sites" className="text-brand font-bold">Add one →</Link>
                    </td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </section>
        </div>
      </div>

      {uploadTarget && (
        <SiteQuickUpload
          site={uploadTarget}
          onClose={() => setUploadTarget(null)}
          onDone={() => { /* storage subscription handles refresh */ }}
        />
      )}

      {showReport && (
        <ReportModal
          title="Investor Monthly Report"
          subtitle="Portfolio-wide PDF for distribution to investors"
          icon={FileText}
          onClose={() => setShowReport(false)}
          onGenerate={(start, end) => {
            generateInvestorMonthlyReport(sites, data, data.perSite, start, end);
          }}
        />
      )}
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
