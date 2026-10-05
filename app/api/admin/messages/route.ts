import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { getRequestAdmin } from '@/lib/apiAuth';
import { alertAdmin } from '@/lib/alerts';

export const dynamic = 'force-dynamic';

// Admin-only: lists the messages sent through the Contact Us form, and marks
// one resolved or unresolved when called with { id, resolved }.
export async function POST(request: Request) {
  try {
    const admin = await getRequestAdmin(request);
    if (!admin) {
      return NextResponse.json({ error: 'Not authorized.' }, { status: 403 });
    }

    const body = await request.json().catch(() => ({}));

    if (body.id) {
      const { error } = await supabaseAdmin
        .from('contact_messages')
        .update({ resolved: Boolean(body.resolved) })
        .eq('id', body.id);

      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
      return NextResponse.json({ success: true });
    }

    const { data: messages, error } = await supabaseAdmin
      .from('contact_messages')
      .select('id, created_at, email, subject, message, resolved, user_id')
      .order('created_at', { ascending: false })
      .limit(100);

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    return NextResponse.json({ messages: messages || [] });
  } catch (err: any) {
    console.error('admin messages error:', err);
    await alertAdmin('admin messages error', err);
    return NextResponse.json({ error: err.message || 'Failed to load messages.' }, { status: 500 });
  }
}
