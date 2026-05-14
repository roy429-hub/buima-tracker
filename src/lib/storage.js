// localStorage-backed data layer. Easy to swap for Supabase later.

const KEYS = {
  sites: "buima.sites",
  uploads: "buima.uploads",
};
const SCHEMA_VERSION_KEY = "buima.schema.v";
const CURRENT_SCHEMA_V = 3;

const read = (k, fallback) => {
  try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : fallback; }
  catch { return fallback; }
};
const write = (k, v) => localStorage.setItem(k, JSON.stringify(v));

// ---- Sites ----
export const getSites    = () => read(KEYS.sites, []);
export const saveSites   = (list) => write(KEYS.sites, list);
export const getSite     = (id) => getSites().find(s => s.id === id);
export const upsertSite  = (site) => {
  const all = getSites();
  const i = all.findIndex(s => s.id === site.id);
  if (i >= 0) all[i] = { ...all[i], ...site };
  else all.push({ ...site, createdAt: new Date().toISOString() });
  saveSites(all);
};
export const deleteSite  = (id) => {
  saveSites(getSites().filter(s => s.id !== id));
  saveUploads(getUploads().filter(u => u.siteId !== id));
};

// ---- Uploads ----
export const getUploads          = () => read(KEYS.uploads, []);
export const saveUploads         = (list) => write(KEYS.uploads, list);
export const getUploadsForSite   = (siteId) => getUploads().filter(u => u.siteId === siteId);
export const addUpload = (upload) => {
  const all = getUploads();
  // Dedupe by site+date — re-upload overwrites that date's record
  const filtered = all.filter(u => !(u.siteId === upload.siteId && u.reportDate === upload.reportDate));
  filtered.push({
    ...upload,
    id: crypto.randomUUID(),
    uploadedAt: new Date().toISOString(),
  });
  saveUploads(filtered);
};
export const deleteUpload = (id) => {
  saveUploads(getUploads().filter(u => u.id !== id));
};

// ---- Seed data ----
export function seedIfEmpty() {
  // Run lightweight schema migration on existing data
  const v = Number(localStorage.getItem(SCHEMA_VERSION_KEY) || 0);
  if (v < CURRENT_SCHEMA_V) {
    const sites = getSites();
    // Add new fields with defaults on existing rows
    const migrated = sites.map(s => ({
      address:      s.address      ?? `${s.city || ""}, ${s.country || ""}`.replace(/^, |, $/, ""),
      capex:        s.capex        ?? 0,
      opexMonthly:  s.opexMonthly  ?? 0,
      ...s,
    }));
    saveSites(migrated);
    localStorage.setItem(SCHEMA_VERSION_KEY, String(CURRENT_SCHEMA_V));
  }

  if (getSites().length > 0) return;

  const seed = [
    {
      id: "duiven",
      name: "Restaurant Nieuwe Tijd — Duiven",
      country: "Netherlands",
      city: "Duiven",
      address: "Roggekamp 4, 6921 RC Duiven, Netherlands",
      lat: 51.9477,
      lng: 6.0214,
      chargerId: "ffa388af-cfa2-4a",
      chargingFee: 0.67,
      costPerKwh: 0.21,
      capex: 45000,                  // estimated EUR CAPEX
      opexMonthly: 250,              // EUR/month — rent, maintenance, comms
      buimaSplitPct: 70,
      partnerSplitPct: 30,
      partnerName: "Zemovi (CPO)",
      currency: "EUR",
      active: true,
    },
    {
      id: "taipei-hq",
      name: "Buima HQ Demo — Taipei",
      country: "Taiwan",
      city: "Taipei",
      address: "Taipei 101, Xinyi District, Taipei, Taiwan",
      lat: 25.0330,
      lng: 121.5654,
      chargerId: "demo-taipei-01",
      chargingFee: 9.5,
      costPerKwh: 3.5,
      capex: 1400000,                // TWD CAPEX
      opexMonthly: 8000,             // TWD/month
      buimaSplitPct: 100,
      partnerSplitPct: 0,
      partnerName: "—",
      currency: "TWD",
      active: true,
    },
    {
      id: "tokyo-pilot",
      name: "Tokyo Pilot — Shibuya",
      country: "Japan",
      city: "Tokyo",
      address: "Shibuya Crossing, Shibuya City, Tokyo, Japan",
      lat: 35.6595,
      lng: 139.7004,
      chargerId: "demo-tokyo-01",
      chargingFee: 45,
      costPerKwh: 22,
      capex: 6000000,
      opexMonthly: 35000,            // JPY/month
      buimaSplitPct: 60,
      partnerSplitPct: 40,
      partnerName: "Local JV partner",
      currency: "JPY",
      active: true,
    },
  ];
  saveSites(seed);
  localStorage.setItem(SCHEMA_VERSION_KEY, String(CURRENT_SCHEMA_V));
}

// ---- Utils ----
export const currencySymbol = (code) => ({
  EUR: "€", USD: "$", GBP: "£", JPY: "¥", TWD: "NT$", CNY: "¥", AUD: "A$", CAD: "C$",
}[code] || code + " ");

export const fmt = (n, dp = 2) => {
  if (n === null || n === undefined || isNaN(n)) return "—";
  return Number(n).toLocaleString(undefined, { minimumFractionDigits: dp, maximumFractionDigits: dp });
};
export const fmt0 = (n) => fmt(n, 0);
