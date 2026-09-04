// Generates one setlist per (Vertex DJ x brief) and writes raw model output to data/raw/.
import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { buildPrompt, extractJson, SET_LENGTH } from './prompt.mjs';

const PROJECT = 'agentbillboard';
const ROOT = path.resolve(import.meta.dirname, '..');
const RAW = path.join(ROOT, 'data', 'raw');
fs.mkdirSync(RAW, { recursive: true });

const token = () => execSync('gcloud auth application-default print-access-token', { encoding: 'utf8' }).trim();
let TOK = token();

const djs = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/djs.json'), 'utf8'));
const briefs = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/briefs.json'), 'utf8'));

async function callGemini(dj, prompt) {
  const url = `https://aiplatform.googleapis.com/v1/projects/${PROJECT}/locations/${dj.location}/publishers/google/models/${dj.model}:generateContent`;
  const r = await fetch(url, {
    method: 'POST',
    headers: { Authorization: `Bearer ${TOK}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      generationConfig: { temperature: 1.0, maxOutputTokens: 8192, responseMimeType: 'application/json' },
    }),
  });
  if (!r.ok) throw new Error(`HTTP ${r.status} ${(await r.text()).slice(0, 200)}`);
  const d = await r.json();
  const parts = d.candidates?.[0]?.content?.parts ?? [];
  const text = parts.map((p) => p.text).filter(Boolean).join('');
  if (!text) throw new Error(`no text (finish=${d.candidates?.[0]?.finishReason})`);
  return text;
}

async function callOpenapi(dj, prompt) {
  const url = `https://${dj.location}-aiplatform.googleapis.com/v1/projects/${PROJECT}/locations/${dj.location}/endpoints/openapi/chat/completions`;
  const r = await fetch(url, {
    method: 'POST',
    headers: { Authorization: `Bearer ${TOK}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: dj.model,
      messages: [{ role: 'user', content: prompt }],
      temperature: 1.0,
      max_tokens: 8192,
    }),
  });
  if (!r.ok) throw new Error(`HTTP ${r.status} ${(await r.text()).slice(0, 200)}`);
  const d = await r.json();
  const m = d.choices?.[0]?.message;
  return m?.content || m?.reasoning_content || '';
}

const call = (dj, prompt) =>
  dj.provider === 'vertex-gemini' ? callGemini(dj, prompt) : callOpenapi(dj, prompt);

function validate(set) {
  if (!set.tracks || !Array.isArray(set.tracks)) throw new Error('no tracks array');
  const tracks = set.tracks.filter((t) => t && t.artist && t.title).slice(0, SET_LENGTH);
  if (tracks.length < SET_LENGTH) throw new Error(`only ${tracks.length}/${SET_LENGTH} usable tracks`);
  return { read: String(set.read || '').trim(), tracks };
}

const targets = [];
for (const dj of djs.filter((d) => d.provider.startsWith('vertex')))
  for (const b of briefs) targets.push({ dj, brief: b });

const only = process.argv[2];
const work = only ? targets.filter((t) => t.dj.id === only) : targets;
console.log(`generating ${work.length} setlists\n`);

let ok = 0, fail = 0;
for (const { dj, brief } of work) {
  const out = path.join(RAW, `${dj.id}__${brief.id}.json`);
  if (fs.existsSync(out)) { console.log(`· skip   ${dj.id} / ${brief.id}`); ok++; continue; }
  let lastErr;
  for (let attempt = 1; attempt <= 4; attempt++) {
    try {
      const text = await call(dj, buildPrompt(brief));
      const set = validate(extractJson(text));
      fs.writeFileSync(out, JSON.stringify({ djId: dj.id, briefId: brief.id, model: dj.model, generatedAt: new Date().toISOString(), ...set }, null, 2));
      console.log(`✓ ${dj.id} / ${brief.id}  — ${set.tracks.map((t) => t.artist).join(', ').slice(0, 70)}`);
      ok++; lastErr = null; break;
    } catch (e) {
      lastErr = e;
      if (String(e.message).includes('401')) TOK = token();
      await new Promise((r) => setTimeout(r, 1500 * attempt));
    }
  }
  if (lastErr) { console.log(`✗ ${dj.id} / ${brief.id}  — ${lastErr.message.slice(0, 120)}`); fail++; }
}
console.log(`\ndone. ok=${ok} fail=${fail}`);
