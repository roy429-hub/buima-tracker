// Parse Buima ESS "Control Box History" xlsx files.
// 5-minute snapshot logs from the PCS/BMS, with Modbus High/Low register pairs.
// Produces a per-day summary suitable for the Tracker ESS view.

import * as XLSX from "xlsx";

// 1-based column positions → 0-based JS indices
const COL = {
  startTime: 0,
  peripheralUID: 1,
  soc: 8,                // System State of Charge (×10 → percent)
  chargeCycles: 19,      // System Charge-Discharge Cycles
  soh: 20,               // State of Health (×10 → percent)
  sysPwrH: 22, sysPwrL: 23,
  sysChrgEnergyH: 27, sysChrgEnergyL: 28,
  sysDschrgEnergyH: 29, sysDschrgEnergyL: 30,
  // Daily counters (firmware may not populate; we also derive from cumulative deltas)
  chrgTodayH: 83, chrgTodayL: 84,
  dschrgTodayH: 85, dschrgTodayL: 86,
  // PCS cumulative energy registers (Wh)
  pcsGridEH: 92, pcsGridEL: 93, pcsGridPwr: 94,
  pcsBackupEH: 95, pcsBackupEL: 96, pcsBackupPwr: 97,
  pcsPvEH: 98, pcsPvEL: 99, pcsPvPwr: 100,
};

const combine = (h, l) => (Number(h) || 0) * 65536 + (Number(l) || 0);

// Convert raw signed-16 to signed integer (power registers come this way)
const signed16 = (v) => {
  const n = Number(v) || 0;
  return n > 32767 ? n - 65536 : n;
};

function parseStartTime(v) {
  if (v instanceof Date) return v;
  if (typeof v === "number") {
    const d = XLSX.SSF.parse_date_code(v);
    if (d) return new Date(d.y, d.m - 1, d.d, d.H, d.M, d.S);
  }
  const s = String(v).trim().replace(/\//g, "-");
  const d = new Date(s);
  return isNaN(d) ? null : d;
}

export function detectXlsxKind(headerRow) {
  // Returns "ev" | "ess" | null
  const lc = (i) => String(headerRow[i] || "").toLowerCase();
  if (lc(15).includes("connect 1") || lc(27).includes("connect 2")) return "ev";
  if (lc(98).includes("pv accumulated") || lc(8).includes("state of charge")) return "ess";
  return null;
}

export async function parseEssXlsx(file) {
  const buf = await file.arrayBuffer();
  const wb = XLSX.read(buf, { type: "array", cellDates: true });
  const ws = wb.Sheets[wb.SheetNames[0]];
  const raw = XLSX.utils.sheet_to_json(ws, { header: 1, raw: true });

  if (raw.length < 2) throw new Error("xlsx is empty");
  const header = raw[0];

  // Verify ESS format
  const kind = detectXlsxKind(header);
  if (kind !== "ess") {
    throw new Error("File does not look like an ESS Control Box xlsx (expected 'System State of Charge', 'PCS PV Accumulated Energy' headers)");
  }

  // Build rows ascending by time
  const rows = raw.slice(1)
    .map(r => ({ time: parseStartTime(r[0]), raw: r }))
    .filter(r => r.time)
    .sort((a, b) => a.time - b.time);

  if (rows.length === 0) throw new Error("No valid timestamp rows");

  // Dominant calendar date
  const dateCounts = new Map();
  for (const r of rows) {
    const key = r.time.toISOString().slice(0, 10);
    dateCounts.set(key, (dateCounts.get(key) || 0) + 1);
  }
  const reportDate = [...dateCounts.entries()].sort((a, b) => b[1] - a[1])[0][0];
  const chargerId  = String(rows[0].raw[COL.peripheralUID] || "").trim();

  // Filter to rows on the report date only
  const dayRows = rows.filter(r => r.time.toISOString().slice(0, 10) === reportDate);
  const first = dayRows[0], last = dayRows[dayRows.length - 1];

  // Cumulative energy deltas → today's flows (Wh → kWh)
  const pvStart   = combine(first.raw[COL.pcsPvEH],   first.raw[COL.pcsPvEL]);
  const pvEnd     = combine(last.raw[COL.pcsPvEH],    last.raw[COL.pcsPvEL]);
  const gridStart = combine(first.raw[COL.pcsGridEH], first.raw[COL.pcsGridEL]);
  const gridEnd   = combine(last.raw[COL.pcsGridEH],  last.raw[COL.pcsGridEL]);
  const chrgStart = combine(first.raw[COL.sysChrgEnergyH],   first.raw[COL.sysChrgEnergyL]);
  const chrgEnd   = combine(last.raw[COL.sysChrgEnergyH],    last.raw[COL.sysChrgEnergyL]);
  const dchrgStart = combine(first.raw[COL.sysDschrgEnergyH], first.raw[COL.sysDschrgEnergyL]);
  const dchrgEnd   = combine(last.raw[COL.sysDschrgEnergyH],  last.raw[COL.sysDschrgEnergyL]);

  // Daily counters (sometimes populated directly)
  const chrgTodayDirect = combine(last.raw[COL.chrgTodayH], last.raw[COL.chrgTodayL]) / 1000;
  const dschrgTodayDirect = combine(last.raw[COL.dschrgTodayH], last.raw[COL.dschrgTodayL]) / 1000;

  // Prefer direct daily counters if they're nonzero; otherwise use cumulative delta
  const pvKwh        = Math.max(0, (pvEnd - pvStart)) / 1000;
  const gridKwh      = Math.max(0, (gridEnd - gridStart)) / 1000;
  const chargedKwh   = chrgTodayDirect > 0 ? chrgTodayDirect : Math.max(0, (chrgEnd - chrgStart)) / 1000;
  const dischargedKwh = dschrgTodayDirect > 0 ? dschrgTodayDirect : Math.max(0, (dchrgEnd - dchrgStart)) / 1000;

  // SoC stats across the day
  const socs = dayRows.map(r => (Number(r.raw[COL.soc]) || 0) / 10).filter(v => v > 0);
  const peakSoc = socs.length ? Math.max(...socs) : 0;
  const minSoc  = socs.length ? Math.min(...socs) : 0;
  const avgSoc  = socs.length ? socs.reduce((s, v) => s + v, 0) / socs.length : 0;

  // Power peaks (PV / Grid / Backup) — these registers may be signed16 (W)
  const pvPeakW = dayRows.reduce((m, r) => Math.max(m, Math.abs(signed16(r.raw[COL.pcsPvPwr]))), 0);
  const gridPeakW = dayRows.reduce((m, r) => Math.max(m, Math.abs(signed16(r.raw[COL.pcsGridPwr]))), 0);

  // Cycles + SoH at end of day
  const cyclesEnd = Number(last.raw[COL.chargeCycles]) || 0;
  const cyclesStart = Number(first.raw[COL.chargeCycles]) || 0;
  const cyclesDelta = Math.max(0, cyclesEnd - cyclesStart);
  const soh = (Number(last.raw[COL.soh]) || 0) / 10;

  // Sample 1-minute SoC trace for the chart (every ~5 minutes)
  const trace = dayRows.map(r => ({
    t: r.time.toISOString(),
    soc: (Number(r.raw[COL.soc]) || 0) / 10,
    pvW: Math.max(0, signed16(r.raw[COL.pcsPvPwr])),
    gridW: signed16(r.raw[COL.pcsGridPwr]),
  }));

  return {
    reportDate,
    chargerId,
    kind: "ess",
    summary: {
      pvKwh:        +pvKwh.toFixed(2),
      gridKwh:      +gridKwh.toFixed(2),
      chargedKwh:   +chargedKwh.toFixed(2),
      dischargedKwh:+dischargedKwh.toFixed(2),
      peakSoc:      +peakSoc.toFixed(1),
      minSoc:       +minSoc.toFixed(1),
      avgSoc:       +avgSoc.toFixed(1),
      pvPeakW:      +pvPeakW.toFixed(0),
      gridPeakW:    +gridPeakW.toFixed(0),
      cyclesEnd, cyclesDelta,
      soh:          +soh.toFixed(1),
      samplesCount: dayRows.length,
      trace,
    },
  };
}
