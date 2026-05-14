// Storage layer — Supabase-backed with an in-memory cache for synchronous reads.
// Components call refreshFromDB() on mount; subsequent getSites()/getUploads()
// are synchronous reads against the cache. Mutations are async.

import {
  dbFetchSites, dbUpsertSite, dbDeleteSite,
  dbFetchUploads, dbAddUpload, dbDeleteUpload,
} from "./supabase";

let _sites = [];
let _uploads = [];
let _loaded = false;
const _listeners = new Set();

const notify = () => _listeners.forEach(fn => fn());

export const subscribe = (fn) => {
  _listeners.add(fn);
  return () => _listeners.delete(fn);
};

export async function refreshFromDB() {
  const [sites, uploads] = await Promise.all([dbFetchSites(), dbFetchUploads()]);
  _sites = sites;
  _uploads = uploads;
  _loaded = true;
  notify();
}

export const isLoaded = () => _loaded;

// ─── Sites (sync reads / async mutations) ─────────────────────────
export const getSites = () => _sites;
export const getSite  = (id) => _sites.find(s => s.id === id);

export async function upsertSite(site) {
  const saved = await dbUpsertSite(site);
  if (site.id) {
    _sites = _sites.map(s => s.id === saved.id ? saved : s);
  } else {
    _sites = [..._sites, saved];
  }
  notify();
  return saved;
}

export async function deleteSite(id) {
  await dbDeleteSite(id);
  _sites = _sites.filter(s => s.id !== id);
  // Cascade is handled DB-side, but clean cache too
  _uploads = _uploads.filter(u => u.siteId !== id);
  notify();
}

// ─── Uploads (sync reads / async mutations) ───────────────────────
export const getUploads        = () => _uploads;
export const getUploadsForSite = (siteId) => _uploads.filter(u => u.siteId === siteId);

export async function addUpload(upload) {
  const saved = await dbAddUpload(upload);
  // Replace any prior record for same site+date
  _uploads = _uploads.filter(u => !(u.siteId === saved.siteId && u.reportDate === saved.reportDate));
  _uploads = [saved, ..._uploads];
  notify();
  return saved;
}

export async function deleteUpload(id) {
  await dbDeleteUpload(id);
  _uploads = _uploads.filter(u => u.id !== id);
  notify();
}

// ─── Utilities ────────────────────────────────────────────────────
export const currencySymbol = (code) => ({
  EUR: "€", USD: "$", GBP: "£", JPY: "¥", TWD: "NT$", CNY: "¥", AUD: "A$", CAD: "C$",
}[code] || code + " ");

export const fmt = (n, dp = 2) => {
  if (n === null || n === undefined || isNaN(n)) return "—";
  return Number(n).toLocaleString(undefined, { minimumFractionDigits: dp, maximumFractionDigits: dp });
};
export const fmt0 = (n) => fmt(n, 0);
