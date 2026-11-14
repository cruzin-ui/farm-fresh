import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { getRequestUser } from '@/lib/apiAuth';
import { alertAdmin, notifyAdmins } from '@/lib/alerts';
import { escapeHtml } from '@/lib/email';
import { COTTAGE_REG_PATTERN, cleanCottageReg } from '@/lib/categories';
import { CERTIFICATE_MAX_BYTES, CERTIFICATE_TYPES } from '@/lib/wholesale';
import { COTTAGE_CERTIFICATE_BUCKET, cottageRegistrationFor, removeCottageRegistration } from '@/lib/cottageFood';

export const dynamic = 'force-dynamic';

// A seller's Arizona cottage food registration, which lets them list jams,
// preserves and baked goods.
//   form with `number` and `file` (the registration certificate, a PDF or
//   photo)   → saves it (replacing any earlier one) and emails the admins a
//              link to spot-check the certificate
//   JSON { action: 'get' }      → { registration: { regNumber, submittedAt } | null }
//   JSON { action: 'remove' }   → removes it and takes the farm's cottage
//                                 food listings off sale: { takenDown }
export async function POST(request: Request) {
  try {
    const user = await getRequestUser(request);
    if (!user) return NextResponse.json({ error: 'Sign in first.' }, { status: 401 });

    if (!(request.headers.get('content-type') || '').includes('multipart/form-data')) {
      const body = await request.json().catch(() => ({}));
      if (body.action === 'remove') {
        const takenDown = await removeCottageRegistration(user.id);
        return NextResponse.json({ registration: null, takenDown });
      }
      return NextResponse.json({ registration: await cottageRegistrationFor(user.id) });
    }

    const form = await request.formData();
    const regNumber = cleanCottageReg(form.get('number'));
    const file = form.get('file');

    if (!COTTAGE_REG_PATTERN.test(regNumber)) {
      return NextResponse.json(
        { error: 'Enter your registration number as it appears on your certificate: letters, numbers and dashes.' },
        { status: 400 }
      );
    }
    if (!(file instanceof File) || file.size === 0) {
      return NextResponse.json({ error: 'Upload your registration certificate (a PDF or a photo).' }, { status: 400 });
    }
    const extension = CERTIFICATE_TYPES[file.type];
    if (!extension) {
      return NextResponse.json({ error: 'Upload the certificate as a PDF or a photo (JPG, PNG, HEIC or WebP).' }, { status: 400 });
    }
    if (file.size > CERTIFICATE_MAX_BYTES) {
      return NextResponse.json({ error: 'That file is too big. Upload one under 4 MB, or take a photo of it instead.' }, { status: 400 });
    }

    const filePath = `${user.id}/${Date.now()}.${extension}`;
    const { error: uploadError } = await supabaseAdmin.storage
      .from(COTTAGE_CERTIFICATE_BUCKET)
      .upload(filePath, Buffer.from(await file.arrayBuffer()), { contentType: file.type });
    if (uploadError) throw uploadError;

    // A new certificate replaces the old one, file and all.
    const { data: previous } = await supabaseAdmin
      .from('cottage_food_registrations')
      .select('file_path')
      .eq('farmer_id', user.id)
      .maybeSingle();
    const submittedAt = new Date().toISOString();
    const { error } = await supabaseAdmin
      .from('cottage_food_registrations')
      .upsert({ farmer_id: user.id, reg_number: regNumber, file_path: filePath, submitted_at: submittedAt });
    if (error) throw error;
    if (previous?.file_path && previous.file_path !== filePath) {
      await supabaseAdmin.storage.from(COTTAGE_CERTIFICATE_BUCKET).remove([previous.file_path]);
    }

    // The number buyers see on the farm's cottage food listings.
    const { data: profile } = await supabaseAdmin
      .from('seller_profiles')
      .update({ cottage_food_reg: regNumber })
      .eq('id', user.id)
      .select('farm_name')
      .maybeSingle();

    // For a spot-check: a link to the certificate, good for a week.
    const { data: link } = await supabaseAdmin.storage
      .from(COTTAGE_CERTIFICATE_BUCKET)
      .createSignedUrl(filePath, 7 * 24 * 60 * 60);
    const farm = profile?.farm_name || user.email || 'A seller';
    await notifyAdmins(
      `Cottage food certificate to spot-check: ${farm}`,
      `<p><strong>${escapeHtml(farm)}</strong> added Arizona cottage food registration
       <strong>${escapeHtml(regNumber)}</strong> and can now list jams, preserves and baked goods.</p>
       ${link?.signedUrl ? `<p><a href="${escapeHtml(link.signedUrl)}">View the certificate</a> (link works for 7 days).</p>` : ''}
       <p>If it doesn't look right, remove their listings from the admin page and contact them.</p>`
    );

    return NextResponse.json({ registration: { regNumber, submittedAt } });
  } catch (err) {
    console.error('cottage food registration error:', err);
    await alertAdmin('cottage food registration error', err);
    return NextResponse.json({ error: 'Your registration could not be saved. Please try again.' }, { status: 500 });
  }
}
