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

// Fall: an orange pumpkin with a green stem and a curl of vine. Drawn here
// because the icon set has no pumpkin.
function Pumpkin() {
  return (
    <svg viewBox="0 0 24 24" className="w-5 h-5">
      <path d="M12 9.5c0-2.2.5-3.8 1.8-5" stroke="#4d7c0f" strokeWidth={2.2} strokeLinecap="round" fill="none" />
      <path d="M13.6 6.4c1.4-1.6 3.8-1.4 4 .3.1 1-1 1.4-1.6.8" stroke="#65a30d" strokeWidth={1.2} strokeLinecap="round" fill="none" />
      <ellipse cx="7.8" cy="15" rx="5.2" ry="6" fill="#ea580c" />
      <ellipse cx="16.2" cy="15" rx="5.2" ry="6" fill="#ea580c" />
      <ellipse cx="12" cy="15" rx="4.2" ry="6.4" fill="#f97316" stroke="#c2410c" strokeWidth={1} />
    </svg>
  );
}

const ICONS: Record<Season, ReactNode> = {
  spring: <SpringFlower />,
  // A yellow sun with a filled centre.
  summer: <Sun className="w-5 h-5" color="#eab308" fill="#fde047" strokeWidth={2.25} />,
  fall: <Pumpkin />,
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
