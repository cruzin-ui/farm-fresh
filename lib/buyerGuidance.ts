// What buyers are told about how pickup works and how to stay safe. Kept in
// one place so the checkout page and the emails always say the same thing.

export const HOW_PICKUP_WORKS = [
  'You pay online now. Farm Fresh Direct holds your payment — the farmer has not been paid yet.',
  "We email you when the farmer marks your order ready, with the pickup details. Please don't head over before then.",
  'Collect your produce at the pickup address on your order and check that it is what you ordered.',
  'Once you have your produce, show the farmer the QR code on your order to scan, or give them your pickup code. That confirms the handover and releases their payment.',
];

export const SAFETY_TIPS = [
  'Never give your pickup code to anyone before your produce is in your hands — not by text, phone or email. The code is what releases your payment to the farmer.',
  "Only meet at the pickup address shown on your order. If you're asked to meet somewhere else, or somewhere that feels isolated or unsafe, don't go.",
  "Pick up during daylight hours when you can, let someone know where you're going, and bring someone along if you'd feel more comfortable.",
  'Your order is fully paid online. Never hand over cash or pay anything extra at pickup.',
  "If something doesn't feel right, leave. You can cancel an order you haven't collected from your order page, or contact us.",
];

// The same guidance as HTML for emails. The strings above are fixed text, so
// they need no escaping. `siteUrl` is used to link to the contact page.
export function buyerGuidanceEmailHtml(siteUrl?: string) {
  const list = (items: string[], ordered: boolean) =>
    `<${ordered ? 'ol' : 'ul'} style="padding-left: 20px; margin: 8px 0;">${items
      .map((item) => `<li style="margin-bottom: 6px;">${item}</li>`)
      .join('')}</${ordered ? 'ol' : 'ul'}>`;

  return `
    <div style="margin-top: 20px; padding: 14px; background: #f0fdf4; border: 1px solid #bbf7d0; border-radius: 8px; font-size: 14px;">
      <strong>How pickup works</strong>
      ${list(HOW_PICKUP_WORKS, true)}
    </div>
    <div style="margin-top: 12px; padding: 14px; background: #fffbeb; border: 1px solid #fde68a; border-radius: 8px; font-size: 14px;">
      <strong>Staying safe</strong>
      ${list(SAFETY_TIPS, false)}
      ${siteUrl ? `<p style="margin: 8px 0 0;">Questions or concerns? <a href="${siteUrl}/contact">Contact us</a>.</p>` : ''}
    </div>
  `;
}
