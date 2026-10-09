import { NextResponse } from 'next/server';
import { timingSafeEqual } from 'crypto';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { getRequestUser } from '@/lib/apiAuth';
import { getPickupCodeRecord } from '@/lib/pickupCodes';
import { escapeHtml } from '@/lib/email';
import { alertAdmin, notifyAdmins } from '@/lib/alerts';

export const dynamic = 'force-dynamic';

const MAX_NOTE_LENGTH = 1000;

function tokensMatch(a: string, b: string) {
  const bufferA = Buffer.from(a);
  const bufferB = Buffer.from(b);
  return bufferA.length === bufferB.length && timingSafeEqual(bufferA, bufferB);
}

// The buyer's side of a pickup. After a farmer marks an item picked up, the
// buyer is asked to confirm they received it:
//   { received: true }          — yes, they got it;
//   { received: false, note }   — the farmer marked it picked up but they did
//                                  not get it (the two accounts don't match);
//   { note }                    — any other problem with an order, open or not.
// A problem is saved on the order and emailed to the admins, who decide what
// to do. Signed-in buyers are matched by account; guests by the secret token
// in their order link.
export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { orderId } = body;
    const token = typeof body.token === 'string' ? body.token : '';
    const received: boolean | null = typeof body.received === 'boolean' ? body.received : null;
    const note = typeof body.note === 'string' ? body.note.trim().slice(0, MAX_NOTE_LENGTH) : '';

    if (!orderId) {
      return NextResponse.json({ error: 'Missing order.' }, { status: 400 });
    }

    const { data: order } = await supabaseAdmin.from('orders').select('*').eq('id', orderId).maybeSingle();
    if (!order) {
      return NextResponse.json({ error: 'Order not found.' }, { status: 404 });
    }

    const user = await getRequestUser(request);
    let isBuyer = Boolean(user && order.buyer_id && order.buyer_id === user.id);

    if (!isBuyer && !order.buyer_id && token) {
      const codeRecord = await getPickupCodeRecord(order.id);
      const expectedToken = codeRecord?.guestToken || order.guest_access_token;
      isBuyer = Boolean(expectedToken && tokensMatch(expectedToken, token));
    }

    if (!isBuyer) {
      return NextResponse.json({ error: 'Order not found.' }, { status: 404 });
    }

    if (received !== null && order.status !== 'completed') {
      return NextResponse.json(
        { error: "This item hasn't been marked as picked up, so there's nothing to confirm yet." },
        { status: 409 }
      );
    }

    if (received === true) {
      const { error } = await supabaseAdmin
        .from('orders')
        .update({ buyer_received_at: new Date().toISOString() })
        .eq('id', order.id);
      if (error) throw error;
      return NextResponse.json({ success: true });
    }

    if (note.length < 5) {
      return NextResponse.json({ error: 'Please tell us briefly what happened.' }, { status: 400 });
    }

    const { error } = await supabaseAdmin
      .from('orders')
      .update({
        buyer_problem_at: new Date().toISOString(),
        buyer_problem_note: note,
        buyer_problem_resolved_at: null,
      })
      .eq('id', order.id);
    if (error) throw error;

    const { data: listing } = await supabaseAdmin
      .from('produce_listings')
      .select('title, unit_type, farmer_id')
      .eq('id', order.listing_id)
      .maybeSingle();
    const { data: farm } = listing?.farmer_id
      ? await supabaseAdmin.from('seller_profiles').select('farm_name').eq('id', listing.farmer_id).maybeSingle()
      : { data: null };

    const what = `${Number(order.reserved_quantity ?? order.quantity ?? 0)} ${listing?.unit_type || 'units'} of ${listing?.title || 'produce'}`;
    const notReceived = received === false;

    await notifyAdmins(
      notReceived ? 'Buyer says an item marked picked up was not received' : 'A buyer reported a problem with an order',
      `
        <h2 style="color: #b91c1c;">${
          notReceived ? "The buyer's and seller's accounts of a pickup don't match" : 'A buyer reported a problem'
        }</h2>
        <p>
          Order <strong>#${String(order.id).slice(0, 8)}</strong>: ${escapeHtml(what)} from
          ${escapeHtml(farm?.farm_name || 'an unknown farm')}, bought by ${escapeHtml(order.buyer_email || 'an unknown buyer')}.
        </p>
        ${
          notReceived
            ? `<p>
                The seller marked it <strong>picked up</strong>${
                  order.completed_at ? ` on ${new Date(order.completed_at).toLocaleString('en-US', { timeZone: 'America/Phoenix' })}` : ''
                } and has been paid $${Number(order.farmer_payout_amount ?? 0).toFixed(2)}. The buyer says they
                <strong>did not receive it</strong>.
              </p>`
            : `<p>The order is currently <strong>${escapeHtml(String(order.status).replace(/_/g, ' '))}</strong>.</p>`
        }
        <p><strong>What the buyer wrote:</strong></p>
        <p style="white-space: pre-wrap; padding: 12px; background: #f3f4f6;">${escapeHtml(note)}</p>
        <p>
          Nothing has been changed automatically. Contact both sides, then use the admin page: Cancel &amp; Refund
          returns the buyer's money and, for a picked-up order, takes the payout back from the seller.
        </p>
        <p><a href="${new URL(request.url).origin}/admin">Open the admin page</a></p>
      `
    );

    return NextResponse.json({ success: true });
  } catch (err: any) {
    console.error('order feedback error:', err);
    await alertAdmin('order feedback error', err);
    return NextResponse.json({ error: 'Could not send that. Please use the Contact Us page.' }, { status: 500 });
  }
}
