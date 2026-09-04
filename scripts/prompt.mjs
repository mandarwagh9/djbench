// The single prompt every DJ receives. Identical across all models — that is the benchmark.
export const SET_LENGTH = 6;

export function buildPrompt(brief) {
  return `You are DJing. Right now, in front of a real crowd. This is your set.

VENUE     ${brief.venue}
TIME      ${brief.clock}
CROWD     ${brief.crowd}
THE MOMENT
${brief.situation}

You are not producing music. You are selecting and sequencing it — that is the entire craft being judged here.
Pick exactly ${SET_LENGTH} real, released, findable-on-YouTube tracks, in the order you would play them, starting now.

Rules:
- Real records only. Correct artist and title. No invented tracks, no invented remixes.
- Sequence matters more than any single pick. Think about energy, key, and what the previous record left in the room.
- No two tracks by the same artist.
- Commit to a point of view. A safe set is a bad set.

Respond with ONLY a JSON object, no prose, no markdown fence:
{
  "read": "one sentence, max 25 words: how you are reading this room",
  "tracks": [
    {
      "artist": "Artist name",
      "title": "Track title",
      "year": 1998,
      "bpm": 122,
      "why": "max 14 words: why this record, in this spot",
      "transition": "max 14 words: how you move out of it into the next"
    }
  ]
}`;
}

const BACKSLASH = String.fromCharCode(92);

// Models wrap JSON in fences, prepend reasoning, or trail commentary. Dig the object out.
export function extractJson(text) {
  if (!text) throw new Error('empty response');
  let t = String(text).trim();
  t = t.replace(/<think>[\s\S]*?<\/think>/gi, '').trim();
  const fence = t.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fence) t = fence[1].trim();
  const start = t.indexOf('{');
  if (start === -1) throw new Error('no JSON object found');
  // Walk braces so trailing prose after the object does not break the parse.
  let depth = 0, inStr = false, esc = false, end = -1;
  for (let i = start; i < t.length; i++) {
    const c = t[i];
    if (esc) { esc = false; continue; }
    if (c === BACKSLASH) { esc = true; continue; }
    if (c === '"') { inStr = !inStr; continue; }
    if (inStr) continue;
    if (c === '{') depth++;
    else if (c === '}') { depth--; if (depth === 0) { end = i; break; } }
  }
  if (end === -1) throw new Error('unbalanced JSON object');
  return JSON.parse(t.slice(start, end + 1));
}
