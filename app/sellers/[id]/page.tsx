import FarmPage from '@/components/FarmPage';

// A farm's page at its original address. A farm that has chosen its own web
// address is also at /<that-name> (see app/[farm]/page.tsx); this one keeps
// working either way, so links shared before then don't break.
export default async function SellerPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <FarmPage sellerId={id} />;
}
