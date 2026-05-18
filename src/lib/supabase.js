import { createClient } from "@supabase/supabase-js";

const url     = import.meta.env.VITE_SUPABASE_URL;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!url || !anonKey) {
  console.error("Missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY. Check .env.local (dev) or Vercel project env vars (prod).");
}

export const supabase = createClient(url, anonKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
  },
});

// Convert DB row (snake_case) → app shape (camelCase)
const siteFromDB = (r) => r && ({
  id: r.id,
  name: r.name,
  country: r.country || "",
  city: r.city || "",
  address: r.address || "",
  lat: Number(r.lat) || 0,
  lng: Number(r.lng) || 0,
  chargerId: r.charger_id || "",
  chargingFee: Number(r.charging_fee) || 0,
  costPerKwh: Number(r.cost_per_kwh) || 0,
  capex: Number(r.capex) || 0,
  opexMonthly: Number(r.opex_monthly) || 0,
  contractYears: Number(r.contract_years) || 0,
  currency: r.currency || "USD",
  active: r.active !== false,
  shareToken: r.share_token,
  createdAt: r.created_at,
});

// Convert app shape → DB row payload
const siteToDB = (s) => ({
  name: s.name,
  country: s.country || "",
  city: s.city || "",
  address: s.address || "",
  lat: s.lat || 0,
  lng: s.lng || 0,
  charger_id: s.chargerId || "",
  charging_fee: s.chargingFee || 0,
  cost_per_kwh: s.costPerKwh || 0,
  capex: s.capex || 0,
  opex_monthly: s.opexMonthly || 0,
  contract_years: s.contractYears || 10,
  currency: s.currency || "USD",
  active: s.active !== false,
});

const uploadFromDB = (r) => r && ({
  id: r.id,
  siteId: r.site_id,
  reportDate: r.report_date,
  chargerId: r.charger_id || "",
  totalKwh: Number(r.total_kwh) || 0,
  totalSessions: r.total_sessions || 0,
  c1Sessions: r.c1_sessions || 0,
  c2Sessions: r.c2_sessions || 0,
  sessions: r.sessions || [],
  uploadedAt: r.uploaded_at,
});

const uploadToDB = (u) => ({
  site_id: u.siteId,
  report_date: u.reportDate,
  charger_id: u.chargerId || "",
  total_kwh: u.totalKwh || 0,
  total_sessions: u.totalSessions || 0,
  c1_sessions: u.c1Sessions || 0,
  c2_sessions: u.c2Sessions || 0,
  sessions: u.sessions || [],
});

// ─── Sites ───────────────────────────────────────────
export async function dbFetchSites() {
  const { data, error } = await supabase.from("sites").select("*").order("created_at", { ascending: true });
  if (error) throw error;
  return (data || []).map(siteFromDB);
}

export async function dbUpsertSite(site) {
  if (site.id) {
    const { data, error } = await supabase.from("sites").update(siteToDB(site)).eq("id", site.id).select().single();
    if (error) throw error;
    return siteFromDB(data);
  } else {
    const { data, error } = await supabase.from("sites").insert(siteToDB(site)).select().single();
    if (error) throw error;
    return siteFromDB(data);
  }
}

export async function dbDeleteSite(id) {
  const { error } = await supabase.from("sites").delete().eq("id", id);
  if (error) throw error;
}

// ─── Uploads ─────────────────────────────────────────
export async function dbFetchUploads() {
  const { data, error } = await supabase.from("uploads").select("*").order("report_date", { ascending: false });
  if (error) throw error;
  return (data || []).map(uploadFromDB);
}

export async function dbFetchUploadsForSite(siteId) {
  const { data, error } = await supabase.from("uploads").select("*")
    .eq("site_id", siteId).order("report_date", { ascending: false });
  if (error) throw error;
  return (data || []).map(uploadFromDB);
}

export async function dbAddUpload(upload) {
  // Upsert by (site_id, report_date) — re-uploading overwrites
  const { data, error } = await supabase
    .from("uploads")
    .upsert(uploadToDB(upload), { onConflict: "site_id,report_date" })
    .select().single();
  if (error) throw error;
  return uploadFromDB(data);
}

export async function dbDeleteUpload(id) {
  const { error } = await supabase.from("uploads").delete().eq("id", id);
  if (error) throw error;
}

// ─── Share Links (public read-only access) ───────────────
export async function dbFetchSiteByShareToken(token) {
  const { data, error } = await supabase.rpc("get_site_by_share_token", { token });
  if (error) throw error;
  if (!data || data.length === 0) return null;
  return siteFromDB(data[0]);
}

export async function dbFetchUploadsByShareToken(token) {
  const { data, error } = await supabase.rpc("get_uploads_by_share_token", { token });
  if (error) throw error;
  return (data || []).map(uploadFromDB);
}

export async function dbRegenerateShareToken(siteId) {
  const { data, error } = await supabase.rpc("regenerate_share_token", { site_id: siteId });
  if (error) throw error;
  return data; // new token string
}
