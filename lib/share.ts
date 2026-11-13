import { isNativeApp } from '@/lib/nativeApp';

// Shares a link to one of our pages: the phone's own share sheet in the app
// (and in phone browsers that have one), otherwise the link is copied.
export async function shareLink(params: { title: string; text?: string; url: string }): Promise<'shared' | 'copied' | 'failed'> {
  const url = new URL(params.url, window.location.origin).href;
  try {
    if (isNativeApp()) {
      const { Share } = await import('@capacitor/share');
      await Share.share({ title: params.title, text: params.text, url, dialogTitle: params.title });
      return 'shared';
    }
    if (typeof navigator.share === 'function' && window.matchMedia('(pointer: coarse)').matches) {
      await navigator.share({ title: params.title, text: params.text, url });
      return 'shared';
    }
  } catch (err: any) {
    // Closing the share sheet without choosing anything isn't a failure.
    if (err?.name === 'AbortError' || /cancel/i.test(String(err?.message || ''))) return 'shared';
  }
  try {
    await navigator.clipboard.writeText(url);
    return 'copied';
  } catch {
    return 'failed';
  }
}

// A small "it worked" tap on the phone, for moments like a paid order. Does
// nothing on the website.
export async function successTap() {
  if (!isNativeApp()) return;
  try {
    const { Haptics, NotificationType } = await import('@capacitor/haptics');
    await Haptics.notification({ type: NotificationType.Success });
  } catch {}
}
