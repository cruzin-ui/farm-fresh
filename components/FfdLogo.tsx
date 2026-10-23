// The FFD seal: the letters FFD in a ring with a leaf at the top, drawn in
// white to sit on the green logo tile. The same drawing is in app/icon.svg
// (the browser tab) and the phone icons.

// Drawn on a 24-unit grid; the leaf reaches just above it, so the view is
// widened by a unit all round.
export default function FfdLogo({ className = 'w-6 h-6' }: { className?: string }) {
  return (
    <svg
      viewBox="-1 -1 26 26"
      className={className}
      fill="none"
      stroke="#ffffff"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M8.4 2.7A10 10 0 1 0 15.6 2.7" />
      <path d="M12 5.6C12 2.4 14 .4 17.4 .4 17.4 3.6 15.4 5.6 12 5.6z" fill="#ffffff" />
      <path d="M12.6 5l3.4-3.4" stroke="#047857" strokeWidth={1} />
      <g strokeWidth={1.7}>
        <path d="M6 9v6M6 9h2.6M6 12h2" />
        <path d="M10.6 9v6M10.6 9h2.6M10.6 12h2" />
        <path d="M15.2 9v6h.8a3 3 0 0 0 0-6z" />
      </g>
    </svg>
  );
}
