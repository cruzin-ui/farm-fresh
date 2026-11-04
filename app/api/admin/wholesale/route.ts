import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { getRequestAdmin } from '@/lib/apiAuth';
import { sendEmail, escapeHtml } from '@/lib/email';
import { alertAdmin } from '@/lib/alerts';
import { logAdminAction } from '@/lib/adminLog';
import { CERTIFICATE_BUCKET } from '@/lib/wholesaleServer';
import { arizonaToday, formatDay } from '@/lib/wholesale';

export const dynamic = 'force-dynamic';

// Admin-only: wholesale accounts and resale certificates.
//   {}                                                    → the lists
//   { action: 'account', userId, decision: 'approve' | 'decline', reason? }
//   { action: 'certificate', id, decision: 'approve' | 'decline', reason? }
//   { action: 'view', id }                                → a link to a certificate's file, good for 5 minutes
// The business is emailed each decision.
export async function POST(request: Request) {
  try {
    const admin = await getRequestAdmin(request);
    if (!admin) return NextResponse.json({ error: 'Not authorized.' }, { status: 403 });

    const body = await request.json().catch(() => ({}));
    const reason = typeof body.reason === 'string' ? body.reason.trim().slice(0, 500) : '';
    const siteUrl = new URL(request.url).origin;

    if (body.action === 'view') {
      const { data: certificate } = await supabaseAdmin.from('wholesale_certificates').select('file_path').eq('id', body.id).maybeSingle();
      if (!certificate) return NextResponse.json({ error: 'Certificate not found.' }, { status: 404 });
      const { data, error } = await supabaseAdmin.storage.from(CERTIFICATE_BUCKET).createSignedUrl(certificate.file_path, 300);
      if (error || !data) throw error || new Error('No link');
      await logAdminAction(admin.email!, 'viewed resale certificate', body.id);
      return NextResponse.json({ url: data.signedUrl });
    }

    if (body.action === 'account' && ['approve', 'decline'].includes(body.decision)) {
      const approve = body.decision === 'approve';
      if (!approve && !reason) return NextResponse.json({ error: 'Give a reason; the business is told it.' }, { status: 400 });
      const { data: account, error } = await supabaseAdmin
        .from('wholesale_accounts')
        .update({
          status: approve ? 'approved' : 'declined',
          decline_reason: approve ? null : reason,
          reviewed_at: new Date().toISOString(),
          reviewed_by: admin.email,
        })
        .eq('user_id', body.userId)
        .select('business_name')
        .maybeSingle();
      if (error) throw error;
      if (!account) return NextResponse.json({ error: 'Account not found.' }, { status: 404 });
      await logAdminAction(admin.email!, approve ? 'approved wholesale account' : 'declined wholesale account', body.userId, reason || account.business_name);
      await emailBusiness(
        body.userId,
        approve ? 'Your wholesale account is approved' : 'Your wholesale application',
        approve
          ? `<p><strong>${escapeHtml(account.business_name)}</strong> is approved for wholesale on Farm Fresh Direct.</p>
             <p>On listings that farms sell by the case, you'll now see a Wholesale box with your business price.
             Sign in with this email address to see it.</p>
             <p>If you resell what you buy, upload your Arizona resale certificate (Form 5000A) on your
             <a href="${siteUrl}/account#wholesale">account page</a> to buy tax-free.</p>`
          : `<p>We weren't able to approve the wholesale account for <strong>${escapeHtml(account.business_name)}</strong>.</p>
             <p>Reason: ${escapeHtml(reason)}</p>
             <p>You can update your details and apply again on your <a href="${siteUrl}/account#wholesale">account page</a>.</p>`
      );
    } else if (body.action === 'certificate' && ['approve', 'decline'].includes(body.decision)) {
      const approve = body.decision === 'approve';
      if (!approve && !reason) return NextResponse.json({ error: 'Give a reason; the business is told it.' }, { status: 400 });
      const { data: certificate } = await supabaseAdmin.from('wholesale_certificates').select('*').eq('id', body.id).maybeSingle();
      if (!certificate) return NextResponse.json({ error: 'Certificate not found.' }, { status: 404 });
      if (approve && String(certificate.expires_on) < arizonaToday()) {
        return NextResponse.json({ error: 'That certificate has already expired.' }, { status: 409 });
      }
      const { error } = await supabaseAdmin
        .from('wholesale_certificates')
        .update({
          status: approve ? 'approved' : 'declined',
          decline_reason: approve ? null : reason,
          reviewed_at: new Date().toISOString(),
          reviewed_by: admin.email,
        })
        .eq('id', body.id);
      if (error) throw error;
      await logAdminAction(admin.email!, approve ? 'approved resale certificate' : 'declined resale certificate', body.id, reason || certificate.business_name);
      await emailBusiness(
        certificate.user_id,
        approve ? 'Your resale certificate is approved' : 'Your resale certificate',
        approve
          ? `<p>Your resale certificate for <strong>${escapeHtml(certificate.business_name)}</strong> is approved.
             Your wholesale purchases are tax-exempt until it expires on <strong>${formatDay(String(certificate.expires_on))}</strong>.
             We'll remind you before then.</p>`
          : `<p>We couldn't accept the resale certificate for <strong>${escapeHtml(certificate.business_name)}</strong>.</p>
             <p>Reason: ${escapeHtml(reason)}</p>
             <p>Upload a corrected one on your <a href="${siteUrl}/account#wholesale">account page</a>. Sales tax is
             charged on wholesale purchases until one is approved.</p>`
      );
    } else if (body.action) {
      return NextResponse.json({ error: 'Unknown action.' }, { status: 400 });
    }

    return NextResponse.json(await lists());
  } catch (err: any) {
    console.error('admin wholesale error:', err);
    await alertAdmin('admin wholesale error', err);
    return NextResponse.json({ error: err.message || 'Something went wrong.' }, { status: 500 });
  }
}

async function emailBusiness(userId: string, subject: string, html: string) {
  const { data } = await supabaseAdmin.auth.admin.getUserById(userId);
  const email = data?.user?.email;
  if (!email) return;
  await sendEmail({ to: email, subject, html: `<div style="font-family: sans-serif; max-width: 520px;">${html}</div>` });
}

async function lists() {
  const [{ data: accounts }, { data: certificates }] = await Promise.all([
    supabaseAdmin.from('wholesale_accounts').select('*').order('applied_at', { ascending: false }),
    supabaseAdmin
      .from('wholesale_certificates')
      .select('id, user_id, business_name, expires_on, status, uploaded_at, reviewed_at, reviewed_by, decline_reason')
      .order('uploaded_at', { ascending: false }),
  ]);

  const emails = new Map<string, string>();
  for (const account of accounts || []) {
    const { data } = await supabaseAdmin.auth.admin.getUserById(account.user_id);
    if (data?.user?.email) emails.set(account.user_id, data.user.email);
  }

  return {
    accounts: (accounts || []).map((a) => ({ ...a, email: emails.get(a.user_id) || '' })),
    certificates: certificates || [],
  };
}
