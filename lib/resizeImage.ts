// BROWSER-ONLY. Shrinks a photo before upload. Phone cameras produce images
// several megabytes in size and thousands of pixels wide, which makes pages
// slow on mobile data; nothing in the app displays them larger than this.
// Returns the original file untouched if it is already small enough or the
// browser can't decode it.
export async function resizeImage(file: File, maxDimension = 1600, quality = 0.82): Promise<File> {
  if (!file.type.startsWith('image/')) return file;

  try {
    const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
    const scale = Math.min(1, maxDimension / Math.max(bitmap.width, bitmap.height));

    // Already small in both pixels and bytes — not worth re-encoding.
    if (scale === 1 && file.size < 500_000) {
      bitmap.close();
      return file;
    }

    const canvas = document.createElement('canvas');
    canvas.width = Math.round(bitmap.width * scale);
    canvas.height = Math.round(bitmap.height * scale);

    const context = canvas.getContext('2d');
    if (!context) return file;

    context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    bitmap.close();

    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', quality));
    if (!blob || blob.size >= file.size) return file;

    const baseName = file.name.replace(/\.[^.]+$/, '') || 'photo';
    return new File([blob], `${baseName}.jpg`, { type: 'image/jpeg' });
  } catch {
    return file;
  }
}
