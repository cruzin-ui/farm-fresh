import { NextResponse } from 'next/server';
import { getRequestUser } from '@/lib/apiAuth';
import { accountDeletionBlockers, deleteAccount } from '@/lib/accountDeletion';
import { alertAdmin, notifyAdmins } from '@/lib/alerts';
import { logAdminAction } from '@/lib/adminLog';
import { escapeHtml } from '@/lib/email';

export const dynamic = 'force-dynamic';

// A signed-in user deleting their own account.
//   { check: true }        — what, if anything, has to be finished first
//   { confirm: 'DELETE' }  — delete it, for good
export async function POST(request: Request) {
  try {
    const user = await getRequestUser(request);
    if (!user) {
      return NextResponse.json({ error: 'You must be signed in.' }, { status: 401 });
    }

    const body = await request.json().catch(() => ({}));
    const blockers = await accountDeletionBlockers(user.id);

    if (body.check) return NextResponse.json({ blockers });

    if (body.confirm !== 'DELETE') {
      return NextResponse.json({ error: 'Type DELETE to confirm.' }, { status: 400 });
    }
    if (blockers.length > 0) {
      return NextResponse.json({ error: blockers.join(' '), blockers }, { status: 409 });
    }

    const { wasSeller } = await deleteAccount(user);

    await logAdminAction(user.email || 'a user', 'Deleted their own account', user.email || user.id, wasSeller ? 'Was a seller' : null);
    await notifyAdmins(
      'An account was deleted',
      `<p><strong>${escapeHtml(user.email || user.id)}</strong> deleted their account${wasSeller ? ' (they were a seller)' : ''}. Their past orders are kept as records.${
        wasSeller ? ' Their listings were taken down. Their Stripe account is untouched, so any balance still pays out.' : ''
      }</p>`
    );

    return NextResponse.json({ success: true });
  } catch (err: any) {
    console.error('account delete error:', err);
    await alertAdmin('account delete error', err);
    return NextResponse.json(
      { error: 'Your account could not be deleted. Please try again, or contact us and we will do it for you.' },
      { status: 500 }
    );
  }
}
