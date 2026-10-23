import type { ReactNode } from 'react';
import { Sun, Snowflake } from 'lucide-react';
import { SEASON_DATES, type Season } from '@/lib/season';

// A small icon after the site name that changes with the season, in that
// season's own colours. All four are in the page and globals.css shows the
// one for the current season, so it is right from the first moment the page
// appears. Hovering over it names the season and its dates.

// Spring: a flower with purple petals on a green stem.
function SpringFlower() {
  return (
    <svg viewBox="0 0 24 24" className="w-5 h-5">
      <path d="M12 12v10" stroke="#16a34a" strokeWidth={2} strokeLinecap="round" />
      <path d="M12 19c-3.2 0-4.8-1.6-4.8-3.8 2.7 0 4.8 1.2 4.8 3.8z" fill="#16a34a" />
      <path d="M12 17c2.6 0 3.9-1.3 3.9-3.1-2.2 0-3.9 1-3.9 3.1z" fill="#16a34a" />
      {[0, 72, 144, 216, 288].map((angle) => (
        <circle key={angle} cx="12" cy="4.6" r="2.7" fill="#9333ea" transform={`rotate(${angle} 12 7.6)`} />
      ))}
      <circle cx="12" cy="7.6" r="1.9" fill="#facc15" />
    </svg>
  );
}

// Fall: a pumpkin-orange maple leaf, tilted as if it's falling. Drawn here
// because the icon set has no maple leaf.
function MapleLeaf() {
  return (
    <svg viewBox="0 0 24 24" className="w-5 h-5">
      <g transform="rotate(-18 12 12)" fill="#ea580c" stroke="#ea580c" strokeLinecap="round" strokeLinejoin="round">
        <path
          strokeWidth={0.6}
          d="M12 2 13.6 5.2 15.4 4.3 14.8 8.4 17.4 5.6 18.1 7.2 21 6.6 20 9.6 21.5 10.4 16.9 14 17.4 15.6 12.6 15 11.4 15 6.6 15.6 7.1 14 2.5 10.4 4 9.6 3 6.6 5.9 7.2 6.6 5.6 9.2 8.4 8.6 4.3 10.4 5.2Z"
        />
        <path d="M12 14.5v6.5" fill="none" strokeWidth={2} />
      </g>
    </svg>
  );
}

const ICONS: Record<Season, ReactNode> = {
  spring: <SpringFlower />,
  // A yellow sun with a filled centre.
  summer: <Sun className="w-5 h-5" color="#eab308" fill="#fde047" strokeWidth={2.25} />,
  fall: <MapleLeaf />,
  // An icy blue snowflake.
  winter: <Snowflake className="w-5 h-5" color="#0ea5e9" strokeWidth={2.25} />,
};

const NAMES: Record<Season, string> = { spring: 'Spring', summer: 'Summer', fall: 'Fall', winter: 'Winter' };

export default function SeasonIcon() {
  return (
    <span className="season-badge items-center">
      {(Object.keys(ICONS) as Season[]).map((season) => (
        <span
          key={season}
          data-season-icon={season}
          className="season-icon"
          title={`${NAMES[season]} Season ${SEASON_DATES[season]}`}
        >
          {ICONS[season]}
        </span>
      ))}
    </span>
  );
}
