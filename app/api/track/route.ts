import { NextResponse } from 'next/server';
import { bumpDailyCount } from '@/lib/dailyCounts';

export const dynamic = 'force-dynamic';

// Counts a shopper reaching the checkout page with something in their cart.
// The browser calls this once per visit. It is the only step of checkout the
// server can't see for itself; pressing Pay and paying are counted where they
// happen. It records a total, nothing about the visitor.
export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}));
  if (body.event === 'checkout_opened') await bumpDailyCount('checkout_opened');
  return NextResponse.json({ ok: true });
}
