import type { Instrumentation } from 'next';
import { alertAdmin } from '@/lib/alerts';

// Next.js calls this for any server error that nothing else caught — a page
// that crashes while rendering, or a route that throws. The routes that handle
// their own errors send their alerts themselves.
export const onRequestError: Instrumentation.onRequestError = async (err, request, context) => {
  await alertAdmin('unexpected server error', err, {
    page: request.path,
    method: request.method,
    route: context.routePath,
  });
};
