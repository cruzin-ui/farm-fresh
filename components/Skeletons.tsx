// Grey stand-ins shown while a page fetches its data, shaped like what is
// about to appear so the page doesn't jump when it arrives.

const block = 'bg-gray-200 rounded animate-pulse motion-reduce:animate-none';

function Loading({ label }: { label: string }) {
  return (
    <p role="status" className="sr-only">
      {label}
    </p>
  );
}

// A grid of listing cards, as on Browse.
export function ListingGridSkeleton({ count = 6 }: { count?: number }) {
  return (
    <>
      <Loading label="Loading harvest listings..." />
      <div aria-hidden="true" className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {Array.from({ length: count }, (_, i) => (
          <div key={i} className="bg-white rounded-2xl border border-gray-200 overflow-hidden shadow-sm">
            <div className={`h-44 ${block} rounded-none`} />
            <div className="p-5 space-y-3">
              <div className={`h-4 w-1/3 ${block}`} />
              <div className={`h-6 w-2/3 ${block}`} />
              <div className={`h-4 w-1/2 ${block}`} />
              <div className="flex items-center justify-between pt-3">
                <div className={`h-7 w-20 ${block}`} />
                <div className={`h-10 w-28 rounded-xl ${block}`} />
              </div>
            </div>
          </div>
        ))}
      </div>
    </>
  );
}

// One listing's own page.
export function ListingPageSkeleton() {
  return (
    <div className="max-w-5xl mx-auto px-4 py-8">
      <Loading label="Loading harvest listing..." />
      <div aria-hidden="true" className="grid grid-cols-1 md:grid-cols-2 gap-8 mt-9">
        <div className={`min-h-64 md:min-h-96 rounded-2xl ${block}`} />
        <div className="space-y-4">
          <div className={`h-5 w-24 rounded-full ${block}`} />
          <div className={`h-9 w-2/3 ${block}`} />
          <div className={`h-5 w-1/3 ${block}`} />
          <div className={`h-9 w-28 ${block}`} />
          <div className={`h-40 rounded-2xl ${block}`} />
          <div className={`h-12 rounded-xl ${block}`} />
        </div>
      </div>
    </div>
  );
}

// A farm's page: banner, name, then its listings.
export function FarmPageSkeleton() {
  return (
    <div className="max-w-4xl mx-auto px-4 py-8">
      <Loading label="Loading farm profile..." />
      <div aria-hidden="true" className="space-y-6">
        <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden">
          <div className={`h-48 ${block} rounded-none`} />
          <div className="p-6 space-y-3">
            <div className={`h-8 w-1/2 ${block}`} />
            <div className={`h-4 w-1/3 ${block}`} />
            <div className={`h-20 ${block}`} />
          </div>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
          {[0, 1].map((i) => (
            <div key={i} className={`h-72 rounded-2xl ${block}`} />
          ))}
        </div>
      </div>
    </div>
  );
}

// A stack of plain cards, for My Orders and Favorite Farms.
export function CardListSkeleton({ label, count = 3 }: { label: string; count?: number }) {
  return (
    <div className="max-w-4xl mx-auto px-4 py-8">
      <Loading label={label} />
      <div aria-hidden="true" className="space-y-4">
        <div className={`h-8 w-1/2 ${block}`} />
        {Array.from({ length: count }, (_, i) => (
          <div key={i} className={`h-40 rounded-2xl ${block}`} />
        ))}
      </div>
    </div>
  );
}
