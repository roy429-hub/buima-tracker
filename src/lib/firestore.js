// Firestore data layer — drop-in replacement for ./supabase.js.
//
// Every exported name and signature matches the Supabase version, so
// storage.js and the page components need no changes beyond one import swap.
//
// ── Data model ────────────────────────────────────────────────────────
//   sites/{siteId}                      canonical site (staff only)
//   uploads/{siteId}__{reportDate}      canonical upload (staff only)
//   shared/{shareToken}                 PUBLIC copy of the site, 18 fields
//   shared/{shareToken}/uploads/{date}  PUBLIC copy of that site's uploads
//
// The /shared tree is the Firestore equivalent of the old SECURITY DEFINER
// RPCs. Rules cannot express "the caller knows a secret" unless the secret is
// the path, so the token IS the path. See firestore.rules.
//
// The mirror is written in the SAME batch as the canonical doc wherever a
// batch is possible, so the two cannot drift.
//
// The upload document id is `${siteId}__${reportDate}`, which reproduces the
// old `unique(site_id, report_date)` constraint — re-uploading a day
// overwrites it instead of creating a duplicate, with no extra check needed.

import { initializeApp } from "firebase/app";
import {
  getFirestore, collection, doc, getDoc, getDocs, setDoc, addDoc,
  deleteDoc, query, where, orderBy, writeBatch, serverTimestamp,
} from "firebase/firestore";
import { getAuth } from "firebase/auth";

const cfg = {
  apiKey:            import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain:        import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId:         import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket:     import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId:             import.meta.env.VITE_FIREBASE_APP_ID,
};

if (!cfg.apiKey || !cfg.projectId) {
  console.error(
    "Missing VITE_FIREBASE_* env vars. Check .env.local (dev) or the hosting env (prod)."
  );
}

export const app  = initializeApp(cfg);
export const db   = getFirestore(app);
export const auth = getAuth(app);

const SITES   = "sites";
const UPLOADS = "uploads";
const SHARED  = "shared";

const uploadId = (siteId, reportDate) => `${siteId}__${reportDate}`;

// ─── Shape conversion ────────────────────────────────────────────────
// Firestore stores camelCase already, so these mostly apply defaults —
// kept as explicit functions so the app-facing shape stays pinned in one place.

const num = (v, d = 0) => (v === null || v === undefined ? d : Number(v) || d);
const iso = (v) =>
  v && typeof v.toDate === "function" ? v.toDate().toISOString() : (v ?? null);

const siteFromDB = (id, r) => r && ({
  id,
  name: r.name,
  country: r.country || "",
  city: r.city || "",
  address: r.address || "",
  lat: num(r.lat),
  lng: num(r.lng),
  chargerId: r.chargerId || "",
  chargingFee: num(r.chargingFee),
  costPerKwh: num(r.costPerKwh),
  capex: num(r.capex),
  opexMonthly: num(r.opexMonthly),
  contractYears: num(r.contractYears),
  partnerName: r.partnerName || "",
  partnerEmail: r.partnerEmail || "",
  buimaSplitPct: num(r.buimaSplitPct, 100),
  partnerSplitPct: num(r.partnerSplitPct, 0),
  siteType: r.siteType || "ev",
  currency: r.currency || "USD",
  active: r.active !== false,
  shareToken: r.shareToken,
  // Set when the site's charging data arrives from Buima EMS instead of a
  // manual xlsx upload. Read-only here: it is written by the migration /
  // ems_sync tooling, and siteToDB deliberately omits it so that editing a
  // site in the UI cannot clear it (dbUpsertSite merges rather than replaces).
  emsSiteCode: r.emsSiteCode || "",
  createdAt: iso(r.createdAt),
});

const siteToDB = (s) => ({
  name: s.name,
  country: s.country || "",
  city: s.city || "",
  address: s.address || "",
  lat: num(s.lat),
  lng: num(s.lng),
  chargerId: s.chargerId || "",
  chargingFee: num(s.chargingFee),
  costPerKwh: num(s.costPerKwh),
  // ?? not || so an explicit 0 survives: a site may legitimately have
  // capex = 0 (undisclosed / NDA) or contractYears = 0 (no formal contract).
  capex:           s.capex           ?? 0,
  opexMonthly:     s.opexMonthly     ?? 0,
  contractYears:   s.contractYears   ?? 0,
  partnerName:     s.partnerName     ?? "",
  partnerEmail:    s.partnerEmail    ?? "",
  buimaSplitPct:   s.buimaSplitPct   ?? 100,
  partnerSplitPct: s.partnerSplitPct ?? 0,
  siteType: s.siteType || "ev",
  currency: s.currency || "USD",
  active: s.active !== false,
});

// Exactly the columns get_site_by_share_token() returned.
// partnerEmail and shareToken are DELIBERATELY ABSENT: the old RPC withheld
// them from anonymous callers, and putting them in the mirror would publish a
// partner's email address to anyone holding a share link.
// Do not "simplify" this into a spread of the whole site document.
const PUBLIC_SITE_FIELDS = [
  "name", "country", "city", "address", "lat", "lng", "chargerId",
  "chargingFee", "costPerKwh", "capex", "opexMonthly", "contractYears",
  "partnerName", "buimaSplitPct", "partnerSplitPct", "siteType",
  "currency", "active",
];

const sitePublic = (siteId, full) => {
  const out = { id: siteId };
  for (const k of PUBLIC_SITE_FIELDS) out[k] = full[k];
  return out;
};

const uploadFromDB = (id, r) => r && ({
  id,
  siteId: r.siteId,
  reportDate: r.reportDate,
  chargerId: r.chargerId || "",
  totalKwh: num(r.totalKwh),
  totalSessions: num(r.totalSessions),
  c1Sessions: num(r.c1Sessions),
  c2Sessions: num(r.c2Sessions),
  sessions: r.sessions || [],
  essSummary: r.essSummary || null,
  uploadedAt: iso(r.uploadedAt),
});

const uploadToDB = (u) => ({
  siteId: u.siteId,
  reportDate: u.reportDate,
  chargerId: u.chargerId || "",
  totalKwh: num(u.totalKwh),
  totalSessions: num(u.totalSessions),
  c1Sessions: num(u.c1Sessions),
  c2Sessions: num(u.c2Sessions),
  sessions: u.sessions || [],
  essSummary: u.essSummary || null,
});

// Firestore has no 1000-row response cap, so the .range() paging loop that
// supabase.js needed (fetchAllRows) has no equivalent here.
const mapSnap = (snap, fn) => snap.docs.map((d) => fn(d.id, d.data()));

// ─── Sites ───────────────────────────────────────────────────────────
export async function dbFetchSites() {
  // Deliberately NOT orderBy("createdAt"): a Firestore orderBy silently drops
  // every document that lacks the field, so one site with a missing createdAt
  // would disappear from the War Room with no error anywhere. The collection
  // is small (one doc per installation), so sort client-side instead, which
  // cannot lose a row. Matches the old `order by created_at asc, id asc`.
  const snap = await getDocs(collection(db, SITES));
  return mapSnap(snap, siteFromDB).sort((a, b) =>
    String(a.createdAt ?? "").localeCompare(String(b.createdAt ?? "")) ||
    String(a.id).localeCompare(String(b.id))
  );
}

export async function dbUpsertSite(site) {
  const payload = siteToDB(site);
  let id = site.id;
  let token = site.shareToken;

  if (!id) {
    token = token || newToken();
    const ref = await addDoc(collection(db, SITES), {
      ...payload, shareToken: token, createdAt: serverTimestamp(),
    });
    id = ref.id;
  } else {
    if (!token) {
      const cur = await getDoc(doc(db, SITES, id));
      token = (cur.exists() && cur.data().shareToken) || newToken();
    }
    await setDoc(doc(db, SITES, id), { ...payload, shareToken: token }, { merge: true });
  }

  // Keep the public mirror in step. An inactive site must vanish from its
  // share link entirely, because the old RPC filtered on `active = true`.
  const pubRef = doc(db, SHARED, token);
  if (payload.active) {
    await setDoc(pubRef, sitePublic(id, payload), { merge: true });
  } else {
    await deleteDoc(pubRef).catch(() => {});
  }

  return siteFromDB(id, { ...payload, shareToken: token, createdAt: site.createdAt });
}

export async function dbDeleteSite(id) {
  const snap = await getDoc(doc(db, SITES, id));
  const token = snap.exists() ? snap.data().shareToken : null;

  const ups = await getDocs(query(collection(db, UPLOADS), where("siteId", "==", id)));
  await chunkedDelete(ups.docs.map((d) => d.ref));

  if (token) {
    const pub = await getDocs(collection(db, SHARED, token, UPLOADS));
    await chunkedDelete(pub.docs.map((d) => d.ref));
    await deleteDoc(doc(db, SHARED, token)).catch(() => {});
  }
  await deleteDoc(doc(db, SITES, id));
}

// ─── Uploads ─────────────────────────────────────────────────────────
export async function dbFetchUploads() {
  const snap = await getDocs(
    query(collection(db, UPLOADS), orderBy("reportDate", "desc"))
  );
  return mapSnap(snap, uploadFromDB);
}

export async function dbFetchUploadsForSite(siteId) {
  const snap = await getDocs(query(
    collection(db, UPLOADS),
    where("siteId", "==", siteId),
    orderBy("reportDate", "desc"),
  ));
  return mapSnap(snap, uploadFromDB);
}

export async function dbAddUpload(upload) {
  const payload = uploadToDB(upload);
  const id = uploadId(payload.siteId, payload.reportDate);

  const site = await getDoc(doc(db, SITES, payload.siteId));
  const token = site.exists() ? site.data().shareToken : null;
  const active = site.exists() ? site.data().active !== false : false;

  // One batch: canonical and mirror land together or not at all.
  const batch = writeBatch(db);
  batch.set(doc(db, UPLOADS, id), { ...payload, uploadedAt: serverTimestamp() });
  if (token && active) {
    batch.set(
      doc(db, SHARED, token, UPLOADS, payload.reportDate),
      { ...payload, uploadedAt: serverTimestamp() },
    );
  }
  await batch.commit();

  return uploadFromDB(id, { ...payload, uploadedAt: new Date() });
}

export async function dbDeleteUpload(id) {
  const snap = await getDoc(doc(db, UPLOADS, id));
  if (!snap.exists()) return;
  const { siteId, reportDate } = snap.data();

  const site = await getDoc(doc(db, SITES, siteId));
  const token = site.exists() ? site.data().shareToken : null;

  const batch = writeBatch(db);
  batch.delete(doc(db, UPLOADS, id));
  if (token) batch.delete(doc(db, SHARED, token, UPLOADS, reportDate));
  await batch.commit();
}

// ─── Share links (public, read-only) ─────────────────────────────────
export async function dbFetchSiteByShareToken(token) {
  const snap = await getDoc(doc(db, SHARED, token));
  if (!snap.exists()) return null;
  const d = snap.data();
  if (d.active === false) return null;
  return siteFromDB(d.id, d);
}

export async function dbFetchUploadsByShareToken(token) {
  const snap = await getDocs(query(
    collection(db, SHARED, token, UPLOADS),
    orderBy("reportDate", "desc"),
  ));
  return mapSnap(snap, uploadFromDB);
}

export async function dbRegenerateShareToken(siteId) {
  const ref  = doc(db, SITES, siteId);
  const snap = await getDoc(ref);
  if (!snap.exists()) throw new Error("site not found");
  const site = snap.data();
  const old  = site.shareToken;
  const next = newToken();

  // Build the new mirror BEFORE tearing the old one down, so a reader is never
  // left with no valid link. Uploads are copied from the canonical collection
  // rather than from the old mirror — if the mirror had drifted, this repairs it.
  const ups = await getDocs(query(collection(db, UPLOADS), where("siteId", "==", siteId)));
  await setDoc(doc(db, SHARED, next), sitePublic(siteId, site));
  await chunkedWrite(ups.docs, (batch, d) => {
    const u = d.data();
    batch.set(doc(db, SHARED, next, UPLOADS, u.reportDate), u);
  });
  await setDoc(ref, { shareToken: next }, { merge: true });

  if (old && old !== next) {
    const stale = await getDocs(collection(db, SHARED, old, UPLOADS));
    await chunkedDelete(stale.docs.map((d) => d.ref));
    await deleteDoc(doc(db, SHARED, old)).catch(() => {});
  }
  return next;
}

// ─── helpers ─────────────────────────────────────────────────────────
// 32 hex chars, matching the old Postgres default
// replace(gen_random_uuid()::text, '-', '').
function newToken() {
  const b = new Uint8Array(16);
  crypto.getRandomValues(b);
  return [...b].map((x) => x.toString(16).padStart(2, "0")).join("");
}

// A Firestore write batch holds at most 500 operations.
const BATCH_MAX = 450;

async function chunkedDelete(refs) {
  for (let i = 0; i < refs.length; i += BATCH_MAX) {
    const batch = writeBatch(db);
    refs.slice(i, i + BATCH_MAX).forEach((r) => batch.delete(r));
    await batch.commit();
  }
}

async function chunkedWrite(docs, apply) {
  for (let i = 0; i < docs.length; i += BATCH_MAX) {
    const batch = writeBatch(db);
    docs.slice(i, i + BATCH_MAX).forEach((d) => apply(batch, d));
    await batch.commit();
  }
}
