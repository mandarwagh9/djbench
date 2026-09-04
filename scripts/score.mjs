#!/usr/bin/env node
/**
 * Objective scorecard for every entrant on the bench.
 *
 * Human votes decide who reads a room, and that takes listeners. These metrics need nobody:
 * they come straight from what each model named and whether those records turned out to exist.
 *
 *   node scripts/score.mjs            print the table
 *   node scripts/score.mjs --json     write data/scorecard.json
 */
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '..');
const read = (p) => JSON.parse(fs.readFileSync(path.join(ROOT, p), 'utf8'));

const djs = read('data/djs.json');
const briefs = read('data/briefs.json');
const cache = fs.existsSync(path.join(ROOT, 'data/track-cache.json')) ? read('data/track-cache.json') : {};

const key = (t) => `${String(t.artist).trim()} :: ${String(t.title).trim()}`;
const norm = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

// How many different models named each record, so we can tell a brave pick from an obvious one.
const pickedBy = new Map();
const setsByDj = new Map();
for (const dj of djs) {
  const sets = [];
  for (const b of briefs) {
    const p = path.join(ROOT, 'data/raw', `${dj.id}__${b.id}.json`);
    if (!fs.existsSync(p)) continue;
    const raw = JSON.parse(fs.readFileSync(p, 'utf8'));
    sets.push(raw);
    for (const t of raw.tracks) {
      const k = norm(key(t));
      if (!pickedBy.has(k)) pickedBy.set(k, new Set());
      pickedBy.get(k).add(dj.id);
    }
  }
  setsByDj.set(dj.id, sets);
}

const pct = (n, d) => (d ? Math.round((n / d) * 1000) / 10 : 0);

const rows = [];
for (const dj of djs) {
  const sets = setsByDj.get(dj.id) ?? [];
  if (!sets.length) continue;

  let named = 0, real = 0, dupArtist = 0, wrongLength = 0;
  const years = [];
  const bpms = [];
  const allKeys = [];
  let consensusSum = 0, consensusN = 0;

  for (const s of sets) {
    if (s.tracks.length !== 6) wrongLength++;
    const artists = new Set();
    for (const t of s.tracks) {
      named++;
      if (cache[key(t)]?.ok) real++;
      const a = norm(t.artist);
      if (artists.has(a)) dupArtist++;
      artists.add(a);
      if (t.year) years.push(Number(t.year));
      if (t.bpm) bpms.push(Number(t.bpm));
      const k = norm(key(t));
      allKeys.push(k);
      const others = (pickedBy.get(k)?.size ?? 1) - 1;
      consensusSum += others;
      consensusN++;
    }
  }

  // A DJ who plays the same records in every room is not reading any of them.
  const uniqueRecords = new Set(allKeys).size;

  const spread = years.length
    ? Math.round(Math.sqrt(years.reduce((a, y) => a + (y - years.reduce((x, z) => x + z, 0) / years.length) ** 2, 0) / years.length))
    : 0;

  rows.push({
    id: dj.id,
    name: dj.name,
    lab: dj.lab,
    sets: sets.length,
    named,
    findable: pct(real, named),
    invented: named - real,
    ruleBreaks: dupArtist + wrongLength,
    reuse: pct(named - uniqueRecords, named),
    eraSpread: spread,
    bpmRange: bpms.length ? `${Math.min(...bpms)}-${Math.max(...bpms)}` : 'n/a',
    consensus: consensusN ? Math.round((consensusSum / consensusN) * 100) / 100 : 0,
  });
}

rows.sort((a, b) => b.findable - a.findable || a.consensus - b.consensus);

const w = (s, n) => String(s).padEnd(n);
console.log(`\nDJbench objective scorecard   ${rows.length} entrants, ${briefs.length} rooms\n`);
console.log(
  w('MODEL', 20) + w('LAB', 11) + w('SETS', 6) + w('FINDABLE', 10) + w('INVENTED', 10) +
  w('BREAKS', 8) + w('REUSE', 7) + w('ERA±', 6) + w('BPM', 10) + 'CONSENSUS',
);
console.log('-'.repeat(103));
for (const r of rows) {
  console.log(
    w(r.name, 20) + w(r.lab, 11) + w(r.sets, 6) + w(`${r.findable}%`, 10) + w(r.invented, 10) +
    w(r.ruleBreaks, 8) + w(`${r.reuse}%`, 7) + w(r.eraSpread, 6) + w(r.bpmRange, 10) + r.consensus,
  );
}

console.log(`
FINDABLE   share of named records that resolved to a real, embeddable video
INVENTED   records that could not be found at all, the closest thing to a hallucination rate
BREAKS     prompt rules broken: a set that is not six tracks, or repeats an artist
REUSE      share of picks recycled across rooms, so a lower number means it read each room
ERA±       standard deviation of release years, a rough measure of range
CONSENSUS  average number of OTHER models that also picked each record.
           High means safe and obvious, low means distinctive. Neither is automatically better,
           but a set that is both low-consensus and well-voted is the interesting one.

Human preference lives on /leaderboard. This table is what the bench can measure alone.
`);

if (process.argv.includes('--json')) {
  const out = { generatedAt: new Date().toISOString(), rooms: briefs.length, rows };
  fs.writeFileSync(path.join(ROOT, 'data/scorecard.json'), JSON.stringify(out, null, 2) + '\n');
  console.log('wrote data/scorecard.json\n');
}
