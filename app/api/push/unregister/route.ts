import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';

export const dynamic = 'force-dynamic';

// Signing out of the phone app: this phone stops getting the account's
// notifications. It runs just after sign-out, so there is no session to
// check; the token itself is the proof, since only that phone knows it, and
// all removing it can do is stop notifications to that phone.
export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}));
    const token = typeof body.token === 'string' ? body.token.trim() : '';
    if (!token || token.length > 512) return NextResponse.json({ removed: false });
    await supabaseAdmin.from('push_devices').delete().eq('token', token);
    return NextResponse.json({ removed: true });
  } catch (err: any) {
    console.error('push unregister error:', err?.message || err);
    return NextResponse.json({ error: 'Could not turn off notifications.' }, { status: 500 });
  }
}
