import Image from 'next/image';

// Photos farmers upload are stored at up to 1600px wide. Shown through this
// component they are resized for the screen asking for them and only loaded
// as they scroll into view, so a phone on mobile data isn't sent a full-size
// file for a thumbnail.
//
// Only photos in our own storage are resized (the address allowed in
// next.config.ts); anything else is shown as it is.
const STORAGE_PREFIX = process.env.NEXT_PUBLIC_SUPABASE_URL
  ? `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/`
  : null;

export default function Photo({
  src,
  alt,
  sizes,
  className,
  eager = false,
  draggable,
}: {
  src: string;
  alt: string;
  // How wide the photo is shown, e.g. "48px" or "(max-width: 767px) 100vw, 33vw".
  sizes: string;
  className?: string;
  // For the one photo a page is about, which should load straight away.
  eager?: boolean;
  draggable?: boolean;
}) {
  if (STORAGE_PREFIX && src.startsWith(STORAGE_PREFIX)) {
    return (
      <Image
        src={src}
        alt={alt}
        // The real shape comes from the class names; these only give the
        // browser a starting ratio.
        width={800}
        height={600}
        sizes={sizes}
        loading={eager ? 'eager' : 'lazy'}
        draggable={draggable}
        className={className}
      />
    );
  }

  return (
    <img
      src={src}
      alt={alt}
      loading={eager ? 'eager' : 'lazy'}
      decoding="async"
      draggable={draggable}
      className={className}
    />
  );
}
