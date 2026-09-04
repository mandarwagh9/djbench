#!/usr/bin/env node
/**
 * Run any model against the DJbench briefs.
 *
 *   node scripts/bench.mjs --id my-model --name "My Model" --lab "My Lab" \
 *     --provider openai --base-url https://api.openai.com/v1 --model gpt-5 \
 *     --key-env OPENAI_API_KEY
 *
 * Every entrant receives the byte-identical prompt in scripts/prompt.mjs. That is the whole
 * point of the bench, so this script has no per-model prompt tuning and offers none.
 *
 * Afterwards:
 *   python scripts/resolve.py     resolve the named records to embeddable YouTube videos
 *   node scripts/compile.mjs      rebuild data/sets.json
 *   node scripts/score.mjs        objective scorecard
 */
import fs from 'node:fs';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { buildPrompt, extractJson, SET_LENGTH } from './prompt.mjs';

const ROOT = path.resolve(import.meta.dirname, '..');
const RAW = path.join(ROOT, 'data', 'raw');

// ---- args ------------------------------------------------------------------------------
const argv = process.argv.slice(2);
const flag = (name, fallback = undefined) => {
  const i = argv.indexOf(`--${name}`);
  if (i === -1) return fallback;
  const v = argv[i + 1];
  return v && !v.startsWith('--') ? v : true;
};

if (flag('help') || argv.length === 0) {
  console.log(`
DJbench entrant runner

Required
  --id <slug>            stable id, e.g. my-model
  --name <label>         display name, e.g. "My Model"
  --lab <label>          who made it, e.g. "My Lab"
  --provider <kind>      openai | anthropic | gemini | vertex-openapi | vertex-gemini | command
  --model <name>         the provider's model identifier

Provider options
  --base-url <url>       openai/anthropic compatible endpoint root
  --key-env <VAR>        env var holding the API key (never pass the key on the command line)
  --location <region>    vertex only
  --project <id>         vertex only (defaults to GOOGLE_CLOUD_PROJECT)
  --cmd "<shell>"        command mode: prompt arrives on stdin, JSON expected on stdout

Options
  --temperature <n>      default 1.0
  --max-tokens <n>       default 8192
  --brief <id>           run a single brief instead of all six
  --force                regenerate briefs that already exist
  --accent <#hex>        colour used for this model on the standings page

Examples
  # anything OpenAI-compatible: OpenRouter, Together, Groq, vLLM, Ollama, LM Studio
  node scripts/bench.mjs --id llama-4 --name "Llama 4" --lab Meta \\
    --provider openai --base-url https://openrouter.ai/api/v1 \\
    --model meta-llama/llama-4-maverick --key-env OPENROUTER_API_KEY

  # a local Ollama server needs no key at all
  node scripts/bench.mjs --id mistral-local --name "Mistral 7B" --lab Local \\
    --provider openai --base-url http://localhost:11434/v1 --model mistral

  # anything else: your own script, prompt on stdin, JSON on stdout
  node scripts/bench.mjs --id my-agent --name "My Agent" --lab Me \\
    --provider command --model custom --cmd "python my_dj.py"
`);
  process.exit(0);
}

const need = (n) => {
  const v = flag(n);
  if (!v || v === true) {
    console.error(`missing --${n}. Run with --help for usage.`);
    process.exit(1);
  }
  return v;
};

const entrant = {
  id: need('id'),
  name: need('name'),
  lab: need('lab'),
  provider: need('provider'),
  model: need('model'),
  location: flag('location', 'global'),
  accent: flag('accent', '#8FB8FF'),
};
const baseUrl = String(flag('base-url', '')).replace(/\/$/, '');
const keyEnv = flag('key-env');
const apiKey = keyEnv && keyEnv !== true ? process.env[keyEnv] : undefined;
const temperature = Number(flag('temperature', 1.0));
const maxTokens = Number(flag('max-tokens', 8192));
const project = flag('project', process.env.GOOGLE_CLOUD_PROJECT || '');

if (!/^[a-z0-9][a-z0-9._-]*$/.test(entrant.id)) {
  console.error(`--id must be a lowercase slug, got "${entrant.id}"`);
  process.exit(1);
}
if (keyEnv && keyEnv !== true && !apiKey) {
  console.error(`env var ${keyEnv} is empty. Export your key first, do not paste it as an argument.`);
  process.exit(1);
}

// ---- providers -------------------------------------------------------------------------
const gcloudToken = () =>
  new Promise((res, rej) =>
    execFile('gcloud auth application-default print-access-token', { shell: true }, (e, out) =>
      e ? rej(new Error('gcloud ADC unavailable: run `gcloud auth application-default login`')) : res(out.trim()),
    ),
  );

async function post(url, headers, body) {
  const r = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...headers },
    body: JSON.stringify(body),
  });
  if (!r.ok) throw new Error(`HTTP ${r.status} ${(await r.text()).slice(0, 300)}`);
  return r.json();
}

const providers = {
  // Covers OpenAI plus every OpenAI-compatible gateway and local server.
  async openai(prompt) {
    if (!baseUrl) throw new Error('--base-url is required for --provider openai');
    const d = await post(
      `${baseUrl}/chat/completions`,
      apiKey ? { Authorization: `Bearer ${apiKey}` } : {},
      { model: entrant.model, messages: [{ role: 'user', content: prompt }], temperature, max_tokens: maxTokens },
    );
    const m = d.choices?.[0]?.message;
    return m?.content || m?.reasoning_content || '';
  },

  async anthropic(prompt) {
    const d = await post(
      `${baseUrl || 'https://api.anthropic.com'}/v1/messages`,
      { 'x-api-key': apiKey ?? '', 'anthropic-version': '2023-06-01' },
      { model: entrant.model, max_tokens: maxTokens, temperature, messages: [{ role: 'user', content: prompt }] },
    );
    return (d.content ?? []).map((c) => c.text).filter(Boolean).join('');
  },

  async gemini(prompt) {
    const root = baseUrl || 'https://generativelanguage.googleapis.com/v1beta';
    const d = await post(`${root}/models/${entrant.model}:generateContent?key=${apiKey ?? ''}`, {}, {
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      generationConfig: { temperature, maxOutputTokens: maxTokens, responseMimeType: 'application/json' },
    });
    return (d.candidates?.[0]?.content?.parts ?? []).map((p) => p.text).filter(Boolean).join('');
  },

  async 'vertex-gemini'(prompt) {
    if (!project) throw new Error('--project or GOOGLE_CLOUD_PROJECT is required for vertex');
    const tok = await gcloudToken();
    const d = await post(
      `https://aiplatform.googleapis.com/v1/projects/${project}/locations/${entrant.location}/publishers/google/models/${entrant.model}:generateContent`,
      { Authorization: `Bearer ${tok}` },
      {
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
        generationConfig: { temperature, maxOutputTokens: maxTokens, responseMimeType: 'application/json' },
      },
    );
    return (d.candidates?.[0]?.content?.parts ?? []).map((p) => p.text).filter(Boolean).join('');
  },

  async 'vertex-openapi'(prompt) {
    if (!project) throw new Error('--project or GOOGLE_CLOUD_PROJECT is required for vertex');
    const tok = await gcloudToken();
    const loc = entrant.location;
    const d = await post(
      `https://${loc}-aiplatform.googleapis.com/v1/projects/${project}/locations/${loc}/endpoints/openapi/chat/completions`,
      { Authorization: `Bearer ${tok}` },
      { model: entrant.model, messages: [{ role: 'user', content: prompt }], temperature, max_tokens: maxTokens },
    );
    const m = d.choices?.[0]?.message;
    return m?.content || m?.reasoning_content || '';
  },

  // Universal escape hatch: anything you can run in a shell.
  command(prompt) {
    const cmd = flag('cmd');
    if (!cmd || cmd === true) throw new Error('--cmd is required for --provider command');
    return new Promise((res, rej) => {
      const child = execFile(String(cmd), { shell: true, maxBuffer: 8 * 1024 * 1024 }, (e, out, err) =>
        e ? rej(new Error(`${e.message} ${String(err).slice(0, 200)}`)) : res(out),
      );
      child.stdin.end(prompt);
    });
  },
};

const call = providers[entrant.provider];
if (!call) {
  console.error(`unknown --provider "${entrant.provider}". One of: ${Object.keys(providers).join(', ')}`);
  process.exit(1);
}

// ---- the rules every entrant is held to -------------------------------------------------
function validate(set) {
  if (!set || !Array.isArray(set.tracks)) throw new Error('no tracks array');
  const tracks = set.tracks.filter((t) => t && t.artist && t.title).slice(0, SET_LENGTH);
  if (tracks.length < SET_LENGTH) throw new Error(`only ${tracks.length}/${SET_LENGTH} usable tracks`);
  return {
    read: String(set.read ?? '').trim(),
    tracks: tracks.map((t) => ({
      artist: String(t.artist).trim(),
      title: String(t.title).trim(),
      year: Number(t.year) || null,
      bpm: Number(t.bpm) || null,
      why: String(t.why ?? '').trim(),
      transition: String(t.transition ?? '').trim(),
    })),
  };
}

// ---- run --------------------------------------------------------------------------------
const briefs = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/briefs.json'), 'utf8'));
const only = flag('brief');
const targets = only && only !== true ? briefs.filter((b) => b.id === only) : briefs;
if (!targets.length) {
  console.error(`no brief matching "${only}". Available: ${briefs.map((b) => b.id).join(', ')}`);
  process.exit(1);
}

fs.mkdirSync(RAW, { recursive: true });
console.log(`\n${entrant.name} (${entrant.provider}:${entrant.model}) against ${targets.length} brief(s)\n`);

let ok = 0;
const failures = [];
for (const brief of targets) {
  const out = path.join(RAW, `${entrant.id}__${brief.id}.json`);
  if (fs.existsSync(out) && !flag('force')) {
    console.log(`  skip   ${brief.id} (exists, use --force to redo)`);
    ok++;
    continue;
  }

  let lastErr;
  for (let attempt = 1; attempt <= 4; attempt++) {
    try {
      const text = await call(buildPrompt(brief));
      const set = validate(extractJson(text));
      fs.writeFileSync(
        out,
        JSON.stringify(
          { djId: entrant.id, briefId: brief.id, model: entrant.model, generatedAt: new Date().toISOString(), ...set },
          null,
          2,
        ),
      );
      console.log(`  ok     ${brief.id.padEnd(16)} ${set.tracks.map((t) => t.artist).join(', ').slice(0, 60)}`);
      ok++;
      lastErr = null;
      break;
    } catch (e) {
      lastErr = e;
      await new Promise((r) => setTimeout(r, 1500 * attempt));
    }
  }
  if (lastErr) {
    console.log(`  FAIL   ${brief.id.padEnd(16)} ${lastErr.message.slice(0, 110)}`);
    failures.push(brief.id);
  }
}

// Register the entrant so the arena and standings can see it.
const djsPath = path.join(ROOT, 'data/djs.json');
const djs = JSON.parse(fs.readFileSync(djsPath, 'utf8'));
if (ok === 0) {
  console.log('\nnothing generated, so the roster was left alone.');
} else if (!djs.some((d) => d.id === entrant.id)) {
  djs.push({
    id: entrant.id,
    name: entrant.name,
    lab: entrant.lab,
    short: entrant.id.slice(0, 6).toUpperCase(),
    accent: entrant.accent,
    provider: entrant.provider,
    model: entrant.model,
    location: entrant.location,
  });
  fs.writeFileSync(djsPath, JSON.stringify(djs, null, 2) + '\n');
  console.log(`\nregistered ${entrant.name} in data/djs.json`);
}

console.log(`\n${ok}/${targets.length} briefs generated${failures.length ? `, failed: ${failures.join(', ')}` : ''}`);
console.log(`\nnext:
  python scripts/resolve.py     find and verify the records on YouTube
  node scripts/compile.mjs      rebuild the catalog
  node scripts/score.mjs        objective scorecard
  npm run dev                   hear it against the field\n`);
process.exit(failures.length ? 1 : 0);
