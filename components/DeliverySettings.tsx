'use client';

import { useEffect, useState } from 'react';
import { Truck, CheckCircle2, AlertCircle, Egg } from 'lucide-react';
import { postWithAuth } from '@/lib/authedFetch';
import {
  DEFAULT_DELIVERY,
  DELIVERY_RELEASE_HOURS,
  EGG_DELIVERY_RULE,
  MAX_DELIVERY_MILES,
  describeDelivery,
  type DeliverySettings as Settings,
} from '@/lib/delivery';

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const dollarsText = (cents: number) => (cents / 100).toFixed(2);
const toCents = (text: string) => Math.round(Number(text || 0) * 100);

// In Farm Profile & Photo: whether and how the farm delivers to buyers' doors
// (see lib/delivery.ts). Turning it on the first time asks the farm to agree
// to the delivery rules; delivering eggs asks it to confirm the egg rule.
export default function DeliverySettings() {
  const [settings, setSettings] = useState<Settings | null>(null);
  const [agreed, setAgreed] = useState(false);
  const [savedEggs, setSavedEggs] = useState(false);
  const [agreeTick, setAgreeTick] = useState(false);
  const [eggTick, setEggTick] = useState(false);
  const [fee, setFee] = useState('5.00');
  const [perMile, setPerMile] = useState('0.00');
  const [minimum, setMinimum] = useState('0');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const res = await postWithAuth('/api/seller/delivery', { action: 'get' });
        const json = await res.json();
        const loaded: Settings = res.ok ? json.settings : DEFAULT_DELIVERY;
        setSettings(loaded);
        setAgreed(Boolean(json.agreed));
        setSavedEggs(loaded.delivers_eggs);
        setFee(dollarsText(loaded.fee_cents));
        setPerMile(dollarsText(loaded.per_mile_cents));
        setMinimum(String(Math.round(loaded.min_order_cents / 100)));
      } catch {
        setSettings(DEFAULT_DELIVERY);
      }
    })();
  }, []);

  if (!settings) {
    return <p className="text-xs text-gray-500 p-4 bg-gray-50 border rounded-xl">Loading delivery settings…</p>;
  }

  const set = (patch: Partial<Settings>) => {
    setSettings({ ...settings, ...patch });
    setNotice(null);
  };
  const needsAgreement = settings.enabled && !agreed;
  const needsEggConfirm = settings.delivers_eggs && !savedEggs;
  const preview: Settings = {
    ...settings,
    fee_cents: toCents(fee),
    per_mile_cents: toCents(perMile),
    min_order_cents: toCents(minimum),
  };

  const save = async () => {
    setError(null);
    setNotice(null);
    if (needsAgreement && !agreeTick) {
      setError('Tick the box to agree to the delivery rules.');
      return;
    }
    if (needsEggConfirm && !eggTick) {
      setError('Tick the box to confirm you keep eggs cold, or turn off egg delivery.');
      return;
    }
    setBusy(true);
    try {
      const res = await postWithAuth('/api/seller/delivery', {
        action: 'save',
        settings: preview,
        agree: (needsAgreement && agreeTick) || (needsEggConfirm && eggTick),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Could not save.');
      setAgreed(Boolean(json.agreed));
      setSavedEggs(preview.delivers_eggs);
      setNotice(preview.enabled ? 'Saved. Buyers can now choose delivery from you at checkout.' : 'Saved. Delivery is off.');
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  const input = 'w-full px-3 py-2 border rounded-lg text-sm bg-white';

  return (
    <div className="p-4 bg-gray-50 border border-gray-200 rounded-xl space-y-3">
      <div>
        <p className="text-sm font-bold text-gray-900 flex items-center gap-2">
          <Truck className="w-4 h-4 text-emerald-700" aria-hidden="true" /> Delivery{' '}
          <span className="text-xs font-normal text-gray-500">(optional)</span>
        </p>
        <p className="text-xs text-gray-600 mt-1">
          Take orders to buyers&apos; doors yourself, on the days you choose. Buyers pay the delivery fee at checkout, and
          it&apos;s paid to you, less the seller fee, once the delivery is done.
        </p>
      </div>

      <label className="flex items-center gap-2 text-sm font-semibold text-gray-900">
        <input type="checkbox" className="w-4 h-4" checked={settings.enabled} onChange={(e) => set({ enabled: e.target.checked })} />
        I deliver
      </label>

      {settings.enabled && (
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label htmlFor="del-radius" className="block text-xs font-semibold text-gray-700 mb-1">
                How far (miles by road)
              </label>
              <input
                id="del-radius"
                type="number"
                min={1}
                max={MAX_DELIVERY_MILES}
                value={settings.radius_miles}
                onChange={(e) => set({ radius_miles: Number(e.target.value) })}
                className={input}
              />
            </div>
            <div>
              <label htmlFor="del-min" className="block text-xs font-semibold text-gray-700 mb-1">
                Smallest order ($)
              </label>
              <input id="del-min" type="number" min={0} step={1} value={minimum} onChange={(e) => setMinimum(e.target.value)} className={input} />
            </div>
            <div>
              <label htmlFor="del-fee" className="block text-xs font-semibold text-gray-700 mb-1">
                Delivery fee ($)
              </label>
              <input id="del-fee" type="number" min={0} step={0.5} value={fee} onChange={(e) => setFee(e.target.value)} className={input} />
            </div>
            <div>
              <label htmlFor="del-mile" className="block text-xs font-semibold text-gray-700 mb-1">
                Plus per mile ($, optional)
              </label>
              <input id="del-mile" type="number" min={0} step={0.1} value={perMile} onChange={(e) => setPerMile(e.target.value)} className={input} />
            </div>
          </div>

          <fieldset>
            <legend className="text-xs font-semibold text-gray-700 mb-1.5">Delivery days</legend>
            <div className="flex flex-wrap gap-2">
              {DAYS.map((day, index) => (
                <label key={day} className="inline-flex items-center gap-1.5 bg-white border rounded-lg px-2.5 py-2 text-xs">
                  <input
                    type="checkbox"
                    className="w-4 h-4"
                    checked={settings.weekdays.includes(index)}
                    onChange={(e) =>
                      set({
                        weekdays: e.target.checked
                          ? [...settings.weekdays, index].sort()
                          : settings.weekdays.filter((d) => d !== index),
                      })
                    }
                  />
                  {day}
                </label>
              ))}
            </div>
          </fieldset>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label htmlFor="del-start" className="block text-xs font-semibold text-gray-700 mb-1">
                Window starts
              </label>
              <input id="del-start" type="time" value={settings.start_time} onChange={(e) => set({ start_time: e.target.value })} className={input} />
            </div>
            <div>
              <label htmlFor="del-end" className="block text-xs font-semibold text-gray-700 mb-1">
                Window ends
              </label>
              <input id="del-end" type="time" value={settings.end_time} onChange={(e) => set({ end_time: e.target.value })} className={input} />
            </div>
          </div>

          <div>
            <label htmlFor="del-note" className="block text-xs font-semibold text-gray-700 mb-1">
              Note for buyers (optional)
            </label>
            <input
              id="del-note"
              value={settings.note}
              maxLength={300}
              onChange={(e) => set({ note: e.target.value })}
              placeholder="For example: I text when I'm on my way, and leave orders in a cooler by the door."
              className={input}
            />
          </div>

          <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 space-y-2">
            <label className="flex items-start gap-2 text-sm font-semibold text-amber-950">
              <input
                type="checkbox"
                className="w-4 h-4 mt-0.5"
                checked={settings.delivers_eggs}
                onChange={(e) => set({ delivers_eggs: e.target.checked })}
              />
              <span className="flex items-center gap-1.5">
                <Egg className="w-4 h-4" aria-hidden="true" /> I deliver eggs
              </span>
            </label>
            <p className="text-xs text-amber-950">
              {EGG_DELIVERY_RULE} Without this, your eggs are pickup only.
            </p>
            {needsEggConfirm && (
              <label className="flex items-start gap-2 text-xs text-amber-950">
                <input type="checkbox" className="w-4 h-4 mt-0.5" checked={eggTick} onChange={(e) => setEggTick(e.target.checked)} />
                <span>I confirm I keep eggs at 45°F or below, in a cooler with ice packs, until they are handed over or left in a cooler.</span>
              </label>
            )}
          </div>

          <p className="text-xs text-gray-700 bg-white border rounded-lg p-2.5">
            Buyers will see: <strong>{describeDelivery(preview)}</strong>
          </p>

          {needsAgreement && (
            <label className="flex items-start gap-2 text-xs text-gray-800">
              <input type="checkbox" className="w-4 h-4 mt-0.5" checked={agreeTick} onChange={(e) => setAgreeTick(e.target.checked)} />
              <span>
                I agree to the delivery rules in the{' '}
                <a href="/seller-terms" target="_blank" className="font-semibold text-emerald-800 underline">
                  Seller Terms
                </a>
                : I deliver myself and am responsible for the drive and for keeping food safe and cold; at the door I
                scan the buyer&apos;s code, or leave the order with a photo, and then I&apos;m paid {DELIVERY_RELEASE_HOURS} hours
                later unless the buyer reports a problem.
              </span>
            </label>
          )}
        </div>
      )}

      <button
        type="button"
        onClick={save}
        disabled={busy}
        className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 disabled:bg-gray-400 text-white text-sm font-semibold rounded-lg"
      >
        {busy ? 'Saving…' : 'Save delivery settings'}
      </button>

      {error && (
        <p role="alert" className="text-xs text-red-700 flex gap-1.5">
          <AlertCircle className="w-4 h-4 shrink-0" aria-hidden="true" /> {error}
        </p>
      )}
      {notice && (
        <p role="status" className="text-xs text-emerald-800 flex gap-1.5">
          <CheckCircle2 className="w-4 h-4 shrink-0" aria-hidden="true" /> {notice}
        </p>
      )}
    </div>
  );
}
