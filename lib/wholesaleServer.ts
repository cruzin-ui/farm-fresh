import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { sendEmail, escapeHtml } from '@/lib/email';
import { CERTIFICATE_REMINDER_DAYS, arizonaToday, formatDay, type WholesaleOffer, type WholesaleStatus } from '@/lib/wholesale';

// SERVER-ONLY. Wholesale offers, accounts and resale certificates. The tables
// are only readable with the service key (see db/wholesale.sql).

export const CERTIFICATE_BUCKET = 'resale-certificates';

// The wholesale offers on some listings, by listing id.
export async function wholesaleOffersFor(listingIds: string[]) {
  const offers = new Map<string, WholesaleOffer>();
  if (listingIds.length === 0) return offers;
  const { data, error } = await supabaseAdmin
    .from('listing_wholesale_offers')
    .select('listing_id, case_size, case_price, min_cases')
    .in('listing_id', listingIds);
  if (error) throw error;
  for (const row of data || []) {
    offers.set(row.listing_id as string, {
      caseSize: Number(row.case_size),
      casePrice: Number(row.case_price),
      minCases: Number(row.min_cases),
    });
  }
  return offers;
}

// Sets or removes a listing's wholesale offer.
export async function saveWholesaleOffer(listingId: string, offer: WholesaleOffer | null) {
  if (!offer) {
    const { error } = await supabaseAdmin.from('listing_wholesale_offers').delete().eq('listing_id', listingId);
    if (error) throw error;
    return;
  }
  const { error } = await supabaseAdmin.from('listing_wholesale_offers').upsert({
    listing_id: listingId,
    case_size: offer.caseSize,
    case_price: offer.casePrice,
    min_cases: offer.minCases,
    updated_at: new Date().toISOString(),
  });
  if (error) throw error;
}

// Whether a user can buy wholesale, and the certificate (if any) that makes
// their wholesale purchases tax-exempt today: approved, and not yet expired.
export async function wholesaleBuyer(userId: string | null | undefined) {
  if (!userId) return { approved: false, exemptCertificateId: null as string | null };

  const { data: account } = await supabaseAdmin
    .from('wholesale_accounts')
    .select('status')
    .eq('user_id', userId)
    .maybeSingle();
  if (account?.status !== 'approved') return { approved: false, exemptCertificateId: null };

  const { data: certificate } = await supabaseAdmin
    .from('wholesale_certificates')
    .select('id')
    .eq('user_id', userId)
    .eq('status', 'approved')
    .gte('expires_on', arizonaToday())
    .order('expires_on', { ascending: false })
    .limit(1)
    .maybeSingle();

  return { approved: true, exemptCertificateId: (certificate?.id as string) || null };
}

// What a business sees about its own wholesale account.
export async function wholesaleStatusFor(userId: string): Promise<WholesaleStatus> {
  const [{ data: account }, { data: certificates }] = await Promise.all([
    supabaseAdmin.from('wholesale_accounts').select('*').eq('user_id', userId).maybeSingle(),
    supabaseAdmin
      .from('wholesale_certificates')
      .select('id, expires_on, status, decline_reason, uploaded_at')
      .eq('user_id', userId)
      .order('uploaded_at', { ascending: false }),
  ]);

  const newest = certificates?.[0] || null;
  const today = arizonaToday();
  const exempt =
    account?.status === 'approved'
      ? (certificates || []).find((c) => c.status === 'approved' && String(c.expires_on) >= today) || null
      : null;

  return {
    account: account
      ? {
          businessName: account.business_name,
          businessType: account.business_type,
          businessAddress: account.business_address,
          phone: account.phone,
          status: account.status,
          declineReason: account.decline_reason || null,
        }
      : null,
    certificate: newest
      ? {
          expiresOn: String(newest.expires_on),
          status: newest.status,
          declineReason: newest.decline_reason || null,
          uploadedAt: newest.uploaded_at,
        }
      : null,
    taxExempt: Boolean(exempt),
    exemptUntil: exempt ? String(exempt.expires_on) : null,
  };
}

// Run once a day: emails each business whose approved resale certificate
// expires within CERTIFICATE_REMINDER_DAYS (once per certificate), unless a
// newer one is already waiting or approved. Returns how many were emailed.
export async function sendCertificateReminders(today: string, siteUrl: string) {
  const cutoff = new Date(Date.parse(`${today}T00:00:00Z`) + CERTIFICATE_REMINDER_DAYS * 86400000).toISOString().slice(0, 10);
  const { data: expiring } = await supabaseAdmin
    .from('wholesale_certificates')
    .select('id, user_id, business_name, expires_on')
    .eq('status', 'approved')
    .is('reminded_at', null)
    .gte('expires_on', today)
    .lte('expires_on', cutoff);

  let sent = 0;
  for (const certificate of expiring || []) {
    const { count: newer } = await supabaseAdmin
      .from('wholesale_certificates')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', certificate.user_id)
      .in('status', ['pending', 'approved'])
      .gt('expires_on', certificate.expires_on);

    // Marked first, so a failed email isn't retried every day.
    await supabaseAdmin.from('wholesale_certificates').update({ reminded_at: new Date().toISOString() }).eq('id', certificate.id);
    if (newer) continue;

    const { data } = await supabaseAdmin.auth.admin.getUserById(certificate.user_id);
    const email = data?.user?.email;
    if (!email) continue;

    await sendEmail({
      to: email,
      subject: `Your resale certificate expires ${formatDay(String(certificate.expires_on))}`,
      html: `<div style="font-family: sans-serif; max-width: 520px;">
        <p>The resale certificate (Arizona Form 5000A) on file for <strong>${escapeHtml(certificate.business_name)}</strong>
        expires on <strong>${formatDay(String(certificate.expires_on))}</strong>.</p>
        <p>After that, sales tax is charged on your wholesale purchases until a current one is approved.
        Upload your new certificate and its expiration date on your
        <a href="${siteUrl}/account#wholesale">account page</a>.</p>
      </div>`,
    });
    sent += 1;
  }
  return sent;
}
