import { NextResponse } from 'next/server';
import { publicAppearances } from '@/lib/appearancesServer';
import { alertAdmin } from '@/lib/alerts';

export const dynamic = 'force-dynamic';

// Where a farm will be next, for anyone: { farmerId }.
export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}));
    const farmerId = typeof body.farmerId === 'string' && /^[0-9a-f-]{36}$/i.test(body.farmerId) ? body.farmerId : '';
    if (!farmerId) return NextResponse.json({ events: [] });
    return NextResponse.json({ events: await publicAppearances(farmerId) });
  } catch (err: any) {
    console.error('public appearances error:', err);
    await alertAdmin('public appearances', err);
    return NextResponse.json({ events: [] });
  }
}
