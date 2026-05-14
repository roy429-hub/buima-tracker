// Parse Buima EV charger 5-min interval xlsx files.
// Mirrors the Python session-detection logic verified against real data.

import * as XLSX from "xlsx";

// 1-based column positions from the file → 0-based JS indices
const COL = {
  startTime: 0,
  peripheralUID: 1,
  maxPower: 12,
  c1Status: 15, c1SoC: 16, c1PwrH: 17, c1PwrL: 18,
  c1VoltH: 19, c1VoltL: 20, c1CurrH: 21, c1CurrL: 22,
  c1KwhH: 23, c1KwhL: 24, c1DurH: 25, c1DurL: 26,
  c2Status: 27, c2SoC: 28, c2PwrH: 29, c2PwrL: 30,
  c2VoltH: 31, c2VoltL: 32, c2CurrH: 33, c2CurrL: 34,
  c2KwhH: 35, c2KwhL: 36, c2DurH: 37, c2DurL: 38,
};

const combine = (h, l) => (Number(h) || 0) * 65536 + (Number(l) || 0);

function parseStartTime(v) {
  if (v instanceof Date) return v;
  if (typeof v === "number") {
    // Excel serial date
    const d = XLSX.SSF.parse_date_code(v);
    if (d) return new Date(d.y, d.m - 1, d.d, d.H, d.M, d.S);
  }
  // Strings like "2026/04/09 23:55:43"
  const s = String(v).trim().replace(/\//g, "-");
  const d = new Date(s);
  return isNaN(d) ? null : d;
}

function analyzeGun(rows, gunName, statusI, socI, pwrH, pwrL, kwhH, kwhL, durH, durL) {
  const sessions = [];
  let inSession = false;
  let curStart = null;
  let cur = { kwh: 0, dur: 0, peakKw: 0, endSoc: 0 };
  let prevKwh = 0;

  for (const row of rows) {
    const t      = row.time;
    const st     = row.raw[statusI];
    const soc    = Number(row.raw[socI]) || 0;
    const pwr    = combine(row.raw[pwrH], row.raw[pwrL]) / 1000; // kW
    const kwh    = combine(row.raw[kwhH], row.raw[kwhL]) / 1000; // kWh
    const dur    = combine(row.raw[durH], row.raw[durL]);         // seconds

    const active = st === 8 || st === 10;
    const kwhReset = inSession && prevKwh > 5 && kwh < prevKwh - 5;

    if (active && !inSession) {
      inSession = true;
      curStart = t;
      cur = { kwh, dur, peakKw: pwr, endSoc: soc };
    } else if (active && inSession && kwhReset) {
      sessions.push({ gun: gunName, start: curStart, end: t, ...cur });
      curStart = t;
      cur = { kwh, dur, peakKw: pwr, endSoc: soc };
    } else if (active && inSession) {
      if (kwh > cur.kwh) cur.kwh = kwh;
      if (dur > cur.dur) cur.dur = dur;
      if (pwr > cur.peakKw) cur.peakKw = pwr;
      if (soc > cur.endSoc) cur.endSoc = soc;
    } else if (!active && inSession) {
      sessions.push({ gun: gunName, start: curStart, end: t, ...cur });
      inSession = false;
      cur = { kwh: 0, dur: 0, peakKw: 0, endSoc: 0 };
    }
    prevKwh = kwh;
  }
  if (inSession) {
    sessions.push({ gun: gunName, start: curStart, end: rows[rows.length - 1].time, ...cur });
  }
  return sessions;
}

export async function parseChargerXlsx(file) {
  const buf = await file.arrayBuffer();
  const wb = XLSX.read(buf, { type: "array", cellDates: true });
  const ws = wb.Sheets[wb.SheetNames[0]];
  const raw = XLSX.utils.sheet_to_json(ws, { header: 1, raw: true });

  if (raw.length < 2) throw new Error("xlsx is empty");
  const header = raw[0];

  // Light sanity check: expect "StartTime" and "Connect 1 System Status" headers
  const hasStart = String(header[0]).toLowerCase().includes("starttime");
  const hasC1    = String(header[15] || "").toLowerCase().includes("connect 1");
  if (!hasStart || !hasC1) {
    throw new Error("File does not look like a Buima EV charger history xlsx");
  }

  // Build rows with parsed timestamps, then sort ascending
  const rows = raw.slice(1)
    .map(r => ({ time: parseStartTime(r[0]), raw: r }))
    .filter(r => r.time)
    .sort((a, b) => a.time - b.time);

  if (rows.length === 0) throw new Error("No valid timestamp rows");

  const c1 = analyzeGun(rows, "C1", COL.c1Status, COL.c1SoC,
    COL.c1PwrH, COL.c1PwrL, COL.c1KwhH, COL.c1KwhL, COL.c1DurH, COL.c1DurL);
  const c2 = analyzeGun(rows, "C2", COL.c2Status, COL.c2SoC,
    COL.c2PwrH, COL.c2PwrL, COL.c2KwhH, COL.c2KwhL, COL.c2DurH, COL.c2DurL);

  const sessions = [...c1, ...c2].sort((a, b) => a.start - b.start);

  // Use the dominant calendar date (most rows fall on this date)
  const dateCounts = new Map();
  for (const r of rows) {
    const key = r.time.toISOString().slice(0, 10);
    dateCounts.set(key, (dateCounts.get(key) || 0) + 1);
  }
  const reportDate = [...dateCounts.entries()].sort((a, b) => b[1] - a[1])[0][0];

  const chargerId = String(rows[0].raw[COL.peripheralUID] || "").trim();

  const totalKwh = sessions.reduce((s, x) => s + x.kwh, 0);

  return {
    reportDate,
    chargerId,
    totalKwh,
    totalSessions: sessions.length,
    c1Sessions: c1.length,
    c2Sessions: c2.length,
    sessions: sessions.map(s => ({
      gun: s.gun,
      start: s.start.toISOString(),
      end: s.end.toISOString(),
      kwh: +s.kwh.toFixed(2),
      durationMin: +(s.dur / 60).toFixed(1),
      peakKw: +s.peakKw.toFixed(2),
      endSoc: s.endSoc,
    })),
  };
}
