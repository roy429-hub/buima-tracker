// Firestore security-rules tests, run against the local emulator.
//
//   npm run test:rules
//
// These guard the two access tiers the Supabase schema had, which are the
// riskiest part of the GCP migration: the sites/uploads collections hold every
// customer's CAPEX, revenue and partner split, and the share link is handed to
// customers and investors.
//
// Each rule gets BOTH controls: a positive case proving the allowed thing
// still works, and a negative case proving the forbidden thing actually fails.
// A test file with only positive cases would pass against `allow read: if true`.

import {
  initializeTestEnvironment, assertFails, assertSucceeds,
} from "@firebase/rules-unit-testing";
import {
  doc, getDoc, setDoc, deleteDoc, collection, getDocs,
} from "firebase/firestore";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, "..");
const TOKEN = "b7e93740e3f948308a698240572bce99";   // shape of a real token
const SITE  = "ed7ba22e-d386-4ba2-a1e9-931f0e3a94c5";

let pass = 0, fail = 0;
const results = [];

async function check(name, fn) {
  try {
    await fn();
    pass++; results.push(`  PASS  ${name}`);
  } catch (e) {
    fail++; results.push(`  FAIL  ${name}\n          ${String(e).split("\n")[0]}`);
  }
}

const env = await initializeTestEnvironment({
  projectId: "buima-website",
  firestore: {
    rules: readFileSync(join(ROOT, "firestore.rules"), "utf8"),
    host: "127.0.0.1",
    port: 8578,
  },
});

// Seed through a context that bypasses rules, so the fixtures themselves are
// not what is under test.
await env.withSecurityRulesDisabled(async (ctx) => {
  const db = ctx.firestore();
  await setDoc(doc(db, "sites", SITE), {
    name: "Restaurant Nieuwe Tijd", active: true, capex: 35500,
    partnerEmail: "partner@example.com", shareToken: TOKEN,
  });
  await setDoc(doc(db, "uploads", `${SITE}__2026-11-08`), {
    siteId: SITE, reportDate: "2026-11-08", totalKwh: 85.024,
  });
  // The public mirror: note it carries NO partnerEmail and NO shareToken.
  await setDoc(doc(db, "shared", TOKEN), {
    id: SITE, name: "Restaurant Nieuwe Tijd", active: true, capex: 35500,
  });
  await setDoc(doc(db, "shared", TOKEN, "uploads", "2026-11-08"), {
    siteId: SITE, reportDate: "2026-11-08", totalKwh: 85.024,
  });
  await setDoc(doc(db, "shared", "someothertoken00000000000000000"), {
    id: "other", name: "Another site", active: true,
  });
});

const anon  = env.unauthenticatedContext().firestore();
const staff = env.authenticatedContext("staff-uid",
  { email: "ops@buimaenergy.com" }).firestore();

// ── Tier 1: staff ────────────────────────────────────────────────────
await check("staff CAN read a site", () =>
  assertSucceeds(getDoc(doc(staff, "sites", SITE))));
await check("staff CAN list sites", () =>
  assertSucceeds(getDocs(collection(staff, "sites"))));
await check("staff CAN write a site", () =>
  assertSucceeds(setDoc(doc(staff, "sites", SITE), { name: "x" }, { merge: true })));
await check("staff CAN read uploads", () =>
  assertSucceeds(getDocs(collection(staff, "uploads"))));
await check("staff CAN write the public mirror", () =>
  assertSucceeds(setDoc(doc(staff, "shared", TOKEN), { name: "y" }, { merge: true })));

// ── Tier 2: anonymous share-link visitor ─────────────────────────────
// The things they MUST be able to do:
await check("anon CAN get the shared site by a known token", () =>
  assertSucceeds(getDoc(doc(anon, "shared", TOKEN))));
await check("anon CAN list that token's uploads", () =>
  assertSucceeds(getDocs(collection(anon, "shared", TOKEN, "uploads"))));

// The things they MUST NOT be able to do:
await check("anon CANNOT read the canonical site", () =>
  assertFails(getDoc(doc(anon, "sites", SITE))));
await check("anon CANNOT list sites", () =>
  assertFails(getDocs(collection(anon, "sites"))));
await check("anon CANNOT read a canonical upload", () =>
  assertFails(getDoc(doc(anon, "uploads", `${SITE}__2026-11-08`))));
await check("anon CANNOT list uploads", () =>
  assertFails(getDocs(collection(anon, "uploads"))));
await check("anon CANNOT ENUMERATE tokens by listing /shared", () =>
  assertFails(getDocs(collection(anon, "shared"))));
await check("anon CANNOT write the public mirror", () =>
  assertFails(setDoc(doc(anon, "shared", TOKEN), { name: "hacked" })));
await check("anon CANNOT write a canonical site", () =>
  assertFails(setDoc(doc(anon, "sites", SITE), { capex: 0 })));
await check("anon CANNOT delete a shared upload", () =>
  assertFails(deleteDoc(doc(anon, "shared", TOKEN, "uploads", "2026-11-08"))));
await check("anon CANNOT read an unrelated collection", () =>
  assertFails(getDoc(doc(anon, "secrets", "anything"))));

// ── Static guard: the public mirror must not leak partner contact data ──
// Rules cannot express this (it is about which fields the client writes), so
// assert it against the source of truth in firestore.js. This is the guard
// against someone "simplifying" sitePublic() into a spread of the whole doc.
await check("firestore.js PUBLIC_SITE_FIELDS excludes partnerEmail/shareToken", () => {
  const src = readFileSync(join(ROOT, "src", "lib", "firestore.js"), "utf8");
  const m = src.match(/const PUBLIC_SITE_FIELDS = \[([\s\S]*?)\];/);
  if (!m) throw new Error("PUBLIC_SITE_FIELDS not found in firestore.js");
  const fields = [...m[1].matchAll(/"([a-zA-Z]+)"/g)].map((x) => x[1]);
  for (const banned of ["partnerEmail", "shareToken"]) {
    if (fields.includes(banned)) {
      throw new Error(`${banned} is in PUBLIC_SITE_FIELDS — it would be published `
                    + `to anyone holding a share link`);
    }
  }
  if (fields.length !== 18) {
    throw new Error(`expected 18 public fields, found ${fields.length}: `
                  + `the old get_site_by_share_token() returned exactly 18`);
  }
});

await env.cleanup();

console.log("\nFirestore rules\n" + results.join("\n"));
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
