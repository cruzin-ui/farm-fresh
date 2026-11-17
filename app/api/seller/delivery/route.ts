import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { getRequestUser } from '@/lib/apiAuth';
import { alertAdmin } from '@/lib/alerts';
import { isTime } from '@/lib/appearances';
import { MAX_DELIVERY_MILES, describeDelivery, type DeliverySettings } from '@/lib/delivery';
import { farmDelivery } from '@/lib/deliveryServer';

export const dynamic = 'force-dynamic';

const whole = (value: unknown, min: number, max: number) => {
  const n = Math.round(Number(value));
  return Number.isFinite(n) && n >= min && n <= max ? n : null;
};

// A seller's delivery settings (Farm Profile & Photo → Delivery).
//   { action: 'get' }                     → { settings, agreed }
//   { action: 'save', settings, agree }   → saves them. Turning delivery on
//     the first time needs `agree: true`: the farm accepts the delivery rules
//     in the Seller Terms (including the egg rule if it delivers eggs).
export async function POST(request: Request) {
  try {
    const user = await getRequestUser(request);
    if (!user) return NextResponse.json({ error: 'Sign in first.' }, { status: 401 });

    const body = await request.json().catch(() => ({}));
    const current = await farmDelivery(user.id);
    if (body.action !== 'save') {
      return NextResponse.json({ settings: current, agreed: current.agreed });
    }

    const input = (body.settings || {}) as Record<string, unknown>;
    const weekdays = Array.isArray(input.weekdays)
      ? [...new Set(input.weekdays.map(Number).filter((d) => Number.isInteger(d) && d >= 0 && d <= 6))]
      : [];
    const settings: DeliverySettings = {
      enabled: input.enabled === true,
      radius_miles: whole(input.radius_miles, 1, MAX_DELIVERY_MILES) ?? -1,
      fee_cents: whole(input.fee_cents, 0, 5000) ?? -1,
      per_mile_cents: whole(input.per_mile_cents, 0, 500) ?? -1,
      min_order_cents: whole(input.min_order_cents, 0, 50000) ?? -1,
      weekdays,
      start_time: isTime(input.start_time) ? input.start_time : '',
      end_time: isTime(input.end_time) ? input.end_time : '',
      delivers_eggs: input.delivers_eggs === true,
      note: typeof input.note === 'string' ? input.note.trim().slice(0, 300) : '',
    };

    if (settings.radius_miles < 0) return NextResponse.json({ error: `Choose how far you deliver: 1 to ${MAX_DELIVERY_MILES} miles.` }, { status: 400 });
    if (settings.fee_cents < 0) return NextResponse.json({ error: 'The delivery fee can be $0 to $50.' }, { status: 400 });
    if (settings.per_mile_cents < 0) return NextResponse.json({ error: 'The amount per mile can be $0 to $5.' }, { status: 400 });
    if (settings.min_order_cents < 0) return NextResponse.json({ error: 'The smallest order can be $0 to $500.' }, { status: 400 });
    if (!settings.start_time || !settings.end_time || settings.end_time <= settings.start_time) {
      return NextResponse.json({ error: 'Choose a delivery window that ends after it starts.' }, { status: 400 });
    }
    if (settings.enabled && settings.weekdays.length === 0) {
      return NextResponse.json({ error: 'Choose at least one delivery day.' }, { status: 400 });
    }
    const agreeing = body.agree === true;
    if (settings.enabled && !current.agreed && !agreeing) {
      return NextResponse.json({ error: 'Tick the box to agree to the delivery rules first.' }, { status: 400 });
    }
    // Saying yes to eggs is a promise about keeping them cold, so it is
    // agreed to each time it is turned on.
    if (settings.delivers_eggs && !current.delivers_eggs && !agreeing) {
      return NextResponse.json({ error: 'Tick the box to confirm the egg rule first.' }, { status: 400 });
    }

    const now = new Date().toISOString();
    const { error } = await supabaseAdmin.from('farm_delivery').upsert(
      {
        farmer_id: user.id,
        ...settings,
        ...(agreeing ? { agreed_at: now } : {}),
        updated_at: now,
      },
      { onConflict: 'farmer_id' }
    );
    if (error) throw error;

    return NextResponse.json({
      settings,
      agreed: current.agreed || agreeing,
      summary: settings.enabled ? describeDelivery(settings) : null,
    });
  } catch (err) {
    console.error('seller delivery error:', err);
    await alertAdmin('seller delivery settings', err);
    return NextResponse.json({ error: 'Could not save your delivery settings. Please try again.' }, { status: 500 });
  }
}
