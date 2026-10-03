import { NextResponse } from 'next/server';
import { stripeAdmin } from '@/lib/stripeAdmin';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { getRequestUser } from '@/lib/apiAuth';

export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  try {
    const user = await getRequestUser(request);
    if (!user) {
      return NextResponse.json({ error: 'You must be signed in.' }, { status: 401 });
    }

    const { data: profile, error: profileError } = await supabaseAdmin
      .from('seller_profiles')
      .select('stripe_account_id')
      .eq('id', user.id)
      .maybeSingle();

    if (profileError) {
      return NextResponse.json({ error: profileError.message }, { status: 500 });
    }

    // Reuse the existing account if one was already created for this seller.
    if (profile?.stripe_account_id) {
      return NextResponse.json({ accountId: profile.stripe_account_id });
    }

    const account = await stripeAdmin.accounts.create({
      type: 'express',
      email: user.email,
      capabilities: {
        transfers: { requested: true },
      },
    });

    const { error: upsertError } = await supabaseAdmin
      .from('seller_profiles')
      .upsert({ id: user.id, stripe_account_id: account.id });

    if (upsertError) {
      return NextResponse.json({ error: upsertError.message }, { status: 500 });
    }

    return NextResponse.json({ accountId: account.id });
  } catch (err: any) {
    console.error('create-account error:', err);
    return NextResponse.json({ error: err.message || 'Failed to create account.' }, { status: 500 });
  }
}
