import { Flower2, Sun, Leaf, Snowflake } from 'lucide-react';

// A small badge on the corner of the logo that changes with the season. All
// four are in the page and globals.css shows the one for the current season,
// so it is right from the first moment the page appears.
const ICONS = [
  { season: 'spring', Icon: Flower2 },
  { season: 'summer', Icon: Sun },
  { season: 'fall', Icon: Leaf },
  { season: 'winter', Icon: Snowflake },
];

export default function SeasonIcon() {
  return (
    <span
      aria-hidden="true"
      className="season-badge absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full bg-white shadow ring-1 ring-black/5 items-center justify-center"
    >
      {ICONS.map(({ season, Icon }) => (
        <Icon key={season} data-season-icon={season} className="season-icon w-3 h-3" strokeWidth={2.5} />
      ))}
    </span>
  );
}
