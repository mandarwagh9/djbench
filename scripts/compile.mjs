// Joins raw model setlists + the resolved YouTube cache into the single file the app ships.
// Everything the player needs is baked in here, so no YouTube API call ever happens on a user request.
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '..');
const read = (p) => JSON.parse(fs.readFileSync(path.join(ROOT, p), 'utf8'));

const djs = read('data/djs.json');
const briefs = read('data/briefs.json');
const cache = fs.existsSync(path.join(ROOT, 'data/track-cache.json')) ? read('data/track-cache.json') : {};

const PLAY_SECONDS = 45;   // how long each track holds the floor before the set advances
const MIN_TRACKS = 4;      // a set with fewer resolved tracks is not shippable

// A stable per-track waveform so the same record always draws the same shape.
// This is a visual signature derived from the track identity, not audio analysis.
function waveform(seedStr, bars = 96) {
  let h = 2166136261;
  for (let i = 0; i < seedStr.length; i++) { h ^= seedStr.charCodeAt(i); h = Math.imul(h, 16777619); }
  const rnd = () => { h ^= h << 13; h ^= h >>> 17; h ^= h << 5; return ((h >>> 0) % 10000) / 10000; };
  const out = [];
  for (let i = 0; i < bars; i++) {
    const p = i / bars;
    const arc = 0.45 + 0.55 * Math.sin(Math.PI * Math.min(1, p * 1.15));  // quiet intro, fuller middle
    const beat = i % 4 === 0 ? 0.22 : 0;                                   // four-to-the-floor accent
    out.push(Math.max(0.06, Math.min(1, arc * (0.55 + rnd() * 0.6) + beat)));
  }
  return out.map((v) => Math.round(v * 100));
}

// Typographic normalisation only, applied to the rationale strings models wrote.
// Meaning and word order are untouched, and data/raw keeps every original verbatim.
function tidy(s) {
  return String(s || "")
    .replace(/\s*[—–]\s*/g, ". ")   // dash used as a pause becomes a sentence break
    .replace(/,\s*\.\s*/g, ", ")               // avoid ", ." where the dash followed a comma
    .replace(/\.\s*\./g, ".")
    .replace(/\s+/g, " ")
    .trim();
}

const sets = [];
const missing = [];

for (const dj of djs) {
  for (const brief of briefs) {
    const p = path.join(ROOT, 'data/raw', `${dj.id}__${brief.id}.json`);
    if (!fs.existsSync(p)) { missing.push(`${dj.id}/${brief.id} (not generated)`); continue; }
    const raw = JSON.parse(fs.readFileSync(p, 'utf8'));

    const tracks = [];
    let dropped = 0;
    for (const t of raw.tracks) {
      const key = `${String(t.artist).trim()} :: ${String(t.title).trim()}`;
      const hit = cache[key];
      if (!hit || !hit.ok) { dropped++; continue; }
      tracks.push({
        artist: String(t.artist).trim(),
        title: String(t.title).trim(),
        year: Number(t.year) || null,
        bpm: Number(t.bpm) || null,
        why: tidy(t.why),
        transition: tidy(t.transition),
        videoId: hit.videoId,
        startSec: hit.startSec,
        playSec: Math.min(PLAY_SECONDS, Math.max(20, hit.duration - hit.startSec - 5)),
        duration: hit.duration,
        wave: waveform(key),
      });
    }

    if (tracks.length < MIN_TRACKS) { missing.push(`${dj.id}/${brief.id} (only ${tracks.length} resolved)`); continue; }
    sets.push({
      id: `${dj.id}__${brief.id}`,
      djId: dj.id,
      briefId: brief.id,
      read: tidy(raw.read),
      tracks,
      dropped,
    });
  }
}

// Only brief that at least two DJs completed can host a battle.
const byBrief = {};
for (const s of sets) (byBrief[s.briefId] ||= []).push(s.djId);
const playableBriefs = briefs.filter((b) => (byBrief[b.id] || []).length >= 2);

const out = {
  builtAt: new Date().toISOString(),
  djs,
  briefs: playableBriefs,
  sets,
  stats: {
    setCount: sets.length,
    trackCount: sets.reduce((n, s) => n + s.tracks.length, 0),
    uniqueVideos: new Set(sets.flatMap((s) => s.tracks.map((t) => t.videoId))).size,
  },
};

fs.writeFileSync(path.join(ROOT, 'data/sets.json'), JSON.stringify(out));
console.log(`sets      ${out.stats.setCount}`);
console.log(`tracks    ${out.stats.trackCount} (${out.stats.uniqueVideos} unique videos)`);
console.log(`briefs    ${playableBriefs.length} playable of ${briefs.length}`);
for (const b of playableBriefs) console.log(`  ${b.id.padEnd(16)} ${(byBrief[b.id] || []).length} DJs`);
if (missing.length) console.log(`\nexcluded (${missing.length}):\n  ` + missing.join('\n  '));
