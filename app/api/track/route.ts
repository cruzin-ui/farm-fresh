import { NextResponse } from 'next/server';
import { bumpDailyCount } from '@/lib/dailyCounts';
import { pageGroupFor } from '@/lib/pageGroups';
import { isScanSource } from '@/lib/scanSources';

export const dynamic = 'force-dynamic';

// Counts things only the browser knows happened, as daily totals for the admin
// page. Nothing about the visitor is recorded.
//   checkout_opened — a shopper reached checkout with something in their cart
//   page_view       — a page was opened; counted by the kind of page it is,
//                     plus one "visit" for the first page of a browser session,
//                     and one scan when it came from a printed QR code (src)
// Pressing Pay and paying are counted on the server, where they happen.
export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}));

  if (body.event === 'checkout_opened') {
    await bumpDailyCount('checkout_opened');
  } else if (body.event === 'page_view' && typeof body.path === 'string') {
    const group = pageGroupFor(body.path.slice(0, 300));
    if (group) {
      await bumpDailyCount(`page:${group}`);
      if (body.newVisit === true) await bumpDailyCount('visit');
    }
    if (isScanSource(body.src)) await bumpDailyCount(`scan:${body.src}`);
  }

  return NextResponse.json({ ok: true });
}
