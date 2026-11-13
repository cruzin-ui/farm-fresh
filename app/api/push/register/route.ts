import { NextResponse } from 'next/server';
import { getRequestUser } from '@/lib/apiAuth';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { pushConfigured } from '@/lib/push';

export const dynamic = 'force-dynamic';

// The phone app sends its push token here once the signed-in person allows
// notifications (components/NativeApp.tsx). The token belongs to whoever is
// signed in on that phone now.
//
// Posting {} only asks whether the server can send to this platform yet, so
// the app doesn't ask for permission before notifications can work.
export async function POST(request: Request) {
  try {
    const user = await getRequestUser(request);
    if (!user) return NextResponse.json({ error: 'You must be signed in.' }, { status: 401 });

    const body = await request.json().catch(() => ({}));
    const platform = body.platform === 'ios' || body.platform === 'android' ? body.platform : null;
    if (!platform) return NextResponse.json({ error: 'Unknown platform.' }, { status: 400 });
    const ready = pushConfigured()[platform as 'ios' | 'android'];

    const token = typeof body.token === 'string' ? body.token.trim() : '';
    if (!token) return NextResponse.json({ ready });
    if (token.length > 512 || !/^[\w:.\-]+$/.test(token)) {
      return NextResponse.json({ error: 'That is not a push token.' }, { status: 400 });
    }

    const { error } = await supabaseAdmin
      .from('push_devices')
      .upsert({ token, user_id: user.id, platform, last_seen_at: new Date().toISOString() }, { onConflict: 'token' });
    if (error) throw error;
    return NextResponse.json({ ready, saved: true });
  } catch (err: any) {
    console.error('push register error:', err?.message || err);
    return NextResponse.json({ error: 'Could not turn on notifications.' }, { status: 500 });
  }
}
