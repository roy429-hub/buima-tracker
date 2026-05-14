import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { MapContainer, TileLayer, CircleMarker, Tooltip, ZoomControl } from "react-leaflet";
import L from "leaflet";
import {
  Zap, Activity, TrendingUp, MapPinned, Upload, Search, Radio,
  AlertCircle, ChevronRight, Sparkles, BarChart3, Clock, DollarSign, Globe, Car
} from "lucide-react";
import { getSites, currencySymbol, fmt0, fmt, getUploads } from "../lib/storage";
import { aggregateAllSites, aggregateSite } from "../lib/aggregate";
import { fmtUSD, fmtCompact, FX_LAST_UPDATED, toUSD } from "../lib/fx";
import LiveClock from "../components/LiveClock";
import SiteQuickUpload from "../components/SiteQuickUpload";

delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png",
  iconUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png",
  shadowUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",
});

export default function WarRoom() {
  const [search, setSearch] = useState("");
  const [refreshKey, setRefreshKey] = useState(0);
  const [uploadTarget, setUploadTarget] = useState(null);
  const sites = useMemo(() => getSites(), [refreshKey]);
  const data  = useMemo(() => aggregateAllSites(sites), [sites, refreshKey]);

  const filteredSites = sites.filter(s =>
    !search || s.name.toLowerCase().includes(search.toLowerCase()) ||
    (s.country || "").toLowerCase().includes(search.toLowerCase()) ||
    (s.city || "").toLowerCase().includes(search.toLowerCase())
  );

  const maxKwh = Math.max(1, ...data.perSite.map(p => p.agg.totals.totalKwh));

  // ── Today's stats (USD) ──
  const todayISO = new Date().toISOString().slice(0, 10);
  const todayUploads = getUploads().filter(u => u.reportDate === todayISO);
  const todayKwh = todayUploads.reduce((s, u) => s + (u.totalKwh || 0), 0);
  const todaySess = todayUploads.reduce((s, u) => s + (u.totalSessions || 0), 0);
  const todayRevenueUSD = todayUploads.reduce((acc, u) => {
    const site = sites.find(s => s.id === u.siteId);
    if (!site) return acc;
    return acc + toUSD((u.totalKwh || 0) * site.chargingFee, site.currency);
  }, 0);

  // ── Recent activity feed (last 8 sessions across all sites) ──
  const recentSessions = sites
    .flatMap(s => {
      const agg = aggregateSite(s.id, s);
      return agg.uploads.flatMap(u => (u.sessions || []).map(sess => ({
        ...sess, site: s, reportDate: u.reportDate, currency: s.currency,
      })));
    })
    .sort((a, b) => b.start.localeCompare(a.start))
    .slice(0, 8);

  // ── Site status ──
  const siteStatus = (site) => {
    const agg = aggregateSite(site.id, site);
    if (!agg.totals.lastDate) return { tag: "no-data", color: "text-slate-500", dot: "bg-slate-600", label: "No Data" };
    const daysAgo = (new Date() - agg.totals.lastDate) / 86400000;
    if (daysAgo <= 7)  return { tag: "live",   color: "text-emerald-400", dot: "bg-emerald-500", label: "Live" };
    if (daysAgo <= 30) return { tag: "stale",  color: "text-amber-400",   dot: "bg-amber-500",   label: "Stale" };
    return { tag: "offline", color: "text-red-400", dot: "bg-red-500", label: "Offline" };
  };

  // ── Top performer ──
  const topSite = [...data.perSite].sort((a, b) => b.agg.totals.totalKwh - a.agg.totals.totalKwh)[0];

  // ── Total Cars Served ≈ total sessions (each session = 1 car) ──
  const totalCars = data.totalSessions;

  return (
    <div className="-mx-4 sm:-mx-6 lg:-mx-8 -mt-8 -mb-12">
      {/* COMMAND BAR */}
      <div className="bg-gradient-to-r from-slate-950 via-slate-900 to-slate-950 border-b border-slate-800/80">
        <div className="max-w-[1400px] mx-auto px-4 sm:px-6 lg:px-8 py-3 flex items-center justify-between flex-wrap gap-3">
          <div className="flex items-center gap-3">
            <div className="bg-brand/15 border border-brand/30 rounded-md px-2.5 py-1 flex items-center gap-1.5">
              <Radio className="w-3.5 h-3.5 text-brand animate-pulse" />
              <span className="text-[10px] font-black uppercase tracking-[0.25em] text-brand">War Room</span>
            </div>
            <span className="text-xs text-slate-400 font-mono">
              OPERATING · {sites.filter(s => s.active).length} / {sites.length} SITES
            </span>
            <span className="text-[10px] text-slate-500 font-mono hidden sm:inline">
              · FX as of {FX_LAST_UPDATED}
            </span>
          </div>
          <LiveClock />
        </div>
      </div>

      {/* MAIN */}
      <div className="bg-slate-950 text-slate-200 p-4 sm:p-6 lg:p-8 pb-12">
        <div className="max-w-[1400px] mx-auto space-y-4">

          {/* ── INVESTOR-GRADE KPI ROW (full width, hero) ── */}
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
            <HeroKPI label="Total Sites" value={fmt0(sites.length)} sub={`${sites.filter(s => s.active).length} active`} icon={MapPinned} />
            <HeroKPI label="Cars Served" value={fmtCompact(totalCars)} sub="sessions to date" icon={Car} />
            <HeroKPI label="kWh Delivered" value={fmtCompact(data.totalKwh)} sub={`${fmt0(data.totalDays)} run-days`} icon={Zap} />
            <HeroKPI label="Revenue (USD)" value={fmtUSD(data.totalRevenueUSD)} sub="all sites, converted" icon={DollarSign} highlight />
            <HeroKPI label="Net Profit (USD)" value={fmtUSD(data.totalProfitUSD)} sub={`Margin ${data.totalRevenueUSD > 0 ? ((data.totalProfitUSD / data.totalRevenueUSD) * 100).toFixed(1) : 0}%`} icon={TrendingUp} />
            <HeroKPI label="Portfolio ROI" value={`${fmt(data.portfolioROI, 1)}%`} sub={`Profit ${fmtUSD(data.totalProfitUSD)} / Capex ${fmtUSD(data.totalCapexUSD)}`} icon={Sparkles} highlight />
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
                  return (
                    <div key={site.id}
                      className="group border-b border-slate-800/70 hover:bg-slate-800/50 transition-colors px-4 py-3">
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
                          <p className="text-sm font-bold text-white truncate group-hover:text-brand transition-colors">{site.name}</p>
                          <p className="text-[10px] text-slate-500 mt-0.5 truncate">{site.city}, {site.country}</p>
                          <div className="flex items-center gap-3 mt-2 font-mono text-[11px]">
                            <span className="text-slate-400"><span className="text-brand font-bold">{fmt0(t.totalKwh)}</span> kWh</span>
                            <span className="text-slate-400"><span className="text-emerald-400 font-bold">{fmt0(t.totalSessions)}</span> cars</span>
                          </div>
                          <p className="text-[10px] text-slate-500 mt-1">
                            Net: <span className="text-emerald-400 font-bold">{sym}{fmt0(t.netProfit)}</span>
                            <span className="text-slate-600"> ({fmtUSD(t.netProfitUSD)})</span>
                          </p>
                        </Link>
                        <button onClick={() => setUploadTarget(site)}
                          title="Quick upload xlsx"
                          className="opacity-0 group-hover:opacity-100 transition-opacity text-slate-400 hover:text-brand bg-slate-800 hover:bg-slate-700 rounded-md p-1.5 flex-shrink-0">
                          <Upload className="w-3.5 h-3.5" />
                        </button>
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
                  <div className="text-[10px] text-slate-500 font-mono">marker size ∝ cumulative kWh</div>
                </div>
                <div style={{ height: 560 }} className="relative">
                  <MapContainer center={[25, 30]} zoom={2.2} scrollWheelZoom zoomControl={false}
                    style={{ height: "100%", width: "100%", background: "#020617" }}>
                    <TileLayer
                      attribution='&copy; CartoDB · OSM'
                      url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
                    />
                    <ZoomControl position="bottomright" />
                    {data.perSite.filter(p => p.site.lat && p.site.lng).map(({ site, agg }) => {
                      const t = agg.totals;
                      const sym = currencySymbol(site.currency);
                      const radius = 7 + (t.totalKwh / maxKwh) * 22;
                      const color = t.totalKwh > 0 ? "#be123c" : "#64748b";
                      return (
                        <CircleMarker key={site.id} center={[site.lat, site.lng]}
                          radius={radius}
                          pathOptions={{ color, weight: 2, fillColor: color, fillOpacity: 0.55 }}>
                          <Tooltip direction="top" offset={[0, -8]} permanent={false}>
                            <div className="text-xs">
                              <div className="font-bold text-slate-900">{site.name}</div>
                              <div className="text-slate-600">{site.city}, {site.country}</div>
                              <div className="mt-1 text-slate-700">
                                <b>{fmt0(t.totalKwh)}</b> kWh · <b>{t.totalSessions}</b> sessions
                              </div>
                              <div className="text-emerald-700 font-bold">
                                Net Profit: {sym}{fmt0(t.netProfit)} ({fmtUSD(t.netProfitUSD)})
                              </div>
                            </div>
                          </Tooltip>
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

              {topSite && topSite.agg.totals.totalKwh > 0 && (
                <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden">
                  <div className="bg-slate-800/50 border-b border-slate-800 px-4 py-2.5 flex items-center gap-2">
                    <TrendingUp className="w-3.5 h-3.5 text-emerald-400" />
                    <h3 className="text-xs font-bold uppercase tracking-wider text-slate-200">Top Performer</h3>
                  </div>
                  <Link to={`/sites/${topSite.site.id}`} className="block p-4 hover:bg-slate-800/30 transition-colors">
                    <p className="font-bold text-white truncate">{topSite.site.name}</p>
                    <p className="text-[10px] text-slate-500 mb-3">{topSite.site.city} · {topSite.site.country}</p>
                    <div className="grid grid-cols-2 gap-3 text-xs">
                      <div>
                        <p className="font-mono text-lg font-black text-brand tabular-nums">{fmt0(topSite.agg.totals.totalKwh)}</p>
                        <p className="text-[9px] text-slate-500 uppercase tracking-wider font-bold">Total kWh</p>
                      </div>
                      <div>
                        <p className="font-mono text-lg font-black text-emerald-400 tabular-nums">{fmtUSD(topSite.agg.totals.netProfitUSD)}</p>
                        <p className="text-[9px] text-slate-500 uppercase tracking-wider font-bold">Net Profit (USD)</p>
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

          {/* ── Full-width: Site performance table ── */}
          <section className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden">
            <div className="bg-slate-800/50 border-b border-slate-800 px-4 py-2.5 flex items-center gap-2">
              <BarChart3 className="w-3.5 h-3.5 text-brand" />
              <h3 className="text-xs font-bold uppercase tracking-wider text-slate-200">Per-Site Performance · All in USD</h3>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="text-[10px] uppercase tracking-wider text-slate-500 bg-slate-900">
                  <tr className="border-b border-slate-800">
                    <th className="px-4 py-3 text-left font-bold">Site</th>
                    <th className="px-4 py-3 text-left font-bold">Location</th>
                    <th className="px-4 py-3 text-center font-bold">Status</th>
                    <th className="px-4 py-3 text-right font-bold">Days</th>
                    <th className="px-4 py-3 text-right font-bold">Cars</th>
                    <th className="px-4 py-3 text-right font-bold">kWh</th>
                    <th className="px-4 py-3 text-right font-bold">Revenue (USD)</th>
                    <th className="px-4 py-3 text-right font-bold">OPEX (USD)</th>
                    <th className="px-4 py-3 text-right font-bold">Net Profit (USD)</th>
                    <th className="px-4 py-3 text-right font-bold">ROI</th>
                    <th className="px-4 py-3"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/70 font-mono">
                  {data.perSite.map(({ site, agg }) => {
                    const status = siteStatus(site);
                    const t = agg.totals;
                    return (
                      <tr key={site.id} className="hover:bg-slate-800/30 transition-colors">
                        <td className="px-4 py-3">
                          <Link to={`/sites/${site.id}`} className="font-sans font-bold text-white hover:text-brand">{site.name}</Link>
                          <div className="text-[10px] text-slate-500 font-mono">{site.chargerId}</div>
                        </td>
                        <td className="px-4 py-3 text-xs text-slate-400 font-sans">{site.city}, {site.country}</td>
                        <td className="px-4 py-3 text-center">
                          <span className={`inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider ${status.color}`}>
                            <span className={`w-1.5 h-1.5 rounded-full ${status.dot}`}></span>
                            {status.label}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-right text-slate-300 tabular-nums">{fmt0(t.totalDays)}</td>
                        <td className="px-4 py-3 text-right text-slate-300 tabular-nums">{fmt0(t.totalSessions)}</td>
                        <td className="px-4 py-3 text-right font-bold text-brand tabular-nums">{fmt0(t.totalKwh)}</td>
                        <td className="px-4 py-3 text-right text-slate-300 tabular-nums">{fmtUSD(t.grossRevenueUSD)}</td>
                        <td className="px-4 py-3 text-right text-amber-400 tabular-nums">{fmtUSD(t.fixedOpexUSD)}</td>
                        <td className="px-4 py-3 text-right font-bold text-emerald-400 tabular-nums">{fmtUSD(t.netProfitUSD)}</td>
                        <td className={`px-4 py-3 text-right font-bold tabular-nums ${t.roi >= 100 ? "text-emerald-400" : t.roi >= 50 ? "text-amber-400" : "text-slate-400"}`}>
                          {site.capex > 0 ? `${fmt(t.roi, 1)}%` : "—"}
                        </td>
                        <td className="px-4 py-3 text-right">
                          <button onClick={() => setUploadTarget(site)}
                            className="text-slate-400 hover:text-brand bg-slate-800 hover:bg-slate-700 rounded p-1.5 inline-flex"
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
                    <tr><td colSpan={12} className="text-center text-slate-500 py-12 text-xs">
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
          onDone={() => setRefreshKey(k => k + 1)}
        />
      )}
    </div>
  );
}

function HeroKPI({ label, value, sub, icon: Icon, highlight }) {
  return (
    <div className={`rounded-xl border p-4 ${highlight ? "bg-gradient-to-br from-brand/15 to-brand-dark/15 border-brand/40" : "bg-slate-900 border-slate-800"}`}>
      <div className="flex items-center justify-between mb-1.5">
        <p className={`text-[10px] uppercase tracking-[0.15em] font-bold ${highlight ? "text-brand" : "text-slate-400"}`}>{label}</p>
        {Icon && <Icon className={`w-3.5 h-3.5 ${highlight ? "text-brand" : "text-slate-500"}`} />}
      </div>
      <p className="text-2xl md:text-3xl font-black tabular-nums text-white">{value}</p>
      {sub && <p className="text-[10px] text-slate-500 mt-1 font-mono truncate">{sub}</p>}
    </div>
  );
}
