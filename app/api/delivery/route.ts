import { NextResponse } from 'next/server';
import { deliveringFarms } from '@/lib/deliveryServer';
import { describeDelivery } from '@/lib/delivery';

export const dynamic = 'force-dynamic';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Public: whether a farm delivers, in words, for its farm page and listings.
// GET /api/delivery?farmerId=... → { delivery: { summary, note, deliversEggs } | null }
export async function GET(request: Request) {
  const farmerId = new URL(request.url).searchParams.get('farmerId') || '';
  if (!UUID.test(farmerId)) return NextResponse.json({ delivery: null });
  const farm = (await deliveringFarms([farmerId])).get(farmerId);
  return NextResponse.json(
    {
      delivery:
        farm && farm.weekdays.length > 0
          ? { summary: describeDelivery(farm), note: farm.note, deliversEggs: farm.delivers_eggs }
          : null,
    },
    { headers: { 'Cache-Control': 'public, max-age=300' } }
  );
}
