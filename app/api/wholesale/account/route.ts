import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { getRequestUser } from '@/lib/apiAuth';
import { wholesaleStatusFor } from '@/lib/wholesaleServer';
import { BUSINESS_TYPES } from '@/lib/wholesale';
import { alertAdmin, notifyAdmins } from '@/lib/alerts';
import { escapeHtml } from '@/lib/email';

export const dynamic = 'force-dynamic';

const clean = (value: unknown, max: number) => (typeof value === 'string' ? value.trim().slice(0, max) : '');

// A business's own wholesale account.
//   { action: 'status' }  → where the application and certificate stand
//   { action: 'apply', businessName, businessType, businessAddress, phone }
//     Applies, or (after a decline) applies again. Details can be updated
//     while waiting; an approved account's details can only be changed by
//     contacting us, since prices and tax exemption hang on them.
export async function POST(request: Request) {
  try {
    const user = await getRequestUser(request);
    if (!user) return NextResponse.json({ error: 'Sign in first.' }, { status: 401 });

    const body = await request.json();

    if (body.action === 'status') {
      return NextResponse.json(await wholesaleStatusFor(user.id));
    }

    if (body.action !== 'apply') {
      return NextResponse.json({ error: 'Unknown action.' }, { status: 400 });
    }

    const businessName = clean(body.businessName, 120);
    const businessType = clean(body.businessType, 40);
    const businessAddress = clean(body.businessAddress, 300);
    const phone = clean(body.phone, 40);

    if (!businessName || !businessAddress || !phone) {
      return NextResponse.json({ error: 'Enter your business name, address and phone number.' }, { status: 400 });
    }
    if (!BUSINESS_TYPES.includes(businessType)) {
      return NextResponse.json({ error: 'Choose the kind of business.' }, { status: 400 });
    }
    if ((phone.match(/\d/g) || []).length < 10) {
      return NextResponse.json({ error: 'Enter a phone number with area code.' }, { status: 400 });
    }

    const { data: existing } = await supabaseAdmin.from('wholesale_accounts').select('status').eq('user_id', user.id).maybeSingle();
    if (existing?.status === 'approved') {
      return NextResponse.json({ error: 'Your wholesale account is already approved. Contact us to change its details.' }, { status: 409 });
    }

    const { error } = await supabaseAdmin.from('wholesale_accounts').upsert({
      user_id: user.id,
      business_name: businessName,
      business_type: businessType,
      business_address: businessAddress,
      phone,
      status: 'pending',
      decline_reason: null,
      applied_at: new Date().toISOString(),
      reviewed_at: null,
      reviewed_by: null,
    });
    if (error) throw error;

    if (existing?.status !== 'pending') {
      await notifyAdmins(
        `Wholesale application: ${businessName}`,
        `<p><strong>${escapeHtml(businessName)}</strong> (${escapeHtml(businessType)}) applied for a wholesale account.</p>
         <p>${escapeHtml(businessAddress)}<br />${escapeHtml(phone)}<br />${escapeHtml(user.email || '')}</p>
         <p>Review it under Wholesale on the admin page.</p>`
      );
    }

    return NextResponse.json(await wholesaleStatusFor(user.id));
  } catch (err: any) {
    console.error('wholesale account error:', err);
    await alertAdmin('wholesale account error', err);
    return NextResponse.json({ error: 'Something went wrong. Please try again.' }, { status: 500 });
  }
}
