'use client';

import { useEffect, useState } from 'react';
import { Briefcase, CheckCircle2, AlertCircle, Clock, Upload } from 'lucide-react';
import { supabase } from '@/lib/supabaseClient';
import { postWithAuth } from '@/lib/authedFetch';
import { resizeImage } from '@/lib/resizeImage';
import {
  BUSINESS_TYPES,
  CERTIFICATE_MAX_BYTES,
  CERTIFICATE_REMINDER_DAYS,
  WHOLESALE_FEE_LABEL,
  arizonaToday,
  formatDay,
  type WholesaleStatus,
} from '@/lib/wholesale';

const daysUntil = (day: string) => Math.round((Date.parse(`${day}T00:00:00Z`) - Date.parse(`${arizonaToday()}T00:00:00Z`)) / 86400000);

// On the account page: applying for wholesale prices, and keeping a resale
// certificate on file for tax-free wholesale purchases.
export default function WholesaleAccount() {
  const [status, setStatus] = useState<WholesaleStatus | null>(null);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ businessName: '', businessType: '', businessAddress: '', phone: '' });
  const [file, setFile] = useState<File | null>(null);
  const [expiresOn, setExpiresOn] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    postWithAuth('/api/wholesale/account', { action: 'status' })
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (!data) return;
        setStatus(data);
        if (data.account) {
          const { businessName, businessType, businessAddress, phone } = data.account;
          setForm({ businessName, businessType, businessAddress, phone });
        }
        // Arrived from "Apply for wholesale pricing" on a listing: open the
        // form and bring it into view (it loads after the page does).
        if (window.location.hash === '#wholesale') {
          setOpen(true);
          setTimeout(() => document.getElementById('wholesale')?.scrollIntoView({ behavior: 'smooth' }), 50);
        }
      })
      .catch(() => undefined);
  }, []);

  const apply = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const res = await postWithAuth('/api/wholesale/account', { action: 'apply', ...form });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Could not send your application.');
      setStatus(data);
      setNotice("Application sent. We'll email you once it's reviewed, usually within two business days.");
    } catch (err: any) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  const upload = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!file) return setError('Choose the certificate file.');
    if (!expiresOn) return setError('Enter the date the certificate expires.');
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const toSend = file.type.startsWith('image/') ? await resizeImage(file, 2400, 0.85) : file;
      if (toSend.size > CERTIFICATE_MAX_BYTES) throw new Error('That file is too big. Upload one under 4 MB, or take a photo of it instead.');
      const body = new FormData();
      body.append('file', toSend);
      body.append('expiresOn', expiresOn);
      const {
        data: { session },
      } = await supabase.auth.getSession();
      const res = await fetch('/api/wholesale/certificate', {
        method: 'POST',
        headers: session ? { Authorization: `Bearer ${session.access_token}` } : {},
        body,
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Could not upload the certificate.');
      setStatus(data);
      setFile(null);
      setExpiresOn('');
      setNotice("Certificate uploaded. We'll check it and email you once it's approved.");
    } catch (err: any) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  if (!status) return null;

  const account = status.account;
  const certificate = status.certificate;
  const input = 'w-full px-3 py-2.5 border rounded-xl text-base bg-white';
  const expiringSoon = status.exemptUntil && daysUntil(status.exemptUntil) <= CERTIFICATE_REMINDER_DAYS;
  const canUpload = account && account.status !== 'declined';

  return (
    <section id="wholesale" className="bg-white border border-gray-200 rounded-2xl shadow-sm p-6 space-y-4 scroll-mt-24">
      <div>
        <h2 className="text-lg font-bold text-gray-900 flex items-center gap-2">
          <Briefcase className="w-5 h-5 text-amber-700" aria-hidden="true" /> Wholesale
        </h2>
        <p className="text-xs text-gray-600 mt-0.5">
          For restaurants, grocers, co-ops and other businesses: buy by the case at farms&apos; wholesale prices, with a
          lower fee ({WHOLESALE_FEE_LABEL} per checkout).
        </p>
      </div>

      {account?.status === 'approved' && (
        <p className="text-sm text-emerald-900 bg-emerald-50 border border-emerald-200 rounded-xl p-3 flex items-start gap-2">
          <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5" aria-hidden="true" />
          <span>
            <strong>{account.businessName}</strong> is approved for wholesale. Look for the Wholesale box on listings that
            farms sell by the case.
            {status.taxExempt && status.exemptUntil && <> Tax-exempt until <strong>{formatDay(status.exemptUntil)}</strong>.</>}
          </span>
        </p>
      )}
      {account?.status === 'pending' && (
        <p className="text-sm text-amber-950 bg-amber-50 border border-amber-200 rounded-xl p-3 flex items-start gap-2">
          <Clock className="w-4 h-4 shrink-0 mt-0.5" aria-hidden="true" />
          <span>Your application for <strong>{account.businessName}</strong> is being reviewed. We&apos;ll email you.</span>
        </p>
      )}
      {account?.status === 'declined' && (
        <p className="text-sm text-red-800 bg-red-50 border border-red-200 rounded-xl p-3 flex items-start gap-2">
          <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" aria-hidden="true" />
          <span>
            Your wholesale application wasn&apos;t approved{account.declineReason ? `: ${account.declineReason}` : '.'} You can
            update your details and apply again below.
          </span>
        </p>
      )}

      {expiringSoon && status.exemptUntil && (
        <p className="text-sm text-amber-950 bg-amber-50 border border-amber-300 rounded-xl p-3">
          Your resale certificate expires <strong>{formatDay(status.exemptUntil)}</strong>. Upload a new one below to keep
          buying tax-free.
        </p>
      )}
      {account?.status === 'approved' && !status.taxExempt && certificate?.status !== 'pending' && (
        <p className="text-xs text-gray-700 bg-gray-50 border rounded-xl p-3">
          {certificate?.status === 'approved'
            ? `Your resale certificate expired ${formatDay(certificate.expiresOn)}, so sales tax is charged again. Upload a current one to buy tax-free.`
            : 'Wholesale purchases include sales tax unless you have a resale certificate on file. If you resell what you buy, upload your Arizona Form 5000A below.'}
        </p>
      )}
      {certificate?.status === 'pending' && (
        <p className="text-xs text-gray-700 bg-gray-50 border rounded-xl p-3">
          Your resale certificate (expires {formatDay(certificate.expiresOn)}) is waiting to be checked. Sales tax is
          charged until it&apos;s approved.
        </p>
      )}
      {certificate?.status === 'declined' && (
        <p className="text-xs text-red-800 bg-red-50 border border-red-200 rounded-xl p-3">
          Your resale certificate wasn&apos;t accepted{certificate.declineReason ? `: ${certificate.declineReason}` : '.'} Upload
          a corrected one below.
        </p>
      )}

      {(!account || account.status !== 'approved') && (
        <>
          {!open && !account ? (
            <button
              type="button"
              onClick={() => setOpen(true)}
              className="px-4 py-2.5 bg-amber-600 hover:bg-amber-700 text-white font-bold rounded-xl text-sm"
            >
              Apply for a wholesale account
            </button>
          ) : (
            <form onSubmit={apply} className="space-y-3">
              <div>
                <label htmlFor="ws-name" className="block text-sm font-semibold text-gray-800 mb-1">Business name</label>
                <input id="ws-name" className={input} value={form.businessName} onChange={(e) => setForm({ ...form, businessName: e.target.value })} required maxLength={120} />
              </div>
              <div>
                <label htmlFor="ws-type" className="block text-sm font-semibold text-gray-800 mb-1">Kind of business</label>
                <select id="ws-type" className={input} value={form.businessType} onChange={(e) => setForm({ ...form, businessType: e.target.value })} required>
                  <option value="">Choose…</option>
                  {BUSINESS_TYPES.map((type) => (
                    <option key={type} value={type}>{type}</option>
                  ))}
                </select>
              </div>
              <div>
                <label htmlFor="ws-address" className="block text-sm font-semibold text-gray-800 mb-1">Business address</label>
                <input id="ws-address" className={input} value={form.businessAddress} onChange={(e) => setForm({ ...form, businessAddress: e.target.value })} required maxLength={300} />
              </div>
              <div>
                <label htmlFor="ws-phone" className="block text-sm font-semibold text-gray-800 mb-1">Business phone</label>
                <input id="ws-phone" type="tel" className={input} value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} required maxLength={40} />
              </div>
              <button type="submit" disabled={busy} className="px-4 py-2.5 bg-amber-600 hover:bg-amber-700 disabled:bg-gray-300 text-white font-bold rounded-xl text-sm">
                {busy ? 'Sending…' : account ? 'Update and send again' : 'Send application'}
              </button>
            </form>
          )}
        </>
      )}

      {canUpload && (
        <form onSubmit={upload} className="border-t pt-4 space-y-3">
          <div>
            <h3 className="text-sm font-bold text-gray-900">Resale certificate (Arizona Form 5000A)</h3>
            <p className="text-xs text-gray-600 mt-0.5">
              Optional. If you resell what you buy, upload your certificate and its expiration date. Once we&apos;ve checked
              it, your wholesale purchases are tax-free until it expires. We&apos;ll remind you {CERTIFICATE_REMINDER_DAYS} days
              before. Only Farm Fresh Direct staff can see it; farms can&apos;t.
            </p>
          </div>
          <div className="grid sm:grid-cols-2 gap-3">
            <div>
              <label htmlFor="ws-file" className="block text-xs font-semibold text-gray-800 mb-1">Certificate (PDF or photo)</label>
              <input
                id="ws-file"
                type="file"
                accept="application/pdf,image/*"
                onChange={(e) => setFile(e.target.files?.[0] || null)}
                className="block w-full text-sm text-gray-700 file:mr-3 file:px-3 file:py-2 file:rounded-lg file:border-0 file:bg-gray-100 file:font-semibold"
              />
            </div>
            <div>
              <label htmlFor="ws-expires" className="block text-xs font-semibold text-gray-800 mb-1">Expiration date</label>
              <input id="ws-expires" type="date" min={arizonaToday()} className={input} value={expiresOn} onChange={(e) => setExpiresOn(e.target.value)} />
            </div>
          </div>
          <button type="submit" disabled={busy} className="inline-flex items-center gap-2 px-4 py-2.5 bg-white border-2 border-amber-600 text-amber-800 hover:bg-amber-50 disabled:opacity-50 font-bold rounded-xl text-sm">
            <Upload className="w-4 h-4" aria-hidden="true" /> {busy ? 'Uploading…' : 'Upload certificate'}
          </button>
        </form>
      )}

      {error && (
        <p role="alert" className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-xl p-3">{error}</p>
      )}
      {notice && (
        <p role="status" className="text-sm text-emerald-900 bg-emerald-50 border border-emerald-200 rounded-xl p-3">{notice}</p>
      )}
    </section>
  );
}
