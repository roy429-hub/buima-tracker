import { useState } from "react";
import { Link } from "react-router-dom";
import {
  Plus, Trash2, MapPin, Settings, ChevronRight, X, Loader2, CheckCircle2,
  AlertCircle, Upload, MapPinned, Zap, Activity, TrendingUp
} from "lucide-react";
import { getSites, upsertSite, deleteSite, currencySymbol } from "../lib/storage";
import { aggregateSite } from "../lib/aggregate";
import { fmtUSD, fmtCompact } from "../lib/fx";
import { geocodeAddress } from "../lib/geocode";
import { useStorageVersion } from "../lib/useStorage";
import SiteQuickUpload from "../components/SiteQuickUpload";

const blankSite = () => ({
  id: "", name: "", country: "", city: "", address: "",
  lat: 0, lng: 0, chargerId: "",
  chargingFee: 0, costPerKwh: 0, capex: 0, opexMonthly: 0,
  buimaSplitPct: 70, partnerSplitPct: 30, partnerName: "",
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

                  {/* ROI bar */}
                  {site.capex > 0 && (
                    <div className="bg-slate-900 px-5 py-2.5 border-t border-slate-800">
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-[9px] uppercase tracking-[0.15em] text-slate-500 font-bold">ROI to date</span>
                        <span className={`text-xs font-black tabular-nums ${agg.roi >= 100 ? "text-emerald-400" : agg.roi >= 50 ? "text-amber-400" : "text-slate-400"}`}>
                          {agg.roi.toFixed(1)}%
                        </span>
                      </div>
                      <div className="h-1 bg-slate-800 rounded-full overflow-hidden">
                        <div className={`h-full transition-all ${agg.roi >= 100 ? "bg-emerald-500" : agg.roi >= 50 ? "bg-amber-500" : "bg-brand"}`}
                          style={{ width: `${Math.min(100, Math.max(0, agg.roi))}%` }} />
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
        <Modal onClose={() => setEditing(null)}>
          <SiteForm site={editing} setSite={setEditing} onSaved={() => { setEditing(null); refresh(); }} />
        </Modal>
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

// ── Modal (keeps light theme — better for forms) ──
function Modal({ children, onClose }) {
  return (
    <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto"
        onClick={e => e.stopPropagation()}>
        <div className="sticky top-0 bg-gradient-to-r from-slate-950 to-slate-900 text-white px-6 py-4 flex justify-between items-center z-10 border-b border-slate-700">
          <h3 className="font-bold flex items-center gap-2">
            <Settings className="w-4 h-4 text-brand" />
            <span>Site Configuration</span>
          </h3>
          <button onClick={onClose} className="text-slate-400 hover:text-white"><X className="w-5 h-5" /></button>
        </div>
        <div className="p-6">{children}</div>
      </div>
    </div>
  );
}

function Field({ label, value, onChange, type = "text", suffix, prefix, placeholder, hint }) {
  return (
    <label className="block">
      <span className="text-[11px] font-bold text-slate-700 uppercase tracking-wider">{label}</span>
      <div className="flex items-center mt-1 border border-slate-300 rounded-lg overflow-hidden focus-within:border-brand focus-within:ring-2 focus-within:ring-brand/20 bg-white">
        {prefix && <span className="px-3 py-2 bg-slate-50 text-slate-500 text-sm border-r border-slate-200">{prefix}</span>}
        <input type={type} value={value} placeholder={placeholder}
          onChange={e => onChange(type === "number" ? +e.target.value : e.target.value)}
          className="flex-1 px-3 py-2 text-sm outline-none min-w-0" />
        {suffix && <span className="px-3 py-2 bg-slate-50 text-slate-500 text-sm border-l border-slate-200 whitespace-nowrap">{suffix}</span>}
      </div>
      {hint && <span className="text-[10px] text-slate-500 mt-1 block">{hint}</span>}
    </label>
  );
}

function SiteForm({ site, setSite, onSaved }) {
  const u = (k) => (v) => setSite({ ...site, [k]: v });
  const [geo, setGeo] = useState({ status: "idle", message: "", coords: site.lat && site.lng ? { lat: site.lat, lng: site.lng } : null });

  const lookupAddress = async () => {
    if (!site.address?.trim()) { setGeo({ status: "error", message: "Please enter an address first.", coords: null }); return; }
    setGeo({ status: "loading", message: "Looking up address…", coords: null });
    try {
      const r = await geocodeAddress(site.address);
      setSite({ ...site, lat: r.lat, lng: r.lng, country: site.country || r.country, city: site.city || r.city });
      setGeo({ status: "ok", message: r.displayName, coords: { lat: r.lat, lng: r.lng } });
    } catch (e) { setGeo({ status: "error", message: e.message, coords: null }); }
  };

  const save = async () => {
    if (!site.name?.trim()) return alert("Please enter a site name.");
    if (!site.address?.trim()) return alert("Please enter an address.");

    let coords = { lat: site.lat, lng: site.lng };
    let inferredCity = site.city, inferredCountry = site.country;
    if (!coords.lat || !coords.lng) {
      try {
        setGeo({ status: "loading", message: "Geocoding…", coords: null });
        const r = await geocodeAddress(site.address);
        coords = { lat: r.lat, lng: r.lng };
        if (!inferredCity)    inferredCity = r.city;
        if (!inferredCountry) inferredCountry = r.country;
      } catch (e) {
        const ok = confirm(`Geocoding failed: ${e.message}\n\nSave anyway? Site won't show on the map.`);
        if (!ok) { setGeo({ status: "error", message: e.message, coords: null }); return; }
      }
    }

    try {
      await upsertSite({
        ...site,
        city: inferredCity,
        country: inferredCountry,
        lat: coords.lat || 0,
        lng: coords.lng || 0,
      });
      onSaved?.();
    } catch (e) {
      setGeo({ status: "error", message: e.message || "Save failed", coords: null });
    }
  };

  return (
    <div className="space-y-4">
      <p className="text-xs font-bold text-brand uppercase tracking-wider">Basic Info</p>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Field label="Site Name *" value={site.name} onChange={u("name")} placeholder="e.g., Restaurant Nieuwe Tijd — Duiven" />
        <Field label="Charger ID" value={site.chargerId} onChange={u("chargerId")} placeholder="e.g., ffa388af-cfa2-4a" />
      </div>

      <Field label="Address *" value={site.address} onChange={u("address")}
        placeholder="Roggekamp 4, 6921 RC Duiven, Netherlands"
        hint="Used to place the marker on the World Map. We auto-geocode this address." />

      <div className="flex items-center gap-3 -mt-2 flex-wrap">
        <button onClick={lookupAddress} disabled={geo.status === "loading"} type="button"
          className="flex items-center gap-1.5 text-xs font-bold text-brand hover:text-brand-dark disabled:opacity-50">
          {geo.status === "loading" ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <MapPin className="w-3.5 h-3.5" />}
          {geo.status === "loading" ? "Looking up…" : "Verify Address"}
        </button>
        {geo.status === "ok" && (
          <span className="flex items-center gap-1 text-xs text-emerald-700 min-w-0">
            <CheckCircle2 className="w-3.5 h-3.5 flex-shrink-0" />
            <span className="truncate">{geo.message}</span>
          </span>
        )}
        {geo.status === "error" && (
          <span className="flex items-center gap-1 text-xs text-red-600">
            <AlertCircle className="w-3.5 h-3.5" /> {geo.message}
          </span>
        )}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Field label="City (optional)" value={site.city} onChange={u("city")} hint="Auto-filled from address if blank." />
        <Field label="Country (optional)" value={site.country} onChange={u("country")} hint="Auto-filled from address if blank." />
      </div>

      <hr className="border-slate-200" />
      <p className="text-xs font-bold text-brand uppercase tracking-wider">Financial Parameters</p>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Field label="Currency (3-letter)" value={site.currency} onChange={u("currency")}
          hint="USD, EUR, GBP, JPY, TWD, CNY, AUD, CAD…" />
        <Field label="CAPEX (Total Investment)" type="number" value={site.capex} onChange={u("capex")}
          suffix={site.currency} hint="One-time upfront investment. Used to compute ROI." />
        <Field label="OPEX (Monthly Fixed Cost)" type="number" value={site.opexMonthly} onChange={u("opexMonthly")}
          suffix={`${site.currency}/mo`} hint="Rent, maintenance, comms — subtracted from net profit." />
        <Field label="Charging Fee" type="number" value={site.chargingFee} onChange={u("chargingFee")}
          suffix={`${site.currency}/kWh`} hint="What customer pays per kWh." />
        <Field label="Variable Cost per kWh" type="number" value={site.costPerKwh} onChange={u("costPerKwh")}
          suffix={`${site.currency}/kWh`} hint="Electricity + location share per kWh." />
      </div>

      <hr className="border-slate-200" />
      <p className="text-xs font-bold text-brand uppercase tracking-wider">Partner / Split (internal reference)</p>
      <p className="text-[11px] text-slate-500 -mt-2">Profit split with partner — not used in headline ROI calculations.</p>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Field label="Partner Name" value={site.partnerName} onChange={u("partnerName")}
          placeholder="e.g., Zemovi (CPO)" />
        <Field label="Buima Split" type="number" value={site.buimaSplitPct}
          onChange={(v) => setSite({ ...site, buimaSplitPct: v, partnerSplitPct: 100 - v })} suffix="%" />
      </div>

      <div className="flex items-center justify-end gap-2 pt-4 border-t border-slate-100">
        <button onClick={() => setSite(null)} className="px-4 py-2 text-slate-600 hover:bg-slate-100 rounded-lg text-sm font-bold">Cancel</button>
        <button onClick={save} className="bg-brand hover:bg-brand-dark text-white px-5 py-2 rounded-lg font-bold shadow-sm flex items-center gap-2"
          disabled={geo.status === "loading"}>
          {geo.status === "loading" && <Loader2 className="w-4 h-4 animate-spin" />}
          Save
        </button>
      </div>
    </div>
  );
}
