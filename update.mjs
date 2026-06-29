// Runs in GitHub Actions. Fetches finished knockout results, resolves the bracket,
// and writes data.json. No npm dependencies (Node 18+ has global fetch).
import { readFileSync, writeFileSync } from 'node:fs';

const config = JSON.parse(readFileSync('./config.json', 'utf8'));
const SEED = config.seed;                 // 32 entrants in bracket order
const SIZES = [16, 8, 4, 2, 1];

// ---- name matching ----
const norm = s => (s || '').toString().toLowerCase()
  .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
  .replace(/[^a-z0-9]+/g, ' ').trim();
const ALIAS = {};
SEED.forEach((t, i) => [t.team, ...(t.aliases || [])].forEach(a => { ALIAS[norm(a)] = i; }));
function seedOf(name) {
  const k = norm(name);
  if (k in ALIAS) return ALIAS[k];
  for (const a in ALIAS) if (a && (k.includes(a) || a.includes(k))) return ALIAS[a];
  return -1;
}

// ---- bracket resolution ----
// winners: { matchId: seedIndex }
function candidates(winners, round, m) {
  if (round === 0) return [2 * m, 2 * m + 1];
  const a = winners[`r${round - 1}m${2 * m}`];
  const b = winners[`r${round - 1}m${2 * m + 1}`];
  return [a, b];
}

/* =========================================================================
 * fetchResults(): returns a normalised array of finished matches:
 *   { home, away, hg, ag, winner: 'home'|'away'|null, ph, pa }
 * Implemented for football-data.org (v4). To swap providers, rewrite ONLY
 * this function to return the same shape.
 * ========================================================================= */
async function fetchResults() {
  const key = process.env.FOOTBALL_API_KEY;
  if (!key) throw new Error('FOOTBALL_API_KEY secret is not set');
  const comp = config.competition || 'WC';
  const res = await fetch(`https://api.football-data.org/v4/competitions/${comp}/matches`, {
    headers: { 'X-Auth-Token': key },
  });
  if (!res.ok) throw new Error(`football-data.org returned ${res.status} ${res.statusText}`);
  const json = await res.json();
  const out = [];
  for (const m of (json.matches || [])) {
    if (m.status !== 'FINISHED') continue;
    const home = m.homeTeam?.name, away = m.awayTeam?.name;
    if (!home || !away) continue;
    const ft = m.score?.fullTime || {};
    const pens = m.score?.penalties || {};
    const w = m.score?.winner; // HOME_TEAM | AWAY_TEAM | DRAW
    const winner = w === 'HOME_TEAM' ? 'home' : w === 'AWAY_TEAM' ? 'away' : null;
    out.push({
      home, away,
      hg: ft.home ?? null, ag: ft.away ?? null,
      ph: pens.home ?? null, pa: pens.away ?? null,
      winner,
    });
  }
  return out;
}

export async function main() {
  let results;
  try {
    results = await fetchResults();
  } catch (e) {
    console.error('Fetch failed:', e.message);
    process.exit(1);
  }
  console.log(`Fetched ${results.length} finished match(es) from the API.`);

  const winners = {};   // matchId -> seedIndex
  const scores = {};    // matchId -> {a,b,pa,pb}
  const placed = new Set();
  let matchedCount = 0;

  // iterate until no more placements (later rounds depend on earlier winners)
  let changed = true;
  while (changed) {
    changed = false;
    for (let r = 0; r < 5; r++) {
      for (let m = 0; m < SIZES[r]; m++) {
        const id = `r${r}m${m}`;
        if (winners[id] !== undefined) continue;
        const c = candidates(winners, r, m);
        if (c[0] === undefined || c[1] === undefined) continue; // entrants not known yet
        // find a finished result matching this pair
        for (const res of results) {
          const hs = seedOf(res.home), as = seedOf(res.away);
          if (hs < 0 || as < 0) continue;
          const pair = new Set([c[0], c[1]]);
          if (!(pair.has(hs) && pair.has(as) && hs !== as)) continue;
          if (res.winner === null) {
            console.warn(`No winner field for ${res.home} v ${res.away} — skipping (check penalties handling).`);
            continue;
          }
          const winSeed = res.winner === 'home' ? hs : as;
          winners[id] = winSeed;
          // align goals to entrant order [c0, c1]
          const homeIsC0 = c[0] === hs;
          scores[id] = {
            a: homeIsC0 ? res.hg : res.ag,
            b: homeIsC0 ? res.ag : res.hg,
            pa: (res.ph != null && res.pa != null) ? (homeIsC0 ? res.ph : res.pa) : null,
            pb: (res.ph != null && res.pa != null) ? (homeIsC0 ? res.pa : res.ph) : null,
          };
          placed.add(`${res.home}|${res.away}`);
          matchedCount++;
          changed = true;
          break;
        }
      }
    }
  }

  // report any finished results we couldn't slot in (usually group games or alias misses)
  for (const res of results) {
    const hs = seedOf(res.home), as = seedOf(res.away);
    if (hs >= 0 && as >= 0 && !placed.has(`${res.home}|${res.away}`)) {
      console.warn(`Unmatched knockout-looking result: ${res.home} v ${res.away} (add an alias in config.json if this should appear).`);
    }
  }

  const out = {
    updated: new Date().toISOString(),
    source: 'football-data.org',
    winners: Object.fromEntries(Object.entries(winners).map(([id, s]) => [id, SEED[s].team])),
    scores,
  };
  writeFileSync('./data.json', JSON.stringify(out, null, 2));
  console.log(`Placed ${matchedCount} knockout result(s). Wrote data.json.`);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}
