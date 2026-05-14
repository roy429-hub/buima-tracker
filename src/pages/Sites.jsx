import { useState } from "react";
import { Link } from "react-router-dom";
import {
  Plus, Trash2, MapPin, Settings, ChevronRight,
  Upload, MapPinned, Zap, Activity, TrendingUp
} from "lucide-react";
import { getSites, deleteSite, currencySymbol } from "../lib/storage";
import { aggregateSite } from "../lib/aggregate";
import { fmtUSD, fmtCompact } from "../lib/fx";
import { useStorageVersion } from "../lib/useStorage";
import SiteQuickUpload from "../components/SiteQuickUpload";
import { SiteFormModal } from "../components/SiteForm";

const blankSite = () => ({
  id: "", name: "", country: "", city: "", address: "",
  lat: 0, lng: 0, chargerId: "",
  chargingFee: 0, costPerKwh: 0, capex: 0, opexMonthly: 0,
  currency: "USD", active: true,
});

export default function Sites() {
  useStorageVersion(); // re-render on cache changes
  const sites = getSites();
  const [editing, setEditing] = useState(null);
  const [uploadTarget, setUploadTarget] = useState(null);
  const refresh = () => { /* storage notifies via subscription */ };

  return (
    <div className="-mx-4 sm:-mx-6 lg:-mx-8 -mt-8 -mb-12">
      {/* Page command bar */}
      <div className="bg-gradient-to-r from-slate-950 via-slate-900 to-slate-950 border-b border-slate-800/80">
        <div className="max-w-[1400px] mx-auto px-4 sm:px-6 lg:px-8 py-3 flex items-center justify-between flex-wrap gap-3">
          <div className="flex items-center gap-3">
            <div className="bg-brand/15 border border-brand/30 rounded-md px-2.5 py-1 flex items-center gap-1.5">
              <MapPinned className="w-3.5 h-3.5 text-brand" />
              <span className="text-[10px] font-black uppercase tracking-[0.25em] text-brand">Installations</span>
            </div>
            <span className="text-xs text-slate-400 font-mono">{sites.length} sites · {sites.filter(s => s.active).length} active</span>
          </div>
          <button onClick={() => setEditing(blankSite())}
            className="flex items-center gap-2 bg-brand hover:bg-brand-dark text-white px-4 py-1.5 rounded-md font-bold text-xs uppercase tracking-wider shadow-[0_0_12px_rgba(190,18,60,0.3)]">
            <Plus className="w-3.5 h-3.5" /> Add Site
          </button>
        </div>
      </div>

      {/* Page body */}
      <div className="bg-slate-950 text-slate-200 p-4 sm:p-6 lg:p-8 pb-12">
        <div className="max-w-[1400px] mx-auto">
          <div className="mb-6">
            <h1 className="text-2xl md:text-3xl font-black text-white tracking-tight">Installation Sites</h1>
            <p className="text-sm text-slate-400 mt-1">Manage all charging stations · click to open · upload daily reports</p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {sites.map(site => {
              const agg = aggregateSite(site.id, site).totals;
              const sym = currencySymbol(site.currency);

              // Site status (live/stale/offline)
              let status = { color: "text-slate-500", dot: "bg-slate-600", label: "No Data" };
              if (agg.lastDate) {
                const daysAgo = (new Date() - agg.lastDate) / 86400000;
                if (daysAgo <= 7)  status = { color: "text-emerald-400", dot: "bg-emerald-500", label: "Live" };
                else if (daysAgo <= 30) status = { color: "text-amber-400",  dot: "bg-amber-500",   label: "Stale" };
                else status = { color: "text-red-400", dot: "bg-red-500", label: "Offline" };
              }

              return (
                <div key={site.id}
                  className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden hover:border-brand/40 transition-all group shadow-[0_4px_16px_rgba(0,0,0,0.3)]">
                  {/* Header strip */}
                  <Link to={`/sites/${site.id}`}
                    className="block px-5 py-4 border-b border-slate-800 bg-gradient-to-r from-slate-900 to-slate-900/60 group-hover:from-slate-800 transition-colors">
                    <div className="flex items-center justify-between mb-1.5">
                      <div className="flex items-center gap-1.5">
                        <span className="relative flex h-1.5 w-1.5">
                          {status.label === "Live" && (
                            <span className={`animate-ping absolute inline-flex h-full w-full rounded-full ${status.dot} opacity-75`}></span>
                          )}
                          <span className={`relative inline-flex rounded-full h-1.5 w-1.5 ${status.dot}`}></span>
                        </span>
                        <span className={`text-[9px] font-bold uppercase tracking-[0.15em] ${status.color}`}>{status.label}</span>
                      </div>
                      <span className="text-[9px] font-mono text-slate-600">{site.currency}</span>
                    </div>
                    <h3 className="font-black text-white truncate group-hover:text-brand transition-colors">{site.name}</h3>
                    <p className="text-[11px] text-slate-500 flex items-center gap-1 mt-0.5 truncate">
                      <MapPin className="w-3 h-3 flex-shrink-0" />
                      <span className="truncate">{site.city || "—"}, {site.country || "—"}</span>
                    </p>
                  </Link>

                  {/* Stats grid */}
                  <div className="grid grid-cols-2 gap-px bg-slate-800">
                    <Stat label="Total kWh" value={fmtCompact(agg.totalKwh)} icon={Zap} accent="brand" />
                    <Stat label="Cars" value={fmtCompact(agg.totalSessions)} icon={Activity} />
                    <Stat label="Days" value={agg.totalDays} />
                    <Stat label="Net Profit" value={`${sym}${fmtCompact(agg.netProfit)}`} sub={fmtUSD(agg.netProfitUSD)} icon={TrendingUp} accent="green" />
                  </div>

                  {/* ROI bar — recovered + annualized */}
                  {site.capex > 0 && (
                    <div className="bg-slate-900 px-5 py-2.5 border-t border-slate-800">
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-[9px] uppercase tracking-[0.15em] text-slate-500 font-bold">Capex Recovered</span>
                        <span className={`text-xs font-black tabular-nums ${agg.roi >= 100 ? "text-emerald-400" : agg.roi >= 50 ? "text-amber-400" : "text-slate-400"}`}>
                          {agg.roi.toFixed(1)}%
                        </span>
                      </div>
                      <div className="h-1 bg-slate-800 rounded-full overflow-hidden">
                        <div className={`h-full transition-all ${agg.roi >= 100 ? "bg-emerald-500" : agg.roi >= 50 ? "bg-amber-500" : "bg-brand"}`}
                          style={{ width: `${Math.min(100, Math.max(0, agg.roi))}%` }} />
                      </div>
                      <div className="flex items-center justify-between mt-1.5 text-[10px] text-slate-500 font-mono">
                        <span>Annualized {agg.annualizedRoi.toFixed(1)}%</span>
                        <span>{agg.paybackYears != null && agg.paybackYears < 100 ? `Payback ${agg.paybackYears.toFixed(1)} yrs` : "Payback >100 yrs"}</span>
                      </div>
                    </div>
                  )}

                  {/* Footer actions */}
                  <div className="border-t border-slate-800 px-5 py-3 flex items-center justify-between bg-slate-900/50">
                    <div className="flex items-center gap-1">
                      <IconBtn onClick={() => setUploadTarget(site)} title="Quick upload xlsx"><Upload className="w-3.5 h-3.5" /></IconBtn>
                      <IconBtn onClick={() => setEditing(site)} title="Edit settings"><Settings className="w-3.5 h-3.5" /></IconBtn>
                      <IconBtn onClick={async () => {
                        if (confirm(`Delete ${site.name}? All uploads for this site will also be deleted.`)) {
                          try { await deleteSite(site.id); } catch (e) { alert(e.message); }
                        }
                      }} title="Delete site" danger><Trash2 className="w-3.5 h-3.5" /></IconBtn>
                    </div>
                    <Link to={`/sites/${site.id}`}
                      className="flex items-center gap-1 text-brand hover:text-white text-xs font-bold uppercase tracking-wider transition-colors">
                      Open <ChevronRight className="w-3.5 h-3.5" />
                    </Link>
                  </div>
                </div>
              );
            })}

            {sites.length === 0 && (
              <div className="col-span-full bg-slate-900 border-2 border-dashed border-slate-800 rounded-xl p-12 text-center">
                <MapPinned className="w-10 h-10 text-slate-700 mx-auto mb-3" />
                <p className="text-slate-400 mb-4">No installation sites yet.</p>
                <button onClick={() => setEditing(blankSite())}
                  className="bg-brand hover:bg-brand-dark text-white px-5 py-2 rounded-lg font-bold inline-flex items-center gap-2">
                  <Plus className="w-4 h-4" /> Add the first site
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {editing && (
        <SiteFormModal
          site={editing}
          onClose={() => setEditing(null)}
          onSaved={() => { setEditing(null); refresh(); }}
        />
      )}

      {uploadTarget && (
        <SiteQuickUpload site={uploadTarget} onClose={() => setUploadTarget(null)} onDone={refresh} />
      )}
    </div>
  );
}

// ── helpers ──
function Stat({ label, value, sub, icon: Icon, accent }) {
  const accentColors = {
    brand:  "text-brand",
    green:  "text-emerald-400",
    default: "text-white",
  };
  const c = accentColors[accent] || accentColors.default;
  return (
    <div className="bg-slate-900 px-3 py-3">
      <div className="flex items-center justify-between mb-1">
        <span className="text-[9px] uppercase tracking-[0.12em] text-slate-500 font-bold">{label}</span>
        {Icon && <Icon className={`w-3 h-3 ${c}`} />}
      </div>
      <p className={`text-base font-black tabular-nums ${c}`}>{value}</p>
      {sub && <p className="text-[9px] text-slate-600 font-mono mt-0.5 truncate">{sub}</p>}
    </div>
  );
}

function IconBtn({ onClick, title, danger, children }) {
  return (
    <button onClick={onClick} title={title}
      className={`p-1.5 rounded-md transition-colors ${
        danger
          ? "text-slate-500 hover:text-red-400 hover:bg-red-500/10"
          : "text-slate-500 hover:text-brand hover:bg-slate-800"
      }`}>
      {children}
    </button>
  );
}

