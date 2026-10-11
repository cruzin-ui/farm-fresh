import { orderRef } from '@/lib/pickupGroups';

// Turns a seller's closed orders into a spreadsheet file (CSV) they can open
// in Excel or Google Sheets, or hand to whoever does their taxes. It is built
// in the browser from orders the dashboard has already loaded, so nothing
// extra is fetched and nothing is stored anywhere.

type ClosedOrder = {
  id: string;
  checkout_id?: string | null;
  status: string;
  created_at: string;
  completed_at?: string | null;
  cancel_reason?: string | null;
  listing_title?: string | null;
  listing_unit_type?: string | null;
  reserved_quantity?: number | string | null;
  original_quantity?: number | string | null;
  subtotal_amount?: number | string | null;
  original_subtotal_amount?: number | string | null;
  farmer_payout_amount?: number | string | null;
  no_show_fee_amount?: number | string | null;
  buyer_email?: string | null;
};

const CANCEL_REASONS: Record<string, string> = {
  seller: 'You cancelled it',
  seller_late: 'Buyer cancelled: not ready in time',
  seller_changed: 'Buyer cancelled after you changed the order',
  never_ready: 'Cancelled automatically: never marked ready',
  listing_removed: 'Listing removed by Farm Fresh Direct',
  admin: 'Cancelled by Farm Fresh Direct',
  buyer: 'Buyer cancelled',
  no_show: 'Buyer did not pick up',
};

const day = (value?: string | null) => (value ? new Date(value).toLocaleDateString('en-CA') : '');
const dollars = (value: number) => value.toFixed(2);

// What a closed order paid the seller, and what it was for.
export function sellerEarnings(order: ClosedOrder) {
  if (order.status === 'completed') {
    const sales = Number(order.subtotal_amount || 0);
    const paid = Number(order.farmer_payout_amount || 0);
    return { sales, fee: Math.max(0, sales - paid), restocking: 0, paid };
  }
  // A cancelled order pays only a restocking fee, if anything.
  const restocking = Number(order.no_show_fee_amount || 0);
  return { sales: 0, fee: 0, restocking, paid: restocking };
}

// One cell, quoted for CSV. Text that a spreadsheet would run as a formula is
// made plain, since listing names and email addresses are typed by other people.
function cell(value: string | number) {
  let text = String(value ?? '');
  if (/^[=+\-@\t\r]/.test(text) && typeof value !== 'number') text = `'${text}`;
  return `"${text.replace(/"/g, '""')}"`;
}

// The years these orders fall in, newest first, for the "which year" menu.
// An order counts in the year it was picked up, or was placed if it never was.
export function salesYears(orders: ClosedOrder[]) {
  const years = new Set(orders.map((o) => new Date(o.completed_at || o.created_at).getFullYear()));
  return [...years].sort((a, b) => b - a);
}

export function buildSalesCsv(orders: ClosedOrder[], year: number | 'all') {
  const rows = orders
    .filter((o) => year === 'all' || new Date(o.completed_at || o.created_at).getFullYear() === year)
    .sort((a, b) => (a.completed_at || a.created_at).localeCompare(b.completed_at || b.created_at));

  const header = [
    'Order number',
    'Date ordered',
    'Date picked up',
    'Outcome',
    'Item',
    'Quantity',
    'Unit',
    'Produce sales ($)',
    'Farm Fresh Direct fee ($)',
    'Restocking fee paid to you ($)',
    'Paid to you ($)',
    'Buyer email',
  ];

  const lines = rows.map((o) => {
    const { sales, fee, restocking, paid } = sellerEarnings(o);
    const completed = o.status === 'completed';
    return [
      orderRef(o),
      day(o.created_at),
      completed ? day(o.completed_at) : '',
      completed ? 'Picked up' : CANCEL_REASONS[o.cancel_reason || ''] || 'Cancelled',
      o.listing_title || '',
      // A cancelled order's quantity is zeroed, so show what was ordered.
      Number((completed ? o.reserved_quantity : o.original_quantity ?? o.reserved_quantity) ?? 0),
      o.listing_unit_type || '',
      dollars(sales),
      dollars(fee),
      dollars(restocking),
      dollars(paid),
      o.buyer_email || '',
    ]
      .map(cell)
      .join(',');
  });

  const totals = rows.reduce(
    (sum, o) => {
      const e = sellerEarnings(o);
      return { sales: sum.sales + e.sales, fee: sum.fee + e.fee, restocking: sum.restocking + e.restocking, paid: sum.paid + e.paid };
    },
    { sales: 0, fee: 0, restocking: 0, paid: 0 }
  );
  const totalLine = ['Total', '', '', '', '', '', '', dollars(totals.sales), dollars(totals.fee), dollars(totals.restocking), dollars(totals.paid), '']
    .map(cell)
    .join(',');

  return { csv: [header.map(cell).join(','), ...lines, totalLine].join('\r\n'), count: rows.length, totals };
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
