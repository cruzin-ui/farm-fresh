'use client';

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';

// A short guided tour laid over the seller dashboard: the page dims, one part
// of it is lit up, and a card beside it says what that part is for. The
// dashboard decides what the steps are; this only shows them.
//
// A step points at something on the page by its `data-tour` name. It can list
// several names, and the first one that is actually visible is used, because
// the same thing is in a different place on a phone than on a computer. A step
// with nothing to point at is shown as a card in the middle of the screen.

export type TourStep = {
  title: string;
  body: string;
  // `data-tour` names, in order of preference.
  targets?: string[];
};

type Box = { top: number; left: number; width: number; height: number };

const CARD_WIDTH = 320;
const GAP = 12;

function findTarget(names: string[] | undefined): HTMLElement | null {
  for (const name of names || []) {
    for (const element of document.querySelectorAll<HTMLElement>(`[data-tour="${name}"]`)) {
      // Skips copies that are hidden at this screen size.
      if (element.offsetParent !== null) return element;
    }
  }
  return null;
}

export default function SellerTour({
  steps,
  onStepChange,
  onClose,
}: {
  steps: TourStep[];
  // Called with each step's number as it is shown, so the dashboard can open
  // the section that step is about.
  onStepChange: (index: number) => void;
  onClose: () => void;
}) {
  const [index, setIndex] = useState(0);
  const [box, setBox] = useState<Box | null>(null);
  const [viewport, setViewport] = useState({ width: 0, height: 0 });
  const cardRef = useRef<HTMLDivElement>(null);
  const onStepChangeRef = useRef(onStepChange);
  onStepChangeRef.current = onStepChange;

  const step = steps[index];
  const last = index === steps.length - 1;

  const measure = useCallback(() => {
    setViewport({ width: window.innerWidth, height: window.innerHeight });
    const target = findTarget(steps[index]?.targets);
    if (!target) {
      setBox(null);
      return;
    }
    const rect = target.getBoundingClientRect();
    setBox({ top: rect.top, left: rect.left, width: rect.width, height: rect.height });
  }, [index, steps]);

  // Open the right section, bring what the step points at into view, then
  // measure it. It is measured more than once because the section it is in may
  // still be appearing.
  useEffect(() => {
    onStepChangeRef.current(index);

    const timers = [
      setTimeout(() => {
        findTarget(steps[index]?.targets)?.scrollIntoView({ block: 'center', behavior: 'auto' });
        measure();
      }, 60),
      setTimeout(measure, 300),
      setTimeout(measure, 700),
    ];
    return () => timers.forEach(clearTimeout);
  }, [index, steps, measure]);

  useLayoutEffect(() => {
    measure();
    window.addEventListener('resize', measure);
    window.addEventListener('scroll', measure, true);
    return () => {
      window.removeEventListener('resize', measure);
      window.removeEventListener('scroll', measure, true);
    };
  }, [measure]);

  // Keyboard: Escape leaves, the arrow keys move, and focus starts on the card.
  useEffect(() => {
    cardRef.current?.focus();
  }, [index]);

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      else if (e.key === 'ArrowRight') setIndex((current) => Math.min(current + 1, steps.length - 1));
      else if (e.key === 'ArrowLeft') setIndex((current) => Math.max(current - 1, 0));
    };
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [onClose, steps.length]);

  if (!step) return null;

  // Where the card goes: under what it points at if there is room, otherwise
  // above it; in the middle of the screen when it points at nothing.
  const width = Math.min(CARD_WIDTH, Math.max(viewport.width - 2 * GAP, 200));
  let cardStyle: React.CSSProperties = { width, top: '50%', left: '50%', transform: 'translate(-50%, -50%)' };
  if (box) {
    const left = Math.min(Math.max(box.left + box.width / 2 - width / 2, GAP), viewport.width - width - GAP);
    const roomBelow = viewport.height - (box.top + box.height);
    cardStyle =
      roomBelow >= 260 || roomBelow >= box.top
        ? { width, left, top: Math.max(box.top + box.height + GAP, GAP) }
        : { width, left, bottom: Math.max(viewport.height - box.top + GAP, GAP) };
  }

  return (
    <div className="fixed inset-0 z-[70] print:hidden">
      {/* Catches clicks, so the page underneath can't be used mid-tour. */}
      <div className={`absolute inset-0 ${box ? '' : 'bg-gray-900/60'}`} aria-hidden="true" />

      {/* The lit-up area: a clear box whose huge shadow dims everything else. */}
      {box && (
        <div
          aria-hidden="true"
          className="absolute rounded-xl ring-2 ring-white pointer-events-none transition-all duration-200"
          style={{
            top: box.top - 6,
            left: box.left - 6,
            width: box.width + 12,
            height: box.height + 12,
            boxShadow: '0 0 0 9999px rgba(17, 24, 39, 0.6)',
          }}
        />
      )}

      <div
        ref={cardRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="seller-tour-title"
        aria-describedby="seller-tour-body"
        tabIndex={-1}
        className="absolute bg-white rounded-2xl shadow-2xl p-5 outline-none"
        style={cardStyle}
      >
        <p className="text-xs font-semibold text-emerald-800">
          Step {index + 1} of {steps.length}
        </p>
        <h2 id="seller-tour-title" className="mt-1 text-lg font-bold text-gray-900">
          {step.title}
        </h2>
        <p id="seller-tour-body" className="mt-2 text-sm text-gray-700 leading-relaxed">
          {step.body}
        </p>

        <div className="mt-4 flex items-center justify-between gap-2">
          <button
            type="button"
            onClick={onClose}
            className="text-xs font-semibold text-gray-600 hover:text-gray-900 underline underline-offset-2 py-2"
          >
            {last ? 'Close' : 'Skip the tour'}
          </button>
          <div className="flex gap-2">
            {index > 0 && (
              <button
                type="button"
                onClick={() => setIndex(index - 1)}
                className="bg-white border border-gray-300 text-gray-700 hover:bg-gray-50 text-sm font-bold px-4 py-2.5 rounded-xl"
              >
                Back
              </button>
            )}
            <button
              type="button"
              onClick={() => (last ? onClose() : setIndex(index + 1))}
              className="bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-bold px-4 py-2.5 rounded-xl"
            >
              {last ? 'Done' : 'Next'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
