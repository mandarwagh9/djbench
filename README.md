# DJbench

**A benchmark for taste.** Models are handed the same crowd, the same room and the same hour, and
asked which real records they would play. Listeners hear two sets blind, ride a crossfader between
them, and vote on who read the room.

The models are not making music. They are selecting and sequencing it, which is the part of DJing
being measured.

Live: **[djbench.vercel.app](https://djbench.vercel.app)**

---

## Put your model on the bench

Every entrant receives the byte-identical prompt in [`scripts/prompt.mjs`](scripts/prompt.mjs).
There is no per-model prompt tuning and the runner offers none. That is the whole point.

```bash
git clone https://github.com/mandarwagh9/djbench
cd djbench && npm install && pip install yt-dlp
```

**1. Run your model against all six rooms.** Anything OpenAI-compatible works, which covers
OpenRouter, Together, Groq, Fireworks, vLLM, Ollama and LM Studio:

```bash
export OPENROUTER_API_KEY=...
node scripts/bench.mjs \
  --id my-model --name "My Model" --lab "My Lab" \
  --provider openai --base-url https://openrouter.ai/api/v1 \
  --model meta-llama/llama-4-maverick --key-env OPENROUTER_API_KEY
```

A local model needs no key at all:

```bash
node scripts/bench.mjs --id mistral-local --name "Mistral 7B" --lab Local \
  --provider openai --base-url http://localhost:11434/v1 --model mistral
```

Anything else at all, including a whole agent, goes through the command adapter. The prompt
arrives on stdin, JSON is expected on stdout:

```bash
node scripts/bench.mjs --id my-agent --name "My Agent" --lab Me \
  --provider command --model custom --cmd "python my_dj.py"
```

Providers: `openai`, `anthropic`, `gemini`, `vertex-openapi`, `vertex-gemini`, `command`.
Run `node scripts/bench.mjs --help` for the full flag list. Pass the **name** of the env var
holding your key via `--key-env`, never the key itself on a command line.

**2. Check the records it named actually exist.**

```bash
export YOUTUBE_API_KEY=...      # YouTube Data API v3
python scripts/resolve.py
```

**3. Score it, then hear it.**

```bash
node scripts/compile.mjs
node scripts/score.mjs
npm run dev
```

Your model is now in the arena and on the standings. Open a PR with your `data/raw/*.json` if you
want it in the hosted roster.

---

## The scorecard

Human votes decide who reads a room, and that needs listeners. These numbers need nobody: they come
from what each model named and whether those records turned out to exist.

| Model | Lab | Findable | Invented | Reuse | Consensus |
| --- | --- | --- | --- | --- | --- |
| Claude Opus 5 | Anthropic | 100% | 0 | 0% | 0.58 |
| Gemini 2.5 Pro | Google | 97.2% | 1 | 0% | **0.22** |
| GPT-OSS 120B | OpenAI | 97.2% | 1 | 2.8% | 0.31 |
| Qwen3 235B | Alibaba | 97.2% | 1 | 2.8% | 0.33 |
| Gemini 2.5 Flash | Google | 97.2% | 1 | 0% | 0.39 |
| DeepSeek R1 | DeepSeek | 94.4% | 2 | 2.8% | 0.42 |

- **Findable** share of *checked* records that resolved to a real, embeddable video. Records not yet
  put through `resolve.py` are counted separately and flagged, never mistaken for hallucinations.
- **Invented** records that could not be found at all, the closest thing to a hallucination rate.
- **Reuse** share of picks recycled across rooms. Lower means it actually read each room.
- **Consensus** average number of *other* models that also picked each record. High means safe and
  obvious, low means distinctive. Neither is automatically better, but a set that is both
  low-consensus and well-voted is the interesting one.

`node scripts/score.mjs --json` writes the full table, including rule breaks and era spread.

## The rooms

Six briefs, each rewarding a different skill.

| | Room | The problem |
| --- | --- | --- |
| 01 | The 3AM Warehouse | Take a drifting floor deeper without losing it |
| 02 | The Wedding, 10:15 PM | Get the grandmother and the groomsmen onto the same record |
| 03 | Rooftop, Golden Hour | Nobody should be dancing yet. Build the next four hours |
| 04 | The Last 30 Minutes | No more peaks. Send them out changed |
| 05 | Main Stage, Peak | Legible to someone 200 metres back who dislikes dance music |
| 06 | The Basement, 1AM | One clipping speaker, and cheap nostalgia empties the room |

## How a battle works

Two YouTube players run the same position in two different setlists. A single wall clock drives
both, so deck A track 3 and deck B track 3 always start together no matter how either one buffers.
The crossfader is an equal-power gain law across the two players, exactly like a two-channel mixer:
both sit at about 0.71 in the middle rather than dipping to 0.5.

The video is real, and it is treated as club projection: laid out at quarter scale, blurred there,
then scaled back up by four. That is the same look as a full-size blur for one sixteenth of the
pixels, which matters because blurring two full-viewport playing videos was enough to lock up the
renderer. Playback is pinned to low quality and the silent deck is dropped from paint entirely.
"Show video" pulls the scrim back so anyone can confirm the audio is real.

A vote only unlocks once the listener has sat on both channels.

## Keeping it blind

Model identity is not merely hidden in the UI, it is never sent. A battle is minted on the server
and travels as an AES-256-GCM token; the browser receives a brief, two setlists and that token,
with no name, lab or model id anywhere in the payload. Voting posts the token back with a side, and
the identities come back in the response. Signing the token was not enough on its own: base64 is an
encoding, not a secret, and the first version decoded straight back to the pairing.

Which model sits on deck A is randomised per battle, so side never correlates with identity.

Ballots are one per pairing per voter and forty per rolling hour, keyed on a salted hash of the
caller. Without that, a shell loop could set the leaderboard to anything.

## Pipeline

Curation happens offline, so no model or YouTube API is ever touched on a user request.

```
scripts/bench.mjs        run any model against the briefs      -> data/raw/
scripts/gen-vertex.mjs   the Vertex AI roster                  -> data/raw/
scripts/gen-claude.py    the Claude Opus 5 sets, same prompt   -> data/raw/
scripts/resolve.py       yt-dlp search, then YouTube Data API videos.list to confirm
                         status.embeddable and no regionRestriction -> data/track-cache.json
scripts/compile.mjs      joins raw sets to resolved videos     -> data/sets.json
scripts/score.mjs        objective scorecard
```

Search costs no quota. Validation costs one unit per fifty videos. The cache is keyed on
`artist :: title`, so models converging on the same record cost one lookup.

Current catalog: 36 sets, 210 selections, 174 unique videos, 6 rooms, all playable by all 6 models.

Of 185 unique records the models named, 179 resolved to a real embeddable video. The six that did
not are themselves a result. `compile.mjs` records the count per set as `dropped`.

A set needs at least 4 resolved tracks to ship (`MIN_TRACKS`). A battle plays `min(lenA, lenB)`
tracks, so pairing a 6-track set against a 5-track one means the longer set's last pick is never
heard. Both sides are always judged over the same number of tracks, which is the property that
matters, but the shorter set does get to hide its tail.

## Scoring

Elo, K-factor 24, everyone starting at 1500. Beating a highly rated model earns more than beating a
struggling one. Ties move both toward each other. Votes and standings live in Firestore.

## Running it

```bash
npm install
cp .env.example .env.local     # then fill it in
npm run dev
```

Everything in `.env.local` is optional for local development. Without `GCP_SA_KEY` the arena plays
end to end and only the tally is unavailable. See [`.env.example`](.env.example) for what each
variable does.

## Notes

The waveform bar shape is a stable signature derived from the track identity, not an analysis of
the audio. A cross-origin YouTube iframe exposes no audio buffer. The playhead riding across it is
real playback position.

No audio is hosted or redistributed here. Playback is the public YouTube embedded player, and every
video is checked for `status.embeddable` before it enters the catalog.

Setlists in `data/raw` are recorded verbatim. `compile.mjs` normalises dash punctuation for display
only, and the originals stay untouched.

MIT licensed. See [LICENSE](LICENSE).
