import { supabase } from '@/lib/supabaseClient';
import { LISTING_CATEGORIES } from '@/lib/categories';

// The picture for "Share to Instagram Story": a Story-sized (1080 x 1920)
// image of a farm, drawn in the browser. It has the farm's cover photo, its
// picture and name, and up to three things it has for sale with their
// prices. No address: the link goes on with Instagram's link sticker.

const W = 1080;
const H = 1920;

const STORAGE_PREFIX = process.env.NEXT_PUBLIC_SUPABASE_URL
  ? `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/`
  : null;

// Loads a photo for drawing. Photos in our storage come through the site's
// own image resizer, so they're from the same site and can be drawn and
// saved; others are asked for with CORS and skipped if that's refused.
function loadImage(src: string | null | undefined, width = 1080): Promise<HTMLImageElement | null> {
  if (!src) return Promise.resolve(null);
  const url =
    src.startsWith('/') ? src : STORAGE_PREFIX && src.startsWith(STORAGE_PREFIX) ? `/_next/image?url=${encodeURIComponent(src)}&w=${width}&q=75` : src;
  return new Promise((resolve) => {
    const img = new Image();
    if (!url.startsWith('/')) img.crossOrigin = 'anonymous';
    const timer = setTimeout(() => resolve(null), 10000);
    img.onload = () => {
      clearTimeout(timer);
      resolve(img);
    };
    img.onerror = () => {
      clearTimeout(timer);
      resolve(null);
    };
    img.src = url;
  });
}

// Draws `img` to fill the box, cropping the edges (like object-fit: cover).
function drawCover(ctx: CanvasRenderingContext2D, img: HTMLImageElement, x: number, y: number, w: number, h: number) {
  const scale = Math.max(w / img.naturalWidth, h / img.naturalHeight);
  const sw = w / scale;
  const sh = h / scale;
  ctx.drawImage(img, (img.naturalWidth - sw) / 2, (img.naturalHeight - sh) / 2, sw, sh, x, y, w, h);
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

// Splits text into lines that fit `maxWidth`, at most `maxLines` (the last
// one cut short with an ellipsis).
function wrap(ctx: CanvasRenderingContext2D, text: string, maxWidth: number, maxLines: number) {
  const words = text.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let line = '';
  for (const word of words) {
    const next = line ? `${line} ${word}` : word;
    if (ctx.measureText(next).width <= maxWidth || !line) line = next;
    else {
      lines.push(line);
      line = word;
    }
  }
  if (line) lines.push(line);
  if (lines.length > maxLines) {
    lines.length = maxLines;
    let last = lines[maxLines - 1];
    while (last && ctx.measureText(`${last}…`).width > maxWidth) last = last.slice(0, -1);
    lines[maxLines - 1] = `${last.trimEnd()}…`;
  }
  return lines;
}

// The site's fonts, by the names the page loaded them under.
function fontFamily(variable: string, fallback: string) {
  const value = getComputedStyle(document.body).getPropertyValue(variable).trim();
  return value ? `${value}, ${fallback}` : fallback;
}

export async function buildFarmStoryImage(sellerId: string): Promise<File> {
  const [{ data: profile }, { data: listings }] = await Promise.all([
    supabase.from('seller_profiles').select('farm_name, avatar_url, cover_image_url').eq('id', sellerId).maybeSingle(),
    supabase
      .from('produce_listings')
      .select('title, variety, price_per_unit, unit_type, image_url')
      .eq('farmer_id', sellerId)
      .eq('status', 'active')
      .gte('available_quantity', 1)
      .in('category', LISTING_CATEGORIES)
      .order('created_at', { ascending: false })
      .limit(3),
  ]);
  const items = listings || [];
  const farmName = String(profile?.farm_name || '').trim() || 'Our farm';

  await document.fonts?.ready;
  const heading = fontFamily('--font-heading', 'Arial, sans-serif');
  const body = fontFamily('--font-body', 'Georgia, serif');

  const [cover, avatar, logo, ...photos] = await Promise.all([
    loadImage(profile?.cover_image_url || '/hero-market.jpg'),
    loadImage(profile?.avatar_url, 384),
    loadImage('/icon-192.png'),
    ...items.map((l) => loadImage(l.image_url, 384)),
  ]);

  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('This browser cannot make the picture.');

  // Background: the cover photo, darkened toward the bottom so the white
  // text and cards stand out; plain green without one.
  ctx.fillStyle = '#065f46';
  ctx.fillRect(0, 0, W, H);
  if (cover) drawCover(ctx, cover, 0, 0, W, H);
  const shade = ctx.createLinearGradient(0, 0, 0, H);
  shade.addColorStop(0, 'rgba(0,0,0,0.5)');
  shade.addColorStop(0.4, 'rgba(0,0,0,0.5)');
  shade.addColorStop(1, 'rgba(2,44,34,0.92)');
  ctx.fillStyle = shade;
  ctx.fillRect(0, 0, W, H);

  // Top: the Farm Fresh Direct logo and name.
  ctx.textBaseline = 'middle';
  ctx.textAlign = 'left';
  ctx.font = `64px ${heading}`;
  const brand = 'Farm Fresh Direct';
  const brandWidth = 100 + 24 + ctx.measureText(brand).width;
  const brandX = (W - brandWidth) / 2;
  if (logo) {
    ctx.save();
    roundRect(ctx, brandX, 150, 100, 100, 24);
    ctx.clip();
    ctx.drawImage(logo, brandX, 150, 100, 100);
    ctx.restore();
  }
  ctx.fillStyle = '#ffffff';
  ctx.fillText(brand, brandX + 124, 202);

  // The farm: its picture in a circle, then its name.
  let y = 380;
  if (avatar) {
    const size = 260;
    ctx.save();
    ctx.beginPath();
    ctx.arc(W / 2, y + size / 2, size / 2, 0, Math.PI * 2);
    ctx.closePath();
    ctx.fillStyle = '#ffffff';
    ctx.fill();
    ctx.beginPath();
    ctx.arc(W / 2, y + size / 2, size / 2 - 10, 0, Math.PI * 2);
    ctx.clip();
    drawCover(ctx, avatar, W / 2 - size / 2 + 10, y + 10, size - 20, size - 20);
    ctx.restore();
    y += size + 60;
  } else {
    y += 120;
  }
  ctx.textAlign = 'center';
  ctx.fillStyle = '#ffffff';
  ctx.font = `112px ${heading}`;
  const nameLines = wrap(ctx, farmName, W - 160, 2);
  ctx.shadowColor = 'rgba(0,0,0,0.35)';
  ctx.shadowBlur = 24;
  for (const line of nameLines) {
    ctx.fillText(line, W / 2, y + 56);
    y += 124;
  }
  ctx.shadowBlur = 0;
  ctx.fillStyle = '#6ee7b7';
  ctx.font = `48px ${body}`;
  ctx.fillText(items.length ? 'Fresh this week' : 'Order ahead and pick up locally', W / 2, y + 30);
  y += 110;

  // Up to three things for sale, each on a white card.
  const cardH = 220;
  const gap = 28;
  const cardsTop = Math.max(y, H - 230 - items.length * (cardH + gap));
  items.forEach((item, i) => {
    const top = cardsTop + i * (cardH + gap);
    const x = 80;
    const w = W - 160;
    ctx.fillStyle = 'rgba(255,255,255,0.96)';
    roundRect(ctx, x, top, w, cardH, 36);
    ctx.fill();
    const photo = photos[i];
    const ph = cardH - 40;
    if (photo) {
      ctx.save();
      roundRect(ctx, x + 20, top + 20, ph, ph, 26);
      ctx.clip();
      drawCover(ctx, photo, x + 20, top + 20, ph, ph);
      ctx.restore();
    } else {
      ctx.fillStyle = '#d1fae5';
      roundRect(ctx, x + 20, top + 20, ph, ph, 26);
      ctx.fill();
    }
    const tx = x + 20 + ph + 36;
    const tw = w - (tx - x) - 30;
    ctx.textAlign = 'left';
    ctx.fillStyle = '#111827';
    ctx.font = `52px ${body}`;
    const title = [item.title, item.variety].filter(Boolean).join(' · ');
    const titleLines = wrap(ctx, title || 'Fresh produce', tw, 2);
    let ty = top + (titleLines.length === 1 ? 82 : 62);
    for (const line of titleLines) {
      ctx.fillText(line, tx, ty);
      ty += 60;
    }
    ctx.fillStyle = '#047857';
    ctx.font = `48px ${body}`;
    ctx.fillText(`$${Number(item.price_per_unit || 0).toFixed(2)} / ${item.unit_type || 'lb'}`, tx, ty + 8);
  });

  // Bottom line.
  ctx.textAlign = 'center';
  ctx.fillStyle = '#ffffff';
  ctx.font = `44px ${body}`;
  ctx.fillText('Order ahead on Farm Fresh Direct', W / 2, H - 120);

  const blob: Blob | null = await new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.9));
  if (!blob) throw new Error('The picture could not be made.');
  const fileName = `${farmName.replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '').toLowerCase() || 'farm'}-story.jpg`;
  return new File([blob], fileName, { type: 'image/jpeg' });
}
