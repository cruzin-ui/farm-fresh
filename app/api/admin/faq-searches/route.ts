import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { getRequestAdmin } from '@/lib/apiAuth';
import { alertAdmin } from '@/lib/alerts';

export const dynamic = 'force-dynamic';

// Admin-only: FAQ searches that found no answer, most searched first.
// { action: 'dismiss', query } removes one, once its answer has been added
// (or it isn't worth one).
export async function POST(request: Request) {
  try {
    const admin = await getRequestAdmin(request);
    if (!admin) return NextResponse.json({ error: 'Not authorized.' }, { status: 403 });

    const body = await request.json().catch(() => ({}));
    if (body.action === 'dismiss') {
      if (typeof body.query !== 'string') return NextResponse.json({ error: 'Which search?' }, { status: 400 });
      const { error } = await supabaseAdmin.from('faq_missed_searches').delete().eq('query', body.query);
      if (error) throw error;
      return NextResponse.json({ ok: true });
    }

    const { data, error } = await supabaseAdmin
      .from('faq_missed_searches')
      .select('query, searches, closest, first_searched_at, last_searched_at')
      .order('searches', { ascending: false })
      .order('last_searched_at', { ascending: false })
      .limit(200);
    // The table doesn't exist until db/faq_searches.sql has been run.
    if (error) return NextResponse.json({ searches: null });
    return NextResponse.json({ searches: data || [] });
  } catch (err: any) {
    console.error('FAQ searches error:', err);
    await alertAdmin('admin FAQ searches', err);
    return NextResponse.json({ error: err.message || 'Could not load FAQ searches.' }, { status: 500 });
  }
}
