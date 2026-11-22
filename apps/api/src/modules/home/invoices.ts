import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { eq, sql } from "drizzle-orm";
import { jwtVerify, SignJWT } from "jose";
import { PDFDocument, rgb, StandardFonts, type PDFFont, type PDFPage } from "pdf-lib";
import {
  bookingCode, financialYear, formatSlot, invoiceNumber, type HomeAddressSnapshot,
} from "@zarva/core";
import type { Db, Tx } from "../../db/client";
import type { Config } from "../../lib/config";
import { badRequest, notFound, pgErrorCode, unauthorized } from "../../lib/errors";
import { homeBookingItems, homeBookings, homeCategories, homeCities, homeInvoiceCounters, homeInvoices, homePros } from "./schema";

type BookingRow = typeof homeBookings.$inferSelect;

/** GST on home services is 18%. Prices on ZARVA include it. */
const GST_BPS = 1800;
/** 4-digit SAC heading per category (services accounting codes). Check with your CA. */
const SAC: Record<string, { code: string; label: string }> = {
  electrician: { code: "9987", label: "Maintenance and repair services" },
  plumber: { code: "9987", label: "Maintenance and repair services" },
  carpenter: { code: "9987", label: "Maintenance and repair services" },
  "ac-appliance": { code: "9987", label: "Maintenance and repair services" },
  cleaning: { code: "9985", label: "Cleaning services" },
  "pest-control": { code: "9985", label: "Pest control services" },
  "salon-women": { code: "9997", label: "Beauty and physical well-being services" },
  "grooming-men": { code: "9997", label: "Beauty and physical well-being services" },
};

/** Everything printed on an invoice, frozen when it is issued. */
export interface InvoiceData {
  number: string;
  /** "tax_invoice" only when ZARVA had a GSTIN at the time of issue. */
  kind: "tax_invoice" | "receipt";
  issuedAt: string;
  bookingCode: string;
  serviceDate: string;
  seller: { name: string; address: string; state: string; gstin: string | null; contact: string };
  buyer: { name: string; phone: string; address: string; state: string };
  category: string;
  sac: { code: string; label: string } | null;
  professional: string | null;
  lines: { name: string; qty: number; unitPaise: number; amountPaise: number }[];
  /** Legacy convenience fee (bookings before pre-GST prices). New bills use `charges`. */
  feePaise: number;
  /** Platform & convenience fee (service + platform charges), before GST. Missing on bills issued before 2026-11-22. */
  charges?: { label: string; amountPaise: number }[];
  /** GST charged on the bill (base + charges), shown as one line on a receipt when there is no GSTIN. */
  gstPaise?: number;
  totalPaise: number;
  /** Only on a tax invoice: the taxable value and the GST split into CGST/SGST or IGST. */
  tax: { rateBps: number; taxablePaise: number; cgstPaise: number; sgstPaise: number; igstPaise: number } | null;
  /** Legacy bills: prices included GST and the tax was worked back from the total. */
  taxInclusive?: boolean;
  paidVia: string;
}

const LOGO = fileURLToPath(new URL("../../../assets/zarva-lockup-on-light.png", import.meta.url));
let logoBytes: Buffer | null = null;

/**
 * Customer invoices for completed home-service jobs.
 * Issued inside the "completed" transaction so every completed job has exactly one invoice number,
 * numbered without gaps per financial year. Older completed jobs get one the first time it is asked for.
 */
export class InvoiceService {
  constructor(private db: Db, private config: Config, private now: () => Date) {}

  async issue(tx: Db | Tx, b: BookingRow): Promise<string> {
    const existing = await tx.query.homeInvoices.findFirst({ where: eq(homeInvoices.bookingId, b.id), columns: { number: true } });
    if (existing) return existing.number;
    const issuedAt = this.now();
    const fy = financialYear(issuedAt);
    const [c] = await tx
      .insert(homeInvoiceCounters)
      .values({ fy, last: 1 })
      .onConflictDoUpdate({ target: homeInvoiceCounters.fy, set: { last: sql`${homeInvoiceCounters.last} + 1` } })
      .returning();
    const number = invoiceNumber(fy, c!.last);

    const [items, cat, city, pro] = await Promise.all([
      tx.select().from(homeBookingItems).where(eq(homeBookingItems.bookingId, b.id)),
      tx.query.homeCategories.findFirst({ where: eq(homeCategories.id, b.categoryId) }),
      tx.query.homeCities.findFirst({ where: eq(homeCities.id, b.cityId) }),
      b.proId ? tx.query.homePros.findFirst({ where: eq(homePros.id, b.proId), columns: { name: true } }) : Promise.resolve(undefined),
    ]);
    const a = b.address as HomeAddressSnapshot;
    const gstin = this.config.INVOICE_GSTIN ?? null;
    const buyerState = city?.state ?? this.config.INVOICE_STATE;
    // New bookings: 18% GST on base + platform & convenience fee, frozen in b.pricing.
    // Legacy bookings: the price included GST, so it is worked back from the total.
    const p = b.pricing;
    const taxablePaise = p ? p.taxablePaise : Math.round((b.totalPaise * 10_000) / (10_000 + GST_BPS));
    const gstPaise = p ? p.gstPaise : b.totalPaise - taxablePaise;
    let tax: InvoiceData["tax"] = null;
    if (gstin) {
      const intra = buyerState.toLowerCase() === this.config.INVOICE_STATE.toLowerCase();
      const cgstPaise = intra ? Math.floor(gstPaise / 2) : 0;
      tax = { rateBps: GST_BPS, taxablePaise, cgstPaise, sgstPaise: intra ? gstPaise - cgstPaise : 0, igstPaise: intra ? 0 : gstPaise };
    }
    const charges = p
      ? [
        { label: "Platform & convenience fee", amountPaise: p.serviceChargePaise + p.platformChargePaise },
      ].filter((c) => c.amountPaise > 0)
      : undefined;
    const data: InvoiceData = {
      number,
      kind: gstin ? "tax_invoice" : "receipt",
      issuedAt: issuedAt.toISOString(),
      bookingCode: bookingCode(b.id),
      serviceDate: `${b.slotStart.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric", timeZone: "Asia/Kolkata" })}, ${formatSlot(b.slotStart.toISOString())}`,
      seller: { name: this.config.INVOICE_LEGAL_NAME, address: this.config.INVOICE_ADDRESS, state: this.config.INVOICE_STATE, gstin, contact: this.config.INVOICE_SUPPORT_CONTACT },
      buyer: {
        name: a.name, phone: a.phone,
        address: [a.line1, a.line2, a.landmark, `${a.city} ${a.pincode}`].filter(Boolean).join(", "),
        state: buyerState,
      },
      category: cat?.name ?? "",
      sac: cat ? SAC[cat.slug] ?? null : null,
      professional: pro?.name ?? null,
      lines: items
        .sort((x, y) => x.name.localeCompare(y.name))
        .map((i) => ({ name: i.name, qty: i.qty, unitPaise: i.unitPricePaise, amountPaise: i.unitPricePaise * i.qty })),
      feePaise: p ? 0 : b.feePaise,
      ...(charges ? { charges, gstPaise } : { taxInclusive: true }),
      totalPaise: b.totalPaise,
      tax,
      paidVia: b.payMode === "online" ? "Paid online (Razorpay)" : "Paid to the professional after the service (cash / UPI)",
    };
    await tx.insert(homeInvoices).values({ bookingId: b.id, number, issuedAt, data });
    return number;
  }

  /** Invoice of a completed booking, issuing it now if the job finished before invoices existed. */
  async get(bookingId: string): Promise<InvoiceData> {
    const b = await this.db.query.homeBookings.findFirst({ where: eq(homeBookings.id, bookingId) });
    if (!b) throw notFound("Booking");
    if (b.status !== "completed") throw badRequest("no_invoice", "The invoice is ready once the job is completed");
    let row = await this.db.query.homeInvoices.findFirst({ where: eq(homeInvoices.bookingId, bookingId) });
    if (!row) {
      try {
        await this.db.transaction(async (tx) => { await this.issue(tx, b); });
      } catch (e) {
        // Two downloads at once: the other one issued it (and its number), so just read it.
        if (pgErrorCode(e) !== "23505") throw e;
      }
      row = await this.db.query.homeInvoices.findFirst({ where: eq(homeInvoices.bookingId, bookingId) });
    }
    return row!.data as InvoiceData;
  }

  async numberFor(bookingId: string): Promise<string | null> {
    const r = await this.db.query.homeInvoices.findFirst({ where: eq(homeInvoices.bookingId, bookingId), columns: { number: true } });
    return r?.number ?? null;
  }

  // ----- Short-lived download links (the phone app opens the PDF in the browser) -----

  private key() {
    return new TextEncoder().encode(`invoice:${this.config.JWT_SECRET}`);
  }

  async linkToken(bookingId: string): Promise<string> {
    return new SignJWT({}).setProtectedHeader({ alg: "HS256" }).setSubject(bookingId).setAudience("zarva-invoice")
      .setIssuedAt(Math.floor(this.now().getTime() / 1000)).setExpirationTime(Math.floor(this.now().getTime() / 1000) + 15 * 60).sign(this.key());
  }

  async checkLinkToken(bookingId: string, token: string): Promise<void> {
    try {
      const { payload } = await jwtVerify(token, this.key(), { audience: "zarva-invoice", currentDate: this.now() });
      if (payload.sub !== bookingId) throw new Error("wrong booking");
    } catch {
      throw unauthorized("This download link has expired. Open the booking and tap Download invoice again.");
    }
  }

  async pdf(bookingId: string): Promise<{ bytes: Uint8Array; filename: string }> {
    const data = await this.get(bookingId);
    return { bytes: await renderInvoice(data), filename: `ZARVA-${data.number.replace(/\//g, "-")}.pdf` };
  }
}

// ---------------- PDF ----------------

const INK = rgb(0x0f / 255, 0x0b / 255, 0x24 / 255);
const MUTED = rgb(0x6e / 255, 0x6a / 255, 0x85 / 255);
const LINE = rgb(0xe3 / 255, 0xe1 / 255, 0xee / 255);
const BRAND = rgb(0x7c / 255, 0x5c / 255, 0xf0 / 255);
const PAPER = rgb(0xf6 / 255, 0xf5 / 255, 0xfb / 255);

/** The built-in PDF fonts only cover Western characters; anything else would crash the render. */
function safe(s: string): string {
  return s
    .replace(/₹/g, "Rs. ")
    .replace(/[–—]/g, "-")
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/×/g, "x")
    .replace(/[^\x20-\x7E\xA0-\xFF]/g, "?");
}

/** "Rs. 1,234.50" */
export function money(paise: number): string {
  const r = paise / 100;
  return `Rs. ${r.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function wrap(text: string, font: PDFFont, size: number, width: number): string[] {
  const words = safe(text).split(/\s+/);
  const lines: string[] = [];
  let cur = "";
  for (const w of words) {
    const next = cur ? `${cur} ${w}` : w;
    if (font.widthOfTextAtSize(next, size) > width && cur) {
      lines.push(cur);
      cur = w;
    } else cur = next;
  }
  if (cur) lines.push(cur);
  return lines;
}

export async function renderInvoice(d: InvoiceData): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  doc.setTitle(`ZARVA ${d.kind === "tax_invoice" ? "tax invoice" : "bill"} ${d.number}`);
  doc.setAuthor(d.seller.name);
  doc.setCreator("ZARVA");
  doc.setCreationDate(new Date(d.issuedAt));
  const page = doc.addPage([595.28, 841.89]); // A4
  const regular = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const W = page.getWidth();
  const M = 48;
  let y = page.getHeight() - M;

  const text = (s: string, x: number, yy: number, o: { size?: number; font?: PDFFont; color?: ReturnType<typeof rgb>; right?: boolean } = {}) => {
    const size = o.size ?? 10;
    const font = o.font ?? regular;
    const t = safe(s);
    page.drawText(t, { x: o.right ? x - font.widthOfTextAtSize(t, size) : x, y: yy, size, font, color: o.color ?? INK });
  };
  const hr = (yy: number) => page.drawLine({ start: { x: M, y: yy }, end: { x: W - M, y: yy }, thickness: 0.8, color: LINE });

  // Header: logo left, title right.
  logoBytes ??= readFileSync(LOGO);
  const logo = await doc.embedPng(logoBytes);
  const logoW = 150;
  const logoH = (logo.height / logo.width) * logoW;
  page.drawImage(logo, { x: M, y: y - logoH, width: logoW, height: logoH });
  text(d.kind === "tax_invoice" ? "TAX INVOICE" : "BILL / PAYMENT RECEIPT", W - M, y - 14, { size: 15, font: bold, right: true });
  text(d.number, W - M, y - 32, { size: 10.5, font: bold, color: BRAND, right: true });
  const issued = new Date(d.issuedAt).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric", timeZone: "Asia/Kolkata" });
  text(`Date: ${issued}`, W - M, y - 47, { size: 9.5, color: MUTED, right: true });
  text(`Booking: ${d.bookingCode}`, W - M, y - 60, { size: 9.5, color: MUTED, right: true });
  y -= Math.max(logoH, 66) + 18;
  hr(y);
  y -= 22;

  // From / Bill to.
  const colW = (W - 2 * M - 24) / 2;
  const block = (x: number, title: string, lines: string[]) => {
    let yy = y;
    text(title, x, yy, { size: 8.5, font: bold, color: MUTED });
    yy -= 15;
    for (const [i, l] of lines.entries()) {
      for (const w of wrap(l, i === 0 ? bold : regular, i === 0 ? 11 : 9.5, colW)) {
        text(w, x, yy, { size: i === 0 ? 11 : 9.5, font: i === 0 ? bold : regular });
        yy -= i === 0 ? 15 : 13;
      }
    }
    return yy;
  };
  const sellerLines = [d.seller.name, d.seller.address, d.seller.gstin ? `GSTIN: ${d.seller.gstin}` : "Not GST-registered yet", `State: ${d.seller.state}`];
  const buyerLines = [d.buyer.name, d.buyer.address, `Phone: ${d.buyer.phone}`, `Place of supply: ${d.buyer.state}`];
  const y1 = block(M, "FROM", sellerLines);
  const y2 = block(M + colW + 24, "BILL TO", buyerLines);
  y = Math.min(y1, y2) - 10;

  // Service details strip.
  page.drawRectangle({ x: M, y: y - 38, width: W - 2 * M, height: 38, color: PAPER });
  text("SERVICE", M + 12, y - 14, { size: 8, font: bold, color: MUTED });
  text(d.category + (d.sac && d.tax ? `  (SAC ${d.sac.code})` : ""), M + 12, y - 28, { size: 10, font: bold });
  text("DONE ON", M + 250, y - 14, { size: 8, font: bold, color: MUTED });
  text(d.serviceDate, M + 250, y - 28, { size: 10 });
  if (d.professional) {
    text("PROFESSIONAL", W - M - 12, y - 14, { size: 8, font: bold, color: MUTED, right: true });
    text(d.professional, W - M - 12, y - 28, { size: 10, right: true });
  }
  y -= 62;

  // Line items.
  const cQty = W - M - 190;
  const cRate = W - M - 100;
  const cAmt = W - M;
  text("DESCRIPTION", M, y, { size: 8.5, font: bold, color: MUTED });
  text("QTY", cQty, y, { size: 8.5, font: bold, color: MUTED, right: true });
  text("RATE", cRate, y, { size: 8.5, font: bold, color: MUTED, right: true });
  text("AMOUNT", cAmt, y, { size: 8.5, font: bold, color: MUTED, right: true });
  y -= 8;
  hr(y);
  y -= 16;
  for (const l of d.lines) {
    const rows = wrap(l.name, regular, 10, cQty - M - 40);
    text(String(l.qty), cQty, y, { right: true });
    text(money(l.unitPaise), cRate, y, { right: true });
    text(money(l.amountPaise), cAmt, y, { right: true });
    for (const r of rows) {
      text(r, M, y);
      y -= 14;
    }
    y -= 4;
  }
  if (d.feePaise > 0) {
    text("Convenience fee", M, y);
    text(money(d.feePaise), cAmt, y, { right: true });
    y -= 18;
  }
  for (const c of d.charges ?? []) {
    text(c.label, M, y);
    text(money(c.amountPaise), cAmt, y, { right: true });
    y -= 18;
  }
  hr(y + 6);
  y -= 12;

  // Totals.
  const total = (label: string, value: string, strong = false) => {
    text(label, cRate, y, { size: strong ? 11.5 : 10, font: strong ? bold : regular, right: true, color: strong ? INK : MUTED });
    text(value, cAmt, y, { size: strong ? 11.5 : 10, font: strong ? bold : regular, right: true });
    y -= strong ? 20 : 15;
  };
  if (d.tax) {
    total("Taxable value", money(d.tax.taxablePaise));
    const half = `${d.tax.rateBps / 200}%`;
    if (d.tax.igstPaise > 0) total(`IGST ${d.tax.rateBps / 100}%`, money(d.tax.igstPaise));
    else {
      total(`CGST ${half}`, money(d.tax.cgstPaise));
      total(`SGST ${half}`, money(d.tax.sgstPaise));
    }
  } else if (d.gstPaise) {
    total(`GST ${GST_BPS / 100}%`, money(d.gstPaise));
  }
  y -= 2;
  page.drawLine({ start: { x: cQty - 40, y: y + 14 }, end: { x: W - M, y: y + 14 }, thickness: 0.8, color: LINE });
  total("Total", money(d.totalPaise), true);
  text(d.paidVia, cAmt, y, { size: 9, color: MUTED, right: true });
  y -= 34;

  // Notes.
  const notes = [
    d.charges
      ? d.tax ? "GST is charged at 18% on the service price plus the platform & convenience fee." : "ZARVA's GST registration is pending, so this is a bill and payment receipt, not a GST tax invoice."
      : d.tax ? "Prices include GST. Amounts above are worked out from the GST-inclusive price." : "ZARVA is not GST-registered yet, so this is a bill and payment receipt, not a GST tax invoice.",
    "Spare parts, if any, are billed separately by the professional at MRP and are not part of this bill.",
    `Questions about this bill? ${d.seller.contact}. Quote booking ${d.bookingCode}.`,
  ];
  text("NOTES", M, y, { size: 8.5, font: bold, color: MUTED });
  y -= 14;
  for (const n of notes) {
    for (const r of wrap(n, regular, 9, W - 2 * M)) {
      text(r, M, y, { size: 9, color: MUTED });
      y -= 12;
    }
    y -= 3;
  }

  footer(page, regular, W, M);
  return doc.save();
}

function footer(page: PDFPage, font: PDFFont, W: number, M: number) {
  const t = "This is a computer-generated document and needs no signature.";
  page.drawText(t, { x: (W - font.widthOfTextAtSize(t, 8)) / 2, y: M - 16, size: 8, font, color: MUTED });
}
