import { redirect } from 'next/navigation';

// This used to be a standalone "post a listing" page. The Seller Dashboard
// now does everything it did, with the posting rules enforced on the server,
// so old links and bookmarks to /sell are sent there instead.
export default function SellPage() {
  redirect('/dashboard');
}
