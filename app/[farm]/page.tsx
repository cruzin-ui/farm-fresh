import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { tidyFarmAddress, farmAddressProblem } from '@/lib/farmAddress';
import FarmPage from '@/components/FarmPage';

export const dynamic = 'force-dynamic';

// A farm's own web address: farmfreshdirect.online/<name>.
//
// This folder catches every top-level address that isn't one of the site's own
// pages, which always win over it. So before adding a new top-level page, add
// its name to the reserved list in lib/farmAddress.ts, or a farm could already
// have it. Anything that isn't a farm's address gets the usual "not found".

// Capital letters don't matter: /NightOwlProduce opens /nightowlproduce.
async function findFarm(typed: string) {
  const address = decodeURIComponent(typed).toLowerCase();
  // Not even the shape of an address (a stray file request, say): no lookup needed.
  if (address !== tidyFarmAddress(address) || farmAddressProblem(address)) return null;

  const { data } = await supabaseAdmin
    .from('seller_profiles')
    .select('id, farm_name')
    .eq('slug', address)
    .maybeSingle();
  return data;
}

export async function generateMetadata({ params }: { params: Promise<{ farm: string }> }): Promise<Metadata> {
  const { farm } = await params;
  const found = await findFarm(farm);
  return found ? { title: found.farm_name || 'Local Farm' } : {};
}

export default async function FarmAddressPage({ params }: { params: Promise<{ farm: string }> }) {
  const { farm } = await params;
  const found = await findFarm(farm);
  if (!found) notFound();

  return <FarmPage sellerId={found.id} />;
}
