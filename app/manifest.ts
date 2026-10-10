import type { MetadataRoute } from 'next';

// Lets a phone add the site to its home screen with the Farm Fresh Direct
// icon and open it full-screen, like an app. (iPhones take their icon from
// app/apple-icon.png.)
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'Farm Fresh Direct',
    short_name: 'Farm Fresh',
    description: 'Buy fresh produce directly from neighbor gardens and small local farms.',
    start_url: '/',
    display: 'standalone',
    background_color: '#ffffff',
    theme_color: '#047857',
    icons: [
      { src: '/icon-192.png', sizes: '192x192', type: 'image/png' },
      { src: '/icon-512.png', sizes: '512x512', type: 'image/png' },
    ],
  };
}
