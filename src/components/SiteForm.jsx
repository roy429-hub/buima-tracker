import { useState } from "react";
import { X, MapPin, Loader2, CheckCircle2, AlertCircle, Settings } from "lucide-react";
import { upsertSite } from "../lib/storage";
import { geocodeAddress } from "../lib/geocode";

export function SiteFormModal({ site, onClose, onSaved }) {
  const [current, setCurrent] = useState(site);
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
        <div className="p-6">
          <SiteForm site={current} setSite={setCurrent} onSaved={onSaved} onCancel={onClose} />
        </div>
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
        <input type={type} value={value ?? ""} placeholder={placeholder}
          onChange={e => onChange(type === "number" ? +e.target.value : e.target.value)}
          className="flex-1 px-3 py-2 text-sm outline-none min-w-0" />
        {suffix && <span className="px-3 py-2 bg-slate-50 text-slate-500 text-sm border-l border-slate-200 whitespace-nowrap">{suffix}</span>}
      </div>
      {hint && <span className="text-[10px] text-slate-500 mt-1 block">{hint}</span>}
    </label>
  );
}

function SiteForm({ site, setSite, onSaved, onCancel }) {
  const u = (k) => (v) => setSite({ ...site, [k]: v });
  const [geo, setGeo] = useState({
    status: "idle",
    message: "",
    coords: site.lat && site.lng ? { lat: site.lat, lng: site.lng } : null,
  });
  const [saving, setSaving] = useState(false);

  const lookupAddress = async () => {
    if (!site.address?.trim()) {
      setGeo({ status: "error", message: "Please enter an address first.", coords: null });
      return;
    }
    setGeo({ status: "loading", message: "Looking up address…", coords: null });
    try {
      const r = await geocodeAddress(site.address);
      setSite({ ...site, lat: r.lat, lng: r.lng, country: site.country || r.country, city: site.city || r.city });
      setGeo({ status: "ok", message: r.displayName, coords: { lat: r.lat, lng: r.lng } });
    } catch (e) {
      setGeo({ status: "error", message: e.message, coords: null });
    }
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
        if (!inferredCity) inferredCity = r.city;
        if (!inferredCountry) inferredCountry = r.country;
      } catch (e) {
        const ok = confirm(`Geocoding failed: ${e.message}\n\nSave anyway? Site won't show on the map.`);
        if (!ok) { setGeo({ status: "error", message: e.message, coords: null }); return; }
      }
    }

    setSaving(true);
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
    } finally {
      setSaving(false);
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
        <button onClick={onCancel} type="button"
          className="px-4 py-2 text-slate-600 hover:bg-slate-100 rounded-lg text-sm font-bold">Cancel</button>
        <button onClick={save} type="button"
          className="bg-brand hover:bg-brand-dark text-white px-5 py-2 rounded-lg font-bold shadow-sm flex items-center gap-2"
          disabled={saving || geo.status === "loading"}>
          {(saving || geo.status === "loading") && <Loader2 className="w-4 h-4 animate-spin" />}
          {saving ? "Saving…" : "Save"}
        </button>
      </div>
    </div>
  );
}
