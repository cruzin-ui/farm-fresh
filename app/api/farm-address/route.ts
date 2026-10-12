import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { getRequestUser } from '@/lib/apiAuth';
import { tidyFarmAddress, farmAddressProblem } from '@/lib/farmAddress';
import { alertAdmin } from '@/lib/alerts';

export const dynamic = 'force-dynamic';

// A seller choosing their farm's web address (farmfreshdirect.online/<name>).
//   { address, check: true }  — says whether it can be used, without taking it
//   { address }               — takes it, for good
// A seller sets theirs once. Changing it afterwards is for an admin.
export async function POST(request: Request) {
  try {
    const user = await getRequestUser(request);
    if (!user) {
      return NextResponse.json({ error: 'You must be signed in.' }, { status: 401 });
    }

    const body = await request.json().catch(() => ({}));
    const address = tidyFarmAddress(typeof body.address === 'string' ? body.address : '');

    const problem = farmAddressProblem(address);
    if (problem) return NextResponse.json({ available: false, error: problem }, { status: body.check ? 200 : 400 });

    const { data: taken } = await supabaseAdmin.from('seller_profiles').select('id').eq('slug', address).maybeSingle();
    if (taken && taken.id !== user.id) {
      return NextResponse.json(
        { available: false, error: 'Another farm already has that one. Please choose another.' },
        { status: body.check ? 200 : 409 }
      );
    }

    if (body.check) return NextResponse.json({ available: true, address });

    const { data: profile } = await supabaseAdmin
      .from('seller_profiles')
      .select('id, slug, farm_name')
      .eq('id', user.id)
      .maybeSingle();

    if (!profile || !String(profile.farm_name || '').trim()) {
      return NextResponse.json(
        { error: 'Save your farm name first, then choose your web address.' },
        { status: 409 }
      );
    }
    if (profile.slug) {
      return NextResponse.json(
        { error: "Your farm's web address is already set. Contact us if it needs to change." },
        { status: 409 }
      );
    }

    const { error } = await supabaseAdmin
      .from('seller_profiles')
      .update({ slug: address })
      .eq('id', user.id)
      .is('slug', null);

    if (error) {
      // Someone else took it in the same moment.
      if (error.code === '23505') {
        return NextResponse.json({ error: 'Another farm has just taken that one. Please choose another.' }, { status: 409 });
      }
      throw error;
    }

    return NextResponse.json({ success: true, address });
  } catch (err: any) {
    console.error('farm address error:', err);
    await alertAdmin('farm address error', err);
    return NextResponse.json({ error: 'Could not set that address. Please try again.' }, { status: 500 });
  }
}
