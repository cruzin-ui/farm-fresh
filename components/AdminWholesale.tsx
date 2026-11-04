'use client';

import { useEffect, useState } from 'react';
import { postWithAuth } from '@/lib/authedFetch';
import { CERTIFICATE_REMINDER_DAYS, arizonaToday, formatDay } from '@/lib/wholesale';

type Account = {
  user_id: string;
  email: string;
  business_name: string;
  business_type: string;
  business_address: string;
  phone: string;
  status: 'pending' | 'approved' | 'declined';
  decline_reason: string | null;
  applied_at: string;
  reviewed_by: string | null;
};

type Certificate = {
  id: string;
  user_id: string;
  business_name: string;
  expires_on: string;
  status: 'pending' | 'approved' | 'declined' | 'replaced';
  uploaded_at: string;
  reviewed_by: string | null;
  decline_reason: string | null;
};

const shortDate = (value: string) => new Date(value).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });

// The admin page's Wholesale section: businesses applying for wholesale
// prices, and the resale certificates that make their purchases tax-free.
export default function AdminWholesale() {
  const [data, setData] = useState<{ accounts: Account[]; certificates: Certificate[] } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  // What is being declined, and why.
  const [declining, setDeclining] = useState<{ kind: 'account' | 'certificate'; id: string } | null>(null);
  const [reason, setReason] = useState('');

  const call = async (body: Record<string, unknown>) => {
    setBusy(true);
    setError(null);
    try {
      const res = await postWithAuth('/api/admin/wholesale', body);
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Something went wrong.');
      if (json.url) window.open(json.url, '_blank', 'noopener');
      else setData(json);
      return true;
    } catch (err: any) {
      setError(err.message);
      return false;
    } finally {
      setBusy(false);
    }
  };

  useEffect(() => {
    call({});
  }, []);

  if (!data) return <p className="text-sm text-gray-500">{error || 'Loading wholesale accounts…'}</p>;

  const today = arizonaToday();
  const soon = new Date(Date.parse(`${today}T00:00:00Z`) + CERTIFICATE_REMINDER_DAYS * 86400000).toISOString().slice(0, 10);
  const pendingAccounts = data.accounts.filter((a) => a.status === 'pending');
  const approved = data.accounts.filter((a) => a.status === 'approved');
  const declined = data.accounts.filter((a) => a.status === 'declined');
  const pendingCerts = data.certificates.filter((c) => c.status === 'pending');
  const currentCert = (userId: string) =>
    data.certificates.find((c) => c.user_id === userId && c.status === 'approved' && c.expires_on >= today) || null;
  const expiringSoon = data.certificates.filter((c) => c.status === 'approved' && c.expires_on >= today && c.expires_on <= soon);
  const accountOf = (userId: string) => data.accounts.find((a) => a.user_id === userId);

  const decideButtons = (kind: 'account' | 'certificate', id: string, extra?: React.ReactNode) =>
    declining?.kind === kind && declining.id === id ? (
      <div className="space-y-2 w-full">
        <label className="block text-xs font-semibold text-gray-800">
          Reason (sent to the business)
          <input value={reason} onChange={(e) => setReason(e.target.value)} className="mt-1 w-full px-3 py-2 border rounded-lg text-sm" maxLength={500} />
        </label>
        <div className="flex gap-2">
          <button
            disabled={busy || !reason.trim()}
            onClick={async () => {
              if (await call({ action: kind, [kind === 'account' ? 'userId' : 'id']: id, decision: 'decline', reason })) {
                setDeclining(null);
                setReason('');
              }
            }}
            className="px-3 py-1.5 bg-red-600 disabled:bg-gray-300 text-white text-xs font-bold rounded-lg"
          >
            Decline
          </button>
          <button onClick={() => setDeclining(null)} className="px-3 py-1.5 border text-xs font-semibold rounded-lg">
            Back
          </button>
        </div>
      </div>
    ) : (
      <div className="flex flex-wrap gap-2">
        {extra}
        <button
          disabled={busy}
          onClick={() => call({ action: kind, [kind === 'account' ? 'userId' : 'id']: id, decision: 'approve' })}
          className="px-3 py-1.5 bg-emerald-600 disabled:bg-gray-300 text-white text-xs font-bold rounded-lg"
        >
          Approve
        </button>
        <button
          disabled={busy}
          onClick={() => {
            setDeclining({ kind, id });
            setReason('');
          }}
          className="px-3 py-1.5 border border-red-300 text-red-700 text-xs font-bold rounded-lg"
        >
          Decline…
        </button>
      </div>
    );

  const viewButton = (id: string) => (
    <button disabled={busy} onClick={() => call({ action: 'view', id })} className="px-3 py-1.5 border text-xs font-semibold rounded-lg bg-white">
      View certificate
    </button>
  );

  const card = 'bg-white border rounded-xl p-4 space-y-2';

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-bold text-gray-900">Wholesale</h2>
        <p className="text-sm text-gray-600">
          Approve businesses for wholesale prices, and check their resale certificates (Arizona Form 5000A). A business&apos;s
          wholesale purchases are tax-free only while an approved certificate hasn&apos;t expired. Check that the certificate
          is filled in, signed, in the business&apos;s name, and that the expiration date typed matches it.
        </p>
      </div>
      {error && <p role="alert" className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg p-3">{error}</p>}

      <section className="space-y-2">
        <h3 className="font-bold text-gray-900">Applications waiting ({pendingAccounts.length})</h3>
        {pendingAccounts.length === 0 && <p className="text-sm text-gray-500">None.</p>}
        {pendingAccounts.map((a) => {
          const cert = pendingCerts.find((c) => c.user_id === a.user_id);
          return (
            <div key={a.user_id} className={card}>
              <p className="text-sm">
                <strong>{a.business_name}</strong> · {a.business_type} · applied {shortDate(a.applied_at)}
              </p>
              <p className="text-xs text-gray-600">
                {a.business_address} · {a.phone} · {a.email}
              </p>
              <p className="text-xs text-gray-700">
                {cert ? <>Resale certificate uploaded, expires {formatDay(cert.expires_on)} (approve it separately below).</> : 'No resale certificate: they would pay tax.'}
              </p>
              {decideButtons('account', a.user_id)}
            </div>
          );
        })}
      </section>

      <section className="space-y-2">
        <h3 className="font-bold text-gray-900">Certificates to check ({pendingCerts.length})</h3>
        {pendingCerts.length === 0 && <p className="text-sm text-gray-500">None.</p>}
        {pendingCerts.map((c) => (
          <div key={c.id} className={card}>
            <p className="text-sm">
              <strong>{c.business_name}</strong> · expires <strong>{formatDay(c.expires_on)}</strong> · uploaded {shortDate(c.uploaded_at)}
            </p>
            <p className="text-xs text-gray-600">Account: {accountOf(c.user_id)?.status || 'unknown'}</p>
            {decideButtons('certificate', c.id, viewButton(c.id))}
          </div>
        ))}
      </section>

      <section className="space-y-2">
        <h3 className="font-bold text-gray-900">Certificates expiring in {CERTIFICATE_REMINDER_DAYS} days ({expiringSoon.length})</h3>
        {expiringSoon.length === 0 && <p className="text-sm text-gray-500">None.</p>}
        {expiringSoon.map((c) => (
          <p key={c.id} className="text-sm text-gray-800">
            <strong>{c.business_name}</strong>, expires {formatDay(c.expires_on)}. They&apos;re emailed a reminder.
          </p>
        ))}
      </section>

      <section className="space-y-2">
        <h3 className="font-bold text-gray-900">Approved businesses ({approved.length})</h3>
        {approved.length === 0 && <p className="text-sm text-gray-500">None yet.</p>}
        {approved.map((a) => {
          const cert = currentCert(a.user_id);
          return (
            <div key={a.user_id} className={card}>
              <p className="text-sm">
                <strong>{a.business_name}</strong> · {a.business_type} · {a.email}
              </p>
              <div className="flex flex-wrap items-center gap-2 text-xs text-gray-700">
                {cert ? <>Tax-exempt until {formatDay(cert.expires_on)}{viewButton(cert.id)}</> : 'Pays tax (no current certificate).'}
              </div>
            </div>
          );
        })}
      </section>

      {declined.length > 0 && (
        <section className="space-y-1">
          <h3 className="font-bold text-gray-900">Declined ({declined.length})</h3>
          {declined.map((a) => (
            <p key={a.user_id} className="text-xs text-gray-600">
              {a.business_name} ({a.email}): {a.decline_reason}
            </p>
          ))}
        </section>
      )}
    </div>
  );
}
