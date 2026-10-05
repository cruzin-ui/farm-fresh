import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { getRequestAdmin } from '@/lib/apiAuth';
import { alertAdmin } from '@/lib/alerts';

export const dynamic = 'force-dynamic';

// Admin-only: lists the most recent reviews, and removes one when called with
// { id }. A removed review disappears from the farm's page and its star
// rating, and its text is erased for good. The row itself stays, so the same
// order can't be used to post the review again.
export async function POST(request: Request) {
  try {
    const admin = await getRequestAdmin(request);
    if (!admin) {
      return NextResponse.json({ error: 'Not authorized.' }, { status: 403 });
    }

    const body = await request.json().catch(() => ({}));

    if (body.id) {
      const { error } = await supabaseAdmin
        .from('seller_reviews')
        .update({ removed_at: new Date().toISOString(), comment: null })
        .eq('id', body.id);

      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
      return NextResponse.json({ success: true });
    }

    const { data: reviews, error } = await supabaseAdmin
      .from('seller_reviews')
      .select('id, created_at, seller_id, order_id, rating, comment, removed_at')
      .order('created_at', { ascending: false })
      .limit(200);

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    const sellerIds = [...new Set((reviews || []).map((r) => r.seller_id).filter(Boolean))];
    const { data: profiles } = sellerIds.length
      ? await supabaseAdmin.from('seller_profiles').select('id, farm_name').in('id', sellerIds)
      : { data: [] as any[] };
    const farmNames = new Map((profiles || []).map((p: any) => [p.id, p.farm_name]));

    return NextResponse.json({
      reviews: (reviews || []).map((r) => ({
        id: r.id,
        created_at: r.created_at,
        seller_id: r.seller_id,
        order_id: r.order_id,
        farm_name: farmNames.get(r.seller_id) || 'Unknown farm',
        rating: Number(r.rating),
        comment: r.comment,
        removed: Boolean(r.removed_at),
      })),
    });
  } catch (err: any) {
    console.error('admin reviews error:', err);
    await alertAdmin('admin reviews error', err);
    return NextResponse.json({ error: err.message || 'Failed to load reviews.' }, { status: 500 });
  }
}
