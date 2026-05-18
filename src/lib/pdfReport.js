// Client-side PDF generation for Buima Tracker.
// Two report flavors:
//   1. generatePartnerStatement(site, agg, period)     — per-site profit-share
//   2. generateInvestorMonthlyReport(sites, data, prt) — portfolio-wide
//
// Both produce a branded A4 PDF using jsPDF + autotable. No server needed.

import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { currencySymbol, fmt, fmt0 } from "./storage";
import { fmtUSD, toUSD } from "./fx";

// ─── Brand ──────────────────────────────────────────
const BRAND = [190, 18, 60];     // #be123c
const BRAND_DARK = [159, 18, 57];
const SLATE_900 = [15, 23, 42];
const SLATE_700 = [51, 65, 85];
const SLATE_500 = [100, 116, 139];
const SLATE_300 = [203, 213, 225];
const SLATE_50  = [248, 250, 252];
const EMERALD = [16, 185, 129];
const AMBER   = [217, 119, 6];
const ROSE_LIGHT = [255, 241, 242];

function header(doc, title, subtitle) {
  // Brand hairline at top
  doc.setFillColor(...BRAND);
  doc.rect(0, 0, 210, 2, "F");

  // Buima brand block
  doc.setTextColor(...SLATE_900);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(20);
  doc.text("BUIMA", 14, 18);
  doc.setTextColor(...BRAND);
  doc.text("ENERGY", 14 + doc.getTextWidth("BUIMA "), 18);

  doc.setTextColor(...BRAND);
  doc.setFontSize(8);
  doc.setFont("helvetica", "bold");
  doc.text("TRACKER · OPERATIONS", 14, 23);

  // Title + subtitle on the right
  doc.setTextColor(...SLATE_900);
  doc.setFontSize(14);
  doc.setFont("helvetica", "bold");
  doc.text(title, 196, 16, { align: "right" });
  if (subtitle) {
    doc.setTextColor(...SLATE_500);
    doc.setFontSize(9);
    doc.setFont("helvetica", "normal");
    doc.text(subtitle, 196, 22, { align: "right" });
  }

  // Bottom rule of header
  doc.setDrawColor(...SLATE_300);
  doc.setLineWidth(0.3);
  doc.line(14, 28, 196, 28);
}

function footer(doc, pageNum, totalPages) {
  doc.setFillColor(...BRAND);
  doc.rect(0, 295, 210, 2, "F");

  doc.setTextColor(...SLATE_500);
  doc.setFontSize(8);
  doc.setFont("helvetica", "normal");
  doc.text(`© 2026 Buima Energy · Confidential`, 14, 290);
  doc.text(`Generated ${new Date().toISOString().slice(0, 10)}`, 105, 290, { align: "center" });
  doc.text(`Page ${pageNum} / ${totalPages}`, 196, 290, { align: "right" });
}

function sectionTitle(doc, y, label) {
  doc.setTextColor(...BRAND);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.text(label.toUpperCase(), 14, y);
  doc.setDrawColor(...BRAND);
  doc.setLineWidth(0.4);
  doc.line(14, y + 1.5, 14 + doc.getTextWidth(label.toUpperCase()), y + 1.5);
  return y + 8;
}

function kpiCards(doc, y, cards, columns = 4) {
  // Simple KPI grid - each card has label + value + sub
  const marginX = 14;
  const totalW = 196 - marginX;
  const cardW = (totalW - 14) / columns - 3;
  const cardH = 22;
  const gap = 4;

  cards.forEach((c, i) => {
    const row = Math.floor(i / columns);
    const col = i % columns;
    const x = marginX + col * (cardW + gap);
    const cy = y + row * (cardH + gap);

    doc.setFillColor(...SLATE_50);
    doc.setDrawColor(...SLATE_300);
    doc.roundedRect(x, cy, cardW, cardH, 1.5, 1.5, "FD");

    doc.setTextColor(...SLATE_500);
    doc.setFontSize(7);
    doc.setFont("helvetica", "bold");
    doc.text(c.label.toUpperCase(), x + 3, cy + 5);

    doc.setTextColor(...SLATE_900);
    doc.setFontSize(13);
    doc.setFont("helvetica", "bold");
    doc.text(c.value, x + 3, cy + 13);

    if (c.sub) {
      doc.setTextColor(...SLATE_500);
      doc.setFontSize(7);
      doc.setFont("helvetica", "normal");
      doc.text(c.sub, x + 3, cy + 18);
    }
  });
  const rows = Math.ceil(cards.length / columns);
  return y + rows * (cardH + gap);
}

function filterUploadsToPeriod(uploads, periodStart, periodEnd) {
  return uploads.filter(u => {
    const d = u.reportDate; // YYYY-MM-DD string
    return d >= periodStart && d <= periodEnd;
  });
}

// ═══════════════════════════════════════════════════════════════
//  PARTNER STATEMENT  (per-site, period-bounded)
// ═══════════════════════════════════════════════════════════════
export function generatePartnerStatement(site, allUploads, periodStart, periodEnd) {
  const doc = new jsPDF({ format: "a4", unit: "mm" });
  const uploads = filterUploadsToPeriod(allUploads, periodStart, periodEnd);

  // Period totals
  const sym = currencySymbol(site.currency);
  let totalKwh = 0, totalSessions = 0;
  uploads.forEach(u => {
    totalKwh += u.totalKwh || 0;
    totalSessions += u.totalSessions || 0;
  });
  const periodDays = uploads.length;
  const opexDays = (() => {
    if (!uploads.length) return 0;
    const start = new Date(periodStart);
    const end = new Date(periodEnd);
    return Math.max(periodDays, Math.ceil((end - start) / 86400000) + 1);
  })();
  const grossRevenue = totalKwh * (site.chargingFee || 0);
  const variableCost = totalKwh * (site.costPerKwh || 0);
  const opexCost = (site.opexMonthly || 0) / 30.4375 * opexDays;
  const netProfit = grossRevenue - variableCost - opexCost;
  const buimaPct = site.buimaSplitPct ?? 100;
  const partnerPct = site.partnerSplitPct ?? 0;
  const buimaShare = netProfit * buimaPct / 100;
  const partnerShare = netProfit * partnerPct / 100;

  // Header
  header(doc, "PARTNER STATEMENT", `${periodStart} → ${periodEnd}`);

  // Statement metadata
  let y = 38;
  doc.setTextColor(...SLATE_900);
  doc.setFontSize(16);
  doc.setFont("helvetica", "bold");
  doc.text(site.name, 14, y);
  y += 6;
  doc.setTextColor(...SLATE_500);
  doc.setFontSize(10);
  doc.setFont("helvetica", "normal");
  doc.text(`${site.city}, ${site.country} · Charger ${site.chargerId}`, 14, y);
  y += 10;

  // Parties
  const partiesY = y;
  const halfW = 91;
  doc.setFillColor(...ROSE_LIGHT);
  doc.setDrawColor(...BRAND);
  doc.roundedRect(14, partiesY, halfW, 22, 1.5, 1.5, "FD");
  doc.roundedRect(14 + halfW + 4, partiesY, halfW, 22, 1.5, 1.5, "FD");

  doc.setTextColor(...BRAND);
  doc.setFontSize(7);
  doc.setFont("helvetica", "bold");
  doc.text("OPERATOR", 14 + 3, partiesY + 5);
  doc.text("PARTNER", 14 + halfW + 4 + 3, partiesY + 5);

  doc.setTextColor(...SLATE_900);
  doc.setFontSize(12);
  doc.text("Buima Energy", 14 + 3, partiesY + 12);
  doc.text(site.partnerName || "—", 14 + halfW + 4 + 3, partiesY + 12);

  doc.setTextColor(...SLATE_500);
  doc.setFontSize(9);
  doc.setFont("helvetica", "normal");
  doc.text(`Share: ${buimaPct}%`, 14 + 3, partiesY + 18);
  doc.text(`Share: ${partnerPct}%${site.partnerEmail ? "  ·  " + site.partnerEmail : ""}`, 14 + halfW + 4 + 3, partiesY + 18);
  y = partiesY + 28;

  // KPI cards
  y = sectionTitle(doc, y, "Period Summary");
  y = kpiCards(doc, y, [
    { label: "kWh Delivered", value: fmt0(totalKwh), sub: `${periodDays} reports` },
    { label: "Cars Served",   value: fmt0(totalSessions) },
    { label: "Gross Revenue", value: `${sym}${fmt0(grossRevenue)}` },
    { label: "Net Profit",    value: `${sym}${fmt0(netProfit)}` },
  ], 4);
  y += 4;

  // Profit & loss breakdown table
  y = sectionTitle(doc, y, "Profit & Loss");
  autoTable(doc, {
    startY: y,
    head: [["Item", "Calculation", `Amount (${site.currency})`]],
    body: [
      ["Gross Revenue", `${fmt0(totalKwh)} kWh × ${sym}${fmt(site.chargingFee)} / kWh`, `${sym}${fmt0(grossRevenue)}`],
      ["Variable Cost", `${fmt0(totalKwh)} kWh × ${sym}${fmt(site.costPerKwh)} / kWh`, `(${sym}${fmt0(variableCost)})`],
      ["Fixed OPEX",    `${sym}${fmt0(site.opexMonthly)} / mo × ${(opexDays / 30.4375).toFixed(2)} mo`, `(${sym}${fmt0(opexCost)})`],
      [{ content: "Net Profit", styles: { fontStyle: "bold" } },
       { content: "Revenue − Variable − OPEX", styles: { fontStyle: "bold" } },
       { content: `${sym}${fmt0(netProfit)}`, styles: { fontStyle: "bold" } }],
    ],
    theme: "grid",
    styles: { fontSize: 9, cellPadding: 2.5 },
    headStyles: { fillColor: SLATE_900, textColor: 255, fontStyle: "bold", fontSize: 9 },
    columnStyles: { 2: { halign: "right", cellWidth: 40 } },
    margin: { left: 14, right: 14 },
  });
  y = doc.lastAutoTable.finalY + 8;

  // Profit Share
  y = sectionTitle(doc, y, "Profit Share Distribution");
  autoTable(doc, {
    startY: y,
    head: [["Party", "Share %", `Amount (${site.currency})`, "Amount (USD)"]],
    body: [
      ["Buima Energy", `${buimaPct}%`,   `${sym}${fmt0(buimaShare)}`,   fmtUSD(toUSD(buimaShare, site.currency))],
      [site.partnerName || "Partner", `${partnerPct}%`, `${sym}${fmt0(partnerShare)}`, fmtUSD(toUSD(partnerShare, site.currency))],
      [{ content: "Total Net Profit", styles: { fontStyle: "bold" } },
       { content: "100%", styles: { fontStyle: "bold" } },
       { content: `${sym}${fmt0(netProfit)}`, styles: { fontStyle: "bold" } },
       { content: fmtUSD(toUSD(netProfit, site.currency)), styles: { fontStyle: "bold" } }],
    ],
    theme: "grid",
    styles: { fontSize: 9, cellPadding: 2.5 },
    headStyles: { fillColor: BRAND, textColor: 255, fontStyle: "bold", fontSize: 9 },
    columnStyles: { 1: { halign: "center" }, 2: { halign: "right" }, 3: { halign: "right" } },
    margin: { left: 14, right: 14 },
  });
  y = doc.lastAutoTable.finalY + 8;

  // Daily breakdown (paginated if needed)
  if (uploads.length > 0) {
    y = sectionTitle(doc, y, "Daily Breakdown");
    autoTable(doc, {
      startY: y,
      head: [["Date", "kWh", "Cars", "Revenue", "Net Profit"]],
      body: uploads.sort((a, b) => a.reportDate.localeCompare(b.reportDate)).map(u => {
        const dayKwh = u.totalKwh || 0;
        const dayRev = dayKwh * (site.chargingFee || 0);
        const dayVar = dayKwh * (site.costPerKwh || 0);
        const dayOpex = (site.opexMonthly || 0) / 30.4375;
        const dayProfit = dayRev - dayVar - dayOpex;
        return [
          u.reportDate,
          fmt(dayKwh, 1),
          fmt0(u.totalSessions || 0),
          `${sym}${fmt0(dayRev)}`,
          `${sym}${fmt0(dayProfit)}`,
        ];
      }),
      theme: "striped",
      styles: { fontSize: 8, cellPadding: 1.8 },
      headStyles: { fillColor: SLATE_700, textColor: 255, fontStyle: "bold", fontSize: 9 },
      columnStyles: { 1: { halign: "right" }, 2: { halign: "right" }, 3: { halign: "right" }, 4: { halign: "right" } },
      margin: { left: 14, right: 14 },
    });
  }

  // Footers + finalize
  const totalPages = doc.internal.getNumberOfPages();
  for (let i = 1; i <= totalPages; i++) {
    doc.setPage(i);
    footer(doc, i, totalPages);
  }

  const filename = `Buima_${site.name.replace(/[^a-z0-9]+/gi, "_")}_Statement_${periodStart}_to_${periodEnd}.pdf`;
  doc.save(filename);
}

// ═══════════════════════════════════════════════════════════════
//  INVESTOR MONTHLY REPORT  (portfolio-wide)
// ═══════════════════════════════════════════════════════════════
export function generateInvestorMonthlyReport(sites, portfolio, perSiteAgg, periodStart, periodEnd) {
  const doc = new jsPDF({ format: "a4", unit: "mm" });

  // ── COVER ──
  header(doc, "INVESTOR REPORT", `${periodStart} → ${periodEnd}`);
  let y = 38;

  doc.setTextColor(...SLATE_900);
  doc.setFontSize(22);
  doc.setFont("helvetica", "bold");
  doc.text("B.E.S.T Portfolio", 14, y);
  y += 7;
  doc.setTextColor(...BRAND);
  doc.setFontSize(11);
  doc.text("MONTHLY INVESTOR BRIEF", 14, y);
  y += 10;

  doc.setTextColor(...SLATE_500);
  doc.setFontSize(10);
  doc.setFont("helvetica", "normal");
  doc.text(
    "Buima Energy operates proprietary B.E.S.T (Battery Energy Storage Tile) systems with integrated DC fast",
    14, y);
  y += 4;
  doc.text(
    "charging across global installation sites. This brief summarizes portfolio performance for the period above.",
    14, y);
  y += 10;

  // Portfolio hero KPIs
  y = sectionTitle(doc, y, "Portfolio Snapshot");
  y = kpiCards(doc, y, [
    { label: "Capital Deployed", value: fmtUSD(portfolio.totalCapexUSD), sub: `${sites.length} holdings` },
    { label: "Monthly Revenue",  value: fmtUSD(portfolio.totalMonthlyRevenueUSD), sub: "run-rate" },
    { label: "Monthly Profit",   value: fmtUSD(portfolio.totalMonthlyProfitUSD),  sub: "run-rate" },
    { label: "Annualized ROI",   value: `${fmt(portfolio.portfolioAnnualizedROI, 1)}%`, sub: "portfolio-wide" },
    { label: "Portfolio Payback",
      value: portfolio.portfolioPaybackYears != null ? `${fmt(portfolio.portfolioPaybackYears, 1)} yrs` : "—",
      sub: portfolio.portfolioPaybackMonths != null ? `${fmt0(portfolio.portfolioPaybackMonths)} months` : "" },
    { label: "Cars Served", value: fmt0(portfolio.totalSessions), sub: `${fmt0(portfolio.totalKwh)} kWh delivered` },
  ], 3);
  y += 6;

  // Holdings Table
  y = sectionTitle(doc, y, "Holdings Performance (USD)");
  autoTable(doc, {
    startY: y,
    head: [["Site", "Location", "Setup Cost", "Contract", "Monthly Rev", "Monthly Profit", "Ann. ROI", "Payback"]],
    body: perSiteAgg.map(({ site, agg }) => {
      const t = agg.totals;
      return [
        site.name,
        `${site.city || "—"}, ${site.country || "—"}`,
        fmtUSD(t.capexUSD),
        site.contractYears ? `${site.contractYears} yrs` : "—",
        fmtUSD(t.monthlyAvgRevenueUSD),
        fmtUSD(t.monthlyAvgProfitUSD),
        site.capex > 0 ? `${fmt(t.annualizedRoi, 1)}%` : "—",
        t.paybackYears != null && t.paybackYears < 100 ? `${fmt(t.paybackYears, 1)} yrs` : "—",
      ];
    }),
    theme: "grid",
    styles: { fontSize: 8, cellPadding: 2 },
    headStyles: { fillColor: BRAND, textColor: 255, fontStyle: "bold", fontSize: 8 },
    columnStyles: {
      2: { halign: "right" }, 3: { halign: "right" },
      4: { halign: "right" }, 5: { halign: "right" },
      6: { halign: "right" }, 7: { halign: "right" },
    },
    margin: { left: 14, right: 14 },
  });
  y = doc.lastAutoTable.finalY + 8;

  // Margin & ROI commentary
  if (y > 220) { doc.addPage(); y = 30; header(doc, "INVESTOR REPORT", `${periodStart} → ${periodEnd}`); y = 38; }
  y = sectionTitle(doc, y, "Returns Profile");
  const totalRevUSD    = portfolio.totalRevenueUSD;
  const totalProfitUSD = portfolio.totalProfitUSD;
  const margin = totalRevUSD > 0 ? (totalProfitUSD / totalRevUSD) * 100 : 0;
  autoTable(doc, {
    startY: y,
    body: [
      ["Lifetime Gross Revenue",  fmtUSD(totalRevUSD)],
      ["Lifetime Net Profit",     fmtUSD(totalProfitUSD)],
      ["Net Margin",              `${fmt(margin, 1)}%`],
      ["Cumulative Capex Recovered", `${fmt(portfolio.portfolioROI, 1)}%`],
      ["Projected Annual Profit", `${fmtUSD(portfolio.totalAnnualizedProfitUSD)} / yr`],
    ],
    theme: "plain",
    styles: { fontSize: 10, cellPadding: 2.5 },
    columnStyles: { 0: { fontStyle: "bold", cellWidth: 80 }, 1: { halign: "right" } },
    margin: { left: 14, right: 14 },
  });
  y = doc.lastAutoTable.finalY + 8;

  // Disclaimer
  if (y > 250) { doc.addPage(); y = 30; }
  doc.setTextColor(...SLATE_500);
  doc.setFontSize(8);
  doc.setFont("helvetica", "italic");
  const disc = [
    "Disclaimer: This report is prepared by Buima Energy for informational purposes only. All figures are based on",
    "operational telemetry collected from installed B.E.S.T systems. Past performance does not guarantee future returns.",
    "FX rates used for USD conversion are static reference rates as of the most recent system update.",
  ];
  disc.forEach((line, i) => doc.text(line, 14, y + i * 4));

  // Footers
  const totalPages = doc.internal.getNumberOfPages();
  for (let i = 1; i <= totalPages; i++) {
    doc.setPage(i);
    footer(doc, i, totalPages);
  }

  const filename = `Buima_Portfolio_Monthly_Report_${periodStart}_to_${periodEnd}.pdf`;
  doc.save(filename);
}
