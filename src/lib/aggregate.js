// Aggregate uploads across day / week / month / year periods.
import { getUploadsForSite } from "./storage";
import { toUSD } from "./fx";

const isoWeek = (d) => {
  const date = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  date.setUTCDate(date.getUTCDate() + 4 - (date.getUTCDay() || 7));
  const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
  const weekNo = Math.ceil(((date - yearStart) / 86400000 + 1) / 7);
  return `${date.getUTCFullYear()}-W${String(weekNo).padStart(2, "0")}`;
};

const monthKey = (d) => `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
const yearKey  = (d) => `${d.getUTCFullYear()}`;
const dayKey   = (d) => d.toISOString().slice(0, 10);

// ── Gap-fillers: insert zero buckets for any missing periods between firstDate and lastDate ──
const zeroBucket = (key) => ({ key, kwh: 0, sessions: 0, c1: 0, c2: 0, minutes: 0, revenue: 0, cost: 0, opex: 0, profit: 0, days: 0 });

function fillDaily(series, firstDate, lastDate) {
  if (!firstDate || !lastDate) return series;
  const byKey = new Map(series.map(b => [b.key, b]));
  const out = [];
  const cur = new Date(Date.UTC(firstDate.getUTCFullYear(), firstDate.getUTCMonth(), firstDate.getUTCDate()));
  const end = new Date(Date.UTC(lastDate.getUTCFullYear(), lastDate.getUTCMonth(), lastDate.getUTCDate()));
  while (cur <= end) {
    const k = cur.toISOString().slice(0, 10);
    out.push(byKey.get(k) || zeroBucket(k));
    cur.setUTCDate(cur.getUTCDate() + 1);
  }
  return out;
}

function fillWeekly(series, firstDate, lastDate) {
  if (!firstDate || !lastDate) return series;
  const byKey = new Map(series.map(b => [b.key, b]));
  const out = [];
  // Snap firstDate to its Monday-of-week
  const start = new Date(Date.UTC(firstDate.getUTCFullYear(), firstDate.getUTCMonth(), firstDate.getUTCDate()));
  start.setUTCDate(start.getUTCDate() - ((start.getUTCDay() + 6) % 7)); // back to Monday
  const end = new Date(Date.UTC(lastDate.getUTCFullYear(), lastDate.getUTCMonth(), lastDate.getUTCDate()));
  const cur = new Date(start);
  while (cur <= end) {
    const k = isoWeek(cur);
    out.push(byKey.get(k) || zeroBucket(k));
    cur.setUTCDate(cur.getUTCDate() + 7);
  }
  // dedupe (in case of edge cases)
  const seen = new Set();
  return out.filter(b => seen.has(b.key) ? false : (seen.add(b.key), true));
}

function fillMonthly(series, firstDate, lastDate) {
  if (!firstDate || !lastDate) return series;
  const byKey = new Map(series.map(b => [b.key, b]));
  const out = [];
  const cur = new Date(Date.UTC(firstDate.getUTCFullYear(), firstDate.getUTCMonth(), 1));
  const end = new Date(Date.UTC(lastDate.getUTCFullYear(), lastDate.getUTCMonth(), 1));
  while (cur <= end) {
    const k = monthKey(cur);
    out.push(byKey.get(k) || zeroBucket(k));
    cur.setUTCMonth(cur.getUTCMonth() + 1);
  }
  return out;
}

function fillYearly(series, firstDate, lastDate) {
  if (!firstDate || !lastDate) return series;
  const byKey = new Map(series.map(b => [b.key, b]));
  const out = [];
  for (let y = firstDate.getUTCFullYear(); y <= lastDate.getUTCFullYear(); y++) {
    const k = String(y);
    out.push(byKey.get(k) || zeroBucket(k));
  }
  return out;
}

export function aggregateSite(siteId, site) {
  const uploads = getUploadsForSite(siteId);
  // OPEX is monthly, allocate per day → / ~30.42 (avg days/month)
  const opexPerDay = (site.opexMonthly || 0) / 30.4375;

  const totals = {
    totalKwh: 0,
    totalSessions: 0,
    totalC1: 0,
    totalC2: 0,
    totalDays: uploads.length,
    grossRevenue: 0,
    variableCost: 0,    // kWh × costPerKwh
    fixedOpex: 0,       // opexPerDay × totalDays
    totalCost: 0,
    netProfit: 0,       // Revenue − variableCost − fixedOpex (this is the headline number)
    buimaProfit: 0,     // split for reference only (not displayed prominently)
    partnerProfit: 0,
    firstDate: null,
    lastDate: null,
    avgKwhPerDay: 0,
    avgSessionsPerDay: 0,
    avgKwhPerSession: 0,
    totalChargeMinutes: 0,
    // USD totals (for cross-site aggregation)
    grossRevenueUSD: 0,
    netProfitUSD: 0,
    buimaProfitUSD: 0,
    partnerProfitUSD: 0,
    fixedOpexUSD: 0,
    capexUSD: toUSD(site.capex || 0, site.currency),
    roi: 0,             // %  = netProfit / capex (NO split applied)
  };

  const byDay = {}, byWeek = {}, byMonth = {}, byYear = {};

  const bucket = (k, store) => store[k] || (store[k] = {
    key: k, kwh: 0, sessions: 0, c1: 0, c2: 0, minutes: 0,
    revenue: 0, cost: 0, opex: 0, profit: 0, days: new Set(),
  });

  uploads.forEach(u => {
    const d = new Date(u.reportDate);
    const kwh = u.totalKwh || 0;
    const sess = u.totalSessions || 0;
    const c1 = u.c1Sessions || 0;
    const c2 = u.c2Sessions || 0;
    const rev = kwh * (site.chargingFee || 0);
    const varCost = kwh * (site.costPerKwh || 0);
    const fixedDay = opexPerDay;
    const profit = rev - varCost - fixedDay;
    const minutes = (u.sessions || []).reduce((s, x) => s + (x.durationMin || 0), 0);

    totals.totalKwh += kwh;
    totals.totalSessions += sess;
    totals.totalC1 += c1;
    totals.totalC2 += c2;
    totals.grossRevenue += rev;
    totals.variableCost += varCost;
    totals.fixedOpex    += fixedDay;
    totals.totalCost    += varCost + fixedDay;
    totals.netProfit    += profit;
    totals.totalChargeMinutes += minutes;
    if (!totals.firstDate || d < totals.firstDate) totals.firstDate = d;
    if (!totals.lastDate || d > totals.lastDate) totals.lastDate = d;

    [[dayKey(d), byDay], [isoWeek(d), byWeek], [monthKey(d), byMonth], [yearKey(d), byYear]].forEach(([k, store]) => {
      const b = bucket(k, store);
      b.kwh += kwh; b.sessions += sess; b.c1 += c1; b.c2 += c2;
      b.minutes += minutes;
      b.revenue += rev; b.cost += varCost; b.opex += fixedDay;
      b.profit += profit;
      b.days.add(dayKey(d));
    });
  });

  const finalize = (s) => Object.values(s).map(b => ({ ...b, days: b.days.size })).sort((a, b) => a.key.localeCompare(b.key));

  totals.avgKwhPerDay = totals.totalDays ? totals.totalKwh / totals.totalDays : 0;
  totals.avgSessionsPerDay = totals.totalDays ? totals.totalSessions / totals.totalDays : 0;
  totals.avgKwhPerSession = totals.totalSessions ? totals.totalKwh / totals.totalSessions : 0;

  // Split (kept for internal reference, not shown on War Room)
  totals.buimaProfit   = totals.netProfit * (site.buimaSplitPct || 0) / 100;
  totals.partnerProfit = totals.netProfit * (site.partnerSplitPct || 0) / 100;

  // USD conversions
  totals.grossRevenueUSD = toUSD(totals.grossRevenue, site.currency);
  totals.netProfitUSD    = toUSD(totals.netProfit,    site.currency);
  totals.buimaProfitUSD  = toUSD(totals.buimaProfit,  site.currency);
  totals.partnerProfitUSD = toUSD(totals.partnerProfit, site.currency);
  totals.fixedOpexUSD    = toUSD(totals.fixedOpex,    site.currency);

  // ROI: total net profit / total CAPEX  (no split adjustment)
  totals.roi = (site.capex || 0) > 0 ? (totals.netProfit / site.capex) * 100 : 0;

  const dailyRaw   = finalize(byDay);
  const weeklyRaw  = finalize(byWeek);
  const monthlyRaw = finalize(byMonth);
  const yearlyRaw  = finalize(byYear);

  return {
    totals,
    daily:   fillDaily(dailyRaw,     totals.firstDate, totals.lastDate),
    weekly:  fillWeekly(weeklyRaw,   totals.firstDate, totals.lastDate),
    monthly: fillMonthly(monthlyRaw, totals.firstDate, totals.lastDate),
    yearly:  fillYearly(yearlyRaw,   totals.firstDate, totals.lastDate),
    uploads: uploads.sort((a, b) => b.reportDate.localeCompare(a.reportDate)),
  };
}

export function aggregateAllSites(sites) {
  let totalKwh = 0, totalSessions = 0, totalDays = 0;
  let totalRevenueUSD = 0, totalProfitUSD = 0, totalCapexUSD = 0, totalOpexUSD = 0;

  const perSite = sites.map(site => {
    const agg = aggregateSite(site.id, site);
    totalKwh        += agg.totals.totalKwh;
    totalSessions   += agg.totals.totalSessions;
    totalDays       += agg.totals.totalDays;
    totalRevenueUSD += agg.totals.grossRevenueUSD;
    totalProfitUSD  += agg.totals.netProfitUSD;
    totalCapexUSD   += agg.totals.capexUSD;
    totalOpexUSD    += agg.totals.fixedOpexUSD;
    return { site, agg };
  });

  // Portfolio ROI = total net profit / total CAPEX (no split applied)
  const portfolioROI = totalCapexUSD > 0 ? (totalProfitUSD / totalCapexUSD) * 100 : 0;

  return {
    totalKwh, totalSessions, totalDays,
    totalRevenueUSD, totalProfitUSD,
    totalCapexUSD, totalOpexUSD, portfolioROI,
    perSite,
  };
}
