// SERVER-ONLY. Sends a transactional email through Resend.
//
// EMAIL_FROM must be an address on a domain verified in Resend, e.g.
// "Farm Fresh Direct <orders@farmfreshdirect.online>". Without it we fall back
// to Resend's shared test sender, which only delivers to the Resend account
// owner's own address — real buyers and farmers get nothing.
const DEFAULT_FROM = 'Farm Fresh Direct <onboarding@resend.dev>';

export function escapeHtml(text: string) {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// Never throws — a missed email shouldn't undo a real sale or refund.
export async function sendEmail(params: { to: string | string[]; subject: string; html: string; replyTo?: string }) {
  if (!process.env.RESEND_API_KEY) {
    console.warn('RESEND_API_KEY not set — skipping email:', params.subject);
    return;
  }

  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: process.env.EMAIL_FROM || DEFAULT_FROM,
        to: Array.isArray(params.to) ? params.to : [params.to],
        ...(params.replyTo ? { reply_to: params.replyTo } : {}),
        subject: params.subject,
        html: params.html,
      }),
    });

    if (!res.ok) {
      console.error('Resend API error:', res.status, await res.text(), '— subject:', params.subject);
    }
  } catch (err) {
    console.error('Failed to send email:', params.subject, err);
  }
}
