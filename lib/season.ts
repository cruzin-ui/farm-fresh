// The site's look changes with the season: each one has its own background
// tone and accent colour (defined in globals.css under [data-season=...]),
// while the FFD green stays the same all year.
//
// The season comes from the calendar in Arizona time. Pages can be built
// ahead of time, so it is worked out in the visitor's browser by a small
// script that runs before the page is drawn (SEASON_SCRIPT, placed in the
// root layout), never baked into a page.
//
// To preview another season, add ?season=winter (or spring, summer, fall) to
// any address; it lasts until that tab is closed. ?season=auto goes back to
// the real season.

export const SEASONS = ['spring', 'summer', 'fall', 'winter'] as const;
export type Season = (typeof SEASONS)[number];

// Where each season starts, as month * 100 + day: the equinoxes and solstices.
const SPRING_STARTS = 320;
const SUMMER_STARTS = 621;
const FALL_STARTS = 922;
const WINTER_STARTS = 1221;

// The same dates in words, shown when hovering over the season's icon.
export const SEASON_DATES: Record<Season, string> = {
  spring: 'Mar 20 – Jun 20',
  summer: 'Jun 21 – Sep 21',
  fall: 'Sep 22 – Dec 20',
  winter: 'Dec 21 – Mar 19',
};

const PREVIEW_KEY = 'ffd-season-preview';

// Kept as plain, old-style JavaScript because it runs as written in the
// browser, before anything else on the page.
export const SEASON_SCRIPT = `(function(){
  var seasons = ${JSON.stringify(SEASONS)};
  var season = null;
  try {
    var asked = new URLSearchParams(location.search).get('season');
    if (asked === 'auto') sessionStorage.removeItem('${PREVIEW_KEY}');
    else if (seasons.indexOf(asked) >= 0) sessionStorage.setItem('${PREVIEW_KEY}', asked);
    var preview = sessionStorage.getItem('${PREVIEW_KEY}');
    if (seasons.indexOf(preview) >= 0) season = preview;
  } catch (e) {}
  try {
    if (!season) {
      var parts = new Intl.DateTimeFormat('en-US', { timeZone: 'America/Phoenix', month: 'numeric', day: 'numeric' }).formatToParts(new Date());
      var month = 0, day = 0;
      for (var i = 0; i < parts.length; i++) {
        if (parts[i].type === 'month') month = +parts[i].value;
        if (parts[i].type === 'day') day = +parts[i].value;
      }
      var date = month * 100 + day;
      season = date >= ${WINTER_STARTS} || date < ${SPRING_STARTS} ? 'winter'
        : date < ${SUMMER_STARTS} ? 'spring'
        : date < ${FALL_STARTS} ? 'summer'
        : 'fall';
    }
    document.documentElement.setAttribute('data-season', season);
  } catch (e) {}
})();`;
