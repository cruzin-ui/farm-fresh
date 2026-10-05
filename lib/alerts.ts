import { sendEmail, escapeHtml } from '@/lib/email';

// SERVER-ONLY. Emails the site's administrators when something goes wrong on
// the server that a person should look at — a payment that couldn't be
// recorded, a payout that failed, a page that crashed.

// How long to stay quiet about a problem after alerting on it once, so a fault
// that hits every visitor doesn't send hundreds of emails. Each server instance
// keeps its own record, so a busy outage can still send a handful.
const QUIET_MINUTES = 30;
const recentAlerts = new Map<string, number>();

// Alerts go to CONTACT_EMAIL if set, otherwise every address in ADMIN_EMAILS.
function alertRecipients() {
  return (process.env.CONTACT_EMAIL || process.env.ADMIN_EMAILS || '')
    .split(',')
    .map((e) => e.trim())
    .filter(Boolean);
}

// `where` says what the site was doing ("order complete", "Stripe webhook");
// `details` adds anything that helps find the order or page involved.
// Never throws — failing to send an alert must not make the original problem worse.
export async function alertAdmin(where: string, error: unknown, details?: Record<string, unknown>) {
  try {
    // A request whose body isn't valid JSON is junk from a bot or a broken
    // client, not a fault in the site.
    if (error instanceof SyntaxError) return;

    const message = error instanceof Error ? error.message : String((error as any)?.message ?? error);
    const stack = error instanceof Error && error.stack ? error.stack.split('\n').slice(0, 12).join('\n') : '';

    const key = `${where}|${message}`;
    const now = Date.now();
    const last = recentAlerts.get(key);
    if (last && now - last < QUIET_MINUTES * 60 * 1000) return;
    recentAlerts.set(key, now);
    if (recentAlerts.size > 200) recentAlerts.clear();

    const recipients = alertRecipients();
    if (recipients.length === 0) return;

    const detailRows = Object.entries(details || {})
      .filter(([, value]) => value !== undefined && value !== null && value !== '')
      .map(([name, value]) => `<li><strong>${escapeHtml(name)}:</strong> ${escapeHtml(String(value))}</li>`)
      .join('');

    await sendEmail({
      to: recipients,
      subject: `[Farm Fresh Direct] Site error: ${where}`,
      html: `
        <div style="font-family: sans-serif; max-width: 640px;">
          <h2 style="color: #b91c1c;">Something went wrong on the site</h2>
          <p><strong>While:</strong> ${escapeHtml(where)}</p>
          <p><strong>Error:</strong> ${escapeHtml(message)}</p>
          ${detailRows ? `<ul>${detailRows}</ul>` : ''}
          <p><strong>When:</strong> ${new Date().toUTCString()}</p>
          ${stack ? `<pre style="font-size: 12px; background: #f3f4f6; padding: 12px; white-space: pre-wrap;">${escapeHtml(stack)}</pre>` : ''}
          <p style="color: #6b7280; font-size: 12px;">
            You won't be emailed about this same error again for ${QUIET_MINUTES} minutes. The full record is in
            the Logs section of the project in Vercel.
          </p>
        </div>
      `,
    });
  } catch (err) {
    console.error('Could not send error alert:', err);
  }
}
