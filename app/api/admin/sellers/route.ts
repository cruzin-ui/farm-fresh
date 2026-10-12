import { NextResponse } from 'next/server';
import { getRequestAdmin } from '@/lib/apiAuth';
import { alertAdmin } from '@/lib/alerts';
import { loadSellerRecords } from '@/lib/sellerRecords';

export const dynamic = 'force-dynamic';

// Admin-only: every seller's track record (see lib/sellerRecords.ts).
export async function POST(request: Request) {
  try {
    const admin = await getRequestAdmin(request);
    if (!admin) {
      return NextResponse.json({ error: 'Not authorized.' }, { status: 403 });
    }

    return NextResponse.json({ sellers: await loadSellerRecords() });
  } catch (err: any) {
    console.error('admin sellers error:', err);
    await alertAdmin('admin sellers error', err);
    return NextResponse.json({ error: err.message || 'Failed to load sellers.' }, { status: 500 });
  }
}
