import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { getRequestAdmin } from '@/lib/apiAuth';

export const dynamic = 'force-dynamic';

// Admin-only: the most recent things admins have done (see lib/adminLog.ts).
export async function POST(request: Request) {
  const admin = await getRequestAdmin(request);
  if (!admin) {
    return NextResponse.json({ error: 'Not authorized.' }, { status: 403 });
  }

  const { data, error } = await supabaseAdmin
    .from('admin_actions')
    .select('id, created_at, admin_email, action, target, detail')
    .order('created_at', { ascending: false })
    .limit(300);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ actions: data || [] });
}
