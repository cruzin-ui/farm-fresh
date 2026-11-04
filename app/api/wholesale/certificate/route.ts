import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { getRequestUser } from '@/lib/apiAuth';
import { CERTIFICATE_BUCKET, wholesaleStatusFor } from '@/lib/wholesaleServer';
import { CERTIFICATE_MAX_BYTES, CERTIFICATE_TYPES, arizonaToday, formatDay } from '@/lib/wholesale';
import { alertAdmin, notifyAdmins } from '@/lib/alerts';
import { escapeHtml } from '@/lib/email';

export const dynamic = 'force-dynamic';

// Uploads a business's Arizona resale certificate (Form 5000A), with the
// date it expires, for an admin to check. Sent as a form: `file` and
// `expiresOn` (yyyy-mm-dd). The file goes in private storage that only the
// server can read. A certificate still waiting to be checked is replaced by a
// newer upload; approved ones are kept as the record behind past sales.
export async function POST(request: Request) {
  try {
    const user = await getRequestUser(request);
    if (!user) return NextResponse.json({ error: 'Sign in first.' }, { status: 401 });

    const { data: account } = await supabaseAdmin
      .from('wholesale_accounts')
      .select('business_name, status')
      .eq('user_id', user.id)
      .maybeSingle();
    if (!account || account.status === 'declined') {
      return NextResponse.json({ error: 'Apply for a wholesale account first.' }, { status: 409 });
    }

    const form = await request.formData();
    const file = form.get('file');
    const expiresOn = String(form.get('expiresOn') || '');

    if (!(file instanceof File) || file.size === 0) {
      return NextResponse.json({ error: 'Choose the certificate file (a PDF or a photo).' }, { status: 400 });
    }
    const extension = CERTIFICATE_TYPES[file.type];
    if (!extension) {
      return NextResponse.json({ error: 'Upload the certificate as a PDF or a photo (JPG, PNG, HEIC or WebP).' }, { status: 400 });
    }
    if (file.size > CERTIFICATE_MAX_BYTES) {
      return NextResponse.json({ error: 'That file is too big. Upload one under 4 MB, or take a photo of it instead.' }, { status: 400 });
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(expiresOn) || Number.isNaN(Date.parse(expiresOn))) {
      return NextResponse.json({ error: 'Enter the date the certificate expires.' }, { status: 400 });
    }
    if (expiresOn < arizonaToday()) {
      return NextResponse.json({ error: 'That certificate has already expired. Upload a current one.' }, { status: 400 });
    }

    const filePath = `${user.id}/${Date.now()}.${extension}`;
    const { error: uploadError } = await supabaseAdmin.storage
      .from(CERTIFICATE_BUCKET)
      .upload(filePath, Buffer.from(await file.arrayBuffer()), { contentType: file.type });
    if (uploadError) throw uploadError;

    // One waiting to be checked is superseded by this one.
    await supabaseAdmin
      .from('wholesale_certificates')
      .update({ status: 'replaced' })
      .eq('user_id', user.id)
      .eq('status', 'pending');

    const { error } = await supabaseAdmin.from('wholesale_certificates').insert({
      user_id: user.id,
      business_name: account.business_name,
      file_path: filePath,
      expires_on: expiresOn,
    });
    if (error) throw error;

    await notifyAdmins(
      `Resale certificate to check: ${account.business_name}`,
      `<p><strong>${escapeHtml(account.business_name)}</strong> uploaded a resale certificate (Form 5000A) that expires
       ${escapeHtml(formatDay(expiresOn))}.</p><p>Check it under Wholesale on the admin page.</p>`
    );

    return NextResponse.json(await wholesaleStatusFor(user.id));
  } catch (err: any) {
    console.error('resale certificate upload error:', err);
    await alertAdmin('resale certificate upload error', err);
    return NextResponse.json({ error: 'The certificate could not be uploaded. Please try again.' }, { status: 500 });
  }
}
