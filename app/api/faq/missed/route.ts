import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { searchToRecord } from '@/lib/faqSearch';

export const dynamic = 'force-dynamic';

// Records an FAQ search that found no answer (see db/faq_searches.sql), for
// the admin page. Only the words searched are kept; nothing about who. The
// browser already tidies the search, and it is checked again here.
export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}));
  const query = typeof body.query === 'string' ? searchToRecord(body.query) : null;
  const closest = Math.min(Math.max(Math.trunc(Number(body.closest) || 0), 0), 10);

  if (query) {
    const { error } = await supabaseAdmin.rpc('record_faq_missed_search', { p_query: query, p_closest: closest });
    if (error) console.error('Could not record an FAQ search:', error.message);
  }

  return NextResponse.json({ ok: true });
}
