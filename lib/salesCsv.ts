import type { LedgerLine } from '@/lib/sellerLedger';

// A seller's records as numbers and as a spreadsheet file (CSV) they can open
// in Excel or Google Sheets, or hand to whoever does their taxes. Built in the
// browser from the record book (lib/sellerLedger), so nothing is stored.

export type Totals = {
  count: number;
  sales: number;
  fee: number;
  packing: number;
  restocking: number;
  paid: number;
  tax: number;
};

export const emptyTotals = (): Totals => ({ count: 0, sales: 0, fee: 0, packing: 0, restocking: 0, paid: 0, tax: 0 });

export function addUp(lines: LedgerLine[]): Totals {
  return lines.reduce((t, l) => {
    t.count += 1;
    t.sales += l.salesCents;
    t.fee += l.feeCents;
    t.packing += l.packingCents;
    t.restocking += l.restockingCents;
    t.paid += l.paidCents;
    t.tax += l.taxCents;
    return t;
  }, emptyTotals());
}

// The lines between two days (inclusive), by the day each one counts on.
export const linesBetween = (lines: LedgerLine[], from: string, to: string) =>
  lines.filter((l) => (!from || l.day >= from) && (!to || l.day <= to));

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

// One year by month, with a subtotal after each quarter and the year's total.
export function monthlyTotals(lines: LedgerLine[], year: number) {
  const rows: { label: string; kind: 'month' | 'quarter' | 'year'; totals: Totals }[] = [];
  for (let q = 0; q < 4; q++) {
    for (let m = q * 3; m < q * 3 + 3; m++) {
      const prefix = `${year}-${String(m + 1).padStart(2, '0')}`;
      rows.push({ label: MONTHS[m], kind: 'month', totals: addUp(lines.filter((l) => l.day.startsWith(prefix))) });
    }
    const from = `${year}-${String(q * 3 + 1).padStart(2, '0')}-01`;
    const to = `${year}-${String(q * 3 + 3).padStart(2, '0')}-31`;
    rows.push({ label: `Quarter ${q + 1} (Q${q + 1})`, kind: 'quarter', totals: addUp(linesBetween(lines, from, to)) });
  }
  rows.push({ label: `${year} total`, kind: 'year', totals: addUp(lines.filter((l) => l.day.startsWith(String(year)))) });
  return rows;
}

const dollars = (c: number) => (c / 100).toFixed(2);

// One cell, quoted for CSV. Text that a spreadsheet would run as a formula is
// made plain, since listing names and email addresses are typed by other people.
function cell(value: string | number) {
  let text = String(value ?? '');
  // Plain amounts like -0.75 stay numbers.
  if (/^[=+\-@\t\r]/.test(text) && typeof value !== 'number' && !/^-?\d+(\.\d+)?$/.test(text)) text = `'${text}`;
  return `"${text.replace(/"/g, '""')}"`;
}
const row = (values: (string | number)[]) => values.map(cell).join(',');

export function buildLedgerCsv(lines: LedgerLine[], periodLabel: string, year: number | null) {
  const sorted = [...lines].sort((a, b) => a.day.localeCompare(b.day) || a.orderedDay.localeCompare(b.orderedDay));
  const header = [
    'Order number',
    'Sale type',
    'Date ordered',
    'Date picked up or closed',
    'Outcome',
    'Item',
    'Quantity',
    'Unit',
    'Wholesale cases',
    'Produce sales ($)',
    'Farm Fresh Direct fee ($)',
    'Shared box packing fee ($)',
    'Restocking fee paid to you ($)',
    'Paid to you ($)',
    'Paid to your Stripe balance on',
    'Sales tax collected by Farm Fresh Direct ($)',
    'Tax-exempt resale',
    'Buyer',
    'Buyer email',
    'Pickup code',
  ];
  const body = sorted.map((l) =>
    row([
      l.ref,
      l.saleType,
      l.orderedDay,
      l.day,
      l.outcome,
      l.item,
      l.quantity,
      l.unit,
      l.cases || '',
      dollars(l.salesCents),
      dollars(l.feeCents),
      dollars(l.packingCents),
      dollars(l.restockingCents),
      dollars(l.paidCents),
      l.paidDay || '',
      dollars(l.taxCents),
      l.taxExempt ? 'Yes' : '',
      l.buyerName || '',
      l.buyerEmail || '',
      l.pickupCode || '',
    ])
  );
  const t = addUp(sorted);
  const out = [
    row([`Farm Fresh Direct sales records: ${periodLabel}`]),
    '',
    row(header),
    ...body,
    row(['Total', '', '', '', `${t.count} orders`, '', '', '', '', dollars(t.sales), dollars(t.fee), dollars(t.packing), dollars(t.restocking), dollars(t.paid), '', dollars(t.tax)]),
  ];
  // A year's records also get the month and quarter totals underneath.
  if (year != null) {
    out.push('', row([`Monthly and quarterly totals, ${year}`]));
    out.push(row(['Period', 'Orders', 'Produce sales ($)', 'Farm Fresh Direct fee ($)', 'Packing fee ($)', 'Restocking fees ($)', 'Paid to you ($)', 'Sales tax collected by Farm Fresh Direct ($)']));
    for (const m of monthlyTotals(lines, year)) {
      const x = m.totals;
      out.push(row([m.label, x.count, dollars(x.sales), dollars(x.fee), dollars(x.packing), dollars(x.restocking), dollars(x.paid), dollars(x.tax)]));
    }
  }
  return out.join('\r\n');
}

// Hands the file to the browser to save. The first character is a marker that
// tells Excel the file is UTF-8, so accented names aren't garbled.
export function downloadCsv(filename: string, csv: string) {
  const url = URL.createObjectURL(new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}
