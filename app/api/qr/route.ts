import { NextResponse } from 'next/server';
import QRCode from 'qrcode';

export const dynamic = 'force-dynamic';

// Draws a pickup code as a QR picture, for emails: an email can't draw one
// itself, so it shows this as an image. It is the same code the buyer's order
// page shows, and the farmer scans it the same way.
//
// Only text shaped like a pickup code is drawn, so this can't be used as a
// general-purpose QR maker. It looks nothing up and says nothing about
// whether a code is real.
export async function GET(request: Request) {
  const code = (new URL(request.url).searchParams.get('code') || '').trim().toUpperCase();

  if (!/^FFD-?\d{6}$/.test(code)) {
    return NextResponse.json({ error: 'Not a pickup code.' }, { status: 400 });
  }

  const png = await QRCode.toBuffer(code, { type: 'png', width: 360, margin: 2 });

  return new NextResponse(new Uint8Array(png), {
    headers: {
      'Content-Type': 'image/png',
      // The picture for a given code never changes.
      'Cache-Control': 'public, max-age=31536000, immutable',
    },
  });
}
